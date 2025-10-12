const log = console.log.bind(console);

let id_sequence = 0;

/**
 * Reset all registries (for testing)
 */
export function reset_registries() {
  Mind.by_id.clear();
  Mind.by_label.clear();
  Belief.by_id.clear();
  Belief.by_label.clear();
  Archetype.by_label = {};
  Traittype.by_label = {};
  id_sequence = 0;
}

/**
 * Register archetypes and trait types into the database
 * @param {Object<string, object>} archetypes - Archetype definitions {label: definition}
 * @param {Object<string, string>} traittypes - Trait type definitions {label: type}
 */
export function register( archetypes, traittypes ) {
  for (const [label, def] of Object.entries(traittypes)) {
    //traittypes[label] = def; // TODO: resolve trait datatypes
    Traittype.by_label[label] = new Traittype(label, def);
    //log("Registred tratittype", label);
  }

  for (const [label, def] of Object.entries(archetypes)) {
    // Check label uniqueness across beliefs and archetypes
    if (Archetype.by_label[label]) {
      throw new Error(`Label '${label}' is already used by another archetype`);
    }
    if (Belief.by_label.has(label)) {
      throw new Error(`Label '${label}' is already used by a belief`);
    }
    Archetype.by_label[label] = new Archetype(label, def);
    //log("Registred archetype", label);
  }
}

export class Mind {
  static by_id = new Map();
  static by_label = new Map();

  /**
   * @param {string} label - Mind identifier
   */
  constructor(label) {
    this._id = ++ id_sequence;
    this.label = label;
    /** @type {Set<State>} */
    this.state = new Set([]);

    // Register globally
    Mind.by_id.set(this._id, this);
    if (label) {
      Mind.by_label.set(label, this);
    }

    //log(`Created mind ${this._id}`);
  }

  /**
   * @param {number} id
   * @returns {Mind|undefined}
   */
  static get_by_id(id) {
    //log(`Get mind by id ${id}`);
    return Mind.by_id.get(id);
  }

  /**
   * @param {string} label
   * @returns {Mind|undefined}
   */
  static get_by_label(label) {
    //log(`Get mind by label ${label}`);
    return Mind.by_label.get(label);
  }

  /**
   * @param {object} belief_def
   * @returns {Belief}
   */
  add(belief_def) {
    const belief = new Belief(this, belief_def);
    return belief;
  }

  /**
   * @param {number} timestamp
   * @returns {State}
   */
  create_state(timestamp) {
    const state = new State(this, timestamp, null, []);
    this.state.add(state);
    return state;
  }

