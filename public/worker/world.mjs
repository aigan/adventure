import * as DB from "./db.mjs";
//import {observation,observation_text} from "./observation.mjs";
//import Time from "./time.mjs";
//import * as Ponder from "./ponder.mjs";

const log = console.log.bind(console);


const traittypes = {
  location: 'Location',
  mind: 'Mind',
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
    archetypes: ['Location'],
  },

  hammer: {
    archetypes: ['PortableObject'],
    traits: {
      location: 'workshop',
    },
  },

  player: {
    archetypes: ['Player'],
    traits: {
      location: 'workshop',
    },
  },
}


DB.register(archetypes, traittypes);

const world_mind = new DB.Mind('world', world_belief);
let state = world_mind.create_state(1, world_mind.belief);

//log(state);

let ball = world_mind.add({
  label: 'ball',
  archetypes: ['PortableObject'],
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

//log(state);

state = state.tick({
  replace: [ball],
});

//log(state);
//log(world_mind);


let player = world_mind.belief_by_label.player;

const player_belief = {
  player_mind_workshop: {
    archetypes: ['Location'],
  },
};

const player_mind = new DB.Mind('player_mind', player_belief);
player_mind.create_state(1, player_mind.belief);
player = player.with_traits({mind:player_mind});

state = state.tick({replace: [player]});


log(JSON.stringify(world_mind));
//log(JSON.stringify(state));

for (const belief of  state.get_beliefs()) {
  log("Belief", belief.sysdesig());
}

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



world_mind.player_enter_location = ()=>{
  //log('you', Adventure.player)
  //const loc = Adventure.player.get('InLocation').entity();

  postMessage(['header_set', `Good morning`]);
  const lines = ['Dizzy...'];
  
  postMessage(['main_add', ...lines ]);
}
