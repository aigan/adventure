//import * as DB from "./db.mjs";
//import {observation,observation_text} from "./observation.mjs";
//import Time from "./time.mjs";
//import * as Ponder from "./ponder.mjs";

const log = console.log.bind(console);

class DB {
  static archetypes = {};
  static traittypes = {}

  static register( archetypes, traittypes ) {
    for (const [label, def] of Object.entries(archetypes)) {
      DB.archetypes[label] = new Archetype(label, def);
    }

    for (const [label, def] of Object.entries(traittypes)) {
      //DB.traittypes[label] = def; // TODO: resolve trait datatypes
      DB.traittypes[label] = new Traittype(label, def);
    }
  }
}

class Mind {
  constructor(label, beliefs) {
    this.label = label;
    this.state = new Set([]);
    this.belief = new Set([]);
    this.belief_by_label = {};

    for (const [label, def] of Object.entries(beliefs)) {
      def.label = label;
      const belief = new Belief(this, def);
      this.belief.add(belief);
      if (def.label != null) {
        this.belief_by_label[def.label] = belief;
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
        base = mind.belief_by_label[base];
      }
      this.bases.add(base);
    }

    for (const [trait_label, trait_data] of Object.entries(traits)) {
      this.resolve_and_add_trait(mind, trait_label, trait_data);
    }
  }

  resolve_and_add_trait(mind, label, data) {
    const traittype = DB.traittypes[label];
    const value = traittype.resolve(mind, data);
    this.traits.set(label, value);

    // TODO: Validate that belief can have trait
    //log('belief', this.label, 'add trait', label, data, datatype, value);
  }
}

class Archetype {
  constructor(label, {bases=[], traits={}}) {
    this.label = label;
    this.bases = new Set(bases);
    //this.traits = new Map();
    this.traits_template = traits;
  }
}

class Traittype {
  static data_type_map = {
    Number: Number,
    String: String,
    Boolean: Boolean,
    Map: Map,
    Set: Set,
  }

  constructor(label, def) {
    this.schema = {
      value: {range:def},
    }
    return;
    
    //-----

    if (typeof(def) !== 'object') {
      def = {value:def};
    }

    this.schema = {};
    for (const [pred, pred_def] of Object.entries(def)) {
      this.schema[pred] = {range:pred_def};
    }
  }

  get_datatype() {
    // Assume single slot type
    return Traittype.get_datatype( this.schema.value.range );
  }

  resolve(mind, data) {
    const range = this.get_datatype();
    if (range instanceof Archetype) {
      let belief;
      if (typeof data === 'string') {
        belief = mind.belief_by_label[data];
      } else {
        belief = data;
      }
      if (!belief.archetypes.has(range)) throw "Archetype mismatch";
      return belief;
    }

    throw "Not archetype";
  }

  static get_datatype(label) {
    if (Traittype.data_type_map[label]) return Traittype.data_type_map[label];
    if (DB.archetypes[label]) return DB.archetypes[label];
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

export const world = new Mind('world', world_belief);

const player = world.belief_by_label.player;

export const Adventure = {
  world,
  player,
};

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
