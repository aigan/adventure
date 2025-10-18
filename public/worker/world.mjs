import * as DB from "./db.mjs";
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
const world_mind = new DB.Mind('world');
const world_state = world_mind.create_state(1);

const room1 = world_mind.add({
  label: 'room1',
  bases: ['Location'],
});

const room2 = world_mind.add({
  label: 'room2',
  bases: ['Location'],
  traits: {
    location: room1,
  },
});

// Update room1 to point back to room2
const room1_v2 = new DB.Belief(world_mind, {
  bases: [room1],
  traits: {
    location: room2,
  },
});

world_state.insert.push(room1, room2);
const state2 = world_state.tick({ replace: [room1_v2] });

// Save and reload
const json = DB.save_mind(world_mind);
DB.reset_registries();
setupStandardArchetypes();
const loaded_mind = /** @type {DB.Mind} */ (DB.load(json));

log(loaded_mind);

// Verify circular refs work
// Need to get the latest versions from the current state, not by label
const loaded_state = [...loaded_mind.state].find(s => s.timestamp === 2);

//log(loaded_state);


const beliefs = [.../** @type {import('./db.mjs').State} */ (loaded_state).get_beliefs()];
const loaded_room1 = beliefs.find(b => b.get_display_label() === 'room1');
const loaded_room2 = beliefs.find(b => b.get_display_label() === 'room2');

const loc1 = /** @type {import('./db.mjs').Belief} */ (loaded_room1).traits.get('location');
const loc2 = /** @type {import('./db.mjs').Belief} */ (loaded_room2).traits.get('location');

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
//const world_mind = new DB.Mind('world');
//let state = world_mind.create_state(1);
//state.add_beliefs(world_belief);
//
//const ball = world_mind.add({
//  label: 'ball',
//  bases: ['PortableObject'],
//  traits: {
//    location: 'workshop',
//  },
//});
//
//state = state.tick({
//  insert: [ball],
//});
//
//state = state.tick_with_traits(ball, {
//  color: 'blue',
//});
//
//const player = DB.Belief.by_label.get('player');
//
//// Adventure would be its own module later...
export const Adventure = {
  world: world_mind,
  player,
  state,
}

// log(Adventure);


//function inspect( obj ){
//  const e = obj.versions ? obj.versions.slice(-1)[0] : obj;
//  log('👁️', world.sysdesig(obj), e.bake());
//}
