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
import { log } from "../lib/debug.mjs";
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
    '@timestamp': 'number',
    location: 'Location',
    mind: 'Mind',  // Singular Mind reference
    color: 'string',
  };

  /** @type {Record<string, ArchetypeDefinition>} */
  const archetypes = {
    Thing: {
      traits: {
        '@about': null,
        '@timestamp': null,
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
        mind: null,
      },
    },
    Location: {
      bases: ['ObjectPhysical'],
    },
    PortableObject: {
      bases: ['ObjectPhysical'],
    },
  };

  DB.register(archetypes, traittypes);
}

setupStandardArchetypes();

// Create shared beliefs (before world mind/state)
Cosmos.Belief.create_shared_from_template(['ObjectPhysical'], {
  '@timestamp': 1,
  '@label': 'Actor'
}, (subject)=>DB.valid_at(subject,1));

Cosmos.Belief.create_shared_from_template(['Actor', 'Mental'], {
  '@timestamp': 1,
  '@label': 'Person'
}, (subject)=>DB.valid_at(subject,1));

// Create world mind and initial state
const world_mind = new Cosmos.Mind('world');
const state = world_mind.create_state(1);

// Create world beliefs (entities in the world)
const world_belief = {
  workshop: {
    bases: ['Location'],
  },

  market: {
    bases: ['Location'],
  },

  hammer: {
    bases: ['PortableObject'],
    traits: {
      location: 'workshop',
    },
  },

  npc1: {
    bases: ['Person'],
    traits: {
      location: 'market',
      mind: {
        workshop: ['location']
      }
    },
  },

  player: {
    bases: ['Person'],
    traits: {
      location: 'workshop',
      mind: {
        workshop: ['location']
      }
    },
  },
}

state.add_beliefs(world_belief);

const player = DB.get_first_belief_by_label('player');
if (!player) throw new Error('Player belief not found');
const player_mind = player.get_trait_as_belief(state, 'mind');
let player_state = [...player_mind.state][0]; // FIXME: iteration anti-pattern
player_state = player_state.branch_state(state);
player_state.learn_about(DB.get_first_belief_by_label('hammer'), ['location']);

state.lock();
//log(player_state);

//const ball = state.add_belief({
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
