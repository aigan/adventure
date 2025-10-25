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
//import {observation,observation_text} from "./observation.mjs";
//import Time from "./time.mjs";
//import * as Ponder from "./ponder.mjs";

/**
 * @typedef {import('./db.mjs').ArchetypeDefinition} ArchetypeDefinition
 * @typedef {import('./db.mjs').TraitTypeSchema} TraitTypeSchema
 */

const log = console.log.bind(console);


export function setupStandardArchetypes() {
  /** @type {Record<string, string|TraitTypeSchema>} */
  const traittypes = {
    '@about': {
      type: 'Subject',
      mind: 'parent'  // Resolve in parent mind's ground state
    },
    location: 'Location',
    mind: 'Mind',  // Singular Mind reference
    color: 'string',
  };

  /** @type {Record<string, ArchetypeDefinition>} */
  const archetypes = {
    ObjectPhysical: {
      traits: {
        '@about': null,
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
    Actor: {
      bases: ['ObjectPhysical'],
    },
    Person: {
      bases: ['Actor', 'Mental'],
    },
    Player: {
      bases: ['Actor', 'Mental'],
    },
  };

  DB.register(archetypes, traittypes);
}

setupStandardArchetypes();


const world_belief = {
  workshop: {
    bases: ['Location'],
  },

  hammer: {
    bases: ['PortableObject'],
    traits: {
      location: 'workshop',
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

// Create world mind and initial state
const world_mind = new Cosmos.Mind('world');
const state = world_mind.create_state(1);
state.add_beliefs(world_belief);

const player = DB.get_first_belief_by_label('player');
if (!player) throw new Error('Player belief not found');
const player_mind = player.get_trait(state, 'mind');
let player_state = [...player_mind.state][0];
player_state = player_state.branch_state(state);
player_state.learn_about(DB.get_first_belief_by_label('hammer'), ['location']);

state.lock();
log(player_state);

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
