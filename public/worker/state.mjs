/**
 * State - immutable snapshot of beliefs at a specific time/tick
 *
 * States represent "what exists at this moment" in a mind. Once finalized, they never mutate;
 * instead, create new states via branch() operations. This enables time travel,
 * branching possibilities, and maintaining observation history.
 *
 * Key concepts:
 * - Immutability: Changes create new states linked via `base` property
 * - Multi-stage creation: States are unlocked during creation, allowing gradual buildup
 * - Tick progression: Each state has a tick number showing temporal ordering
 * - Operations: insert (new beliefs), remove (beliefs) via base chain
 * - Superposition: Multiple states can exist at same tick with different certainty
 *
 * Usage pattern:
 *   const state2 = state1.branch(ground_state, vt)
 *   // Add beliefs to state2 before locking
 *
 * See docs/SPECIFICATION.md for state architecture
 * See docs/ALPHA-1.md for how states track observations over time
 */

import { assert, log, debug } from './debug.mjs'
import { next_id } from './id_sequence.mjs'
import * as DB from './db.mjs'
import { Subject } from './subject.mjs'
import { Belief } from './belief.mjs'
import { Serialize } from './serialize.mjs'
import { Traittype, T } from './traittype.mjs'
import { Archetype, A } from './archetype.mjs'

/**
 * @typedef {import('./mind.mjs').Mind} Mind
 */

// IMPORT CONSTRAINTS: Cannot import temporal, timeless, convergence, eidos, logos, materia
// (circular dependencies). Use registries instead. See docs/CIRCULAR_DEPENDENCIES.md

/**
 * @typedef {object} StateJSON
 * @property {string} _type - "State", "Temporal", "Timeless", or "Convergence"
 * @property {number} _id - State identifier
 * @property {number|null} tt - State transaction time/tick (null for timeless states like logos)
 * @property {number|null} vt - State valid time (null for timeless states like logos)
 * @property {number|null} base - Base state _id (null for root states)
 * @property {number|null} ground_state - Ground state _id (null for Timeless/Logos bootstrap)
 * @property {number|null} self - Subject sid (null if no self identity)
 * @property {number|null} [about_state] - Alternative resolution context (Eidos→World lookups)
 * @property {number[]} insert - Belief _ids present in this state (serialized from private _insert)
 * @property {number[]} remove - Belief _ids removed in this state (serialized from private _remove)
 * @property {number} in_mind - Mind _id this state belongs to
 * @property {number[]} [component_states] - Component state _ids (only for Convergence)
 */

/**
 * @typedef {object} StateReference
 * @property {string} _type - Always "State"
 * @property {number} _id - State identifier
 */

/**
 * Immutable state snapshot with differential updates
 */
export class State {
  /**
   * Registry for State subclasses (avoids circular imports)
   * @type {Object<string, any>}
   */
  static _type_registry = {}

  /**
   * Register State subclass. Called by subclass at module load.
   * @param {string} type_name - The _type value (e.g., 'Temporal')
   * @param {any} class_constructor - The subclass constructor
   */
  static register_type(type_name, class_constructor) {
    this._type_registry[type_name] = class_constructor
  }

  /**
   * Get State subclass by type (for deserialization/construction)
   * @param {string} type_name - The _type value
   * @returns {any} The class constructor
   */
  static get_class(type_name) {
    return this._type_registry[type_name]
  }

  // TODO: Populate this registry for prototype state templates
  // Will be used to share belief lists across many nodes
  // See resolve_template() lines 364-367 for planned usage
  // Now stored in DB.state_by_label

  // Property declarations for TypeScript
  /** @type {string} - Type discriminator for polymorphism */
  _type = 'State'
  /** @type {string} - Base class identifier */
  _kind = 'State'

  /** @type {number} */ _id = 0
  /** @type {Mind} */ in_mind = /** @type {Mind} */ ({})
  /** @type {State|null} */ base = null
  /** @type {number|null} */ tt = null
  /** @type {number|null} */ vt = null
  /** @type {Belief[]} */ _insert = []
  /** @type {Belief[]} */ _remove = []
  /** @type {State|null} */ ground_state = null  // Null only for Timeless (Logos bootstrap)
  /** @type {Subject|null} */ self = null
  /** @type {State|null} */ about_state = null  // Alternative resolution context (Eidos→World lookups)
  /** @type {boolean} */ locked = false
  /** @type {State[]} */ _branches = []
  /** @type {Map<Subject, Belief|null>|null} */ _subject_index = null
  /** @type {Map<Subject, Map<Traittype, State|null>>} */ _rev_base = new Map()
  /** @type {Map<Subject, Map<Traittype, Set<Belief>>>} */ _rev_add = new Map()
  /** @type {Map<Subject, Map<Traittype, Set<Belief>>>} */ _rev_del = new Map()

