import { assert, log } from '../lib/debug.mjs';

let id_sequence = 0;

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * @typedef {object} MindJSON
 * @property {string} _type - Always "Mind"
 * @property {number} _id - Mind identifier
 * @property {string|null} label - Optional label for lookup
 * @property {BeliefJSON[]} belief - All beliefs in this mind
 * @property {StateJSON[]} state - All states in this mind
 * @property {MindJSON[]} [nested_minds] - Nested minds discovered during serialization
 */

/**
 * @typedef {object} StateJSON
 * @property {string} _type - Always "State"
 * @property {number} _id - State identifier
 * @property {number} timestamp - State timestamp/tick
 * @property {number|null} base - Base state _id (null for root states)
 * @property {number|null} ground_state - Ground state _id (null if no external reference)
 * @property {number[]} insert - Belief _ids present in this state
 * @property {number[]} remove - Belief _ids removed in this state
 * @property {number} in_mind - Mind _id this state belongs to
 */

/**
 * @typedef {object} BeliefJSON
 * @property {string} _type - Always "Belief"
 * @property {number} _id - Unique version identifier
 * @property {number} sid - Subject identifier (stable across versions)
 * @property {string|null} label - Optional label for lookup
 * @property {number|null} about - Parent belief _id (null if not about another belief)
 * @property {string[]} archetypes - Archetype labels for this belief
 * @property {(string|number)[]} bases - Base archetype labels or belief _ids
 * @property {Object<string, SerializedTraitValue>} traits - Trait values (sids, primitives, or references)
 */

/**
 * @typedef {number|string|boolean|null|StateReference|MindReference|Array<number|string|boolean|null|StateReference|MindReference>} SerializedTraitValue
 * Trait values in JSON can be:
 * - number (sid or primitive)
 * - string/boolean/null (primitives)
 * - StateReference/MindReference (for State/Mind traits)
 * - Array of any of the above
 */

/**
 * @typedef {object} StateReference
 * @property {string} _type - Always "State"
 * @property {number} _id - State identifier
 */

/**
 * @typedef {object} MindReference
 * @property {string} _type - Always "Mind"
 * @property {number} _id - Mind identifier
 * @property {string|null} label - Mind label
 */

/**
 * @typedef {object} ArchetypeDefinition
 * @property {string[]} [bases] - Base archetype labels
 * @property {Object<string, *>} [traits] - Default trait values
 */

/**
 * @typedef {string|TraitTypeSchema} TraitTypeDefinition
 * Can be either:
 * - Simple string: "Location", "string", "number", "boolean", "State", "Mind"
 * - Complex schema object for arrays/validation
 */

/**
 * @typedef {object} TraitTypeSchema
 * @property {string} type - Base type (e.g., "State", "Location", "string")
 * @property {Function} [container] - Container constructor (e.g., Array)
 * @property {number} [min] - Minimum array length
 * @property {number} [max] - Maximum array length
 */

/**
 * Reset all registries (for testing)
 */
export function reset_registries() {
  Mind.by_id.clear();
  Mind.by_label.clear();
  Belief.by_id.clear();
  Belief.by_label.clear();
  Belief.by_sid.clear();
  Belief.sid_by_label.clear();
  Belief.label_by_sid.clear();
  Archetype.by_label = {};
  Traittype.by_label = {};
  id_sequence = 0;
}

/**
 * Serialization coordinator with dependency tracking
 */
export class Serialize {
  /** @type {Mind[]|null} */
  static dependency_queue = null;
  /** @type {Set<number>|null} */
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
    /** @type {MindJSON} */
    const root = /** @type {any} */ (mind.toJSON());

