import { assert } from '../lib/debug.mjs'
import { next_id } from './id_sequence.mjs'
import * as DB from './db.mjs'
import * as Cosmos from './cosmos.mjs'

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
 * Immutable state snapshot with differential updates
 * @property {number} _id - Unique identifier
 * @property {import('./mind.mjs').Mind} in_mind - Mind this state belongs to
 * @property {number} timestamp - State timestamp/tick
 * @property {State|null} base - Parent state (inheritance chain)
 * @property {State|null} ground_state - External world state this references
 * @property {import('./belief.mjs').Belief[]} insert - Beliefs added/present in this state
 * @property {import('./belief.mjs').Belief[]} remove - Beliefs removed in this state
 * @property {State[]} branches - Child states branching from this one
 * @property {boolean} locked - Whether state can be modified
 * @property {Map<number, import('./belief.mjs').Belief>|null} _sid_index - Cached sid→belief lookup (lazy, only on locked states)
 */
export class State {
  // TODO: Populate this registry for prototype state templates
  // Will be used to share belief lists across many nodes
  // See resolve_template() lines 364-367 for planned usage
  // Now stored in DB.state_by_label

  /**
   * @param {import('./mind.mjs').Mind} mind
   * @param {number} timestamp
   * @param {State|null} base
   * @param {State|null} ground_state
   */
  constructor(mind, timestamp, base=null, ground_state=null) {
                              this._id = next_id()
                              this.in_mind = mind
    /** @type {State|null} */   this.base = base
                              this.timestamp = timestamp
    /** @type {import('./belief.mjs').Belief[]} */     this.insert = []
    /** @type {import('./belief.mjs').Belief[]} */     this.remove = []
    /** @type {State|null} */   this.ground_state = ground_state
    /** @type {State[]} */      this.branches = []
                              this.locked = false

    // Register this state with its mind
    this.in_mind.state.add(this)
  }

  lock() {
    this.locked = true
    for (const belief of this.insert) {
      belief.lock()
    }
  }

