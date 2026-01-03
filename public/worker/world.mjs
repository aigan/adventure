/**
 * Game world setup: archetypes, traittypes, and initial state
 *
 * See docs/SPECIFICATION.md for data model design
 * See CLAUDE.md for worker implementation details
 * See docs/ALPHA-1.md for development stages
 */

// @ts-nocheck

import * as DB from "./db.mjs"
import { Subject } from "./subject.mjs"
import { Traittype } from "./traittype.mjs"
import { Archetype } from "./archetype.mjs"
import { log, assert, sysdesig } from "./debug.mjs"
import { Materia } from './materia.mjs'
import { Convergence } from './convergence.mjs'
import { logos, logos_state } from './logos.mjs'
import { eidos } from './eidos.mjs'
import { State } from './state.mjs'
import { Belief } from './belief.mjs'
import { learn_about } from './perception.mjs'
import { unknown } from './fuzzy.mjs'

/**
 * @typedef {import('./db.mjs').ArchetypeDefinition} ArchetypeDefinition
 * @typedef {import('./db.mjs').TraitTypeSchema} TraitTypeSchema
 */


/** @type {Record<string, string|TraitTypeSchema>} */
const traittypes = {
  '@about': {
    type: 'Subject',  // Could be simplified to type Thing
    mind: 'parent',  // Resolve in parent mind's ground state
    exposure: 'internal'  // Not directly observable
  },
  '@uncertain_identity': {
    type: 'boolean',
    exposure: 'internal'  // Not directly observable
  },
  '@form': {
    type: 'string',
    values: ['solid', 'liquid', 'vapor', 'olfactory', 'auditory', 'intangible']
  },
  location: {
    type: 'Location',
    exposure: 'spatial'  // Observable through spatial awareness
  },
  mind: {
    type: 'Mind',
    composable: true,  // Compose minds from multiple bases
    exposure: 'internal'  // Not physically observable
  },
  content: {
    type: 'Thing',
    container: Array,
  },
  color: {
    type: 'string',
    exposure: 'visual'  // Observable by looking
  },
  material: {
    type: 'string',
    exposure: 'visual'
  },
  length: {
    type: 'string',
    values: ['short', 'medium', 'long'],
    exposure: 'visual'
  },
  head: {
    type: 'HammerHead',
    exposure: 'visual'
  },
  handle: {
    type: 'HammerHandle',
    exposure: 'visual'
  },
  name: 'string',
  tools: {
    type: 'string',
    container: Array,
  },
  direction: {
    type: 'string',
    values: ['north', 'east', 'south', 'west'],
    exposure: 'visual'
  },
};

/** @type {Record<string, ArchetypeDefinition>} */
const archetypes = {
  Thing: {
    traits: {
      '@about': null,
      '@uncertain_identity': null,
    },
  },

  EventAwareness: {
    bases: ['Thing'],
    traits: {
      content: null,
    },
  },

  EventPerception: {
    bases: ['EventAwareness'],
    traits: {
      content: null,  // Inherited from EventAwareness
    },
  },

  ObjectPhysical: {
    bases: ['Thing'],
    traits: {
      '@form': 'solid',  // Common case: tangible visible objects
      location: null,
      material: null,
      length: null,
      color: null,
    },
  },


  PortableObject: {
    bases: ['ObjectPhysical'],
  },

  Compass: {
    bases: ['PortableObject'],
    traits: { direction: null }
  },

  HammerHead: {
    bases: ['ObjectPhysical'],
    traits: { material: null, color: null }
  },
  HammerHandle: {
    bases: ['ObjectPhysical'],
    traits: { material: null, color: null, length: null }
  },
  Hammer: {
    bases: ['PortableObject'],
    traits: { head: 'HammerHead', handle: 'HammerHandle' }
  },


  Mental: {
    bases: ['Thing'],
    traits: {
      mind: null,
      // No @form - intangible mental states
    },
  },
  Location: {
    bases: ['ObjectPhysical'],
    traits: {location: null, tools: null}
  },
  Person: {
    bases: ['ObjectPhysical', 'Mental'],
  },
}

