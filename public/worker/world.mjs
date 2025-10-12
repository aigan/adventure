import * as DB from "./db.mjs";
//import {observation,observation_text} from "./observation.mjs";
//import Time from "./time.mjs";
//import * as Ponder from "./ponder.mjs";

const log = console.log.bind(console);


const traittypes = {
  location: 'Location',
  mind_states: {
    type: 'State',
    container: Array,
    min: 1
  },
  color: 'string',
}

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

  Player: {
    bases: ['Actor', 'Mental'],
  },
}

// Define state prototypes
//DB.State.by_label.player_mind = {
//  learn: {
//    workshop: ['location']
//  }
//}

DB.register(archetypes, traittypes);

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
    bases: ['Player'],
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
const world_mind = new DB.Mind('world');
let state = world_mind.create_state(1);
state.add_beliefs(world_belief);

let ball = world_mind.add({
  label: 'ball',
  bases: ['PortableObject'],
  traits: {
    location: 'workshop',
  },
});

state = state.tick({
  insert: [ball],
});

ball = ball.with_traits({
  color: 'blue',
});

state = state.tick({
  replace: [ball],
});

const player = DB.Belief.by_label.get('player');

// Adventure would be its own module later...
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
