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
import { Serialize } from './serialize.mjs'

/**
 * @typedef {import('./mind.mjs').Mind} Mind
 */

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
 * @typedef {object} StateReference
 * @property {string} _type - Always "State"
 * @property {number} _id - State identifier
 */

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
 * @property {Map<Subject, Belief>|null} _subject_index - Cached subject→belief lookup (lazy, only on locked states)
 */
export class State {
  // TODO: Populate this registry for prototype state templates
  // Will be used to share belief lists across many nodes
  // See resolve_template() lines 364-367 for planned usage
  // Now stored in DB.state_by_label

  /**
   * @param {Mind} mind
   * @param {number} timestamp
   * @param {State|null} base
   * @param {State|null} ground_state
   * @param {Subject|null} self
   */
  constructor(mind, timestamp, base=null, ground_state=null, self=null) {
    assert(base === null || base.locked, 'Cannot create state from unlocked base state')
    assert(self === null || self instanceof Subject, 'self must be Subject or null')

    // Check if self belief is unlocked
    if (self !== null && ground_state !== null) {
      const self_belief = ground_state.get_belief_by_subject(self)
      assert(self_belief === null || !self_belief.locked, 'Cannot create state for locked self')
    }

    this._id = next_id()
    this.in_mind = mind
    /** @type {State|null} */ this.base = base
    this.timestamp = timestamp
    /** @type {Belief[]} */ this.insert = []
    /** @type {Belief[]} */ this.remove = []
    /** @type {State|null} */ this.ground_state = ground_state
    /** @type {Subject|null} */ this.self = self
    /** @type {State[]} */ this.branches = []
    this.locked = false

    this.in_mind.state.add(this)
    this.in_mind._register_state_by_ground_state(this)
    DB.register_state(this)
  }

  lock() {
    this.locked = true
    for (const belief of this.insert) {
      belief.lock(this)
    }
  }

