//import * as DB from "./db.mjs";
//import {observation,observation_text} from "./observation.mjs";
//import Time from "./time.mjs";
//import * as Ponder from "./ponder.mjs";

const log = console.log.bind(console);

class DB {
  static archetypes = {};
  static traittypes = {}

  static register( archetypes, traittypes ){
    for (const [label, def] of Object.entries(archetypes)) {
      DB.archetypes[label] = new Archetype(label, def);
    }

    for (const [label, def] of Object.entries(traittypes)) {
      DB.traittypes[label] = def; // TODO: resolve trait datatypes
    }
  }
}

class Mind {
  constructor(label, beliefs) {
    this.label = label;
    this.state = new Set([]);
    this.belief = new Set([]);
    this.beliefByLabel = {};

    for (const [label, def] of Object.entries(beliefs)) {
      def.label = label;
      const belief = new Belief(this, def);
      this.belief.add(belief);
      if (def.label != null) {
        this.beliefByLabel[def.label] = belief;
      }
    }
  }
}

class Belief {
  constructor(mind, {label=null, archetypes=[], bases=[], traits={}}) {
    this.label = label;
    this.archetypes = new Set([]);
    this.bases = new Set([]);
    this.traits = new Map();

    for (let type of archetypes) {
      if (typeof type === 'string') {
        type = DB.archetypes[type];
      }
      this.archetypes.add(type);
    }

    for (let base of bases) {
      if (typeof base === 'string') {
        base = mind.beliefByLabel[base];
      }
      this.bases.add(base);
    }

    //log('belief', label);
  }
}

class Archetype {
  constructor(label, {bases=[], traits={}}) {
    this.label = label;
    this.bases = new Set(bases);
    this.traits = new Map();
    this.traits_template = traits;
  }
}

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
}


DB.register(archetypes, traittypes);

export const world = new Mind('world', world_belief);

const hammer = world.beliefByLabel.hammer;
log(hammer);


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
