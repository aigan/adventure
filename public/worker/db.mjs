const log = console.log.bind(console);

const db_archetypes = {};
const db_traittypes = {};

export function register( archetypes, traittypes ) {
  for (const [label, def] of Object.entries(traittypes)) {
    //traittypes[label] = def; // TODO: resolve trait datatypes
    db_traittypes[label] = new Traittype(label, def);
    //log("Registred tratittype", label);
  }

  for (const [label, def] of Object.entries(archetypes)) {
    db_archetypes[label] = new Archetype(label, def);
    //log("Registred archetype", label);
  }
}

export class Mind {
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

  create_state(tick, beliefs) {
    const state = new State(this, tick, beliefs);
    this.state.add(state);
    return state;
  }
}

export class State {
  constructor(mind, tick, added) {
    this.mind = mind;
    this.tick = tick;
    this.added = added;
  }
}

export class Belief {
  constructor(mind, {label=null, archetypes=[], bases=[], traits={}}) {
    this.label = label;
    this.archetypes = new Set([]);
    this.bases = new Set([]);
    this.traits = new Map();

    for (let type of archetypes) {
      if (typeof type === 'string') {
        type = db_archetypes[type];
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
    // TODO: add default trait values
  }

  resolve_and_add_trait(mind, label, data) {
    const traittype = db_traittypes[label];
    //log('looking up traittype', label, traittype);
    if (traittype == null) {
      log('belief', this.label, 'add trait', label, data);
      throw `Trait ${label} do not exist `;
    }

    const value = traittype.resolve(mind, data);

    if (!this.can_have_trait(label)) {
      log('belief', this.label, 'add trait', label, data, value);
      throw "belief cant have trait " + label;
    }

    this.traits.set(label, value);

    //log('belief', this.label, 'add trait', label, data, datatype, value);
  }

  can_have_trait(label) {
    for (const archetype of this.get_archetypes()) {
      //log ("check traits of archetype", archetype.label, archetype);
      if (label in archetype.traits_template) return true;
    }
    return false;
  }

  *get_archetypes(seen = new Set([])) {
    // bredth first
    const bases = [this];
    while (bases.length > 0) {
      const base = bases.shift();
      if (seen.has(base)) continue;

      //log ("Check archetypes of", base.label);
      seen.add(base);
      bases.push(... base.bases);

      for (const archetype of base.archetypes) {
        if (seen.has(archetype)) continue;
        yield* archetype.get_archetypes(seen);
      }
    }
  }
}

export class Archetype {
  constructor(label, {bases=[], traits={}}) {
    this.label = label;

    //log("Construct archetype with bases", bases);
    this.bases = new Set([]);
    for (const base_label of bases) {
      this.bases.add(db_archetypes[base_label]);
    }

    //this.traits = new Map();
    this.traits_template = traits;
  }

  *get_archetypes(seen = new Set([])) {
    // bredth first
    const bases = [this];
    while (bases.length > 0) {
      const base = bases.shift();
      if (seen.has(base)) continue;

      //log ("Check archetype", base.label);
      seen.add(base);
      bases.push(... base.bases);
      //log("archetype bases now", bases);
      yield base;
    }
  }
}

export class Traittype {
  static data_type_map = {
    Number: Number,
    String: String,
    Boolean: Boolean,
    Map: Map,
    Set: Set,
  }

  constructor(label, def) {
    this.label = label;
    this.schema = {
      value: {range:def},
    }
    return;
    
    //-----

    // Stub for multi-slot traits
    // eslint-disable-next-line no-unreachable
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
    //log('resolve traittype', this.label, data, range);
    if (range instanceof Archetype) {
      let belief;
      if (typeof data === 'string') {
        belief = mind.belief_by_label[data];
      } else {
        belief = data;
      }
      //log('validate archetype', belief);
      if (!belief.archetypes.has(range)) throw "Archetype mismatch";
      return belief;
    }

    throw "Not archetype";
  }

  static get_datatype(label) {
    //log('Get traittype datatype', label);
    if (Traittype.data_type_map[label]) return Traittype.data_type_map[label];
    if (db_archetypes[label]) return db_archetypes[label];
  }

}