  /**
   * @param {Mind} mind
   * @param {State|null} ground_state - Ground state (null only for Timeless with Logos)
   * @param {State|null} base
   * @param {object} options - Optional meta-parameters
   * @param {number|null} [options.tt] - Transaction time (explicit for timeless states)
   * @param {number|null} [options.vt] - Valid time (defaults to tt)
   * @param {Subject|null} [options.self] - Self identity (defaults to base.self)
   * @param {State|null} [options.about_state] - Alternative resolution context (Eidos→World lookups)
   * @param {boolean} [options.derivation] - True if this state is a derivation (computed view, non-mutating)
   */
  constructor(mind, ground_state, base=null, {tt: tt_option, vt, self, about_state, derivation} = {}) {
    // Prevent direct instantiation - State is abstract
    // Only allow construction through subclasses (Temporal, Timeless, Convergence)
    if (new.target === State) {
      throw new Error(
        'Cannot instantiate State directly - use Temporal for temporal states, ' +
        'Timeless for timeless states, or Convergence for compositions'
      )
    }

    assert(base === null || base.locked, 'Cannot create state from unlocked base state')

    // Allow null ground_state for Timeless (Logos bootstrap)
    if (ground_state !== null) {
      assert(
        ground_state._kind === 'State',
        'ground_state must be a State',
        { ground_kind: ground_state?._kind, ground_type: ground_state?._type }
      )

      assert(
        ground_state.in_mind === mind.parent,
        'ground_state must be in parent mind',
        {
          mind: mind.label,
          parent: mind.parent?.label ?? null,
          ground_state_mind: ground_state.in_mind?.label ?? null
        }
      )
    }

    // Derive tt from ground_state.vt (fork invariant)
    // Exception: When ground_state is timeless (vt === null), allow explicit tt
    const tt = tt_option ?? ground_state?.vt ?? null

    // If tt was explicitly provided, validate it's only for timeless ground_state
    if (tt_option != null && ground_state !== null) {
      assert(
        ground_state.vt === null,
        'tt can only be provided explicitly when ground_state is timeless (vt === null)',
        { provided_tt: tt_option, ground_vt: ground_state.vt }
      )
    }

    // Default self to base.self, vt to tt
    const effective_self = self ?? base?.self ?? null
    const effective_vt = vt ?? tt

    // Validate self
    assert(effective_self === null || effective_self instanceof Subject, 'self must be Subject or null')

    // Check if self belief is unlocked (only for initial states, not versioning)
    // Skip this check for derivations (computed views that don't mutate)
    if (effective_self !== null && base === null && !derivation && ground_state !== null) {
      const self_belief = ground_state.get_belief_by_subject(effective_self)
      assert(self_belief === null || !self_belief.locked, 'Cannot create state for locked self')
    }

    // Use shared initialization
    this._init_properties(mind, ground_state, base, tt, effective_vt, effective_self, about_state ?? null)
  }

  /**
   * Shared initialization - SINGLE SOURCE OF TRUTH for property assignment
   * Used by both constructor and from_json
   * @protected
   * @param {Mind} in_mind
   * @param {State|null} ground_state
   * @param {State|null} base
   * @param {number|null} tt
   * @param {number|null} vt
   * @param {Subject|null} self
   * @param {State|null} about_state
   * @param {number|null} [id] - ID for deserialization (null = generate new)
   */
  _init_properties(in_mind, ground_state, base, tt, vt, self, about_state, id = null) {
    // Initialize ALL properties
    this._kind = 'State'  // Base class identifier (same for all State subclasses)
    this._id = id ?? next_id()  // Use provided ID or generate new one
    this.in_mind = in_mind
    this.base = base
    this.ground_state = ground_state
    this.tt = tt
    this.vt = vt
    this.self = self
    this.about_state = about_state
    this._insert = []
    this._remove = []

    // Initialize collections and register (keep existing method)
    this._init_state_properties()
  }

