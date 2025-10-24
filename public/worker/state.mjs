/**
 * State - immutable snapshot of beliefs at a specific time/tick
 *
 * States represent "what exists at this moment" in a mind. Once finalized, they never mutate;
 * instead, create new states via tick() operations. This enables time travel,
 * branching possibilities, and maintaining observation history.
 *
 * Key concepts:
 * - Immutability: Changes create new states linked via `base` property
 * - Multi-stage creation: States are unlocked during creation, allowing gradual buildup
 * - Tick progression: Each state has a tick number showing temporal ordering
 * - Operations: insert (new beliefs), remove (beliefs), replace (belief updates)
 * - Superposition: Multiple states can exist at same tick with different certainty
 *
 * Usage pattern:
 *   const state2 = state1.tick({ insert: [new_belief], replace: [[old_id, new_belief]] })
 *
 * See docs/SPECIFICATION.md for state architecture
 * See docs/ALPHA-1.md for how states track observations over time
 */

import { assert } from '../lib/debug.mjs'
import { next_id } from './id_sequence.mjs'
import * as DB from './db.mjs'
import * as Cosmos from './cosmos.mjs'
import { Subject } from './subject.mjs'
import { Belief } from './belief.mjs'

/**
 * @typedef {object} StateJSON
 * @property {string} _type - Always "State"
 * @property {number} _id - State identifier
 * @property {number} timestamp - State timestamp/tick
 * @property {number|null} base - Base state _id (null for root states)
 * @property {number|null} ground_state - Ground state _id (null if no external reference)
 * @property {number|null} self - Subject sid (null if no self identity)
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
   * @param {import('./subject.mjs').Subject|null} self
   */
  constructor(mind, timestamp, base=null, ground_state=null, self=null) {
    assert(base === null || base.locked, 'Cannot create state from unlocked base state')
    assert(self === null || self instanceof Subject, 'self must be Subject or null')
    this._id = next_id()
    this.in_mind = mind
    /** @type {State|null} */ this.base = base
    this.timestamp = timestamp
    /** @type {import('./belief.mjs').Belief[]} */ this.insert = []
    /** @type {import('./belief.mjs').Belief[]} */ this.remove = []
    /** @type {State|null} */ this.ground_state = ground_state
    /** @type {import('./subject.mjs').Subject|null} */ this.self = self
    /** @type {State[]} */ this.branches = []
    this.locked = false

    this.in_mind.state.add(this)
    DB.state_by_id.set(this._id, this)
  }

  lock() {
    this.locked = true
    for (const belief of this.insert) {
      belief.lock()
    }
  }

  /**
   * @param {object} template - Belief template
   * @returns {import('./belief.mjs').Belief}
   */
  add_belief(template) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})
    const belief = Cosmos.create_belief(this.in_mind, template, this)
    this.insert.push(belief)
    return belief
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
   * @param {State|null} [ground_state] - External world state this mind observes (for resolving beliefs in learn_about)
   * @returns {State} New unlocked state
   */
  branch_state(ground_state) {
    const state = Cosmos.create_state(this.in_mind, this.timestamp + 1, this, ground_state ?? this.ground_state, this.self)
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
      const belief_bases = /** @type {import('./belief.mjs').Belief[]} */ ([...belief.bases].filter(b => b instanceof Belief))
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
    this.lock()  // Lock this state before branching
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
    const new_belief = Cosmos.create_belief(this.in_mind, {sid: belief.subject.sid, bases: [belief], traits}, this)
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
        if (belief.subject.sid === sid) return belief
      }
      return null
    }

    // Locked state - search and cache as we go (progressive indexing)
    if (!this._sid_index) {
      this._sid_index = new Map()
    }

    for (const belief of this.get_beliefs()) {
      // Cache each belief we encounter
      if (!this._sid_index.has(belief.subject.sid)) {
        this._sid_index.set(belief.subject.sid, belief)
      }

      // Found it? Return immediately (early termination)
      if (belief.subject.sid === sid) {
        return belief
      }
    }

    // Not found - cache the null result to avoid re-scanning
    this._sid_index.set(sid, null)
    return null
  }

  /**
   * Find existing beliefs about a subject in this state's mind
   * @param {import('./belief.mjs').Belief} belief - Belief to find matches for
   * @returns {Array<import('./belief.mjs').Belief>} Ranked list of matching beliefs (max 3)
   */
  recognize(belief) {
    // Query DB for all beliefs in this mind about the same subject
    const beliefs_about_subject = DB.find_beliefs_about_subject(
      this.in_mind,
      belief.subject,
      this
    )

    // TODO: Sort by confidence (for now just return first 3)
    // TODO: Limit to explicit knowledge beliefs (not observation events, etc.)
    return beliefs_about_subject.slice(0, 3)
  }

  /**
   * Integrate new knowledge with existing beliefs
   * @param {State} source_state - State context for resolving trait references
   * @param {import('./belief.mjs').Belief} belief - Belief to integrate
   * @param {string[]} trait_names - Traits to copy/update
   * @param {Array<import('./belief.mjs').Belief>} existing_beliefs - Beliefs from recognize()
   * @returns {import('./belief.mjs').Belief} Updated or new belief
   */
  integrate(source_state, belief, trait_names, existing_beliefs) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})

    // TODO: Reconciliation logic - try options to minimize contradictions
    // TODO: Check trait compatibility (detect contradictions)
    // TODO: May create variants instead of updating
    // TODO: Source trust comparison
    // TODO: Time-based logic (old knowledge vs fresh observation)

    if (existing_beliefs.length === 0) {
      // No existing knowledge - create new belief
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
        bases: archetype_bases,
        traits: {
          '@about': DB.get_or_create_subject(belief.subject.sid),  // Shared canonical Subject
          ...copied_traits
        }
      })

      this.insert.push(new_belief)
      return new_belief

    } else {
      // Update existing belief (use first from ranked list)
      const existing_belief = existing_beliefs[0]

      // Copy new traits, dereferencing belief references
      /** @type {Record<string, any>} */
      const new_traits = {}
      for (const name of trait_names) {
        if (belief.traits.has(name)) {
          const value = belief.traits.get(name)
          new_traits[name] = this._dereference_trait_value(source_state, value)
        }
      }

      // If no new traits, just return existing belief
      if (Object.keys(new_traits).length === 0) {
        return existing_belief
      }

      // Create updated belief - keeps all old traits, updates specified ones
      const updated_belief = Cosmos.create_belief(this.in_mind, {
        bases: [existing_belief],
        traits: new_traits
      })

      this.insert.push(updated_belief)
      this.remove.push(existing_belief)
      return updated_belief
    }
  }

  /**
   * Learn about a belief from another mind, copying it into this state's mind
   * @param {import('./belief.mjs').Belief} belief - Belief from another mind/state to learn about
   * @param {string[]} [trait_names] - Traits to copy (empty = copy no traits, just archetypes)
   * @param {State|null} [source_state] - State where the belief exists (defaults to this.ground_state)
   * @returns {import('./belief.mjs').Belief}
   */
  learn_about(belief, trait_names = [], source_state = null) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})

    const resolved_source = source_state ?? this.ground_state
    assert(resolved_source != null, 'source_state required: either pass explicitly or set ground_state')

    // Step 1: Recognize existing knowledge
    const existing_beliefs = this.recognize(belief)

    // Step 2: Integrate new knowledge
    return this.integrate(resolved_source, belief, trait_names, existing_beliefs)
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
    } else if (value instanceof Subject) {
      // Resolve Subject to belief, then learn_about it (which calls recognize → integrate)
      return this.learn_about(value.resolve(source_state), [], source_state)
    } else {
      return value
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
      self: this.self?.toJSON() ?? null,
      insert: this.insert.map(b => b._id),
      remove: this.remove.map(b => b._id),
      in_mind: this.in_mind?._id ?? null
    }
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
      base = DB.state_by_id.get(data.base)
      if (!base) {
        throw new Error(`Cannot resolve base state ${data.base} for state ${data._id}`)
      }
    }

    // Resolve ground_state reference
    let ground_state = null
    if (data.ground_state != null) {
      ground_state = DB.state_by_id.get(data.ground_state)
      if (!ground_state) {
        throw new Error(`Cannot resolve ground_state ${data.ground_state} for state ${data._id}`)
      }
    }

    // Resolve self reference
    let self = null
    if (data.self != null) {
      self = DB.get_or_create_subject(data.self)
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
    state.self = self
    state.branches = []
    state.locked = false

    // Register in global registry
    DB.state_by_id.set(state._id, state)

    // Update branches
    if (base) {
      base.branches.push(state)
    }

    return state
  }
}
