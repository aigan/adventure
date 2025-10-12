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
 * @param {Object<string, string|object>} traittypes - Trait type definitions {label: type or schema}
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
   * @param {State|null} ground_state
   * @returns {State}
   */
  create_state(timestamp, ground_state = null) {
    const state = new State(this, timestamp, null, [], [], ground_state);
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
   * @param {State|null} ground_state
   */
  constructor(mind, timestamp, base=null, insert=[], remove=[], ground_state=null) {
    this._id = ++ id_sequence;
    this.in_mind = mind;
    /** @type {State|null} */
    this.base = base;
    this.timestamp = timestamp;
    /** @type {Belief[]} */
    this.insert = insert;
    /** @type {Belief[]} */
    this.remove = remove;
    /** @type {State|null} */
    this.ground_state = ground_state;
    /** @type {State[]} */
    this.branches = [];
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
   * @param {State|null} [param0.ground_state]
   * @returns {State}
   */
  tick({insert=[], remove=[], replace=[], ground_state}) {
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

    const state = new State(this.in_mind, this.timestamp + 1, this, insert, remove, ground_state ?? this.ground_state);
    this.branches.push(state);
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
    const original = this._follow_about_chain_to_original(belief);

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
        copied_traits[name] = this._dereference_trait_value(value);
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

  /**
   * @param {Belief} belief
   * @param {boolean} throw_on_cycle - If false, returns null on cycle instead of throwing
   * @returns {Belief|null}
   */
  _follow_about_chain_to_original(belief, throw_on_cycle = true) {
    let original = belief;
    const seen = new Set();
    while (original.about != null) {
      if (seen.has(original)) {
        if (throw_on_cycle) {
          throw new Error(`Cycle detected in about chain for belief ${belief._id}`);
        }
        return null;
      }
      seen.add(original);
      original = original.about;
    }
    return original;
  }

  /**
   * Handles primitives, Beliefs, and arrays recursively
   * @param {*} value
   * @returns {*}
   */
  _dereference_trait_value(value) {
    if (Array.isArray(value)) {
      return value.map(item => this._dereference_trait_value(item));
    } else if (value instanceof Belief) {
      return this._find_or_learn_belief_about(value);
    } else {
      return value;
    }
  }

  /**
   * Calls learn_about() recursively if belief doesn't exist in this state
   * @param {Belief} belief_reference
   * @returns {Belief}
   */
  _find_or_learn_belief_about(belief_reference) {
    // Find the original entity this belief is about
    const original = this._follow_about_chain_to_original(belief_reference);

    // Search for existing belief about this entity in current state
    const existing_beliefs = [];
    for (const b of this.get_beliefs()) {
      const candidate_original = this._follow_about_chain_to_original(b, false);
      if (candidate_original && candidate_original === original) {
        existing_beliefs.push(b);
      }
    }

    if (existing_beliefs.length > 1) {
      throw new Error(`Multiple beliefs about entity ${original._id} exist in mind ${this.in_mind.label}`);
    }

    if (existing_beliefs.length === 1) {
      return existing_beliefs[0];
    } else {
      // Create new belief about the referenced entity
      return this.learn_about(belief_reference);
    }
  }

  toJSON() {
    return {
      _type: 'State',
      _id: this._id,
      base: this.base?._id ?? null,
      ground_state: this.ground_state?._id ?? null,
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
   * @param {string|object} def
   */
  constructor(label, def) {
    this.label = label;

    // Parse definition
    if (typeof def === 'string') {
      // Simple type: 'State', 'Location', 'string', etc
      this.data_type = def;
      this.container = null;
      this.constraints = null;
    } else {
      // Object schema: {type: 'State', container: Array, min: 1}
      this.data_type = def.type;
      this.container = def.container ?? null;
      this.constraints = {
        min: def.min ?? null,
        max: def.max ?? null
      };
    }

    // Build resolver function once during construction
    this._resolver = this._build_resolver();
  }

  /**
   * Build the resolver function based on container type
   * @returns {Function}
   */
  _build_resolver() {
    if (this.container === Array) {
      return (mind, data) => {
        if (!Array.isArray(data)) {
          throw new Error(`Expected array for trait '${this.label}', got ${typeof data}`);
        }

        if (this.constraints?.min != null && data.length < this.constraints.min) {
          throw new Error(`Array for trait '${this.label}' has length ${data.length}, min is ${this.constraints.min}`);
        }

        if (this.constraints?.max != null && data.length > this.constraints.max) {
          throw new Error(`Array for trait '${this.label}' has length ${data.length}, max is ${this.constraints.max}`);
        }

        // Resolve each item
        return data.map(item => this._resolve_item(mind, item));
      };
    } else {
      // No container - single value
      return (mind, data) => this._resolve_item(mind, data);
    }
  }

  /**
   * Resolve a single item (not an array)
   * @param {Mind} mind
   * @param {*} data
   * @returns {*}
   */
  _resolve_item(mind, data) {
    const type_label = this.data_type;

    // Check if it's an Archetype reference
    if (Archetype.by_label[type_label]) {
      const archetype = Archetype.by_label[type_label];
      let belief;
      if (typeof data === 'string') {
        belief = Belief.by_label.get(data);
      } else {
        belief = data;
      }

      if (belief == null) {
        throw new Error(`Belief not found for trait '${this.label}': ${data}`);
      }

      // Check if belief has the required archetype in its chain
      for (const a of belief.get_archetypes()) {
        if (a === archetype) {
          return belief;
        }
      }

      throw new Error(`Belief does not have required archetype '${type_label}' for trait '${this.label}'`);
    }

    // Check if it's a literal type (string, number, boolean)
    if (Traittype.literal_type_map[type_label]) {
      if (typeof data === type_label) {
        return data;
      }
      throw new Error(`Expected ${type_label} for trait '${this.label}', got ${typeof data}`);
    }

    // Check if it's a data type (Mind, State)
    if (Traittype.data_type_map[type_label]) {
      const type_constructor = Traittype.data_type_map[type_label];
      if (data instanceof type_constructor) {
        return data;
      }
      throw new Error(`Expected ${type_label} instance for trait '${this.label}'`);
    }

    throw new Error(`Unknown type '${type_label}' for trait '${this.label}'`);
  }

  /**
   * @param {Mind} mind
   * @param {*} data
   * @returns {*}
   */
  resolve(mind, data) {
    return this._resolver(mind, data);
  }

  /** @param {*} value */
  static serializeTraitValue(value) {
    if (Array.isArray(value)) {
      return value.map(item => Traittype.serializeTraitValue(item));
    }
    if (value instanceof Belief || value instanceof State) {
      //return {_ref: value._id};
    }
    if (value?.toJSON) return value.toJSON();
    return value;
  }

  /** @param {*} value */
  static inspectTraitValue(value) {
    if (Array.isArray(value)) {
      return value.map(item => Traittype.inspectTraitValue(item));
    }
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
