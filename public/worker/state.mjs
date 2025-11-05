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

import { assert, log } from '../lib/debug.mjs'
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
 * @property {number} tt - State transaction time/tick
 * @property {number} vt - State valid time (what time this state is thinking about)
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
 * @property {number} tt - State transaction time/tick
 * @property {number} vt - State valid time (what time this state is thinking about, defaults to tt)
 * @property {State|null} base - Parent state (inheritance chain)
 * @property {State|null} ground_state - External world state this references
 * @property {Belief[]} insert - Beliefs added/present in this state
 * @property {Belief[]} remove - Beliefs removed in this state
 * @property {boolean} locked - Whether state can be modified
 * @property {State[]} _branches - Child states branching from this one (access via get_branches())
 * @property {Map<Subject, Belief>|null} _subject_index - Cached subject→belief lookup (lazy, only on locked states)
 */
export class State {
  // TODO: Populate this registry for prototype state templates
  // Will be used to share belief lists across many nodes
  // See resolve_template() lines 364-367 for planned usage
  // Now stored in DB.state_by_label

  /**
   * @param {Mind} mind
   * @param {number} tt
   * @param {State|null} base
   * @param {State|null} ground_state
   * @param {Subject|null} self
   * @param {number|null} vt - Valid time (defaults to tt if not specified)
   */
  constructor(mind, tt, base=null, ground_state=null, self=null, vt=null) {
    assert(base === null || base.locked, 'Cannot create state from unlocked base state')
    assert(self === null || self instanceof Subject, 'self must be Subject or null')
    assert(ground_state === null || ground_state instanceof State, 'ground_state must be State or null')

    // Validate ground_state is in parent mind
    if (ground_state) {
      /** @type {State} */
      const gs = ground_state
      assert(
        gs.in_mind === mind.parent,
        'ground_state must be in parent mind',
        {
          mind: mind.label,
          parent: mind.parent?.label ?? null,
          ground_state_mind: gs.in_mind.label
        }
      )
    }

    // Check if self belief is unlocked (only for initial states, not versioning)
    if (self !== null && ground_state !== null && base === null) {
      const self_belief = ground_state.get_belief_by_subject(self)
      assert(self_belief === null || !self_belief.locked, 'Cannot create state for locked self')
    }

    this._id = next_id()
    this.in_mind = mind
    /** @type {State|null} */ this.base = base
    this.tt = tt
    this.vt = vt ?? tt  // Default vt to tt
    /** @type {Belief[]} */ this.insert = []
    /** @type {Belief[]} */ this.remove = []
    /** @type {State|null} */ this.ground_state = ground_state
    /** @type {Subject|null} */ this.self = self
    this.locked = false

    /**
     * Forward links to child states branching from this one
     * Query: O(1) enumeration for possibility tree navigation
     * Maintained by: branch_state(), tick() - adds child to parent's branches
     * Scale: Essential - enables navigation of branching timelines and planning scenarios
     * @type {State[]}
     */
    this._branches = []

    /**
     * Lazy cache: subject → belief lookup (only built on locked states)
     * Query: O(1) cached lookup after first access, O(n) on first access where n = beliefs in state
     * Maintained by: get_belief_by_subject() - progressively populated during queries
     * Scale: Smart optimization - avoids precomputing index for all states
     *   - Only created on locked states (immutable historical states)
     *   - Built incrementally as beliefs are accessed (not all at once)
     *   - Caches both found beliefs AND null results (avoids rescanning)
     *   - Unlocked states skip caching (transient, will change)
     * Alternative considered: Pre-build index on lock() → rejected (wastes memory for unused states)
     * @type {Map<Subject, Belief|null>|null}
     */
    this._subject_index = null

    this.in_mind.register_state(this)
    DB.register_state(this)
  }

  /**
   * Lock this state and cascade to contained beliefs
   * @returns {State} this state (for chaining)
   */
  lock() {
    this.locked = true

    // Clear mind's reference to this as unlocked state
    if (this.in_mind.state === this) {
      this.in_mind.state = null
    }

    for (const belief of this.insert) {
      belief.lock(this)
    }
    return this
  }

  /**
   * Get child states branching from this state
   * @returns {State[]} Array of child states
   */
  get_branches() {
    return this._branches
  }

  /**
   * @param {object} template - Belief template
   * @returns {Belief}
   */
  add_belief_from_template(template) {
    return Belief.from_template(this, template)
  }

  /**
   * @param {Object<string, object>} beliefs - Object mapping labels to belief definitions
   */
  add_beliefs_from_template(beliefs) {
    for (const [label, def] of Object.entries(beliefs)) {
      const existing_traits = /** @type {Record<string, any>} */ ('traits' in def ? def.traits : {})
      Belief.from_template(this, {
        ...def,
        traits: {...existing_traits, '@label': label}
      })
    }
  }