  /**
   * Initialize common state properties
   * Sets properties that are always initialized the same way across all state creation paths
   * Call this after setting variable properties (_id, in_mind, base, tt, vt, etc.)
   */
  _init_state_properties() {
    this.locked = false

    /**
     * Forward links to child states branching from this one
     * Query: O(1) enumeration for possibility tree navigation
     * Maintained by: branch() - adds child to parent's branches
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

    this._rev_base = new Map()
    this._rev_add = new Map()
    this._rev_del = new Map()

    this.in_mind.register_state(this)
    DB.register_state(this)
  }

  /**
   * Add belief to reverse index for a subject's trait
   * Maintains skip list pointer to previous state with changes
   * @param {Subject} subject - Subject being referenced
   * @param {Traittype} trait_type - Traittype object
   * @param {Belief} belief - Belief containing the reference
   */
  rev_add(subject, trait_type, belief) {
    let by_subject = this._rev_add.get(subject);
    if (!by_subject) {
      this._rev_add.set(subject, by_subject = new Map());
    }

    let beliefs = by_subject.get(trait_type);
    if (!beliefs) {
      by_subject.set(trait_type, beliefs = new Set());

      // First operation for this (subject, traittype) - set skip list pointer
      this._set_rev_base_pointer(subject, trait_type);
    }

    beliefs.add(belief);
  }

  /**
   * Remove belief from reverse index for a subject's trait
   * Maintains skip list pointer to previous state with changes
   * @param {Subject} subject - Subject being referenced
   * @param {Traittype} trait_type - Traittype object
   * @param {Belief} belief - Belief containing the reference
   */
  rev_del(subject, trait_type, belief) {
    let by_subject = this._rev_del.get(subject);
    if (!by_subject) {
      this._rev_del.set(subject, by_subject = new Map());
    }

    let beliefs = by_subject.get(trait_type);
    if (!beliefs) {
      by_subject.set(trait_type, beliefs = new Set());

      // First operation for this (subject, traittype) - set skip list pointer
      this._set_rev_base_pointer(subject, trait_type);
    }

    beliefs.add(belief);
  }

  /**
   * Set skip list pointer to previous state with changes for (subject, traittype)
   * Called on first rev_add or rev_del operation for a (subject, traittype) pair
   * @param {Subject} subject - Subject being referenced
   * @param {Traittype} trait_type - Traittype object
   * @private
   */
  _set_rev_base_pointer(subject, trait_type) {
    // Walk base chain to find previous state with changes
    for (let s = this.base; s; s = s.base) {
      const has_add = s._rev_add.get(subject)?.has(trait_type)
      const has_del = s._rev_del.get(subject)?.has(trait_type)

      if (has_add || has_del) {
        // Found previous state with changes - set pointer
        let base_by_subject = this._rev_base.get(subject)
        if (!base_by_subject) {
          this._rev_base.set(subject, base_by_subject = new Map())
        }
        base_by_subject.set(trait_type, s)
        return
      }
    }

    // No previous state with changes - set null to mark end of chain
    let base_by_subject = this._rev_base.get(subject)
    if (!base_by_subject) {
      this._rev_base.set(subject, base_by_subject = new Map())
    }
    base_by_subject.set(trait_type, null)
  }

  /**
   * Get next state(s) to check in reverse trait lookup chain
   * Returns array of states to continue traversal (polymorphic with Convergence)
   * @param {Subject} subject - Subject being queried in reverse lookup
   * @param {Traittype} traittype - Traittype being queried
   * @returns {State[]} Array of next states to check (single element or empty)
   */
  rev_base(subject, traittype) {
    const next = this._rev_base.get(subject)?.get(traittype) ?? this.base
    return next ? [next] : []
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

    for (const belief of this._insert) {
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
   * @param {object} options - Optional parameters
   * @param {State|null} [options.about_state] - Alternative resolution context (Eidos→World lookups)
   */
  add_beliefs_from_template(beliefs, {about_state=null} = {}) {
    const created_beliefs = []
    for (const [label, def] of Object.entries(beliefs)) {
      const belief = Belief.from_template(this, {
        ...def,
        about_state,
        label
      })
      created_beliefs.push(belief)
    }

    // Auto-lock each created belief (matches create_shared_from_template behavior)
    for (const belief of created_beliefs) {
      belief.lock(this)
    }
  }

  /**
   * Create shared beliefs (prototypes) in Eidos that reference beliefs in this state
   * Convenience wrapper for eidos_state.add_beliefs_from_template() with about_state=this
   * @param {Object<string, object>} beliefs - Object mapping labels to belief definitions
   */
  add_shared_from_template(beliefs) {
    // Use Mind registry to avoid circular dependency (state→eidos→mind→state)
    // @ts-ignore - in_mind.constructor is Mind class with static get_function
    const eidos = this.in_mind.constructor.get_function('eidos')
    const eidos_mind = eidos()
    const eidos_state = eidos_mind.origin_state
    assert(eidos_state instanceof State, 'Eidos origin_state must be State', {eidos_state})

    // TypeScript null-check (assert doesn't narrow types)
    if (!eidos_state) throw new Error('Eidos origin_state is null')

    eidos_state.add_beliefs_from_template(beliefs, {about_state: this})
  }

  /**
   * Create a new branched state from this state (low-level)
   * @param {State} ground_state - External world state this mind observes (required)
   * @param {number|null} [vt] - Valid time override (for temporal reasoning about past/future)
   * @returns {State} New unlocked state
   */
  branch(ground_state, vt) {
    // Build options for State constructor
    const options = {}

    // If ground_state.vt is null (logos case), must provide tt explicitly
    if (ground_state.vt === null) {
      assert(vt != null, 'vt must be provided when ground_state.vt is null (world mind branching)')
      options.tt = vt
    }

    // If vt is provided, use it (for memory/planning scenarios)
    if (vt !== undefined && vt !== null) {
      options.vt = vt
    }

    // self is inherited from this.self via base.self in constructor (no need to pass explicitly)

    // Use registry to construct Temporal without importing it
    const TemporalClass = State.get_class('Temporal')
    const state = new TemporalClass(this.in_mind, ground_state, this, options)

    // Validate time doesn't go backwards (skip check for timeless states)
    if (state.tt != null && this.tt != null) {
      assert(state.tt >= this.tt, 'tt must not go backwards', {current_tt: this.tt, next_tt: state.tt})
    }

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

      // Add to reverse index for all subject-reference traits (including inherited)
      // TODO: EXPENSIVE - iterates all traits (own + inherited) for each belief
      for (const [traittype, value] of belief.get_traits()) {
        if (traittype.is_subject_reference) {
          for (const subject of belief.extract_subjects(value)) {
            this.rev_add(subject, traittype, belief)
          }
        }
      }
    }
    this._insert.push(...beliefs)

    // Notify listeners of state mutation (for inspect UI updates)
    if (typeof self !== 'undefined' && self.dispatchEvent) {
      self.dispatchEvent(new CustomEvent('state_mutated', { detail: { state_id: this._id } }))
    }
  }

  /**
   * Add beliefs to this state's remove list
   * @param {...Belief} beliefs - Beliefs to remove
   */
  remove_beliefs(...beliefs) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})

    // Clean up reverse index for removed beliefs
    // TODO: EXPENSIVE - iterates all traits (own + inherited) for each belief
    for (const belief of beliefs) {
      for (const [traittype, value] of belief.get_traits()) {
        if (traittype.is_subject_reference) {
          for (const subject of belief.extract_subjects(value)) {
            this.rev_del(subject, traittype, belief)
          }
        }
      }
    }

