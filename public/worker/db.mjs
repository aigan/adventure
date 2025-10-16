import { assert, log } from '../lib/debug.mjs';

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
 * Serialization coordinator with dependency tracking
 */
export class Serialize {
  static dependency_queue = null;
  static seen = null;

  /**
   * Save mind to JSON string with automatic nested mind discovery
   * @param {Mind} mind - Mind to serialize
   * @returns {string} JSON string
   */
  static save_mind(mind) {
    // Set up tracking
    Serialize.dependency_queue = [];
    Serialize.seen = new Set([mind._id]); // Mark root as seen

    // Serialize root mind
    const root = mind.toJSON();

    // Process dependencies discovered during serialization
    const nested_minds = [];
    while (Serialize.dependency_queue.length > 0) {
      const dep_mind = Serialize.dependency_queue.shift();
      if (!Serialize.seen.has(dep_mind._id)) {
        Serialize.seen.add(dep_mind._id);
        nested_minds.push(dep_mind.toJSON());
      }
    }

    // Clean up
    Serialize.dependency_queue = null;
    Serialize.seen = null;

    // Add nested minds to root
    if (nested_minds.length > 0) {
      root.nested_minds = nested_minds;
    }

    return JSON.stringify(root, null, 2);
  }
}

/**
 * Save mind to JSON string
 * @param {Mind} mind - Mind to serialize
 * @returns {string} JSON string
 */
export function save_mind(mind) {
  return Serialize.save_mind(mind);
}

/**
 * Load from JSON string (dispatches on _type field)
 * Assumes empty DB - updates id_sequence from loaded data
 * @param {string} json_string - JSON string to load
 * @returns {Mind|Belief|State} Loaded object
 */
export function load(json_string) {
  const data = JSON.parse(json_string);

  if (!data._type) {
    throw new Error('JSON data missing _type field');
  }

  let result;
  switch (data._type) {
    case 'Mind':
      result = Mind.from_json(data);
      break;
    case 'Belief':
      throw new Error('Loading individual Belief not yet implemented');
    case 'State':
      throw new Error('Loading individual State not yet implemented');
    default:
      throw new Error(`Unknown _type: ${data._type}`);
  }

  // Update id_sequence to continue from highest loaded ID
  update_id_sequence_from_data(data);

  return result;
}

/**
 * Update id_sequence from loaded data
 * @param {object} data - Loaded JSON data
 */
function update_id_sequence_from_data(data) {
  const find_max_id = (obj, max = 0) => {
    if (!obj || typeof obj !== 'object') return max;

    if (obj._id != null && typeof obj._id === 'number') {
      max = Math.max(max, obj._id);
    }

    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          max = find_max_id(item, max);
        }
      } else if (typeof value === 'object') {
        max = find_max_id(value, max);
      }
    }

    return max;
  };

  id_sequence = find_max_id(data);
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
    //log("Registered traittype", label);
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
   * @param {string|null|object} label - Mind identifier or JSON data
   * @param {Belief|null} self - What this mind considers "self" (can be null, can change)
   */
  constructor(label = null, self = null) {
    // Check if loading from JSON
    if (label && typeof label === 'object' && label._type === 'Mind') {
      const data = label;
      this._id = data._id;
      this.label = data.label;
      this.self = null; // Will be resolved in _materialize
      this.state = new Set();
      this._lazy = data;

      // Register globally
      Mind.by_id.set(this._id, this);
      if (this.label) {
        Mind.by_label.set(this.label, this);
      }
      return;
    }

    // Normal construction
    this._id = ++ id_sequence;
    this.label = label;
    this.self = self;
    /** @type {Set<State>} */
    this.state = new Set([]);
    this._lazy = null;

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

  /**
   * Create Mind from JSON data with lazy loading
   * @param {object} data - JSON data with _type: 'Mind'
   * @returns {Mind}
   */
  static from_json(data) {
    // Create mind shell (constructor handles lazy setup)
    const mind = new Mind(data);

    // Create belief shells
    for (const belief_data of data.belief) {
      Belief.from_json(mind, belief_data);
    }

    // Create state shells and add to their respective minds
    for (const state_data of data.state) {
      const state = State.from_json(mind, state_data);
      // Add to the state's in_mind (which might be different from mind if nested)
      state.in_mind.state.add(state);
    }

    // Load nested minds AFTER parent states (so ground_state references can be resolved)
    if (data.nested_minds) {
      for (const nested_mind_data of data.nested_minds) {
        Mind.from_json(nested_mind_data);
      }
    }

    return mind;
  }
}