    // Process dependencies discovered during serialization
    const nested_minds = [];
    while (Serialize.dependency_queue.length > 0) {
      const dep_mind = Serialize.dependency_queue.shift();
      if (dep_mind && !Serialize.seen.has(dep_mind._id)) {
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
  const data = /** @type {MindJSON|BeliefJSON|StateJSON} */ (JSON.parse(json_string));

  if (!data._type) {
    throw new Error('JSON data missing _type field');
  }

  let result;
  switch (data._type) {
    case 'Mind':
      result = Mind.from_json(/** @type {MindJSON} */ (data));
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
 * @param {MindJSON|BeliefJSON|StateJSON} data - Loaded JSON data
 */
function update_id_sequence_from_data(data) {
  /**
   * @param {any} obj
   * @param {number} [max]
   * @returns {number}
   */
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
 * @param {Object<string, ArchetypeDefinition>} archetypes - Archetype definitions {label: definition}
 * @param {Object<string, string|TraitTypeSchema>} traittypes - Trait type definitions {label: type or schema}
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

/**
 * Container for beliefs with state tracking
 * @property {number} _id - Unique identifier
 * @property {string|null} label - Optional label for lookup
 * @property {Belief|null} self - What this mind considers "self"
 * @property {Set<State>} state - All states belonging to this mind
 */
export class Mind {
  /** @type {Map<number, Mind>} */
  static by_id = new Map();
  /** @type {Map<string, Mind>} */
  static by_label = new Map();

  /**
   * @param {string|null|MindJSON} label - Mind identifier or JSON data
   * @param {Belief|null} self - What this mind considers "self" (can be null, can change)
   */
  constructor(label = null, self = null) {
    // Check if loading from JSON
    if (label && typeof label === 'object' && label._type === 'Mind') {
      const data = /** @type {MindJSON} */ (label);
      this._id = data._id;
      this.label = data.label;
      this.self = null; // Will be resolved later if needed
      this.state = new Set();

      // Register globally
      Mind.by_id.set(this._id, this);
      if (this.label) {
        Mind.by_label.set(this.label, this);
      }
      return;
    }

    // Normal construction
    this._id = ++ id_sequence;
    this.label = /** @type {string|null} */ (label);
    this.self = self;
    /** @type {Set<State>} */
    this.state = new Set([]);

    // Register globally
    Mind.by_id.set(this._id, this);
    if (this.label) {
      Mind.by_label.set(this.label, this);
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
    const state = new State(this, timestamp, null, ground_state);
    return state;
  }

  /**
   * @returns {Omit<MindJSON, 'nested_minds'>}
   */
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
   * @param {MindJSON} data - JSON data with _type: 'Mind'
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

    // Finalize beliefs for THIS mind (resolve State/Mind references in traits)
    // Do this AFTER loading nested minds so all State/Mind references can be resolved
    for (const belief_data of data.belief) {
      const belief = Belief.by_id.get(belief_data._id);
      if (belief) {
        belief._finalize_traits();
      }
    }

    return mind;
  }
}

/**
 * Immutable state snapshot with differential updates
 * @property {number} _id - Unique identifier
 * @property {Mind} in_mind - Mind this state belongs to
 * @property {number} timestamp - State timestamp/tick
 * @property {State|null} base - Parent state (inheritance chain)
 * @property {State|null} ground_state - External world state this references
 * @property {Belief[]} insert - Beliefs added/present in this state
 * @property {Belief[]} remove - Beliefs removed in this state
 * @property {State[]} branches - Child states branching from this one
 * @property {boolean} locked - Whether state can be modified
 * @property {Map<number, Belief>|null} _sid_index - Cached sid→belief lookup (lazy, only on locked states)
 */
export class State {
  // TODO: Populate this registry for prototype state templates
  // Will be used to share belief lists across many nodes
  // See resolve_template() lines 364-367 for planned usage
  /** @type {Record<string, object>} */
  static by_label = {};

  /**
   * @param {Mind} mind
   * @param {number} timestamp
   * @param {State|null} base
   * @param {State|null} ground_state
   */
  constructor(mind, timestamp, base=null, ground_state=null) {
                                this._id = ++ id_sequence;
                                this.in_mind = mind;
    /** @type {State|null} */   this.base = base;
                                this.timestamp = timestamp;
    /** @type {Belief[]} */     this.insert = [];
    /** @type {Belief[]} */     this.remove = [];
    /** @type {State|null} */   this.ground_state = ground_state;
    /** @type {State[]} */      this.branches = [];
                                this.locked = false;

    // Register this state with its mind
    this.in_mind.state.add(this);
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
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label});

    for (const [label, def] of Object.entries(beliefs)) {
      const belief = new Belief(this.in_mind, {...def, label}, this);
      this.insert.push(belief);
    }
  }

  /**
   * Create a new branched state from this state (low-level)
   * @param {State|null} [ground_state] - Optional ground_state override
   * @returns {State} New unlocked state
   */
  branch_state(ground_state) {
    const state = new State(this.in_mind, this.timestamp + 1, this, ground_state ?? this.ground_state);
    this.branches.push(state);
    return state;
  }

  /**
   * Add beliefs to this state's insert list
   * @param {...Belief} beliefs - Beliefs to insert
   */
  insert_beliefs(...beliefs) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label});

    // Validate all beliefs belong to this mind or are cultural (null mind)
    for (const belief of beliefs) {
      if (belief.in_mind !== this.in_mind && belief.in_mind !== null) {
        throw new Error(`Belief ${belief._id} (in_mind: ${belief.in_mind?.label}) cannot be inserted into state for mind ${this.in_mind.label}`);
      }
    }
    this.insert.push(...beliefs);
  }

