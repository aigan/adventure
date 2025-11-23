/**
 * Game world setup: archetypes, traittypes, and initial state
 *
 * See docs/SPECIFICATION.md for data model design
 * See CLAUDE.md for worker implementation details
 * See docs/ALPHA-1.md for development stages
 */

// @ts-nocheck

import * as Cosmos from "./cosmos.mjs"
import * as DB from "./db.mjs"
import { Subject } from "./subject.mjs"
import { Traittype } from "./traittype.mjs"
import { log, assert, sysdesig } from "./debug.mjs"
import { eidos } from './eidos.mjs'

/**
 * @typedef {import('./db.mjs').ArchetypeDefinition} ArchetypeDefinition
 * @typedef {import('./db.mjs').TraitTypeSchema} TraitTypeSchema
 */


/** @type {Record<string, string|TraitTypeSchema>} */
const traittypes = {
  '@about': {
    type: 'Subject',
    mind: 'parent',  // Resolve in parent mind's ground state
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
  color: {
    type: 'string',
    exposure: 'visual'  // Observable by looking
  },
  name: 'string',
  inventory: {
    type: 'PortableObject',
    container: Array,
    composable: true  // Compose inventories from multiple bases
  },
  tools: {type: 'string', container: Array},
};

/** @type {Record<string, ArchetypeDefinition>} */
const archetypes = {
  Thing: {
    traits: {
      '@about': null,
    },
  },

  ObjectPhysical: {
    bases: ['Thing'],
    traits: {
      '@form': 'solid',  // Common case: tangible visible objects
      location: null,
      color: null,
    },
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
  PortableObject: {
    bases: ['ObjectPhysical'],
  },
  Person: {
    bases: ['ObjectPhysical', 'Mental'],
    traits: {
      inventory: null,
    },
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
 * @returns {{world_state: Cosmos.State, avatar: Cosmos.Belief}}
 */
export function init_world() {
  // Create world mind and initial state
  const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world');
  let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1});

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

    hammer: {
      bases: ['PortableObject'],
      traits: {
        location: 'workshop',
        color: 'blue',
      },
    }
  })

  // Create shared items for prototype inventories
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

  // Create person prototypes with minds and inventories
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

  state.add_shared_from_template({
    Blacksmith: {
      bases: ['Person'],
      traits: {
        mind: {
          workshop: ['location', 'tools']
        },
        inventory: ['guild_badge'],
      },
    },
  });

  state.add_beliefs_from_template({
    person1: {
      bases: ['Person'],
      traits: {
        mind: {
          hammer: ['color'],
        },
        location: 'workshop',
      },
    }
  })

  state.lock();
  state = state.branch_state(Cosmos.logos_state(), 2)

  const person1 = state.get_belief_by_label('person1');
  assert(person1, 'person1 belief not found')
  const person1_state = state.get_active_state_by_host(person1)
  const hammer = state.get_belief_by_label('hammer')
  assert(hammer, 'hammer belief not found')
  person1_state.learn_about(hammer)

  state.lock();

  return { world_state: state, avatar: person1 }
}