/** @type {Record<string, {bases: string[], traits?: Object}>} */
const prototypes_1 = {
}

// Register schemas at module load time (no circular dependency issues)
DB.register(traittypes, archetypes, prototypes_1)

/**
 * Initialize the game world
 * Called after all modules are loaded to avoid circular dependency issues
 * @returns {{world_state: State, avatar: Subject}}
 */
export function init_world() {
  // Re-register schemas in case reset_registries was called (e.g., in tests)
  // Check if already registered by looking for 'Thing' archetype
  if (!Archetype.get_by_label('Thing')) {
    DB.register(traittypes, archetypes, prototypes_1)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Timeline Resolution Example: Divergent timelines with hammer scenario
  // ══════════════════════════════════════════════════════════════════════════

  const world_mind = Materia.create_world('workshop_world')
  const ground = logos_state()

  // Base state (tt=1): workshop with hammer, anvil, tongs
  const state_0 = world_mind.create_state(ground, { tt: 1 })

  state_0.add_beliefs_from_template({
    workshop: {
      bases: ['Location'],
    },
    hammer: {
      bases: ['PortableObject'],
      traits: { color: 'gray', material: 'iron', location: 'workshop' }
    },
    anvil: {
      bases: ['PortableObject'],
      traits: { color: 'black', material: 'iron', location: 'workshop' }
    },
    tongs: {
      bases: ['PortableObject'],
      traits: { color: 'dark_gray', material: 'iron', location: 'workshop' }
    },
  })

  const hammer = state_0.get_belief_by_label('hammer')
  const anvil = state_0.get_belief_by_label('anvil')
  state_0.lock()

  // ══════════════════════════════════════════════════════════════════════════
  // Timeline A (tt=2): "The Red Hammer Path"
  // - Hammer painted red
  // - Anvil gets rusty (changed)
  // - Tongs unchanged
  // ══════════════════════════════════════════════════════════════════════════
  const timeline_a = state_0.branch(ground, 2)
  hammer.replace(timeline_a, { color: 'red' })
  anvil.replace(timeline_a, { color: 'rusty_black' })
  timeline_a.lock()

  // ══════════════════════════════════════════════════════════════════════════
  // Timeline B (tt=2): "The Blue Hammer Path"
  // - Hammer painted blue
  // - Anvil broken and removed
  // - New chisel added
  // - Tongs unchanged
  // ══════════════════════════════════════════════════════════════════════════
  const timeline_b = state_0.branch(ground, 2)
  hammer.replace(timeline_b, { color: 'blue' })
  timeline_b.remove_beliefs(anvil)  // Anvil is gone in this timeline
  timeline_b.add_beliefs_from_template({
    chisel: {
      bases: ['PortableObject'],
      traits: { color: 'silver', material: 'steel', location: 'workshop' }
    }
  })
  timeline_b.lock()

  // ══════════════════════════════════════════════════════════════════════════
  // Convergence (tt=3): Both timelines exist as possibilities
  // Before resolution, first-wins applies (timeline_a values)
  // ══════════════════════════════════════════════════════════════════════════
  const convergence = new Convergence(world_mind, ground, [timeline_a, timeline_b], { tt: 3 })
  convergence.lock()

  const t_color = Traittype.get_by_label('color')

  // Verify first-wins behavior BEFORE resolution
  const hammer_in_conv = convergence.get_belief_by_label('hammer')
  assert(hammer_in_conv.get_trait(convergence, t_color) === 'red',
    'Before resolution: hammer should be red (first-wins from timeline_a)')

  // ══════════════════════════════════════════════════════════════════════════
  // Resolution (tt=4): An observation collapses uncertainty to Timeline B
  // From this point forward, all queries see Timeline B's reality
  // ══════════════════════════════════════════════════════════════════════════
  const resolved_state = convergence.branch(ground, 4)
  convergence.register_resolution(resolved_state, timeline_b)

  // Add player to resolved state - their mind learns about the resolved world
  // Player is created AFTER resolution so their mind state connects to this timeline
  resolved_state.add_beliefs_from_template({
    player: {
      bases: ['Person'],
      traits: {
        location: 'workshop',
        mind: {
          // Player learns about resolved world: blue hammer, no anvil, new chisel
          hammer: ['color', 'location'],
          tongs: ['color', 'location'],
          chisel: ['color', 'location'],
        }
      }
    }
  })

  const player = resolved_state.get_belief_by_label('player')

  resolved_state.lock()

  // Verify resolution AFTER registering
  const hammer_after = resolved_state.get_belief_by_label('hammer')
  const anvil_after = resolved_state.get_belief_by_label('anvil')
  const chisel_after = resolved_state.get_belief_by_label('chisel')

  assert(hammer_after.get_trait(resolved_state, t_color) === 'blue',
    'After resolution: hammer should be blue (from timeline_b)')
  assert(anvil_after === null,
    'After resolution: anvil should NOT exist (removed in timeline_b)')
  assert(chisel_after !== null,
    'After resolution: chisel should exist (added in timeline_b)')

  log('Timeline resolution world initialized successfully!')
  log(`  - hammer color: ${hammer_after.get_trait(resolved_state, t_color)}`)
  log(`  - anvil exists: ${anvil_after !== null}`)
  log(`  - chisel exists: ${chisel_after !== null}`)

  return { world_state: resolved_state, avatar: player.subject }
}

/* ══════════════════════════════════════════════════════════════════════════
 * PREVIOUS init_world() - commented out for reference
 * ══════════════════════════════════════════════════════════════════════════
export function init_world_original() {
  // Create world mind and initial state
  const world_mind = new Materia(logos(), 'world');
  let state = world_mind.create_state(logos_state(), {tt: 1});


  state.add_shared_from_template({
    HammerHandleCommon: {
      bases: ['HammerHandle'],
      traits: { material: 'wood' }
    },
    HammerCommon: {
      bases: ['Hammer'],
      traits: { handle: 'HammerHandleCommon' }
    },
  });

  state.add_beliefs_from_template({
    village: {
      bases: ['Location'],
    },

    workshop: {
      bases: ['Location'],
      traits: {
        location: 'village',
      },
    },

    tavern: {
      bases: ['Location'],
      traits: {location: unknown()}
    },

    compass: {
      bases: ['Compass'],
      traits: {
        location: 'workshop',
        direction: {
          alternatives: [
            { value: 'north', certainty: 0.6 },
            { value: 'east', certainty: 0.25 },
            { value: 'south', certainty: 0.15 }
          ]
        }
      }
    },

    lost_key: {
      bases: ['PortableObject'],
      traits: {
        color: 'rusty',
        location: {
          alternatives: [
            { value: 'workshop', certainty: 0.5 },
            { value: 'tavern', certainty: 0.3 },
            { value: 'village', certainty: 0.2 }
          ]
        }
      }
    },

    //hammer1_head: {
    //  bases: ['HammerHead'],
    //  traits: { material: 'iron', color: 'black' }
    //},
    //hammer1_handle: {
    //  bases: ['HammerHandle'],
    //  traits: { material: 'wood', color: 'brown', length: 'short' }
    //},
    //hammer1: {
    //  bases: ['Hammer'],
    //  traits: {
    //    '@uncertain_identity': true,
    //    head: 'hammer1_head',
    //    handle: 'hammer1_handle',
    //    location: 'workshop',
    //  }
    //},

    //hammer2_head: {
    //  bases: ['HammerHead'],
    //  traits: { material: 'iron', color: 'black' }
    //},
    //hammer2_handle: {
    //  bases: ['HammerHandle'],
    //  traits: { material: 'wood', color: 'dark_brown', length: 'long' }
    //},
    //hammer2: {
    //  bases: ['Hammer'],
    //  traits: { head: 'hammer2_head', handle: 'hammer2_handle', location: 'workshop' }
    //},

    //hammer3: {
    //  bases: ['HammerCommon'],
    //  traits: {
    //    '@uncertain_identity': true,
    //    location: 'workshop',
    //    handle: 'HammerHandleCommon',
    //  },
    //},

  })

  state.add_shared_from_template({
    apprentice_token: {
      bases: ['PortableObject'],
      traits: {color: 'bronze'},
    },
    basic_tools: {
      bases: ['PortableObject'],
      traits: {color: 'gray'},
    },
    guild_badge: {
      bases: ['PortableObject'],
      traits: {color: 'gold'},
    },
  })

  // Example: Branch resolution for inherited traits
  // A merchant who might be at workshop (60%) or tavern (40%)
  // Querying wandering_merchant.location returns Fuzzy via branch resolution
  //
  // IMPORTANT: Promotions can only be created in Eidos hierarchy (shared beliefs).
  // So we create the merchant_location belief in an Eidos sub-mind, then
  // have the world's wandering_merchant inherit from it.
  const workshop = state.get_belief_by_label('workshop')
  const tavern = state.get_belief_by_label('tavern')
  const Person = Archetype.get_by_label('Person')

  // Create shared belief in Eidos hierarchy for promotions
  const shared_mind = new Materia(eidos(), 'shared_behaviors')
  const shared_state = shared_mind.create_state(eidos().origin_state, { tt: 1 })

  // Create belief that will have probability alternatives (in Eidos)
  const merchant_location = Belief.from_template(shared_state, {
    bases: ['ObjectPhysical'],
    label: 'merchant_location',
    promotable: true
  })
  // replace() with promote: true removes original and registers promotions
  merchant_location.replace(shared_state, { location: workshop.subject }, { promote: true, certainty: 0.6 })
  merchant_location.replace(shared_state, { location: tavern.subject }, { promote: true, certainty: 0.4 })
  shared_state.lock()

  // Create wandering_merchant in world state with merchant_location (from Eidos) as base
  // When querying location, get_trait walks bases, finds promotions, returns Fuzzy
  const wandering_merchant = Belief.from(state, [Person, merchant_location])
  wandering_merchant.label = 'wandering_merchant'
  DB.register_label('wandering_merchant', wandering_merchant.subject.sid)

  state.add_shared_from_template({
    Villager: {
      bases: ['Person'],
      traits: {
        mind: {
          workshop: ['location']
        },
      },
    },
  })

  state.add_beliefs_from_template({
    badge1: {
      bases: ['guild_badge'],
      traits: {
        color: 'blue',
        location: 'workshop',
        '@uncertain_identity': true,
      },
    },
    person1: {
      bases: ['Person'],
      traits: {
        mind: {
          // hammer: ['color'],
          badge1: ['color', 'location'],
        },
        location: 'workshop',
      },
    }
  })

  const person1 = state.get_belief_by_label('person1')

  state.lock();

  return { world_state: state, avatar: person1.subject }
}
*/

/**
 * Timeline Resolution Example: Hammer Scenario
 *
 * Demonstrates two divergent timelines where:
 * - Timeline A: hammer is painted red, anvil gains rust
 * - Timeline B: hammer is painted blue, anvil is removed (broken), chisel added
 *
 * When resolved to Timeline B, ALL queries from that point forward
 * see the blue hammer, no anvil, and the new chisel.
 *
 * @example
 * ```javascript
 * import { setupTimelineResolutionExample } from './world.mjs'
 * const { convergence, timeline_a, timeline_b, resolved_state, tools } = setupTimelineResolutionExample()
 *
 * // Before resolution: first-wins behavior (Timeline A)
 * tools.hammer.get_trait(convergence, t_color)  // → 'red'
 * convergence.get_belief_by_label('anvil')       // → anvil belief
 *
 * // After resolution to Timeline B:
 * tools.hammer.get_trait(resolved_state, t_color)  // → 'blue'
 * resolved_state.get_belief_by_label('anvil')       // → null (removed)
 * resolved_state.get_belief_by_label('chisel')      // → chisel belief
 * ```
 */
export function setupTimelineResolutionExample() {
  // Convergence imported at module level (via materia.mjs → convergence.mjs dependency chain)

  const world_mind = Materia.create_world('workshop_world')
  const ground = logos_state()

  // Base state: workshop with hammer, anvil, and tongs
  const state_0 = world_mind.create_state(ground, { tt: 1 })

  state_0.add_beliefs_from_template({
    hammer: {
      bases: ['PortableObject'],
      traits: { color: 'gray', material: 'iron' }
    },
    anvil: {
      bases: ['PortableObject'],
      traits: { color: 'black', material: 'iron' }
    },
    tongs: {
      bases: ['PortableObject'],
      traits: { color: 'dark_gray', material: 'iron' }
    }
  })

  const hammer = state_0.get_belief_by_label('hammer')
  const anvil = state_0.get_belief_by_label('anvil')
  const tongs = state_0.get_belief_by_label('tongs')
  state_0.lock()

  // ══════════════════════════════════════════════════════════════════════════
  // Timeline A: "The Red Hammer Path"
  // - Hammer painted red
  // - Anvil gets rusty (changed)
  // - Tongs unchanged
  // ══════════════════════════════════════════════════════════════════════════
  const timeline_a = state_0.branch(ground, 2)
  hammer.replace(timeline_a, { color: 'red' })
  anvil.replace(timeline_a, { color: 'rusty_black' })
  timeline_a.lock()

  // ══════════════════════════════════════════════════════════════════════════
  // Timeline B: "The Blue Hammer Path"
  // - Hammer painted blue
  // - Anvil broken and removed
  // - New chisel added
  // - Tongs unchanged
  // ══════════════════════════════════════════════════════════════════════════
  const timeline_b = state_0.branch(ground, 2)
  hammer.replace(timeline_b, { color: 'blue' })
  timeline_b.remove_beliefs(anvil)  // Anvil is gone in this timeline
  timeline_b.add_beliefs_from_template({
    chisel: {
      bases: ['PortableObject'],
      traits: { color: 'silver', material: 'steel' }
    }
  })
  timeline_b.lock()

  // ══════════════════════════════════════════════════════════════════════════
  // Convergence: Both timelines exist as possibilities
  // Before resolution, first-wins applies (timeline_a values)
  // ══════════════════════════════════════════════════════════════════════════
  const convergence = new Convergence(world_mind, ground, [timeline_a, timeline_b], { tt: 3 })
  convergence.lock()

  const t_color = Traittype.get_by_label('color')

  // Verify first-wins behavior BEFORE resolution
  const hammer_in_conv = convergence.get_belief_by_label('hammer')
  const anvil_in_conv = convergence.get_belief_by_label('anvil')
  const chisel_in_conv = convergence.get_belief_by_label('chisel')

  assert(hammer_in_conv.get_trait(convergence, t_color) === 'red',
    'Before resolution: hammer should be red (first-wins from timeline_a)')
  assert(anvil_in_conv !== null,
    'Before resolution: anvil should exist (from timeline_a)')
  assert(chisel_in_conv !== null,
    'Before resolution: chisel should exist (from timeline_b, not removed)')

  // ══════════════════════════════════════════════════════════════════════════
  // Resolution: An observation collapses uncertainty to Timeline B
  // From this point forward, all queries see Timeline B's reality
  // ══════════════════════════════════════════════════════════════════════════
  const resolved_state = convergence.branch(ground, 4)
  convergence.register_resolution(resolved_state, timeline_b)
  resolved_state.lock()

  // Verify resolution AFTER registering
  const hammer_after = resolved_state.get_belief_by_label('hammer')
  const anvil_after = resolved_state.get_belief_by_label('anvil')
  const chisel_after = resolved_state.get_belief_by_label('chisel')
  const tongs_after = resolved_state.get_belief_by_label('tongs')

  assert(hammer_after.get_trait(resolved_state, t_color) === 'blue',
    'After resolution: hammer should be blue (from timeline_b)')
  assert(anvil_after === null,
    'After resolution: anvil should NOT exist (removed in timeline_b)')
  assert(chisel_after !== null,
    'After resolution: chisel should exist (added in timeline_b)')
  assert(tongs_after.get_trait(resolved_state, t_color) === 'dark_gray',
    'After resolution: tongs unchanged (inherited from base)')

  log('Timeline resolution example passed all assertions!')

  return {
    world_mind,
    state_0,
    timeline_a,
    timeline_b,
    convergence,
    resolved_state,
    tools: { hammer, anvil, tongs },
    t_color
  }
}
