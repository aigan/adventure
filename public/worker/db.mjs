const log = console.log.bind(console);

const db_archetypes = {};
const db_traittypes = {};

let id_sequence = 0;

/**
 * Register archetypes and trait types into the database
 * @param {Object<string, object>} archetypes - Archetype definitions {label: definition}
 * @param {Object<string, string>} traittypes - Trait type definitions {label: type}
 */
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
  static db_by_id = new Map();
  static db_by_label = new Map();

  /**
   * @param {string} label - Mind identifier
   * @param {object} beliefs - Initial beliefs {label: definition}
   */
  constructor(label, beliefs) {
    this._id = ++ id_sequence;
    this.label = label;
    /** @type {Set<State>} */
    this.state = new Set([]);
    /** @type {Set<Belief>} */
    this.belief = new Set([]);
    this.belief_by_label = {};

    for (const [label, def] of Object.entries(beliefs)) {
      def.label = label;
      this.add(def);
    }

    // Register globally
    Mind.db_by_id.set(this._id, this);
    if (label) {
      Mind.db_by_label.set(label, this);
    }

    //log(`Created mind ${this._id}`);
  }

  /**
   * @param {number} id
   * @returns {Mind|undefined}
   */
  static get_by_id(id) {
    //log(`Get mind by id ${id}`);
    return Mind.db_by_id.get(id);
  }

  /**
   * @param {string} label
   * @returns {Mind|undefined}
   */
  static get_by_label(label) {
    //log(`Get mind by label ${label}`);
    return Mind.db_by_label.get(label);
  }

  /**
   * @param {object} belief_def
   * @returns {Belief}
   */
  add(belief_def) {
    const belief = new Belief(this, belief_def);
    this.belief.add(belief);
    if (belief_def.label != null) {
      this.belief_by_label[belief_def.label] = belief;
    }
    return belief;
  }

  /**
   * @param {number} timestamp
   * @param {Iterable<Belief>} beliefs
   * @returns {State}
   */
  create_state(timestamp, beliefs) {
    const state = new State(this, timestamp, null, [...beliefs]);
    this.state.add(state);
    return state;
  }

  /**
   * @param {Belief} belief - Belief from parent mind
   * @param {string[]} trait_names - Traits to copy
   * @returns {Belief}
   */
  learn_about(belief, trait_names = []) {
    const copied_traits = {};
    for (const name of trait_names) {
      if (belief.traits.has(name)) {
        copied_traits[name] = belief.traits.get(name);
      }
    }

    // Copy only Archetype bases (not Belief bases which are version chains)
    const archetype_bases = [...belief.bases].filter(b => b instanceof Archetype);

    return this.add({
      about: belief,
      bases: archetype_bases,
      traits: copied_traits
    });
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
  /**
   * @param {Mind} mind
   * @param {number} timestamp
   * @param {State|null} base
   * @param {Belief[]} insert
   * @param {Belief[]} remove
   */
  constructor(mind, timestamp, base=null, insert=[], remove=[]) {
    this._id = ++ id_sequence;
    this.in_mind = mind;
    /** @type {State|null} */
    this.base = base;
    this.timestamp = timestamp;
    /** @type {Belief[]} */
    this.insert = insert;
    /** @type {Belief[]} */
    this.remove = remove;
  }

  /**
   * @param {object} param0
   * @param {Belief[]} [param0.insert]
   * @param {Belief[]} [param0.remove]
   * @param {Belief[]} [param0.replace]
   * @returns {State}
   */
  tick({insert=[], remove=[], replace=[]}) {
    for (const belief of replace) {
      // Only remove Belief bases (version chains), not Archetypes
      const belief_bases = [...belief.bases].filter(b => b instanceof Belief);
      remove.push(...belief_bases);
      insert.push(belief);
    }

    const state = new State(this.in_mind, this.timestamp + 1, this, insert, remove);
    this.in_mind.state.add(state);
    return state;
  }

  *get_beliefs() {
    const removed = new Set();

    /** @type {State|null} s */ let s;
    for (s = this; s; s = s.base) {
      for (const belief of s.insert) {
        if (!removed.has(belief._id)) {
          yield belief;
        }
      }
      for (const belief of s.remove) {
        removed.add(belief._id);
      }
    }
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
  /**
   * @param {Mind} mind
   * @param {object} param1
   * @param {string|null} [param1.label]
   * @param {Belief|null} [param1.about]
   * @param {(string|Archetype|Belief)[]} [param1.bases]
   * @param {object} [param1.traits]
   */
  constructor(mind, {label=null, about=null, bases=[], traits={}}) {
    this._id = ++ id_sequence;
    this.in_mind = mind;
    this.label = label;
    this.about = about;
    /** @type {Set<Belief|Archetype>} */
    this.bases = new Set([]);
    this.traits = new Map();

    for (let base of bases) {
      if (typeof base === 'string') {
        const base_label = base;
        // Resolution order: own mind → archetype registry
        base = mind.belief_by_label[base] ?? db_archetypes[base];
        if (!base) {
          throw `Base '${base_label}' not found in mind '${mind.label}' or archetype registry`;
        }
      }
      this.bases.add(/** @type {Belief|Archetype} */ (base));
    }

    for (const [trait_label, trait_data] of Object.entries(traits)) {
      this.resolve_and_add_trait(trait_label, trait_data);
    }
    // TODO: add default trait values
  }

  /**
   * @param {string} label
   * @param {*} data - Raw data to be resolved by traittype
   */
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

  /**
   * @param {string} label
   * @returns {boolean}
   */
  can_have_trait(label) {
    for (const archetype of this.get_archetypes()) {
      //log ("check traits of archetype", archetype.label, archetype);
      // @ts-ignore - generator always yields valid archetypes
      if (label in archetype.traits_template) return true;
    }
    return false;
  }

  /**
   * @param {Set<Belief|Archetype>} seen
   * @returns {Generator<Archetype>}
   */
  *get_archetypes(seen = new Set([])) {
    // bredth first
    /** @type {(Belief|Archetype)[]} */
    const bases = [this];
    while (bases.length > 0) {
      const base = bases.shift();
      if (!base || seen.has(base)) continue;

      // If base is an Archetype, yield it and its bases
      if (base instanceof Archetype) {
        yield* base.get_archetypes(seen);
      } else {
        // If base is a Belief, continue walking its bases
        seen.add(base);
        bases.push(... base.bases);
      }
    }
  }

  /**
   * @param {object} traits
   * @returns {Belief}
   */
  with_traits(traits) {
    const belief = new Belief(this.in_mind, {bases: [this], traits});
    this.in_mind.belief.add(belief);
    return belief;
  }

  sysdesig() {
    const parts = [];

    if (this.label) {
      parts.push(this.label);
    }

    // Get edge archetypes (directly in bases, not full inheritance)
    const edge_archetypes = [];
    const seen = new Set();
    /** @type {Belief[]} */
    const bases_to_check = [this];

    while (bases_to_check.length > 0) {
      const base = bases_to_check.shift();
      if (!base || seen.has(base)) continue;
      seen.add(base);

      for (const b of base.bases) {
        if (b instanceof Archetype) {
          edge_archetypes.push(b);
        } else if (b instanceof Belief) {
          // Walk up belief chain to find archetypes
          bases_to_check.push(b);
        }
      }

      // Stop after finding archetypes
      if (edge_archetypes.length > 0) break;
    }

    if (edge_archetypes.length > 0) {
      parts.push(`[${edge_archetypes.map(a => a.label).join(', ')}]`);
    }

    parts.push(`#${this._id}`);

    return parts.join(' ');
  }

  toJSON() {
    return {
      _type: 'Belief',
      _id: this._id,
      label: this.label,
      about: this.about?._id ?? null,
      archetypes: [...this.get_archetypes()].map(a => a.label),
      bases: [...this.bases].map(b => b instanceof Archetype ? b.label : b._id),
      traits: Object.fromEntries(
        [...this.traits].map(([k, v]) => [k, Traittype.serializeTraitValue(v)])
      )
    };
  }

  inspect() {
    return {
      _type: 'Belief',
      _id: this._id,
      label: this.label,
      about: this.about ? {_ref: this.about._id, label: this.about.label} : null,
      archetypes: [...this.get_archetypes()].map(a => a.label),
      bases: [...this.bases].map(b => b instanceof Archetype ? b.label : b._id),
      traits: Object.fromEntries(
        [...this.traits].map(([k, v]) => [k, Traittype.inspectTraitValue(v)])
      )
    };
  }
}

export class Archetype {
  /**
   * @param {string} label
   * @param {object} param1
   * @param {string[]} [param1.bases]
   * @param {object} [param1.traits]
   */
  constructor(label, {bases=[], traits={}}) {
    this.label = label;

    //log("Construct archetype with bases", bases);
    /** @type {Set<Archetype>} */
    this.bases = new Set([]);
    for (const base_label of bases) {
      this.bases.add(db_archetypes[base_label]);
    }

    //this.traits = new Map();
    this.traits_template = traits;
  }

  /**
   * @param {Set<Belief|Archetype>} seen
   * @returns {Generator<Archetype>}
   */
  *get_archetypes(seen = new Set([])) {
    // bredth first
    /** @type {Archetype[]} */
    const bases = [this];
    while (bases.length > 0) {
      const base = bases.shift();
      if (!base || seen.has(base)) continue;

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

  /**
   * @param {string} label
   * @param {string} def
   */
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
      // @ts-ignore - unreachable code for future multi-slot traits
      def = {value:def};
    }

    this.schema = {};
    for (const [pred, pred_def] of Object.entries(def)) {
      this.schema[pred] = {range:pred_def};
    }
  }

  /**
   * @param {Mind} mind
   * @param {*} data
   * @returns {*}
   */
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

      if (belief == null) {
        log('resolve traittype', this.label, data, range_label);
        throw "Belief not found";
      }

      // Check if belief has the required archetype in its chain
      for (const archetype of belief.get_archetypes()) {
        if (archetype === range) {
          return belief;
        }
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

  /** @param {*} value */
  static serializeTraitValue(value) {
    if (value instanceof Belief || value instanceof State) {
      //return {_ref: value._id};
    }
    if (value?.toJSON) return value.toJSON();
    return value;
  }

  /** @param {*} value */
  static inspectTraitValue(value) {
    if (value instanceof Belief || value instanceof State || value instanceof Mind) {
      const result = {_ref: value._id, _type: value.constructor.name};
      if (value instanceof Belief || value instanceof Mind) {
        result.label = value.label;
      }
      return result;
    }
    if (value?.toJSON) return value.toJSON();
    return value;
  }
}