  /**
   * Add beliefs to this state's remove list
   * @param {...Belief} beliefs - Beliefs to remove
   */
  remove_beliefs(...beliefs) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label});

    this.remove.push(...beliefs);
  }

  /**
   * Replace beliefs (convenience for remove+insert)
   * Removes the Belief bases of each belief and inserts the belief itself
   * @param {...Belief} beliefs - Beliefs to replace
   */
  replace_beliefs(...beliefs) {
    for (const belief of beliefs) {
      // Only remove Belief bases (version chains), not Archetypes
      const belief_bases = [...belief.bases].filter(b => b instanceof Belief);
      this.remove_beliefs(...belief_bases);
      this.insert_beliefs(belief);
    }
  }

  /**
   * High-level convenience method: branch state and apply operations
   * @param {object} param0
   * @param {Belief[]} [param0.insert]
   * @param {Belief[]} [param0.remove]
   * @param {Belief[]} [param0.replace]
   * @param {State|null} [param0.ground_state]
   * @returns {State} New locked state with operations applied
   */
  tick({insert=[], remove=[], replace=[], ground_state}) {
    const state = this.branch_state(ground_state);

    if (replace.length > 0) {
      state.replace_beliefs(...replace);
    }
    if (insert.length > 0) {
      state.insert_beliefs(...insert);
    }
    if (remove.length > 0) {
      state.remove_beliefs(...remove);
    }

    state.lock();
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
   * Resolve a subject ID to the appropriate belief version visible in this state
   * Progressively builds cache as beliefs are accessed (locked states only)
   * @param {number} sid - Subject ID to resolve
   * @returns {Belief|null} The belief with this sid visible in this state, or null if not found
   */
  resolve_subject(sid) {
    // Check cache first (only on locked states)
    if (this.locked && this._sid_index?.has(sid)) {
      return this._sid_index.get(sid);
    }

    // If unlocked, don't cache - just search with early termination
    if (!this.locked) {
      for (const belief of this.get_beliefs()) {
        if (belief.sid === sid) return belief;
      }
      return null;
    }

    // Locked state - search and cache as we go (progressive indexing)
    if (!this._sid_index) {
      this._sid_index = new Map();
    }

    for (const belief of this.get_beliefs()) {
      // Cache each belief we encounter
      if (!this._sid_index.has(belief.sid)) {
        this._sid_index.set(belief.sid, belief);
      }

      // Found it? Return immediately (early termination)
      if (belief.sid === sid) {
        return belief;
      }
    }

    // Not found - cache the null result to avoid re-scanning
    this._sid_index.set(sid, null);
    return null;
  }

  /**
   * Learn about a belief from another mind, copying it into this state's mind
   * @param {State} source_state - State context to resolve trait sids in (REQUIRED)
   * @param {Belief} belief - Belief from another mind/state to learn about
   * @param {string[]} [trait_names] - Traits to copy (empty = copy no traits, just archetypes)
   * @returns {Belief}
   */
  learn_about(source_state, belief, trait_names = []) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label});
    assert(source_state != null, 'source_state is required for resolving trait references');

    const original = this._follow_about_chain_to_original(belief);
    const archetype_bases = [...belief.get_archetypes()];

    // Copy traits, dereferencing belief references to this mind
    /** @type {Record<string, any>} */
    const copied_traits = {};
    for (const name of trait_names) {
      if (belief.traits.has(name)) {
        const value = belief.traits.get(name);
        copied_traits[name] = this._dereference_trait_value(source_state, value);
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
   * Handles primitives, Beliefs, sids, and arrays recursively
   * @param {State} source_state - State to resolve sids in
   * @param {*} value
   * @returns {*}
   */
  _dereference_trait_value(source_state, value) {
    if (Array.isArray(value)) {
      return value.map(item => this._dereference_trait_value(source_state, item));
    } else if (typeof value === 'number' && source_state) {
      // Value is a sid - resolve it to a belief in source_state
      const resolved_belief = source_state.resolve_subject(value);
      if (resolved_belief) {
        return this._find_or_learn_belief_about(source_state, resolved_belief);
      }
      // If can't resolve, return the sid as-is (might be a primitive number)
      return value;
    } else if (value instanceof Belief) {
      return this._find_or_learn_belief_about(source_state, value);
    } else {
      return value;
    }
  }

  /**
   * Calls learn_about() recursively if belief doesn't exist in this state
   * @param {State|null} source_state - State context for resolving trait references
   * @param {Belief} belief_reference
   * @returns {Belief}
   */
  _find_or_learn_belief_about(source_state, belief_reference) {
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
      throw new Error(`Multiple beliefs about entity ${/** @type {Belief} */ (original)._id} exist in mind ${this.in_mind.label}`);
    }

    if (existing_beliefs.length === 1) {
      return existing_beliefs[0];
    } else {
      // Create new belief about the referenced entity
      // Use source_state from belief's mind if not provided
      if (!source_state && belief_reference.in_mind) {
        // Get the latest state from the source mind
        const states = [...belief_reference.in_mind.state];
        source_state = states[states.length - 1];
      }
      return this.learn_about(/** @type {State} */ (source_state), belief_reference);
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
    /** @type {Record<string, any>} */
    const learn_spec = {}

    // Apply prototype template
    if (spec.base && State.by_label[spec.base]) {
      const prototype = /** @type {any} */ (State.by_label[spec.base])
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
        // Use ground state as source context (the parent mind's state we're observing from)
        assert(ground != null, `Cannot learn about beliefs without ground_state context`)
        state.learn_about(/** @type {State} */ (ground), belief, trait_names)
      }
    }

    state.lock()
    return state
  }

  /**
   * Create State from JSON data (fully materialized)
   * @param {Mind} mind - Mind this state belongs to (or context for resolution)
   * @param {StateJSON} data - JSON data with _type: 'State'
   * @returns {State}
   */
  static from_json(mind, data) {
    // Resolve in_mind reference (if present in data, otherwise use parameter)
    let resolved_mind = mind;
    if (data.in_mind != null) {
      const found_mind = Mind.by_id.get(data.in_mind);
      if (!found_mind) {
        throw new Error(`Cannot resolve in_mind ${data.in_mind} for state ${data._id}`);
      }
      resolved_mind = found_mind;
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

/**
 * Represents a belief about an entity with versioning support
 * @property {number} _id - Unique version identifier
 * @property {number} sid - Subject identifier (stable across versions)
 * @property {string|null} label - Optional label for lookup
 * @property {Mind} in_mind - Mind this belief belongs to
 * @property {Belief|null} _about - Parent belief this is about (identity chain)
 * @property {Set<Belief|Archetype>} _bases - Base archetypes/beliefs for inheritance
 * @property {Map<string, *>} _traits - Trait values (sids, primitives, State/Mind refs)
 * @property {boolean} locked - Whether belief can be modified
 */
export class Belief {
  /** @type {Map<number, Belief>} */
  static by_id = new Map();
  /** @type {Map<string, Belief>} */
  static by_label = new Map();
  /** @type {Map<number, Set<Belief>>} */ // sid → Set<Belief> (all versions of a subject)
  static by_sid = new Map();
  /** @type {Map<string, number>} */ // label → sid
  static sid_by_label = new Map();
  /** @type {Map<number, string>} */ // sid → label
  static label_by_sid = new Map();

  /**
   * @param {Mind} mind
   * @param {object} param1
   * @param {string|null} [param1.label]
   * @param {Belief|number|null} [param1.about] - Belief object or _id (when loading from JSON)
   * @param {(string|Archetype|Belief|number)[]} [param1.bases] - Archetype labels, Belief objects, or _ids (when loading from JSON)
   * @param {object} [param1.traits]
   * @param {string|null} [param1._type]
   * @param {number|null} [param1._id]
   * @param {number|null} [param1.sid]
   * @param {State|null} [creator_state] - State that's creating this belief (for inferring ground_state)
   */
  constructor(mind, {label=null, about=null, bases=[], traits={}, _type=null, _id=null, sid=null}, creator_state = null) {
    // Check if loading from JSON
    if (_type === 'Belief' && _id != null) {
      this._id = _id;
      /** @type {number} */
      this.sid = 0;  // Temporary, will be set immediately
      this.sid = /** @type {number} */ (sid);  // sid must be present when loading from JSON
      this.in_mind = mind;
      this.label = label;
      this.locked = false;

      // Resolve 'about' reference (ID to Belief object)
      /** @type {Belief|null} */
      this._about = null;
      /** @type {Belief|null} */
      let resolved_about = null;
      if (about != null) {
        if (typeof about === 'number') {
          resolved_about = Belief.by_id.get(about) ?? null;
          if (!resolved_about) {
            throw new Error(`Cannot resolve about reference ${about} for belief ${this._id}`);
          }
        } else {
          // Should not happen when loading from JSON, but handle for safety
          resolved_about = about;
        }
      }
      this._about = resolved_about;

      // Resolve 'bases' (archetype labels or belief IDs)
      this._bases = new Set();
      for (const base_ref of bases) {
        if (typeof base_ref === 'string') {
          const archetype = Archetype.by_label[base_ref];
          if (!archetype) {
            throw new Error(`Archetype '${base_ref}' not found for belief ${this._id}`);
          }
          this._bases.add(archetype);
        } else if (typeof base_ref === 'number') {
          const base_belief = Belief.by_id.get(base_ref);
          if (!base_belief) {
            throw new Error(`Cannot resolve base belief ${base_ref} for belief ${this._id}`);
          }
          this._bases.add(base_belief);
        } else {
          // Direct Belief or Archetype object (not from JSON)
          this._bases.add(base_ref);
        }
      }

      // Copy traits as-is - sids, primitives, and State/Mind reference objects
      // Resolution happens lazily when accessed via get_trait()
      this._traits = new Map();
      for (const [trait_name, trait_value] of Object.entries(traits)) {
        this._traits.set(trait_name, trait_value);
      }

      // Register globally
      Belief.by_id.set(this._id, this);

      // Register in by_sid (sid → Set<Belief>)
      const sid_val = /** @type {number} */ (this.sid);
      if (!Belief.by_sid.has(sid_val)) {
        Belief.by_sid.set(sid_val, new Set());
      }
      /** @type {Set<Belief>} */ (Belief.by_sid.get(sid_val)).add(this);

      if (label) {
        // Register label-sid mappings (for first belief with this label loaded)
        if (!Belief.sid_by_label.has(label)) {
          if (Archetype.by_label[label]) {
            throw new Error(`Label '${label}' is already used by an archetype`);
          }
          Belief.sid_by_label.set(label, sid_val);
          Belief.label_by_sid.set(sid_val, label);
        }

        // Still maintain by_label for backward compatibility
        Belief.by_label.set(label, this);
      }
      return;
    }

    // Resolve bases early to determine if this is a new subject or version
    /** @type {Set<Belief|Archetype>} */
    this._bases = new Set([]);

    for (let base of bases) {
      if (typeof base === 'string') {
        const base_label = base;
        // Resolution order: belief registry → archetype registry
        base = Belief.by_label.get(base) ?? Archetype.by_label[base];
        assert(base != null, `Base '${base_label}' not found in belief registry or archetype registry`, {base_label, Belief_by_label: Belief.by_label, Archetype_by_label: Archetype.by_label});
      }
      this._bases.add(/** @type {Belief|Archetype} */ (base));
    }

    // Determine sid: reuse from belief base, or assign new subject id
    let parent_belief = null;
    for (const base of this._bases) {
      if (base instanceof Belief) {
        parent_belief = base;
        break;
      }
    }

    // Normal construction
    if (parent_belief) {
      // This is a version of an existing subject
      this.sid = parent_belief.sid;
      this._id = ++id_sequence;
    } else {
      // This is a new subject
      this.sid = ++id_sequence;
      this._id = ++id_sequence;
    }

    this.in_mind = mind;
    this.label = label;
    this._about = /** @type {Belief|null} */ (about);
    this._traits = new Map();
    this.locked = false;

    for (const [trait_label, trait_data] of Object.entries(traits)) {
      this.resolve_and_add_trait(trait_label, trait_data, creator_state);
    }

    // Register globally
    Belief.by_id.set(this._id, this);

    // Register in by_sid (sid → Set<Belief>)
    if (!Belief.by_sid.has(this.sid)) {
      Belief.by_sid.set(this.sid, new Set());
    }
    /** @type {Set<Belief>} */ (Belief.by_sid.get(this.sid)).add(this);

    if (label) {
      // For new subjects, register label-sid mappings
      if (!parent_belief) {
        // Check label uniqueness across beliefs and archetypes
        if (Belief.sid_by_label.has(label)) {
          throw new Error(`Label '${label}' is already used by another belief`);
        }
        if (Archetype.by_label[label]) {
          throw new Error(`Label '${label}' is already used by an archetype`);
        }

        // Register label-sid bidirectional mapping
        Belief.sid_by_label.set(label, this.sid);
        Belief.label_by_sid.set(this.sid, label);
      }

      // Still maintain by_label for backward compatibility (maps label → latest belief)
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
    assert(!this.locked, 'Cannot modify locked belief', {belief_id: this._id, label: this.label});

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
   * Get a trait value with sids resolved to Beliefs
   * @param {State} state - State context for resolving sids
   * @param {string} trait_name - Name of the trait to get
   * @returns {*} Resolved trait value (Beliefs instead of sids)
   */
  get_trait(state, trait_name) {
    const raw_value = this.traits.get(trait_name);
    return this._resolve_trait_value(raw_value, state);
  }

  /**
   * @private
   * @param {*} value - Raw trait value (may contain sids or State/Mind refs)
   * @param {State} state - State context for resolving sids
   * @returns {*} Resolved value
   */
  _resolve_trait_value(value, state) {
    if (Array.isArray(value)) {
      return value.map(item => this._resolve_trait_value(item, state));
    } else if (typeof value === 'number') {
      // Might be a sid - try to resolve to Belief
      const resolved = state.resolve_subject(value);
      return resolved !== null ? resolved : value;
    } else if (value && typeof value === 'object' && value._type) {
      // State/Mind reference object from JSON - deserialize it
      return deserialize_trait_value(value);
    } else {
      return value;
    }
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
      sid: this.sid,
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
   * Finalize traits after loading - resolve State/Mind reference objects
   * Called after all entities are loaded
   */
  _finalize_traits() {
    for (const [trait_name, trait_value] of this._traits) {
      this._traits.set(trait_name, this._resolve_final_trait_value(trait_value));
    }
  }

  /**
   * Resolve trait value completely (including nested State/Mind references)
   * @param {*} value - Trait value (may contain {_type, _id} reference objects)
   * @returns {*} Fully resolved value
   */
  _resolve_final_trait_value(value) {
    if (Array.isArray(value)) {
      return value.map(item => this._resolve_final_trait_value(item));
    } else if (value && typeof value === 'object' && value._type) {
      // State/Mind reference object from JSON - deserialize it
      return deserialize_trait_value(value);
    } else {
      // Primitives and sids stay as-is
      return value;
    }
  }

  /**
   * Create Belief from JSON data with lazy loading
   * @param {Mind} mind - Mind this belief belongs to
   * @param {BeliefJSON} data - JSON data with _type: 'Belief'
   * @returns {Belief}
   */
  static from_json(mind, data) {
    return new Belief(mind, data);
  }

  // Simple property accessors (no lazy loading needed with SID system)
  get about() {
    return this._about;
  }

  get bases() {
    return this._bases;
  }

  get traits() {
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
  /** @type {Record<string, Archetype>} */
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
  /** @type {Record<string, Traittype>} */
  static by_label = {};

  /** @type {Record<string, typeof Mind|typeof State>} */
  static data_type_map = {
    Mind: Mind,
    State: State,
  }

  /** @type {Record<string, NumberConstructor|StringConstructor|BooleanConstructor>} */
  static literal_type_map = {
    'number': Number,
    'string': String,
    'boolean': Boolean,
  }

  /**
   * @param {string} label
   * @param {string|TraitTypeSchema} def
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
      return (/** @type {Mind} */ mind, /** @type {any} */ data) => {
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
      return (/** @type {Mind} */ mind, /** @type {any} */ data) => this._resolve_item(mind, data);
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
          // Store sid (subject ID) instead of object reference
          return belief.sid;
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
      // Type assertion: we know Mind and State both have resolve_template
      const type_class = /** @type {any} */ (Traittype.data_type_map[data._type])
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
      /** @type {{_ref: number, _type: string, label?: string|null}} */
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