  /**
   * Create a new branched state from this state (low-level)
   * @param {State|null} [ground_state] - External world state this mind observes (for resolving beliefs in learn_about)
   * @param {number|null} [vt] - Valid time override (for temporal reasoning about past/future)
   * @returns {State} New unlocked state
   */
  branch_state(ground_state, vt) {
    // Assert ground_state is in parent mind (or null for root minds)
    assert(
      ground_state === null || ground_state?.in_mind === this.in_mind.parent,
      'ground_state must be in parent mind',
      {mind: this.in_mind.label, parent: this.in_mind.parent?.label, ground_state_mind: ground_state?.in_mind?.label}
    )

    // Time coordination: tt from ground_state.vt, vt can be overridden
    const next_tt = ground_state?.vt ?? vt
    const next_vt = vt ?? next_tt

    assert(next_tt != null, 'next_tt must be set (world state must provide vt when branching)')
    assert(next_tt >= this.tt, 'tt must not go backwards', {current_tt: this.tt, next_tt})

    const state = new State(this.in_mind, next_tt, this, ground_state, this.self, next_vt)
    this._branches.push(state)
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
      // Validate belief was created in this state
      assert(belief.origin_state === this,
        `Belief ${belief._id} origin_state mismatch: expected state ${this._id}, got ${belief.origin_state?._id}`,
        {belief_id: belief._id, expected_state: this._id, actual_state: belief.origin_state?._id})
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
   * Create new belief version with updated traits and add to new state
   * @param {Belief} belief - Belief to version
   * @param {number} vt - Valid time for new state
   * @param {object} traits - New traits to add
   * @returns {State}
   */
  tick_with_traits(belief, vt, traits) {
    this.lock()
    const new_state = this.branch_state(this.ground_state, vt)
    const new_belief = Belief.from_template(new_state, {sid: belief.subject.sid, bases: [belief], traits})
    new_state.remove.push(belief)
    new_state.lock()
    return new_state
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
   * Get Belief for a Subject in this state (state only, no shared beliefs)
   * Progressively builds cache as beliefs are accessed (locked states only)
   * @param {Subject} subject - Subject to find belief for
   * @returns {Belief|null} The belief for this subject visible in this state
   */
  get_belief_by_subject(subject) {
    // Check cache first (only on locked states)
    if (this.locked && this._subject_index?.has(subject)) {
      // TypeScript: .has() check guarantees .get() returns Belief|null, not undefined
      return /** @type {Belief|null} */ (this._subject_index.get(subject))
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

    return null
  }

  /**
   * Get belief by label (delegates to get_belief_by_subject)
   * @param {string} label - Label to look up
   * @returns {Belief|null} The belief with this label in this state (state only, no shared beliefs)
   */
  get_belief_by_label(label) {
    const subject = DB.get_subject_by_label(label)
    if (!subject) return null
    return this.get_belief_by_subject(subject)
  }

  /**
   * Find existing beliefs about a subject in this state's mind
   * @param {Belief} source_belief - Belief to find matches for
   * @returns {Array<Belief>} Ranked list of matching beliefs (max 3)
   */
  recognize(source_belief) {
    // Query DB for all beliefs in this mind about the same subject
    const beliefs_about_subject = DB.find_beliefs_about_subject_in_state(
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
        const value = source_belief.get_trait(source_state, name)
        if (value !== null) {
          copied_traits[name] = this._recursively_learn_trait_value(source_state, value)
        }
      }

      const new_belief = Belief.from(this, archetype_bases, {
        '@about': DB.get_or_create_subject(source_belief.subject.ground_mind, source_belief.subject.sid),  // Shared canonical Subject
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
        const value = source_belief.get_trait(source_state, name)
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

      this.remove.push(existing_belief)
      return updated_belief
    }
  }

  /**
   * Learn about a belief from the parent mind (ground_state), copying it into this state's mind
   *
   * Models observation: NPCs forming inner knowledge about entities in the outer world.
   * The source_belief must exist in ground_state (observable entities with ownership).
   * Shared beliefs (prototypes) cannot be learned about - they exist only for inheritance.
   *
   * @param {Belief} source_belief - Belief from parent mind to learn about (must be in ground_state)
   * @param {string[]} [trait_names] - Traits to copy (empty = copy no traits, just archetypes)
   * @returns {Belief}
   */
  learn_about(source_belief, trait_names = []) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})
    assert(this.ground_state instanceof State, 'learn_about requires ground_state', {state_id: this._id})

    const source_state = this.ground_state

    // Verify source_belief exists in ground_state
    const belief_in_ground = source_state.get_belief_by_subject(source_belief.subject)
    assert(belief_in_ground === source_belief, 'source_belief must exist in ground_state',
      {source_belief_id: source_belief._id, ground_state_id: source_state._id})

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
      const learned_belief = this.learn_about(source_belief, [])
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

  /**
   * System designation - compact debug string
   * @returns {string}
   */
  sysdesig() {
    const parts = []

    const mind_label = this.in_mind?.label || `Mind#${this.in_mind?._id}`
    parts.push(mind_label)

    parts.push(`State#${this._id}`)

    if (this.vt !== undefined && this.vt !== this.tt) {
      parts.push(`tt:${this.tt} vt:${this.vt}`)
    } else {
      parts.push(`tt:${this.tt}`)
    }

    parts.push(this.locked ? '🔒' : '🔓')

    return parts.join(' ')
  }

  toJSON() {
    // Register in_mind as dependency if we're in a serialization context
    if (Serialize.active && this.in_mind) {
      Serialize.add_dependency(this.in_mind)
    }

    return {
      _type: 'State',
      _id: this._id,
      tt: this.tt,
      vt: this.vt,
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
      const ground_mind = mind.parent
      self = DB.get_or_create_subject(ground_mind, data.self)
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
    state.tt = data.tt
    state.vt = data.vt ?? data.tt  // Default vt to tt for backward compatibility
    state.insert = insert
    state.remove = remove
    state.ground_state = ground_state
    state.self = self
    state._branches = []
    state.locked = false
    state._subject_index = null

    // Register in global registry
    DB.register_state(state)

    // Update branches
    if (base) {
      base._branches.push(state)
    }

    return state
  }
}
