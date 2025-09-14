import * as DB from "./db.mjs";
//import {observation,observation_text} from "./observation.mjs";
//import Time from "./time.mjs";
//import * as Ponder from "./ponder.mjs";

const log = console.log.bind(console);


const traittypes = {
 'location': 'Location',
}

const archetypes = {
  ObjectPhysical: {
    traits: {
      location: null,
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
    bases: ['Actor'],
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

export const world = new DB.Mind('world', world_belief);
const state = world.create_state(1, world.belief);
const player = world.belief_by_label.player;

export const Adventure = {
  world,
  player,
  state,
}

log(Adventure);


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