export class State {
  // TODO: Populate this registry for prototype state templates
  // Will be used to share belief lists across many nodes
  // See resolve_template() lines 364-367 for planned usage
  static by_label = {};

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
    /** @type {State|null} */   this.base = base;
                                this.timestamp = timestamp;
    /** @type {Belief[]} */     this.insert = insert;
    /** @type {Belief[]} */     this.remove = remove;
    /** @type {State|null} */   this.ground_state = ground_state;
    /** @type {State[]} */      this.branches = [];
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
      const belief = new Belief(this.in_mind, {...def, label}, this);
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

  /**
   * Create new belief version with updated traits and add to new state
   * @param {Belief} belief - Belief to version
   * @param {object} traits - New traits to add
   * @returns {State}
   */
  tick_with_traits(belief, traits) {
    const new_belief = new Belief(this.in_mind, {bases: [belief], traits}, this);
    return this.tick({ replace: [new_belief] });
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
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label});

    const original = this._follow_about_chain_to_original(belief);
    const archetype_bases = [...belief.get_archetypes()];

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
    // Register in_mind as dependency if we're in a serialization context
    if (Serialize.dependency_queue !== null && this.in_mind) {
      Serialize.dependency_queue.push(this.in_mind);
    }

    return {
      _type: 'State',
      _id: this._id,
      timestamp: this.timestamp,
      base: this.base?._id ?? null,
      ground_state: this.ground_state?._id ?? null,
      insert: this.insert.map(b => b._id),
      remove: this.remove.map(b => b._id),
      in_mind: this.in_mind?._id ?? null
    };
  }

  /**
   * Construct State from declarative template
   * @param {Mind} parent_mind - Mind creating this (context for belief resolution)
   * @param {object} spec
   * @param {string} spec._type - Must be 'State'
   * @param {string} [spec.mind_label] - Optional label for the mind (for debugging)
   * @param {string} [spec.base] - Prototype template name from State.by_label
   * @param {Object<string, string[]>} [spec.learn] - {belief_label: [trait_names]}
   * @param {State} [spec.ground_state] - Explicit ground state reference
   * @param {Belief|null} owner_belief - Belief that this mind considers "self"
   * @param {State|null} [creator_state] - State creating this (for inferring ground_state)
   * @returns {State}
   */
  static resolve_template(parent_mind, spec, owner_belief = null, creator_state = null) {
    // Create entity's mind with optional label and self
    const entity_mind = new Mind(spec.mind_label || null, owner_belief)

    // Ground state: explicit in spec, or inferred from creator, or null
    const ground = spec.ground_state ?? creator_state ?? null

    // Create initial state
    const state = entity_mind.create_state(1, ground)

    // Build combined learn spec (prototype + custom)
    const learn_spec = {}

    // Apply prototype template
    if (spec.base && State.by_label[spec.base]) {
      const prototype = State.by_label[spec.base]
      Object.assign(learn_spec, prototype.learn || {})
    }

    // Merge custom learning (overrides prototype)
    Object.assign(learn_spec, spec.learn || {})

    // Execute learning
    for (const [label, trait_names] of Object.entries(learn_spec)) {
      const belief = Belief.by_label.get(label)
      if (!belief) {
        throw new Error(`Cannot learn about '${label}': belief not found`)
      }

      // Only learn explicitly listed traits (empty array = nothing)
      if (trait_names.length > 0) {
        state.learn_about(belief, trait_names)
      }
    }

    state.lock()
    return state
  }

  /**
   * Create State from JSON data (fully materialized)
   * @param {Mind} mind - Mind this state belongs to (or context for resolution)
   * @param {object} data - JSON data with _type: 'State'
   * @returns {State}
   */
  static from_json(mind, data) {
    // Resolve in_mind reference (if present in data, otherwise use parameter)
    let resolved_mind = mind;
    if (data.in_mind != null) {
      resolved_mind = Mind.by_id.get(data.in_mind);
      if (!resolved_mind) {
        throw new Error(`Cannot resolve in_mind ${data.in_mind} for state ${data._id}`);
      }
    }

    // Resolve base reference
    let base = null;
    if (data.base != null) {
      for (const state of resolved_mind.state) {
        if (state._id === data.base) {
          base = state;
          break;
        }
      }
      if (!base) {
        throw new Error(`Cannot resolve base state ${data.base} for state ${data._id}`);
      }
    }

    // Resolve ground_state reference
    let ground_state = null;
    if (data.ground_state != null) {
      // Search all minds for the ground state
      for (const m of Mind.by_id.values()) {
        for (const state of m.state) {
          if (state._id === data.ground_state) {
            ground_state = state;
            break;
          }
        }
        if (ground_state) break;
      }
      if (!ground_state) {
        throw new Error(`Cannot resolve ground_state ${data.ground_state} for state ${data._id}`);
      }
    }

    // Resolve insert/remove belief references
    const insert = [];
    for (const belief_id of data.insert) {
      const belief = Belief.by_id.get(belief_id);
      if (!belief) {
        throw new Error(`Cannot resolve insert belief ${belief_id} for state ${data._id}`);
      }
      insert.push(belief);
    }

    const remove = [];
    for (const belief_id of data.remove) {
      const belief = Belief.by_id.get(belief_id);
      if (!belief) {
        throw new Error(`Cannot resolve remove belief ${belief_id} for state ${data._id}`);
      }
      remove.push(belief);
    }

    // Create fully materialized state
    const state = Object.create(State.prototype);
    state._id = data._id;
    state.in_mind = resolved_mind;
    state.base = base;
    state.timestamp = data.timestamp;
    state.insert = insert;
    state.remove = remove;
    state.ground_state = ground_state;
    state.branches = [];
    state.locked = false;

    // Update branches
    if (base) {
      base.branches.push(state);
    }

    return state;
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
   * @param {string|null} [param1._type]
   * @param {number|null} [param1._id]
   * @param {State|null} [creator_state] - State that's creating this belief (for inferring ground_state)
   */
  constructor(mind, {label=null, about=null, bases=[], traits={}, _type=null, _id=null}, creator_state = null) {
    // Check if loading from JSON
    if (_type === 'Belief' && _id != null) {
      this._id = _id;
      this.in_mind = mind;
      this.label = label;
      this._about = null;
      this._bases = new Set();
      this._traits = new Map();
      this.locked = false;
      this._lazy = {label, about, bases, traits};

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
      return;
    }

    // Normal construction
    this._id = ++ id_sequence;
    this.in_mind = mind;
    this.label = label;
    this._about = about;
    /** @type {Set<Belief|Archetype>} */
    this._bases = new Set([]);
    this._traits = new Map();
    this.locked = false;
    this._lazy = null;

    for (let base of bases) {
      if (typeof base === 'string') {
        const base_label = base;
        // Resolution order: belief registry → archetype registry
        base = Belief.by_label.get(base) ?? Archetype.by_label[base];
        assert(base != null, `Base '${base_label}' not found in belief registry or archetype registry`, {base_label, Belief_by_label: Belief.by_label, Archetype_by_label: Archetype.by_label});
      }
      this._bases.add(/** @type {Belief|Archetype} */ (base));
    }

    for (const [trait_label, trait_data] of Object.entries(traits)) {
      this.resolve_and_add_trait(trait_label, trait_data, creator_state);
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
   * @param {State|null} [creator_state] - State creating this belief (for inferring ground_state)
   */
  resolve_and_add_trait(label, data, creator_state = null) {
    const traittype = Traittype.by_label[label];
    //log('looking up traittype', label, traittype);
    assert(traittype != null, `Trait ${label} do not exist`, {label, belief: this.label, data, Traittype_by_label: Traittype.by_label});

    const value = traittype.resolve(this.in_mind, data, this, creator_state);

    assert(this.can_have_trait(label), `Belief can't have trait ${label}`, {label, belief: this.label, value, archetypes: [...this.get_archetypes()].map(a => a.label)});

    this._traits.set(label, value);

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

  lock() {
    this.locked = true;
  }

  /**
   * Get label for display by walking the belief chain
   * @returns {string|null}
   */
  get_display_label() {
    if (this.label) return this.label;

    // Walk bases to find label (only Belief bases, not Archetypes)
    for (const base of this.bases) {
      if (base instanceof Belief) {
        const label = base.get_display_label();
        if (label) return label;
      }
    }

    return null;
  }

  sysdesig() {
    const parts = [];

    const label = this.get_display_label();
    if (label) {
      parts.push(label);
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
      about: this.about ? {_ref: this.about._id, label: this.about.get_display_label()} : null,
      archetypes: [...this.get_archetypes()].map(a => a.label),
      bases: [...this.bases].map(b => b instanceof Archetype ? b.label : b._id),
      traits: Object.fromEntries(
        [...this.traits].map(([k, v]) => [k, Traittype.inspectTraitValue(v)])
      )
    };
  }

  /**
   * Create Belief from JSON data with lazy loading
   * @param {Mind} mind - Mind this belief belongs to
   * @param {object} data - JSON data with _type: 'Belief'
   * @returns {Belief}
   */
  static from_json(mind, data) {
    return new Belief(mind, data);
  }

  /**
   * Materialize lazy-loaded belief (resolve ID references)
   */
  _materialize() {
    if (!this._lazy) return;

    const data = this._lazy;
    this._lazy = null;

    // Resolve 'about' reference (ID to Belief object)
    if (data.about != null) {
      this._about = Belief.by_id.get(data.about);
      if (!this._about) {
        throw new Error(`Cannot resolve about reference ${data.about} for belief ${this._id}`);
      }
    }

    // Resolve 'bases' (archetype labels or belief IDs)
    for (const base_ref of data.bases) {
      if (typeof base_ref === 'string') {
        const archetype = Archetype.by_label[base_ref];
        if (!archetype) {
          throw new Error(`Archetype '${base_ref}' not found for belief ${this._id}`);
        }
        this._bases.add(archetype);
      } else {
        const base_belief = Belief.by_id.get(base_ref);
        if (!base_belief) {
          throw new Error(`Cannot resolve base belief ${base_ref} for belief ${this._id}`);
        }
        this._bases.add(base_belief);
      }
    }

    // Resolve traits (deserialize trait values)
    for (const [trait_name, trait_value] of Object.entries(data.traits)) {
      this._traits.set(trait_name, deserialize_trait_value(trait_value));
    }
  }

  // Lazy getters
  get about() {
    if (this._lazy) this._materialize();
    return this._about;
  }

  get bases() {
    if (this._lazy) this._materialize();
    return this._bases;
  }

  get traits() {
    if (this._lazy) this._materialize();
    return this._traits;
  }
}

/**
 * Deserialize trait value (handle nested Mind/State/Belief references)
 * @param {*} value - Serialized value
 * @returns {*} Deserialized value
 */
function deserialize_trait_value(value) {
  if (Array.isArray(value)) {
    return value.map(item => deserialize_trait_value(item));
  }

  if (value && typeof value === 'object' && value._type) {
    // Handle nested references
    if (value._type === 'Belief') {
      // Use ID lookup (exact version), fall back to label lookup if needed
      const belief = Belief.by_id.get(value._id);
      if (!belief) {
        throw new Error(`Cannot resolve belief reference ${value._id} in trait`);
      }
      return belief;
    }

    if (value._type === 'State') {
      // States are nested in minds, need to search
      for (const mind of Mind.by_id.values()) {
        for (const state of mind.state) {
          if (state._id === value._id) {
            return state;
          }
        }
      }
      throw new Error(`Cannot resolve state reference ${value._id} in trait`);
    }

    if (value._type === 'Mind') {
      const mind = Mind.by_id.get(value._id);
      if (!mind) {
        throw new Error(`Cannot resolve mind reference ${value._id} in trait`);
      }
      return mind;
    }
  }

  return value;
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
      const base = Archetype.by_label[base_label];
      assert(base != null, `Archetype '${base_label}' not found in archetype registry`, {base_label, Archetype_by_label: Archetype.by_label});
      this.bases.add(base);
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
   * @param {Belief|null} owner_belief - Belief being constructed (for setting mind owner)
   * @param {State|null} [creator_state] - State creating the belief (for inferring ground_state)
   * @returns {*}
   */
  resolve(mind, data, owner_belief = null, creator_state = null) {
    // Check for template construction first (_type field)
    if (data?._type) {
      const type_class = Traittype.data_type_map[data._type]
      if (type_class?.resolve_template) {
        const result = type_class.resolve_template(mind, data, owner_belief, creator_state)

        // Wrap in array if container expects it
        if (this.container === Array && !Array.isArray(result)) {
          return [result]
        }
        return result
      }
    }

    return this._resolver(mind, data);
  }

  /**
   * Serialize trait value for full data dump (deep serialization)
   * Calls toJSON() on objects to get complete structure
   * @param {*} value - Value to serialize
   * @returns {*} Fully serialized value
   */
  static serializeTraitValue(value) {
    if (Array.isArray(value)) {
      return value.map(item => Traittype.serializeTraitValue(item));
    }
    if (value?.toJSON) return value.toJSON();
    return value;
  }

  /**
   * Inspect trait value for shallow reference view (light serialization)
   * Returns only {_ref, _type, label} for Beliefs/States/Minds
   * @param {*} value - Value to inspect
   * @returns {*} Shallow representation with references
   */
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