  /**
   * @param {object} template - Belief template (supports legacy 'label' parameter or traits['@label'])
   * @returns {Belief}
   */
  add_belief(template) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})

    // Handle legacy 'label' parameter for backward compatibility
    let normalized_template = template
    if ('label' in template && template.label != null) {
      const {label, ...rest} = /** @type {any} */ (template)
      const existing_traits = /** @type {Record<string, any>} */ ('traits' in rest ? rest.traits : {})
      normalized_template = {
        ...rest,
        traits: {...existing_traits, '@label': label}
      }
    }

    const belief = Belief.from_template(this, normalized_template)
    this.insert.push(belief)
    return belief
  }

  /**
   * @param {Object<string, object>} beliefs - Object mapping labels to belief definitions
   */
  add_beliefs(beliefs) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})

    for (const [label, def] of Object.entries(beliefs)) {
      const existing_traits = /** @type {Record<string, any>} */ ('traits' in def ? def.traits : {})
      const belief = Belief.from_template(this, {
        ...def,
        traits: {...existing_traits, '@label': label}
      })
      this.insert.push(belief)
    }
  }

  /**
   * Create a new branched state from this state (low-level)
   * @param {State|null} [ground_state] - External world state this mind observes (for resolving beliefs in learn_about)
   * @returns {State} New unlocked state
   */
  branch_state(ground_state) {
    const state = new State(this.in_mind, this.timestamp + 1, this, ground_state ?? this.ground_state, this.self)
    this.branches.push(state)
    return state
  }

  /**
   * Add beliefs to this state's insert list
   * @param {...Belief} beliefs - Beliefs to insert
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
   * @param {...Belief} beliefs - Beliefs to remove
   */
  remove_beliefs(...beliefs) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})

    this.remove.push(...beliefs)
  }

  /**
   * Replace beliefs (convenience for remove+insert)
   * Removes the Belief bases of each belief and inserts the belief itself
   * @param {...Belief} beliefs - Beliefs to replace
   */
  replace_beliefs(...beliefs) {
    for (const belief of beliefs) {
      // Only remove Belief bases (version chains), not Archetypes
      const belief_bases = /** @type {Belief[]} */ ([...belief._bases].filter(b => b instanceof Belief))
      this.remove_beliefs(...belief_bases)
      this.insert_beliefs(belief)
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
   * @param {Belief} belief - Belief to version
   * @param {object} traits - New traits to add
   * @returns {State}
   */
  tick_with_traits(belief, traits) {
    const new_belief = Belief.from_template(this, {sid: belief.subject.sid, bases: [belief], traits})
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
   * Get Belief for a Subject in this state
   * Progressively builds cache as beliefs are accessed (locked states only)
   * @param {Subject} subject - Subject to find belief for
   * @returns {Belief|null} The belief for this subject visible in this state, or null if not found
   */
  get_belief_by_subject(subject) {
    // Check cache first (only on locked states)
    if (this.locked && this._subject_index?.has(subject)) {
      return this._subject_index.get(subject)
    }

    // If unlocked, don't cache - just search with early termination
    if (!this.locked) {
      for (const belief of this.get_beliefs()) {
        if (belief.subject === subject) return belief
      }
      return null
    }

    // Locked state - search and cache as we go (progressive indexing)
    if (!this._subject_index) {
      this._subject_index = new Map()
    }

    for (const belief of this.get_beliefs()) {
      // Cache each belief we encounter
      if (!this._subject_index.has(belief.subject)) {
        this._subject_index.set(belief.subject, belief)
      }

      // Found it? Return immediately (early termination)
      if (belief.subject === subject) {
        return belief
      }
    }

    // Not found - cache the null result to avoid re-scanning
    this._subject_index.set(subject, null)
    return null
  }

  /**
   * Get belief by label (state-scoped lookup)
   * @param {string} label - Label to look up
   * @returns {Belief|null} The belief with this label in this state, or null if not found
   */
  get_belief_by_label(label) {
    const subject = DB.get_subject_by_label(label)
    if (!subject) return null

    // Find all beliefs in this state with this subject
    const matching_beliefs = []
    for (const belief of this.get_beliefs()) {
      if (belief.subject === subject) {
        matching_beliefs.push(belief)
      }
    }

    // Assert there's at most one belief with this label
    assert(matching_beliefs.length <= 1,
      `Multiple beliefs found with label '${label}' in state`,
      {label, count: matching_beliefs.length, state_id: this._id})

    return matching_beliefs[0] ?? null
  }

  /**
   * Find existing beliefs about a subject in this state's mind
   * @param {Belief} source_belief - Belief to find matches for
   * @returns {Array<Belief>} Ranked list of matching beliefs (max 3)
   */
  recognize(source_belief) {
    // Query DB for all beliefs in this mind about the same subject
    const beliefs_about_subject = DB.find_beliefs_about_subject(
      this.in_mind,
      source_belief.subject,
      this
    )

    // TODO: Sort by confidence (for now just return first 3)
    // TODO: Limit to explicit knowledge beliefs (not observation events, etc.)
    return beliefs_about_subject.slice(0, 3)
  }

  /**
   * Integrate new knowledge with existing beliefs
   * @param {State} source_state - State context for resolving trait references
   * @param {Belief} source_belief - Belief to integrate
   * @param {string[]} trait_names - Traits to copy/update
   * @param {Array<Belief>} existing_beliefs - Beliefs from recognize()
   * @returns {Belief} Updated or new belief
   */
  integrate(source_state, source_belief, trait_names, existing_beliefs) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})

    // TODO: Reconciliation logic - try options to minimize contradictions
    // TODO: Check trait compatibility (detect contradictions)
    // TODO: May create variants instead of updating
    // TODO: Source trust comparison
    // TODO: Time-based logic (old knowledge vs fresh observation)

    if (existing_beliefs.length === 0) {
      // No existing knowledge - create new belief
      const archetype_bases = [...source_belief.get_archetypes()]

      // Copy traits, dereferencing belief references to this mind
      // Use get_trait() to find inherited values (returns raw Subjects, not Beliefs)
      /** @type {Record<string, any>} */
      const copied_traits = {}
      for (const name of trait_names) {
        const value = source_belief.get_trait(name)
        if (value !== null) {
          copied_traits[name] = this._recursively_learn_trait_value(source_state, value)
        }
      }

      const new_belief = Belief.from(this, archetype_bases, {
        '@about': DB.get_or_create_subject(source_belief.subject.sid),  // Shared canonical Subject
        ...copied_traits
      })

      this.insert.push(new_belief)
      return new_belief

    } else {
      // Update existing belief (use first from ranked list)
      const existing_belief = existing_beliefs[0]

      // Copy new traits, dereferencing belief references
      // Use get_trait() to find inherited values (returns raw Subjects, not Beliefs)
      /** @type {Record<string, any>} */
      const new_traits = {}
      for (const name of trait_names) {
        const value = source_belief.get_trait(name)
        if (value !== null) {
          new_traits[name] = this._recursively_learn_trait_value(source_state, value)
        }
      }

      // If no new traits, just return existing belief
      if (Object.keys(new_traits).length === 0) {
        return existing_belief
      }

      // Create updated belief - keeps all old traits, updates specified ones
      const updated_belief = Belief.from_template(this, {
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
   *
   * Typically source_state is this.ground_state (learning from observable world state).
   * However, source_state may differ from ground_state when learning from another mind's
   * perspective within the same parent (e.g., NPC testimony about what they believe).
   *
   * @param {Belief} source_belief - Belief from another mind/state to learn about
   * @param {string[]} [trait_names] - Traits to copy (empty = copy no traits, just archetypes)
   * @param {State|null} [source_state] - State where the belief exists (defaults to this.ground_state)
   * @returns {Belief}
   */
  learn_about(source_belief, trait_names = [], source_state = null) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})

    source_state ??= this.ground_state
    assert(source_state instanceof State, 'source_state required: either pass explicitly or set ground_state')

    // Step 1: Recognize existing knowledge
    const existing_beliefs = this.recognize(source_belief)

    // Step 2: Integrate new knowledge
    return this.integrate(source_state, source_belief, trait_names, existing_beliefs)
  }

  /**
   * Recursively learn about Subject references in trait values
   * Ensures that beliefs referenced in traits also exist in this mind
   * @param {State} source_state - State to resolve Subjects in
   * @param {*} value - Trait value (Subject, primitive, or array)
   * @returns {*} Value with Subjects learned (returns Subject of learned belief, not Belief)
   */
  _recursively_learn_trait_value(source_state, value) {
    if (Array.isArray(value)) {
      return value.map(item => this._recursively_learn_trait_value(source_state, item))
    } else if (value instanceof Subject) {
      // Learn about the referenced belief (creates belief in this mind)
      // Then return its Subject (traits store Subjects, not Beliefs)
      const source_belief = value.get_belief_by_state(source_state)
      const learned_belief = this.learn_about(source_belief, [], source_state)
      return learned_belief.subject  // Return Subject, not Belief
    } else {
      return value  // Primitives, State, Mind pass through as-is
    }
  }

  /**
   * Shallow inspection view for the inspect UI
   * @param {State} state
   * @returns {object}
   */
  to_inspect_view(state) {
    return {_ref: this._id, _type: 'State'}
  }

  toJSON() {
    // Register in_mind as dependency if we're in a serialization context
    if (Serialize.active && this.in_mind) {
      Serialize.add_dependency(this.in_mind)
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
   * @param {Mind} mind - Mind this state belongs to (or context for resolution)
   * @param {StateJSON} data - JSON data with _type: 'State'
   * @returns {State}
   */
  static from_json(mind, data) {
    // Resolve in_mind reference (if present in data, otherwise use parameter)
    let resolved_mind = mind
    if (data.in_mind != null) {
      const found_mind = DB.get_mind_by_id(data.in_mind)
      if (!found_mind) {
        throw new Error(`Cannot resolve in_mind ${data.in_mind} for state ${data._id}`)
      }
      resolved_mind = found_mind
    }

    // Resolve base reference
    let base = null
    if (data.base != null) {
      base = DB.get_state_by_id(data.base)
      if (!base) {
        throw new Error(`Cannot resolve base state ${data.base} for state ${data._id}`)
      }
    }

    // Resolve ground_state reference
    let ground_state = null
    if (data.ground_state != null) {
      ground_state = DB.get_state_by_id(data.ground_state)
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
      const belief = DB.get_belief(belief_id)
      if (!belief) {
        throw new Error(`Cannot resolve insert belief ${belief_id} for state ${data._id}`)
      }
      insert.push(belief)
    }

    const remove = []
    for (const belief_id of data.remove) {
      const belief = DB.get_belief(belief_id)
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
    DB.register_state(state)

    // Update branches
    if (base) {
      base.branches.push(state)
    }

    return state
  }
}
