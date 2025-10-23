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
    mind_states: {
      type: 'State',
      container: Array,
      min: 1
    },
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
        mind_states: null,
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
      mind_states: {
        _type: 'State',
        learn: {
          workshop: ['location']
        },
        // ground_state automatically inferred from state.add_beliefs context
        // Note: Can't learn about 'player' here since it's not registered yet
        // The prototype already learns about workshop
      }
    },
  },
}

// Create world mind and initial state
const world_mind = new Cosmos.Mind('world');
const state = world_mind.create_state(1);
state.add_beliefs(world_belief);

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

const player = DB.get_belief_by_label('player');

// Create game session
export const session = new Session(world_mind, state, player);

// log(Adventure);


//function inspect( obj ){
//  const e = obj.versions ? obj.versions.slice(-1)[0] : obj;
//  log('👁️', world.sysdesig(obj), e.bake());
//}