  toJSON() {
    // Filter beliefs from global registry that belong to this mind
    const mind_beliefs = [];
    for (const belief of Belief.by_id.values()) {
      if (belief.in_mind === this) {
        mind_beliefs.push(belief.toJSON());
      }
    }

    return {
      _type: 'Mind',
      _id: this._id,
      label: this.label,
      belief: mind_beliefs,
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
    this.locked = false;
  }

  lock() {
    this.locked = true;
    for (const belief of this.insert) {
      belief.lock();
    }
  }

  /**
   * @param {Object<string, object>} beliefs - Object mapping labels to belief definitions
   */
  add_beliefs(beliefs) {
    for (const [label, def] of Object.entries(beliefs)) {
      const belief = new Belief(this.in_mind, {...def, label});
      this.insert.push(belief);
    }
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

    // Validate all beliefs belong to this mind or are cultural (null mind)
    for (const belief of insert) {
      if (belief.in_mind !== this.in_mind && belief.in_mind !== null) {
        throw new Error(`Belief ${belief._id} (in_mind: ${belief.in_mind?.label}) cannot be inserted into state for mind ${this.in_mind.label}`);
      }
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

  /**
   * @param {Belief} belief - Belief from another mind/state
   * @param {string[]} trait_names - Traits to copy
   * @returns {Belief}
   */
  learn_about(belief, trait_names = []) {
    // Follow about chain to original entity
    let original = belief;
    const seen_in_chain = new Set();
    while (original.about != null) {
      if (seen_in_chain.has(original)) {
        throw new Error(`Cycle detected in about chain for belief ${belief._id}`);
      }
      seen_in_chain.add(original);
      original = original.about;
    }

    // Walk belief chain to collect all archetype bases
    const archetype_bases = [];
    const seen = new Set();
    const to_check = [belief];

    while (to_check.length > 0) {
      const current = to_check.shift();
      if (seen.has(current)) continue;
      seen.add(current);

      for (const base of current.bases) {
        if (base instanceof Archetype) {
          if (!archetype_bases.includes(base)) {
            archetype_bases.push(base);
          }
        } else if (base instanceof Belief) {
          to_check.push(base);
        }
      }
    }

    // Copy traits, dereferencing belief references to this mind
    const copied_traits = {};
    for (const name of trait_names) {
      if (belief.traits.has(name)) {
        const value = belief.traits.get(name);

        if (value instanceof Belief) {
          // Find or create belief in this state about the referenced entity

          // Follow about chain for the referenced belief
          let ref_original = value;
          const ref_seen = new Set();
          while (ref_original.about != null) {
            if (ref_seen.has(ref_original)) {
              throw new Error(`Cycle detected in about chain for belief ${value._id}`);
            }
            ref_seen.add(ref_original);
            ref_original = ref_original.about;
          }

          // Search for existing belief about this entity in current state
          const existing_beliefs = [];
          for (const b of this.get_beliefs()) {
            // Follow about chain for candidate
            let candidate_original = b;
            const candidate_seen = new Set();
            while (candidate_original.about != null) {
              if (candidate_seen.has(candidate_original)) {
                // Skip beliefs with cycles
                break;
              }
              candidate_seen.add(candidate_original);
              candidate_original = candidate_original.about;
            }

            if (candidate_original === ref_original) {
              existing_beliefs.push(b);
            }
          }

          if (existing_beliefs.length > 1) {
            throw new Error(`Multiple beliefs about entity ${ref_original._id} exist in mind ${this.in_mind.label}`);
          }

          if (existing_beliefs.length === 1) {
            copied_traits[name] = existing_beliefs[0];
          } else {
            // Create new belief about the referenced entity
            const new_belief = this.learn_about(value);
            copied_traits[name] = new_belief;
          }
        } else {
          // Copy non-Belief values as-is
          copied_traits[name] = value;
        }
      }
    }

    // Create the belief and add to state's insert list
    const new_belief = new Belief(this.in_mind, {
      about: original,
      bases: archetype_bases,
      traits: copied_traits
    });

    this.insert.push(new_belief);

    return new_belief;
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
  static by_id = new Map();
  static by_label = new Map();

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
    this.locked = false;

    for (let base of bases) {
      if (typeof base === 'string') {
        const base_label = base;
        // Resolution order: belief registry → archetype registry
        base = Belief.by_label.get(base) ?? Archetype.by_label[base];
        if (!base) {
          throw `Base '${base_label}' not found in belief registry or archetype registry`;
        }
      }
      this.bases.add(/** @type {Belief|Archetype} */ (base));
    }

    for (const [trait_label, trait_data] of Object.entries(traits)) {
      this.resolve_and_add_trait(trait_label, trait_data);
    }

    // Register globally
    Belief.by_id.set(this._id, this);
    if (label) {
      // Check label uniqueness across beliefs and archetypes
      if (Belief.by_label.has(label)) {
        throw new Error(`Label '${label}' is already used by another belief`);
      }
      if (Archetype.by_label[label]) {
        throw new Error(`Label '${label}' is already used by an archetype`);
      }
      Belief.by_label.set(label, this);
    }

    // TODO: add default trait values
  }

  /**
   * @param {string} label
   * @param {*} data - Raw data to be resolved by traittype
   */
  resolve_and_add_trait(label, data) {
    const traittype = Traittype.by_label[label];
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
    return belief;
  }

  lock() {
    this.locked = true;
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
  static by_label = {};

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
      this.bases.add(Archetype.by_label[base_label]);
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
  static by_label = {};

  static data_type_map = {
    Map: Map,
    Set: Set,
    Mind: Mind,
    State: State,
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

    if (Archetype.by_label[range_label]) {
      const range = Archetype.by_label[range_label];
      let belief;
      if (typeof data === 'string') {
        belief = Belief.by_label.get(data);
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
