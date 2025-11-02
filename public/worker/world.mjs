/**
 * Game world setup: archetypes, traittypes, and initial state
 *
 * See docs/SPECIFICATION.md for data model design
 * See .CONTEXT.md for worker implementation details
 * See docs/ALPHA-1.md for development stages
 */

import * as Cosmos from "./cosmos.mjs";
import * as DB from "./db.mjs";
import { Session } from "./session.mjs";
import { Subject } from "./subject.mjs";
import { log, assert } from "../lib/debug.mjs";
//import {observation,observation_text} from "./observation.mjs";
//import Time from "./time.mjs";
//import * as Ponder from "./ponder.mjs";

/**
 * @typedef {import('./db.mjs').ArchetypeDefinition} ArchetypeDefinition
 * @typedef {import('./db.mjs').TraitTypeSchema} TraitTypeSchema
 */


export function setupStandardArchetypes() {
  /** @type {Record<string, string|TraitTypeSchema>} */
  const traittypes = {
    '@about': {
      type: 'Subject',
      mind: 'parent'  // Resolve in parent mind's ground state
    },
    '@label': 'string',
    '@tt': 'number',
    location: 'Location',
    mind: 'Mind',  // Singular Mind reference
    color: 'string',
    name: 'string',
    inventory: 'PortableObject',
  };

  /** @type {Record<string, ArchetypeDefinition>} */
  const archetypes = {
    Thing: {
      traits: {
        '@about': null,
        '@label': null,
        '@tt': null,
      },
    },

    ObjectPhysical: {
      bases: ['Thing'],
      traits: {
        location: null,
        color: null,
      },
    },
    Mental: {
      traits: {
        mind: {_call: 'create_from_template'},
      },
    },
    Villager: {
      bases: ['Mental'],
      traits: {
        'mind.append': {
          tavern: ['location'],
          mayor: ['name']
        }
      },
    },
    Blacksmith: {
      bases: ['Mental'],
      traits: {
        'mind.append': {
          forge: ['location'],
          tools: ['inventory']
        }
      },
    },
    Location: {
      bases: ['ObjectPhysical'],
    },
    PortableObject: {
      bases: ['ObjectPhysical'],
    },
  };

  /** @type {Record<string, {bases: string[], traits?: Object}>} */
  const prototypes = {
    Actor: {
      bases: ['ObjectPhysical'],
    },
    Person: {
      bases: ['Actor', 'Mental'],
    },

    // Demonstrates trait composition from multiple archetypes
    blacksmith_villager: {
      bases: ['Person', 'Villager', 'Blacksmith'],
      traits: {
        location: 'forge',
      },
    },

  };

  DB.register(traittypes, archetypes, prototypes);
}

setupStandardArchetypes();

// Create world mind and initial state
const world_mind = new Cosmos.Mind(null, 'world');
const state = world_mind.create_state(1);

// Create world beliefs (entities in the world)
const world_belief = {
  workshop: {
    bases: ['Location'],
  },

  market: {
    bases: ['Location'],
  },

  tavern: {
    bases: ['Location'],
  },

  forge: {
    bases: ['Location'],
  },

  hammer: {
    bases: ['PortableObject'],
    traits: {
      location: 'workshop',
    },
  },

  tools: {
    bases: ['PortableObject'],
    traits: {
      location: 'forge',
    },
  },

  mayor: {
    bases: ['Person'],
    traits: {
      location: 'tavern',
    },
  },

  npc1: {
    bases: ['Person'],
    traits: {
      location: 'market',
//    mind: {
//      workshop: ['location']
//    }
    },
  },

  player: {
    bases: ['blacksmith_villager'],
    traits: {
      location: 'workshop',
//      mind: {
//        workshop: ['location']
//      }
    },
  },
}

state.add_beliefs_from_template(world_belief);

const player = state.get_belief_by_label('player');
if (!player) throw new Error('Player belief not found');

//const player_mind = player.get_trait(state, 'mind');
//let player_state = [...player_mind.states_at_tt(1)][0];
//player_state.lock()

//player_state = player_state.branch_state(state);
//player_state.learn_about(state.get_belief_by_label('hammer'), ['location']);



state.lock();
//log(player_state);

//const ball = state.add_belief_from_template({
//  label: 'ball',
//  bases: ['PortableObject'],
//  traits: {
//    location: 'workshop',
//  },
//});
//
//state = state.tick({});
//
//state = state.tick_with_traits(ball, {
//  color: 'blue',
//});


// Create game session
export const session = new Session(world_mind, state, player);

// log(Adventure);


//function inspect( obj ){
//  const e = obj.versions ? obj.versions.slice(-1)[0] : obj;
//  log('👁️', world.sysdesig(obj), e.bake());
//}