  /**
   * @param {Object<string, object>} beliefs - Object mapping labels to belief definitions
   */
  add_beliefs(beliefs) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})

    for (const [label, def] of Object.entries(beliefs)) {
      const belief = Cosmos.create_belief(this.in_mind, {...def, label}, this)
      this.insert.push(belief)
    }
  }

  /**
   * Create a new branched state from this state (low-level)
   * @param {State|null} [ground_state] - Optional ground_state override
   * @returns {State} New unlocked state
   */
  branch_state(ground_state) {
    const state = Cosmos.create_state(this.in_mind, this.timestamp + 1, this, ground_state ?? this.ground_state)
    this.branches.push(state)
    return state
  }

  /**
   * Add beliefs to this state's insert list
   * @param {...import('./belief.mjs').Belief} beliefs - Beliefs to insert
   */
  insert_beliefs(...beliefs) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})

    // Validate all beliefs belong to this mind or are cultural (null mind)
    for (const belief of beliefs) {
      if (belief.in_mind !== this.in_mind && belief.in_mind !== null) {
        throw new Error(`Belief ${belief._id} (in_mind: ${belief.in_mind?.label}) cannot be inserted into state for mind ${this.in_mind.label}`)
      }
    }
    this.insert.push(...beliefs)
  }

  /**
   * Add beliefs to this state's remove list
   * @param {...import('./belief.mjs').Belief} beliefs - Beliefs to remove
   */
  remove_beliefs(...beliefs) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})

    this.remove.push(...beliefs)
  }

  /**
   * Replace beliefs (convenience for remove+insert)
   * Removes the Belief bases of each belief and inserts the belief itself
   * @param {...import('./belief.mjs').Belief} beliefs - Beliefs to replace
   */
  replace_beliefs(...beliefs) {
    for (const belief of beliefs) {
      // Only remove Belief bases (version chains), not Archetypes
      const belief_bases = /** @type {import('./belief.mjs').Belief[]} */ ([...belief.bases].filter(b => b.constructor.name === 'Belief'))
      this.remove_beliefs(...belief_bases)
      this.insert_beliefs(belief)
    }
  }

  /**
   * High-level convenience method: branch state and apply operations
   * @param {object} param0
   * @param {import('./belief.mjs').Belief[]} [param0.insert]
   * @param {import('./belief.mjs').Belief[]} [param0.remove]
   * @param {import('./belief.mjs').Belief[]} [param0.replace]
   * @param {State|null} [param0.ground_state]
   * @returns {State} New locked state with operations applied
   */
  tick({insert=[], remove=[], replace=[], ground_state}) {
    const state = this.branch_state(ground_state)

    if (replace.length > 0) {
      state.replace_beliefs(...replace)
    }
    if (insert.length > 0) {
      state.insert_beliefs(...insert)
    }
    if (remove.length > 0) {
      state.remove_beliefs(...remove)
    }

    state.lock()
    return state
  }

  /**
   * Create new belief version with updated traits and add to new state
   * @param {import('./belief.mjs').Belief} belief - Belief to version
   * @param {object} traits - New traits to add
   * @returns {State}
   */
  tick_with_traits(belief, traits) {
    const new_belief = Cosmos.create_belief(this.in_mind, {bases: [belief], traits}, this)
    return this.tick({ replace: [new_belief] })
  }

  *get_beliefs() {
    const removed = new Set()

    /** @type {State|null} s */ let s
    for (s = this; s; s = s.base) {
      for (const belief of s.insert) {
        if (!removed.has(belief._id)) {
          yield belief
        }
      }
      for (const belief of s.remove) {
        removed.add(belief._id)
      }
    }
  }

  /**
   * Resolve a subject ID to the appropriate belief version visible in this state
   * Progressively builds cache as beliefs are accessed (locked states only)
   * @param {number} sid - Subject ID to resolve
   * @returns {import('./belief.mjs').Belief|null} The belief with this sid visible in this state, or null if not found
   */
  resolve_subject(sid) {
    // Check cache first (only on locked states)
    if (this.locked && this._sid_index?.has(sid)) {
      return this._sid_index.get(sid)
    }

    // If unlocked, don't cache - just search with early termination
    if (!this.locked) {
      for (const belief of this.get_beliefs()) {
        if (belief.sid === sid) return belief
      }
      return null
    }

    // Locked state - search and cache as we go (progressive indexing)
    if (!this._sid_index) {
      this._sid_index = new Map()
    }

    for (const belief of this.get_beliefs()) {
      // Cache each belief we encounter
      if (!this._sid_index.has(belief.sid)) {
        this._sid_index.set(belief.sid, belief)
      }

      // Found it? Return immediately (early termination)
      if (belief.sid === sid) {
        return belief
      }
    }

    // Not found - cache the null result to avoid re-scanning
    this._sid_index.set(sid, null)
    return null
  }

  /**
   * Learn about a belief from another mind, copying it into this state's mind
   * @param {State} source_state - State context to resolve trait sids in (REQUIRED)
   * @param {import('./belief.mjs').Belief} belief - Belief from another mind/state to learn about
   * @param {string[]} [trait_names] - Traits to copy (empty = copy no traits, just archetypes)
   * @returns {import('./belief.mjs').Belief}
   */
  learn_about(source_state, belief, trait_names = []) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})
    assert(source_state != null, 'source_state is required for resolving trait references')

    const original = this._follow_about_chain_to_original(belief)
    const archetype_bases = [...belief.get_archetypes()]

    // Copy traits, dereferencing belief references to this mind
    /** @type {Record<string, any>} */
    const copied_traits = {}
    for (const name of trait_names) {
      if (belief.traits.has(name)) {
        const value = belief.traits.get(name)
        copied_traits[name] = this._dereference_trait_value(source_state, value)
      }
    }

    // Create the belief and add to state's insert list
    const new_belief = Cosmos.create_belief(this.in_mind, {
      about: original,
      bases: archetype_bases,
      traits: copied_traits
    })

    this.insert.push(new_belief)

    return new_belief
  }

  /**
   * @param {import('./belief.mjs').Belief} belief
   * @param {boolean} throw_on_cycle - If false, returns null on cycle instead of throwing
   * @returns {import('./belief.mjs').Belief|null}
   */
  _follow_about_chain_to_original(belief, throw_on_cycle = true) {
    let original = belief
    const seen = new Set()
    while (original.about != null) {
      if (seen.has(original)) {
        if (throw_on_cycle) {
          throw new Error(`Cycle detected in about chain for belief ${belief._id}`)
        }
        return null
      }
      seen.add(original)
      original = original.about
    }
    return original
  }

  /**
   * Handles primitives, Beliefs, sids, and arrays recursively
   * @param {State} source_state - State to resolve sids in
   * @param {*} value
   * @returns {*}
   */
  _dereference_trait_value(source_state, value) {
    if (Array.isArray(value)) {
      return value.map(item => this._dereference_trait_value(source_state, item))
    } else if (typeof value === 'number' && source_state) {
      // Value is a sid - resolve it to a belief in source_state
      const resolved_belief = source_state.resolve_subject(value)
      if (resolved_belief) {
        return this._find_or_learn_belief_about(source_state, resolved_belief)
      }
      // If can't resolve, return the sid as-is (might be a primitive number)
      return value
    } else if (value && value.constructor.name === 'Belief') {
      return this._find_or_learn_belief_about(source_state, value)
    } else {
      return value
    }
  }

  /**
   * Calls learn_about() recursively if belief doesn't exist in this state
   * @param {State|null} source_state - State context for resolving trait references
   * @param {import('./belief.mjs').Belief} belief_reference
   * @returns {import('./belief.mjs').Belief}
   */
  _find_or_learn_belief_about(source_state, belief_reference) {
    // Find the original entity this belief is about
    const original = this._follow_about_chain_to_original(belief_reference)

    // Search for existing belief about this entity in current state
    const existing_beliefs = []
    for (const b of this.get_beliefs()) {
      const candidate_original = this._follow_about_chain_to_original(b, false)
      if (candidate_original && candidate_original === original) {
        existing_beliefs.push(b)
      }
    }

    if (existing_beliefs.length > 1) {
      throw new Error(`Multiple beliefs about entity ${/** @type {import('./belief.mjs').Belief} */ (original)._id} exist in mind ${this.in_mind.label}`)
    }

    if (existing_beliefs.length === 1) {
      return existing_beliefs[0]
    } else {
      // Create new belief about the referenced entity
      // Use source_state from belief's mind if not provided
      if (!source_state && belief_reference.in_mind) {
        // Get the latest state from the source mind
        const states = [...belief_reference.in_mind.state]
        source_state = states[states.length - 1]
      }
      return this.learn_about(/** @type {State} */ (source_state), belief_reference)
    }
  }

  toJSON() {
    // Register in_mind as dependency if we're in a serialization context
    if (Cosmos.is_serializing() && this.in_mind) {
      Cosmos.add_serialization_dependency(this.in_mind)
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
    }
  }

  /**
   * Construct State from declarative template
   * @param {import('./mind.mjs').Mind} parent_mind - Mind creating this (context for belief resolution)
   * @param {object} spec
   * @param {string} spec._type - Must be 'State'
   * @param {string} [spec.mind_label] - Optional label for the mind (for debugging)
   * @param {string} [spec.base] - Prototype template name from State.by_label
   * @param {Object<string, string[]>} [spec.learn] - {belief_label: [trait_names]}
   * @param {State} [spec.ground_state] - Explicit ground state reference
   * @param {import('./belief.mjs').Belief|null} owner_belief - Belief that this mind considers "self"
   * @param {State|null} [creator_state] - State creating this (for inferring ground_state)
   * @returns {State}
   */
  static resolve_template(parent_mind, spec, owner_belief = null, creator_state = null) {
    // Create entity's mind with optional label and self
    const entity_mind = Cosmos.create_mind(spec.mind_label || null, owner_belief)

    // Ground state: explicit in spec, or inferred from creator, or null
    const ground = spec.ground_state ?? creator_state ?? null

    // Create initial state
    const state = entity_mind.create_state(1, ground)

    // Build combined learn spec (prototype + custom)
    /** @type {Record<string, any>} */
    const learn_spec = {}

    // Apply prototype template
    if (spec.base && DB.state_by_label[spec.base]) {
      const prototype = /** @type {any} */ (DB.state_by_label[spec.base])
      Object.assign(learn_spec, prototype.learn || {})
    }

    // Merge custom learning (overrides prototype)
    Object.assign(learn_spec, spec.learn || {})

    // Execute learning
    for (const [label, trait_names] of Object.entries(learn_spec)) {
      const belief = DB.belief_by_label.get(label)
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
   * @param {import('./mind.mjs').Mind} mind - Mind this state belongs to (or context for resolution)
   * @param {StateJSON} data - JSON data with _type: 'State'
   * @returns {State}
   */
  static from_json(mind, data) {
    // Resolve in_mind reference (if present in data, otherwise use parameter)
    let resolved_mind = mind
    if (data.in_mind != null) {
      const found_mind = DB.mind_by_id.get(data.in_mind)
      if (!found_mind) {
        throw new Error(`Cannot resolve in_mind ${data.in_mind} for state ${data._id}`)
      }
      resolved_mind = found_mind
    }

    // Resolve base reference
    let base = null
    if (data.base != null) {
      for (const state of resolved_mind.state) {
        if (state._id === data.base) {
          base = state
          break
        }
      }
      if (!base) {
        throw new Error(`Cannot resolve base state ${data.base} for state ${data._id}`)
      }
    }

    // Resolve ground_state reference
    let ground_state = null
    if (data.ground_state != null) {
      // Search all minds for the ground state
      for (const m of DB.mind_by_id.values()) {
        for (const state of m.state) {
          if (state._id === data.ground_state) {
            ground_state = state
            break
          }
        }
        if (ground_state) break
      }
      if (!ground_state) {
        throw new Error(`Cannot resolve ground_state ${data.ground_state} for state ${data._id}`)
      }
    }

    // Resolve insert/remove belief references
    const insert = []
    for (const belief_id of data.insert) {
      const belief = DB.belief_by_id.get(belief_id)
      if (!belief) {
        throw new Error(`Cannot resolve insert belief ${belief_id} for state ${data._id}`)
      }
      insert.push(belief)
    }

    const remove = []
    for (const belief_id of data.remove) {
      const belief = DB.belief_by_id.get(belief_id)
      if (!belief) {
        throw new Error(`Cannot resolve remove belief ${belief_id} for state ${data._id}`)
      }
      remove.push(belief)
    }

    // Create fully materialized state
    const state = Object.create(State.prototype)
    state._id = data._id
    state.in_mind = resolved_mind
    state.base = base
    state.timestamp = data.timestamp
    state.insert = insert
    state.remove = remove
    state.ground_state = ground_state
    state.branches = []
    state.locked = false

    // Update branches
    if (base) {
      base.branches.push(state)
    }

    return state
  }
}
