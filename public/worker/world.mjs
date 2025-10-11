import * as DB from "./db.mjs";
//import {observation,observation_text} from "./observation.mjs";
//import Time from "./time.mjs";
//import * as Ponder from "./ponder.mjs";

const log = console.log.bind(console);


const traittypes = {
  location: 'Location',
  mind: 'State',
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

  Player: {
    bases: ['Actor', 'Mental'],
  },
}

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
    },
  },
}


DB.register(archetypes, traittypes);

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


let player = world_mind.belief_by_label.player;


// Create player mind and initial empty state
const player_mind = new DB.Mind('player_mind');
const player_mind_state = player_mind.create_state(1);

// Player learns about hammer on the state (automatically adds to insert list)
const hammer_knowledge = player_mind_state.learn_about(
  world_mind.belief_by_label.hammer,
  ['location']
);


// Lock the state when done learning
player_mind_state.lock();

// Update player entity with the locked state
player = player.with_traits({mind: player_mind_state});
state = state.tick({replace: [player]});


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
