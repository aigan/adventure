/**
 * Game world setup: archetypes, traittypes, and initial state
 *
 * See docs/SPECIFICATION.md for data model design
 * See .CONTEXT.md for worker implementation details
 * See docs/ALPHA-1.md for development stages
 */

import * as Cosmos from "./cosmos.mjs";
import * as DB from "./db.mjs";
import { Session as SessionClass } from "./session.mjs";
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


// Create circular location refs
const world_mind = new Cosmos.Mind('world');
const world_state = world_mind.create_state(1);

const room1 = world_state.add_belief({
  label: 'room1',
  bases: ['Location'],
});

const room2 = world_state.add_belief({
  label: 'room2',
  bases: ['Location'],
  traits: {
    location: room1,
  },
});

// Update room1 to point back to room2 (using tick_with_traits for versioning)
const state2 = world_state.tick_with_traits(room1, {
  location: room2,
});

// Save and reload
const json = Cosmos.save_mind(world_mind);
DB.reset_registries();
setupStandardArchetypes();
const loaded_mind = /** @type {Cosmos.Mind} */ (Cosmos.load(json));

log(loaded_mind);

// Verify circular refs work
// Need to get the latest versions from the current state, not by label
const loaded_state = [...loaded_mind.state].find(s => s.timestamp === 2);

if (!loaded_state) throw new Error('State with timestamp 2 not found');

//log(loaded_state);


const beliefs = [...loaded_state.get_beliefs()];
const loaded_room1 = beliefs.find(b => b.get_label() === 'room1');
const loaded_room2 = beliefs.find(b => b.get_label() === 'room2');

const loc1 = /** @type {import('./cosmos.mjs').Belief} */ (loaded_room1).traits.get('location');
const loc2 = /** @type {import('./cosmos.mjs').Belief} */ (loaded_room2).traits.get('location');

log(loc1,loc2);

const state = loaded_state;
const player = loc1;










//const world_belief = {
//  workshop: {
//    bases: ['Location'],
//  },
//
//  hammer: {
//    bases: ['PortableObject'],
//    traits: {
//      location: 'workshop',
//    },
//  },
//
//  player: {
//    bases: ['Person'],
//    traits: {
//      location: 'workshop',
//      mind_states: {
//        _type: 'State',
//        learn: {
//          workshop: ['location']
//        },
//        // ground_state automatically inferred from state.add_beliefs context
//        // Note: Can't learn about 'player' here since it's not registered yet
//        // The prototype already learns about workshop
//      }
//    },
//  },
//}
//
//// Create world mind and initial state
//const world_mind = new Cosmos.Mind('world');
//let state = world_mind.create_state(1);
//state.add_beliefs(world_belief);
//
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
//
//const player = Cosmos.Belief.by_label.get('player');
//
// Create game session
export const Session = new SessionClass(loaded_mind, loaded_state, loc1);

// log(Adventure);


//function inspect( obj ){
//  const e = obj.versions ? obj.versions.slice(-1)[0] : obj;
//  log('👁️', world.sysdesig(obj), e.bake());
//}