    this._remove.push(...beliefs)

    // Notify listeners of state mutation (for inspect UI updates)
    if (typeof self !== 'undefined' && self.dispatchEvent) {
      self.dispatchEvent(new CustomEvent('state_mutated', { detail: { state_id: this._id } }))
    }
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
  tick_with_template(belief, vt, traits) {
    this.lock()
    // ground_state is only null for Timeless, which never calls tick_with_template
    const new_state = this.branch(/** @type {State} */ (this.ground_state), vt)
    const new_belief = Belief.from_template(new_state, {sid: belief.subject.sid, bases: [belief], traits})
    new_state.remove_beliefs(belief)
    new_state.lock()
    return new_state
  }

  *get_beliefs() {
    const removed = new Set()

    /** @type {State|null} s */ let s
    for (s = this; s; s = s.base) {
      // Process _remove BEFORE _insert to handle same-state updates correctly
      // (e.g., when a belief is both inserted and then removed/replaced in same state)
      for (const belief of s._remove) {
        removed.add(belief._id)
      }
      for (const belief of s._insert) {
        if (!removed.has(belief._id)) {
          yield belief
        }
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
    const subject = Subject.get_by_label(label)
    if (!subject) return null
    return this.get_belief_by_subject(subject)
  }

  /**
   * Find existing beliefs about a subject visible in this state
   * Searches beliefs in this state and all base states (via base chain)
   * @param {Belief} source_belief - Belief to find matches for
   * @returns {Array<Belief>} Ranked list of matching beliefs (max 3)
   */
  recognize(source_belief) {
    // Find beliefs in this state where @about points to source_belief.subject
    // Uses reverse trait index for efficient lookup (only returns visible beliefs)
    const t_about = Traittype.get_by_label('@about')
    assert(t_about, "Traittype '@about' not found in registry")

    const query_state = this.ground_state ?? this.about_state
    let about_belief = query_state?.get_belief_by_subject(source_belief.subject)
    if (!about_belief && query_state) {
      about_belief = source_belief.subject.get_shared_belief_by_state(query_state)
    }

    const beliefs_about_subject = about_belief ? [...about_belief.rev_trait(this, t_about)] : []

    // TODO: Sort by confidence (for now just return first 3)
    // TODO: Limit to explicit knowledge beliefs (not observation events, etc.)
    // TODO: Filter by acquaintance threshold - beliefs with low acquaintance
    //       may not trigger recognition during perception events
    return beliefs_about_subject.slice(0, 3)
  }

  /**
   * Integrate new knowledge with existing beliefs
   * @param {State} source_state - State context for resolving trait references
   * @param {Belief} source_belief - Belief to integrate
   * @param {Traittype[]} traittypes - Traittypes to copy/update
   * @param {Array<Belief>} existing_beliefs - Beliefs from recognize()
   * @returns {Belief} Updated or new belief
   */
  integrate(source_state, source_belief, traittypes, existing_beliefs) {
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
      for (const traittype of traittypes) {
        const value = source_belief.get_trait(source_state, traittype)
        if (value !== null) {
          copied_traits[traittype.label] = this._recursively_learn_trait_value(source_state, value)
        }
      }

      const new_belief = Belief.from(this, archetype_bases, {
        '@about': source_belief.subject,
        ...copied_traits
      })

      this.insert_beliefs(new_belief)
      return new_belief

    } else {
      // Update existing belief (use first from ranked list)
      const existing_belief = existing_beliefs[0]

      // Copy new traits, dereferencing belief references
      // Use get_trait() to find inherited values (returns raw Subjects, not Beliefs)
      /** @type {Record<string, any>} */
      const new_traits = {}
      for (const traittype of traittypes) {
        const value = source_belief.get_trait(source_state, traittype)
        if (value !== null) {
          new_traits[traittype.label] = this._recursively_learn_trait_value(source_state, value)
        }
      }

      // If no new traits, just return existing belief
      if (Object.keys(new_traits).length === 0) {
        return existing_belief
      }

      // Create updated belief - keeps all old traits, updates specified ones
      const updated_belief = existing_belief.branch(this, new_traits)

      this.remove_beliefs(existing_belief)
      return updated_belief
    }
  }

  /**
   * Get the core state for a nested mind hosted by an entity
   *
   * The core state is the mind's primary operational state: synchronized with
   * this ground state (tt = this.vt), used as the starting point for belief
   * allocation and tree walks.
   * @param {Belief} host - Entity with mind trait (e.g., player, NPC)
   * @returns {State} The core mind state
   * @throws {Error} If host has no mind, or if no state or multiple states found
   */
  get_core_state_by_host(host) {
    // Get the nested mind from the host entity
    const mind_traittype = Traittype.get_by_label('mind')
    assert(mind_traittype, "Traittype 'mind' not found in registry")
    const host_mind = host.get_trait(this, mind_traittype)
    assert(host_mind, `Entity ${host._id} has no mind trait`, {host_id: host._id, host_label: host.get_label()})

    // Find the core state: latest state where tt <= this.vt and ground_state = this (or this's ancestry)
    // Use states_at_tt to get outermost states, then filter by checking ground_state ancestry
    const candidates = []
    for (const s of host_mind.states_at_tt(this.vt)) {
      // Check if s.ground_state is this or in this's ancestry
      /** @type {State | null} */
      let current_check = this
      while (current_check) {
        if (current_check === s.ground_state) {
          candidates.push(s)
          break
        }
        current_check = current_check.base
      }
    }

    if (candidates.length === 0) {
      assert(false,
        `No core state found for host`,
        {
          host_id: host._id,
          host_label: host.get_label(),
          mind_label: host_mind.label,
          vt: this.vt,
          available_states: [...host_mind._states].map(s => ({id: s._id, tt: s.tt, ground_state_id: s.ground_state?._id}))
        })
    }

    // Should be exactly one core state (no superposition)
    const core_tt = candidates[0]?.tt
    assert(candidates.length === 1,
      `Expected single core state at tt=${core_tt}, found ${candidates.length} (superposition)`,
      {
        host_id: host._id,
        host_label: host.get_label(),
        mind_label: host_mind.label,
        tt: core_tt,
        vt: this.vt,
        candidates: candidates.map(s => ({id: s._id, tt: s.tt, ground: s.ground_state?._id}))
      })

    return candidates[0]
  }

  /**
   * Get an active (unlocked) state for a host entity
   * Like get_core_state_by_host(), but ensures the returned state is unlocked.
   * If the core state is locked, branches it forward to create a new unlocked state.
   * @param {Belief} host - Entity with mind trait (e.g., player, NPC)
   * @returns {State} An unlocked state in the host's mind
   */
  get_active_state_by_host(host) {
    const core_state = this.get_core_state_by_host(host)

    if (core_state.locked) {
      // Branch forward to create unlocked state
      return core_state.branch(this, this.vt)
    }

    return core_state
  }

  /**
   * Get observable trait names from a belief based on exposure modalities
   *
   * Filters traits to only those matching the specified sensory modalities.
   * Traits with exposure: 'internal' are never included (not physically observable).
   * @param {Belief} belief - Belief to get observable traits from
   * @param {string[]} modalities - Exposure types to include (e.g., ['visual', 'spatial'])
   * @returns {Traittype[]} Array of Traittypes with matching exposure
   */
  get_observable_traits(belief, modalities) {
    const observable_traits = []

    // Iterate through all traits on the belief
    for (const [traittype, _value] of belief.get_traits()) {
      // Skip if traittype has no exposure metadata
      if (!traittype.exposure) {
        continue
      }

      // Skip internal traits (never physically observable)
      if (traittype.exposure === 'internal') {
        continue
      }

      // Include trait if its exposure matches any of the specified modalities
      if (modalities.includes(traittype.exposure)) {
        observable_traits.push(traittype)
      }
    }

    return observable_traits
  }

  /**
   * Learn about a belief from the parent mind (ground_state), copying it into this state's mind
   *
   * Models observation: NPCs forming inner knowledge about entities in the outer world.
   * The source_belief must exist in ground_state (observable entities with ownership).
   * Shared beliefs (prototypes) cannot be learned about - they exist only for inheritance.
   * @param {Belief} source_belief - Belief from parent mind to learn about (must be in ground_state)
   * @param {Object} [options] - Learning options
   * @param {string[]} [options.traits] - Specific traits to copy (overrides modalities)
   * @param {string[]} [options.modalities] - Exposure modalities to observe (default: ['visual', 'spatial'])
   * @returns {Belief}
   */
  learn_about(source_belief, {traits, modalities = ['visual', 'spatial']} = {}) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})
    assert(this.ground_state instanceof State, 'learn_about requires ground_state', {state_id: this._id})

    // Use about_state for resolution if set (Eidos→World), otherwise ground_state
    const source_state = this.about_state ?? this.ground_state

    // Verify source_belief exists in source_state (either about_state or ground_state)
    const belief_in_source = source_state.get_belief_by_subject(source_belief.subject)
    assert(belief_in_source === source_belief, 'source_belief must exist in source_state',
      {source_belief_id: source_belief._id, source_state_id: source_state._id,
       source_state_mind: source_state.in_mind?.label, using_about_state: this.about_state != null})

    // Determine which traits to learn
    let traittypes
    if (traits !== undefined) {
      // Explicit traits specified (as strings) - convert to Traittypes
      traittypes = traits.map(name => {
        const tt = Traittype.get_by_label(name)
        assert(tt, `Traittype '${name}' not found in registry`, {mind: this.in_mind.label, traits})
        return tt
      })
    } else {
      // Auto-learn observable traits based on modalities
      traittypes = this.get_observable_traits(source_belief, modalities)
    }

    // Step 1: Recognize existing knowledge
    const existing_beliefs = this.recognize(source_belief)

    // Step 2: Integrate new knowledge
    return this.integrate(source_state, source_belief, traittypes, existing_beliefs)
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
      const learned_belief = this.learn_about(source_belief, {traits: []})
      return learned_belief.subject  // Return Subject, not Belief
    } else {
      return value  // Primitives, State, Mind pass through as-is
    }
  }

  /**
   * Perceive a single entity, creating a perceived belief with observable traits
   * @private
   * @param {Belief} world_entity - Entity to perceive from the world state
   * @param {State} about_state - State to resolve trait values in
   * @param {string[]} modalities - Exposure modalities to observe
   * @returns {Belief} Perceived belief with observable traits
   */
  _perceive_single(world_entity, about_state, modalities) {
    const observed_traittypes = this.get_observable_traits(world_entity, modalities)
    const archetype_bases = [...world_entity.get_archetypes()]  // Convert generator to array

    /** @type {Record<string, any>} */
    const observed_traits = {}
    for (const traittype of observed_traittypes) {
      const value = world_entity.get_trait(about_state, traittype)
      if (value !== null) {
        // If value is a Subject (nested entity), recursively perceive it
        if (value instanceof Subject) {
          const nested_belief = value.get_belief_by_state(about_state)
          if (nested_belief) {
            // Recursively perceive the nested entity
            const nested_perceived = this._perceive_single(nested_belief, about_state, modalities)
            observed_traits[traittype.label] = nested_perceived.subject
          }
        } else {
          observed_traits[traittype.label] = value
        }
      }
    }

    // Create perceived belief with @about: null (unrecognized)
    // Use Belief.from() since @about is not allowed in add_belief_from_template
    const perceived = Belief.from(this, archetype_bases, {
      '@about': null,
      ...observed_traits
    })

    this.insert_beliefs(perceived)
    return perceived
  }

  /**
   * Perceive entity with identity recognition (fast path)
   * Recursively perceives nested entities and creates versioned beliefs when traits change
   * @private
   * @param {Belief} world_entity - Entity to perceive from world state
   * @param {State} world_state - State to resolve world entity traits in
   * @param {string[]} modalities - Observable modalities
   * @returns {{belief: Belief, all_perceived: Belief[]}} Knowledge belief and all perceived entities
   */
  _perceive_with_recognition(world_entity, world_state, modalities) {
    // Collect all beliefs perceived during this operation (including nested)
    const all_perceived = []

    // Step 1: Recursively perceive all observable Subject-valued traits first
    const observed_traittypes = this.get_observable_traits(world_entity, modalities)
    /** @type {Record<string, any>} */
    const observed_traits = {}
    const uncertain_tt = T['@uncertain_identity']

    for (const traittype of observed_traittypes) {
      let value = world_entity.get_trait(world_state, traittype)

      if (value !== null) {
        // If Subject-valued, recursively perceive it
        if (value instanceof Subject) {
          const nested_belief = value.get_belief_by_state(world_state)
          if (nested_belief) {
            // Check if nested entity has @uncertain_identity
            const is_uncertain = uncertain_tt && nested_belief.get_trait(world_state, uncertain_tt) === true

            if (is_uncertain) {
              // Nested entity is uncertain: use slow path
              const perceived = this._perceive_single(nested_belief, world_state, modalities)
              value = perceived.subject
              all_perceived.push(perceived)
            } else {
              // Nested entity is certain: recursive fast path
              const result = this._perceive_with_recognition(nested_belief, world_state, modalities)
              value = result.belief.subject
              all_perceived.push(...result.all_perceived)  // Collect nested perceptions
            }
          }
        }

        observed_traits[traittype.label] = value
      }
    }

    // Step 2: Check for existing knowledge about this entity
    const existing_knowledge = this.recognize(world_entity)

    let main_belief

    if (existing_knowledge.length === 0) {
      // No existing knowledge: create new knowledge belief with @about set
      const archetype_bases = [...world_entity.get_archetypes()]
      main_belief = Belief.from(this, archetype_bases, {
        '@about': world_entity.subject,
        ...observed_traits
      })
      this.insert_beliefs(main_belief)
    } else {
      // Step 3: Compare NON-SUBJECT traits with existing knowledge
      // (Subject traits don't matter - they auto-resolve to latest version in state)
      const knowledge = existing_knowledge[0]  // Use first match
      let traits_match = true

      for (const traittype of observed_traittypes) {
        const perceived_value = observed_traits[traittype.label]

        // Skip Subject-valued traits - they don't need comparison
        if (perceived_value instanceof Subject) continue

        const knowledge_value = knowledge.get_trait(this, traittype)

        if (perceived_value !== knowledge_value) {
          traits_match = false
          break
        }
      }

      // Step 4: Reuse or create versioned belief
      if (traits_match) {
        // All non-Subject traits match: reuse existing knowledge
        main_belief = knowledge
      } else {
        // Traits differ: create new version with knowledge as base
        // Only include non-Subject trait updates (Subject traits are inherited)
        /** @type {Record<string, any>} */
        const trait_updates = {}
        for (const [label, value] of Object.entries(observed_traits)) {
          if (!(value instanceof Subject)) {
            trait_updates[label] = value
          }
        }

        // Null out knowledge traits not in perception
        const knowledge_traits = knowledge.get_traits()
        for (const [traittype, _value] of knowledge_traits) {
          if (traittype.label === '@about') continue  // Skip meta-trait
          if (!(traittype.label in observed_traits)) {
            trait_updates[traittype.label] = null
          }
        }

        // Use branch() for versioning with same subject - avoids template overhead
        main_belief = knowledge.branch(this, trait_updates)
      }
    }

    // Add main belief to perceived list and return
    all_perceived.push(main_belief)
    return {belief: main_belief, all_perceived}
  }

  /**
   * Create an observation/perception event capturing what was observed
   *
   * Implements the categorization phase of dual-process recognition:
   * - Fast path: Familiar entities → just store subject reference
   * - Slow path: Unfamiliar entities → create perceived belief with traits
   *
   * @param {Belief[]} content - Array of world entities to perceive
   * @param {string[]} modalities - Exposure modalities to observe (default: ['visual', 'spatial'])
   * @returns {Belief} EventPerception belief containing perceived items
   */
  perceive(content, modalities = ['visual', 'spatial']) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})

    const all_perceived_subjects = []
    const uncertain_tt = T['@uncertain_identity']

    for (const world_entity of content) {
      const about_state = world_entity.origin_state

      // Check if identity is uncertain
      const is_uncertain = uncertain_tt && world_entity.get_trait(about_state, uncertain_tt) === true

      if (is_uncertain) {
        // Slow path: Identity uncertain, create perceived belief with @about: null
        const perceived = this._perceive_single(world_entity, about_state, modalities)
        all_perceived_subjects.push(perceived.subject)
      } else {
        // Fast path: Identity certain, use recognition-based perception
        const result = this._perceive_with_recognition(world_entity, about_state, modalities)
        // Add all perceived entities (including nested) to the perception event
        all_perceived_subjects.push(...result.all_perceived.map(b => b.subject))
      }
    }

    // Create EventPerception holding ALL perceived items (including nested entities)
    const perception = Belief.from(this, [A.EventPerception], {
      content: all_perceived_subjects
    })
    this.insert_beliefs(perception)
    return perception
  }

  /**
   * Identify a perceived belief by matching its traits against knowledge beliefs
   *
   * Implements the identification/recollection phase of dual-process recognition.
   * Searches for knowledge beliefs with matching archetypes and trait values.
   *
   * @param {Belief} perceived_belief - Perceived belief with traits but no/unknown @about
   * @returns {Subject[]} Array of candidate subjects (ranked by match quality)
   */
  identify(perceived_belief) {
    // FIXME: validate
    const archetypes = perceived_belief.get_archetypes()
    const candidates = new Map()  // Use Map to deduplicate by subject

    for (const archetype of archetypes) {
      // Get knowledge beliefs with this archetype
      const beliefs = this.get_beliefs_by_archetype(archetype)

      for (const belief of beliefs) {
        // Skip if no @about (not knowledge)
        const about_tt = Traittype.get_by_label('@about')
        if (!about_tt) continue
        const about = belief.get_trait(this, about_tt)
        if (!about) continue

        // Match traits
        const score = this.match_traits(perceived_belief, belief)
        if (score > 0) {
          // Only add if not already present or if score is higher
          const key = about.sid
          if (!candidates.has(key) || candidates.get(key).score < score) {
            candidates.set(key, {subject: about, score})
          }
        }
      }
    }

    // Sort by score (descending), return subjects only
    return [...candidates.values()]
      .sort((a, b) => b.score - a.score)
      .map(c => c.subject)
  }

  /**
   * Form knowledge from a perception event
   *
   * Processes EventPerception content, running identification for unrecognized items
   * and integrating them into knowledge via learn_about().
   *
   * @param {Belief} perception - EventPerception belief
   */
  learn_from(perception) {
    // FIXME: validate what learn_from does
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})

    const content_tt = Traittype.get_by_label('content')
    const about_tt = Traittype.get_by_label('@about')
    if (!content_tt || !about_tt) return

    const content = perception.get_trait(this, content_tt)

    if (!content) return

    for (const item_subject of content) {
      const item = this.get_belief_by_subject(item_subject)
      if (!item) {
        // Subject not found in this state - skip
        continue
      }

      const about = item.get_trait(this, about_tt)

      if (about !== undefined) {
        // It's a perceived belief (has @about trait)
        if (about === null) {
          // Unidentified - run identification
          const candidates = this.identify(item)

          if (candidates.length === 1 && this.ground_state) {
            // Unambiguous match - learn about the identified entity
            let world_entity = this.ground_state.get_belief_by_subject(candidates[0])
            if (!world_entity) {
              world_entity = candidates[0].get_shared_belief_by_state(this.ground_state)
            }
            assert(world_entity, 'Failed to find identified entity in ground_state', {subject: candidates[0]})
            this.learn_about(world_entity)
          }
          // else: Ambiguous or no match - skip for now
          // (Future: create uncertain knowledge, track ambiguity)
        } else if (this.ground_state) {
          // Already identified - learn about the identified entity
          let world_entity = this.ground_state.get_belief_by_subject(/** @type {Subject} */ (about))
          if (!world_entity) {
            world_entity = /** @type {Subject} */ (about).get_shared_belief_by_state(this.ground_state)
          }
          assert(world_entity, 'Failed to find identified entity in ground_state', {about})
          this.learn_about(world_entity)
        }
      } else if (this.ground_state) {
        // Just a subject reference - familiar entity
        let world_entity = this.ground_state.get_belief_by_subject(item_subject)
        if (!world_entity) {
          world_entity = item_subject.get_shared_belief_by_state(this.ground_state)
        }
        assert(world_entity, 'Failed to find familiar entity in ground_state', {subject: item_subject})
        this.learn_about(world_entity)
      }
    }
  }

  /**
   * Get all beliefs in this state with a specific archetype
   *
   * @param {Archetype} archetype - Archetype to match
   * @returns {Belief[]} Beliefs with this archetype in their bases
   */
  get_beliefs_by_archetype(archetype) {
    const matching_beliefs = []

    // Iterate through all beliefs in this state (including base chain)
    for (const belief of this.get_beliefs()) {
      const archetypes = [...belief.get_archetypes()]
      if (archetypes.some((/** @type {Archetype} */ a) => a === archetype)) {
        matching_beliefs.push(belief)
      }
    }

    return matching_beliefs
  }

  /**
   * Match traits between two beliefs and return similarity score
   *
   * Initial simple implementation: exact match on all perceived traits = 1.0
   * Future: partial match, hierarchical matching, weighted traits
   *
   * @param {Belief} perceived - Perceived belief with observed traits
   * @param {Belief} knowledge - Knowledge belief to compare against
   * @returns {number} Match score (0.0 = no match, 1.0 = perfect match)
   */
  match_traits(perceived, knowledge) {
    // FIXME: validate
    // Get all traits from perceived belief (except @about)
    const perceived_traits = [...perceived.get_traits()]
      .filter(([tt, _]) => tt.label !== '@about')

    if (perceived_traits.length === 0) {
      // No traits to match (just archetype)
      return 0.5  // Weak match - same archetype but no discriminating traits
    }

    let matched_count = 0
    const total_count = perceived_traits.length

    for (const [traittype, perceived_value] of perceived_traits) {
      const knowledge_value = knowledge.get_trait(this, traittype)

      // Exact match check
      if (perceived_value === knowledge_value) {
        matched_count++
      } else if (perceived_value instanceof Subject) {
        // Subject reference - compare subject equality
        if (knowledge_value instanceof Subject && perceived_value.sid === knowledge_value.sid) {
          matched_count++
        }
      }
      // TODO: Nested object matching, array matching, partial matching
    }

    return matched_count / total_count
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

    // Only show lock symbol when locked (unlocked is default)
    if (this.locked) {
      parts.push('🔒')
    }

    return parts.join(' ')
  }

  /**
   * @returns {StateJSON}
   */
  toJSON() {
    // Register in_mind as dependency if we're in a serialization context
    if (Serialize.active && this.in_mind) {
      Serialize.add_dependency(this.in_mind)
    }

    return {
      _type: this._type,  // Use instance _type property for polymorphism
      _id: this._id,
      tt: this.tt,
      vt: this.vt,
      base: this.base?._id ?? null,
      ground_state: this.ground_state?._id ?? null,
      self: this.self?.toJSON() ?? null,
      about_state: this.about_state?._id ?? null,
      insert: this._insert.map(b => b._id),
      remove: this._remove.map(b => b._id),
      in_mind: this.in_mind?._id ?? null
    }
  }

  // ========================================================================
  // JSON Loading Helpers - Used by from_json in State and subclasses
  // ========================================================================

  /**
   * Load references from JSON data (ID → object lookup)
   * @param {Mind} mind - Mind context for resolution
   * @param {StateJSON} data - JSON data
   * @returns {{in_mind: Mind, base: State|null, ground_state: State|null, self: Subject|null, about_state: State|null}}
   */
  static _load_refs_from_json(mind, data) {
    // Load in_mind
    let in_mind = mind
    if (data.in_mind != null) {
      const found = DB.get_mind_by_id(data.in_mind)
      if (!found) throw new Error(`Cannot load in_mind ${data.in_mind} for state ${data._id}`)
      in_mind = found
    }

    // Load base
    let base = null
    if (data.base != null) {
      base = DB.get_state_by_id(data.base)
      if (!base) throw new Error(`Cannot load base ${data.base} for state ${data._id}`)
    }

    // Load ground_state
    let ground_state = null
    if (data.ground_state != null) {
      ground_state = DB.get_state_by_id(data.ground_state)
      if (!ground_state) throw new Error(`Cannot load ground_state ${data.ground_state} for state ${data._id}`)
    }

    // Load self
    let self = null
    if (data.self != null) {
      self = Subject.get_or_create_by_sid(data.self, mind)  // mater = mind
    }

    // Load about_state
    let about_state = null
    if (data.about_state != null) {
      about_state = DB.get_state_by_id(data.about_state)
      if (!about_state) throw new Error(`Cannot load about_state ${data.about_state} for state ${data._id}`)
    }

    return { in_mind, base, ground_state, self, about_state }
  }

  /**
   * Load insert beliefs from JSON data
   * @param {StateJSON} data - JSON data with insert array
   */
  _load_insert_from_json(data) {
    for (const belief_id of data.insert) {
      const belief = DB.get_belief_by_id(belief_id)
      if (!belief) throw new Error(`Cannot load insert belief ${belief_id} for state ${data._id}`)
      this._insert.push(belief)
    }
  }

  /**
   * Load remove beliefs from JSON data
   * @param {StateJSON} data - JSON data with remove array
   */
  _load_remove_from_json(data) {
    for (const belief_id of data.remove) {
      const belief = DB.get_belief_by_id(belief_id)
      if (!belief) throw new Error(`Cannot load remove belief ${belief_id} for state ${data._id}`)
      this._remove.push(belief)
    }
  }

  /**
   * Link this state to its base's branches array
   */
  _link_base() {
    if (this.base) {
      this.base._branches.push(this)
    }
  }

  /**
   * Create State from JSON data (fully materialized)
   * @param {Mind} mind - Mind this state belongs to (or context for resolution)
   * @param {StateJSON} data - JSON data with _type: 'State' or 'Convergence'
   * @returns {State}
   */
  static from_json(mind, data) {
    // Use registry for polymorphic deserialization
    const StateClass = this._type_registry[data._type]
    if (StateClass) {
      return StateClass.from_json(mind, data)
    }

    // Fallback to base State for unknown/unregistered types
    // Load references and create instance
    const refs = State._load_refs_from_json(mind, data)
    const state = Object.create(State.prototype)
    state._type = 'State'

    const vt = data.vt ?? data.tt
    state._init_properties(refs.in_mind, refs.ground_state, refs.base, data.tt, vt, refs.self, refs.about_state, data._id)
    state._load_insert_from_json(data)
    state._load_remove_from_json(data)
    state._link_base()

    return state
  }
}
