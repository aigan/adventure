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

const world = new DB.Mind('world', world_belief);
let state = world.create_state(1, world.belief);

//log(state);

let ball = world.add({
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
//log(world);


let player = world.belief_by_label.player;

player = player.with_traits({mind:new DB.Mind('player_mind', {
  player_mind_workshop: {
    archetypes: ['Location'],
  },
})});
state = state.tick({replace: [player]});


//log(JSON.stringify(world)); log(world);
//log(JSON.stringify(state));

log(state);

for (const belief of  state.get_beliefs()) {
  log("Belief", belief.sysdesig());
}

// Adventure would be its own module later...
export const Adventure = {
  world,
  player,
  state,
}

// log(Adventure);


//function inspect( obj ){
//  const e = obj.versions ? obj.versions.slice(-1)[0] : obj;
//  log('👁️', world.sysdesig(obj), e.bake());
//}



world.player_enter_location = ()=>{
  //log('you', Adventure.player)
  //const loc = Adventure.player.get('InLocation').entity();

  postMessage(['header_set', `Good morning`]);
  const lines = ['Dizzy...'];
  
  postMessage(['main_add', ...lines ]);
}
