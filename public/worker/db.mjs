const log = console.log.bind(console);

const db_archetypes = {};
const db_traittypes = {};

let id_sequence = 0;

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
    this._id = ++ id_sequence;
    this.label = label;
    this.state = new Set([]);
    this.belief = new Set([]);
    this.belief_by_label = {};

    for (const [label, def] of Object.entries(beliefs)) {
      def.label = label;
      this.add(def);
    }
  }

  add(belief_def) {
    const belief = new Belief(this, belief_def);
    this.belief.add(belief);
    if (belief_def.label != null) {
      this.belief_by_label[belief_def.label] = belief;
    }
    return belief;
  }

  create_state(timestamp, beliefs) {
    const state = new State(this, timestamp, beliefs);
    this.state.add(state);
    return state;
  }

  toJSON() {
    return {
      _type: 'Mind',
      _id: this._id,
      label: this.label,
      belief: [...this.belief].map(b => b.toJSON()),
      state: [...this.state].map(s => s.toJSON())
    };
  }
}

export class State {
  constructor(mind, timestamp, base=null, insert=[], remove=[]) {
    this._id = ++ id_sequence;
    this.in_mind = mind;
    this.base = base;
    this.timestamp = timestamp;
    this.insert = insert;
    this.remove = remove;
  }

  tick({insert=[], remove=[], replace=[]}) {
    for (const belief of replace) {
      remove.push(...belief.bases);
      insert.push(belief);
    }

    const state = new State(this.in_mind, ++ this.timestamp, this, insert, remove);
    this.in_mind.state.add(state);
    return state;
  }

  toJSON() {
    return {
      _type: 'State',
      _id: this._id,
      base: this.base?._id ?? null,
      insert: this.insert.map(b => b._id),
      remove: this.remove.map(b => b._id)
    };
  }
}

export class Belief {
  constructor(mind, {label=null, archetypes=[], bases=[], traits={}}) {
    this._id = ++ id_sequence;
    this.in_mind = mind;
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
      this.resolve_and_add_trait(trait_label, trait_data);
    }
    // TODO: add default trait values
  }

  resolve_and_add_trait(label, data) {
    const traittype = db_traittypes[label];
    //log('looking up traittype', label, traittype);
    if (traittype == null) {
      log('belief', this.label, 'add trait', label, data);
      throw `Trait ${label} do not exist `;
    }

    const value = traittype.resolve(this.in_mind, data);

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

  with_traits(traits) {
    const belief = new Belief(this.in_mind, {bases: [this], traits});
    this.in_mind.belief.add(belief);
    return belief;
  }

  toJSON() {
    return {
      _type: 'Belief',
      _id: this._id,
      label: this.label,
      archetypes: [...this.archetypes].map(a => a.label),
      bases: [...this.bases].map(b => b._id),
      traits: Object.fromEntries(
        [...this.traits].map(([k, v]) => [k, Traittype.serializeTraitValue(v)])
      )
    };
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
    Map: Map,
    Set: Set,
    Mind: Mind,
  }

  static literal_type_map = {
    'number': Number,
    'string': String,
    'boolean': Boolean,
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

  resolve(mind, data) {
    const range_label = this.schema.value.range;

    if (db_archetypes[range_label]) {
      const range = db_archetypes[range_label];
      let belief;
      if (typeof data === 'string') {
        belief = mind.belief_by_label[data];
      } else {
        belief = data;
      }

      if (belief.archetypes.has(range)) {
        return belief;
      }

      log('resolve traittype', this.label, data, range_label);
      throw "Archetype mismatch";
    }

    if (Traittype.literal_type_map[range_label]) {
      if (typeof data === range_label) {
        return data;
      }

      log('resolve traittype', this.label, data, range_label);
      throw "type mismatch";
    }

    if (Traittype.data_type_map[range_label]) {
      const range =  Traittype.data_type_map[range_label];
      if (data instanceof range) {
        return data;
      }

      log('resolve traittype', this.label, data, range);
      throw "type mismatch";
    }

    log('resolve traittype', this.label, data, range_label);
    throw "Type not found";
  }

  static serializeTraitValue(value) {
    if (value instanceof Belief || value instanceof State) {
      //return {_ref: value._id};
    }
    if (value?.toJSON) return value.toJSON();
    return value;
  }
}
