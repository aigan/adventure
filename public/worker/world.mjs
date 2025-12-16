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
import { log, assert, sysdesig } from "./debug.mjs"
import { Materia } from './materia.mjs'
import { logos, logos_state } from './logos.mjs'
import { eidos } from './eidos.mjs'
import { State } from './state.mjs'
import { Belief } from './belief.mjs'
import { learn_about } from './perception.mjs'

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
      traits: {location: 'village'}
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

  /*
    const hammer1 = state.get_belief_by_label('hammer1')
    const person1_pov = state.get_active_state_by_host(person1)
    person1_pov.learn_about(hammer1)
  */

  state.lock();

  /*
  state = state.branch(logos_state(), 2)
  assert(person1, 'person1 belief not found')
  const person1_state = state.get_active_state_by_host(person1)
  const hammer = state.get_belief_by_label('hammer')
  assert(hammer, 'hammer belief not found')
  learn_about(person1_state, hammer)
  state.lock();
  */

  return { world_state: state, avatar: person1.subject }
}
