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
import { Fuzzy } from './fuzzy.mjs'

/**
 * @typedef {import('./mind.mjs').Mind} Mind
 */

// IMPORT CONSTRAINTS: Cannot import temporal, timeless, convergence, eidos, logos, materia
// (circular dependencies). Use registries instead. See docs/CIRCULAR_DEPENDENCIES.md

/**
 * Find latest locked state in timeline with vt <= query_vt
 * Follows _branches from start state forward until no valid next state exists
 * NOTE: Currently assumes single child per state (linear timeline).
 * When implementing alts, multiple branches should be handled as uncertain
 * alternatives, possibly adding them as alts rather than picking one.
 * @param {State} start - Starting state to search from
 * @param {number} query_vt - Maximum vt to allow
 * @returns {State} The latest locked state with vt <= query_vt
 */
function get_last_locked_edge(start, query_vt) {
  let current = start
  while (current._branches.length > 0) {
    const next = current._branches.find(b => b.vt !== null && b.vt <= query_vt && b.locked)
    if (!next) break
    current = next
  }
  return current
}

/**
 * @typedef {object} StateJSON
 * @property {string} _type - "State", "Temporal", "Timeless", or "Convergence"
 * @property {number} _id - State identifier
 * @property {number|null} tt - State transaction time/tick (null for timeless states like logos)
 * @property {number|null} vt - State valid time (null for timeless states like logos)
 * @property {number} [certainty] - Certainty level 0.0-1.0 for superposition states (defaults to 1.0)
 * @property {number|null} base - Base state _id (null for root states)
 * @property {number|null} ground_state - Ground state _id (null for Timeless/Logos bootstrap)
 * @property {number|null} self - Subject sid (null if no self identity)
 * @property {number|null} [about_state] - Alternative resolution context (Eidos→World lookups)
 * @property {number[]} insert - Belief _ids present in this state (serialized from private _insert)
 * @property {number[]} remove - Belief _ids removed in this state (serialized from private _remove)
 * @property {number} in_mind - Mind _id this state belongs to
 * @property {number|null} [tracks] - Tracked state _id for overlay inheritance
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

  /**
   * Validate that value is a State instance
   * @param {Traittype} traittype
   * @param {*} value
   * @throws {Error} If value is not a State instance
   */
  static validate_value(traittype, value) {
    if (value === null) return

    assert(
      value instanceof State,
      `Expected State instance for trait '${traittype.label}', got ${value?.constructor?.name || typeof value}`,
      {traittype, value, value_type: value?.constructor?.name || typeof value}
    )
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
  /** @type {number} */ _certainty = 1.0  // 0.0 to 1.0, for superposition states
  /** @type {number|undefined} */ _cached_path_certainty = undefined  // Cached path certainty for locked states
  /** @type {State[]} */ _branches = []
  /** @type {Map<Subject, Belief|null>|null} */ _subject_index = null
  /** @type {Map<Subject, Map<Traittype, State|null>>} */ _rev_base = new Map()
  /** @type {Map<Subject, Map<Traittype, Set<Belief>>>} */ _rev_add = new Map()
  /** @type {Map<Subject, Map<Traittype, Set<Belief>>>} */ _rev_del = new Map()
  /** @type {State|null} */ tracks = null  // Tracked state for overlay inheritance

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
   * @param {number} [options.certainty] - Certainty level 0.0-1.0 for superposition states (defaults to 1.0)
   * @param {State|null} [options.tracks] - Tracked state for overlay inheritance (requires base: null)
   */
  constructor(mind, ground_state, base=null, {tt: tt_option, vt, self, about_state, derivation, certainty, tracks} = {}) {
    // Prevent direct instantiation - State is abstract
    // Only allow construction through subclasses (Temporal, Timeless, Convergence)
    if (new.target === State) {
      throw new Error(
        'Cannot instantiate State directly - use Temporal for temporal states, ' +
        'Timeless for timeless states, or Convergence for compositions'
      )
    }

    assert(
      base === null || base.locked,
      'Cannot create state from unlocked base state',
      {
        base_id: base?._id,
        base_locked: base?.locked,
        base_mind: base?.in_mind?.label ?? null,
        base_tt: base?.tt,
        base_vt: base?.vt,
        ground_state_id: ground_state?._id,
        ground_state_mind: ground_state?.in_mind?.label ?? null,
        ground_state_vt: ground_state?.vt
      }
    )

    // Tracks validation moved below after effective_vt is calculated

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

    // Validate tracks constraints
    if (tracks) {
      // Tracked state must be locked
      assert(
        tracks.locked,
        'Cannot track unlocked state',
        { tracks_id: tracks._id, tracks_locked: tracks.locked }
      )

      // Can't track future state (tracks.vt must be <= this.vt)
      // Skip check if either vt is null (timeless states)
      if (tracks.vt !== null && effective_vt !== null) {
        assert(
          tracks.vt <= effective_vt,
          'Cannot track future state',
          { tracks_vt: tracks.vt, this_vt: effective_vt }
        )
      }

      // Base cannot be in tracked timeline (check chain intersection)
      if (base) {
        /** @type {Set<State>} */
        const tracks_chain = new Set()
        for (let s = /** @type {State|null} */ (tracks); s; s = s.base) {
          tracks_chain.add(s)
        }
        for (let s = /** @type {State|null} */ (base); s; s = s.base) {
          assert(
            !tracks_chain.has(s),
            'base cannot be in tracked timeline',
            { base_id: base._id, tracks_id: tracks._id, conflict_state_id: s._id }
          )
        }
      }
    }

    // Use shared initialization
    this._init_properties(mind, ground_state, base, tt, effective_vt, effective_self, about_state ?? null, null, certainty ?? 1.0, tracks ?? null)
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
   * @param {number} [certainty] - Certainty level 0.0-1.0 (defaults to 1.0)
   * @param {State|null} [tracks] - Tracked state for overlay inheritance
   */
  _init_properties(in_mind, ground_state, base, tt, vt, self, about_state, id = null, certainty = 1.0, tracks = null) {
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
    this._certainty = certainty
    this.tracks = tracks
    this._insert = []
    this._remove = []

    // FIXME: generalize to all tracked states
    // Track Convergence ancestor for timeline resolution
    // When branching from a Convergence, queries need to check if it was resolved
    /** @type {State|null} */
    // @ts-ignore - is_union exists on Convergence, _convergence_ancestor on States branched from Convergence
    this._convergence_ancestor = base?.is_union ? base : (base?._convergence_ancestor ?? null)

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
   * @param {State} [query_state] - Original query state (for Convergence resolution checks)
   * @returns {State[]} Array of next states to check (single element or empty)
   */
  rev_base(subject, traittype, query_state = undefined) {
    const next = this._rev_base.get(subject)?.get(traittype) ?? this.base
    return next ? [next] : []
  }

  /**
   * Lock this state and cascade to contained beliefs
   * @returns {State} this state (for chaining)
   */
  lock() {
    this.locked = true

    for (const belief of this._insert) {
      belief.lock(this)
    }

    // Cascade lock to nested mind states (direct lookup via child_minds)
    // O(1) lookup per child mind using _states_by_ground_state index
    for (const child_mind of this.in_mind._child_minds) {
      const child_states = child_mind.get_states_by_ground_state(this) // @heavy - lock cascade
      for (const child_state of child_states) {
        if (!child_state.locked) {
          child_state.lock()
        }
      }
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
   * @param {object} [opts] - Additional options
   * @param {number} [opts.certainty] - Certainty level 0.0-1.0 for superposition states
   * @param {State} [opts.tracks] - Tracked state for overlay inheritance
   * @returns {State} New unlocked state
   */
  branch(ground_state, vt, opts = {}) {
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

    // Pass certainty: explicit override or inherit from base
    if (opts.certainty !== undefined) {
      options.certainty = opts.certainty
    } else if (this._certainty !== 1.0) {
      // Inherit non-default certainty from base state
      options.certainty = this._certainty
    }

    // Handle tracks: explicit override or auto-update from base
    if (opts.tracks !== undefined) {
      options.tracks = opts.tracks
    } else if (this.tracks) {
      // Auto-update tracks to latest locked state in tracked timeline with vt <= new vt
      const new_vt = vt ?? ground_state.vt
      if (new_vt !== null) {
        options.tracks = get_last_locked_edge(this.tracks, new_vt)
      } else {
        // Timeless case - keep same tracks
        options.tracks = this.tracks
      }
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
      // @heavy - iterates all traits (own + inherited) for each belief
      for (const [traittype, value] of belief.get_traits()) {
        if (traittype.is_subject_reference) {
          for (const subject of belief.extract_subjects(value)) {
            this.rev_add(subject, traittype, belief)
          }
        }
      }

      // Index resolution beliefs for O(1) lookup in get_resolution()
      if (belief.resolution !== null) {
        belief.subject.register_resolution(belief)
      }
    }
    this._insert.push(...beliefs)

    // Notify listeners of state mutation (for inspect UI updates)
    if (typeof self !== 'undefined' && self.dispatchEvent) {
      self.dispatchEvent(new CustomEvent('state_mutated', { detail: { state_id: this._id } }))
    }
  }

  /**
   * Add beliefs to this state's remove list, if not already in the list
   * @param {...Belief} beliefs - Beliefs to remove
   */
  remove_beliefs(...beliefs) {
    assert(!this.locked, 'Cannot modify locked state', {state_id: this._id, mind: this.in_mind.label})

    // Clean up reverse index for removed beliefs
    // @heavy - iterates all traits (own + inherited) for each belief
    for (const belief of beliefs) {
      assert(belief instanceof Belief, 'fail', belief)
      if (this._remove.indexOf(belief) >= 0) continue;

      for (const [traittype, value] of belief.get_traits()) { // @heavy
        if (traittype.is_subject_reference) {
          for (const subject of belief.extract_subjects(value)) {
            this.rev_del(subject, traittype, belief)
          }
        }
      }

      this._remove.push(belief)
    }

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
      /** @type {Belief[]} */
      const belief_bases = []
      for (const b of belief._bases) {
        if (b instanceof Belief) belief_bases.push(b)
      }
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

  /**
   * @heavy O(beliefs in state + base chain + tracks chain) - iterates all beliefs
   * Includes tracks overlay: local beliefs win by subject, unhandled subjects fall through to tracks
   * @param {Set<State>} [seen] - Cycle detection for tracks (internal use)
   * @returns {Generator<Belief, void, undefined>}
   */
  *get_beliefs(seen = new Set()) {
    // Cycle detection for tracks
    if (seen.has(this)) {
      return  // Already visited, prevent infinite loop
    }
    seen.add(this)

    const removed_ids = new Set()       // For versioning (by _id)
    const handled_subjects = new Set()  // For tracks overlay (by subject) - NOT for local chain

    /** @type {State|null} */ let s
    for (s = this; s; s = s.base) {
      // Process _remove BEFORE _insert to handle same-state updates correctly
      // (e.g., when a belief is both inserted and then removed/replaced in same state)
      for (const belief of s._remove) {
        removed_ids.add(belief._id)
      }
      for (const belief of s._insert) {
        if (removed_ids.has(belief._id)) continue
        // Track subject for tracks overlay (but yield all local beliefs)
        handled_subjects.add(belief.subject)
        yield belief
      }

      // Mark removed subjects as handled for tracks
      for (const belief of s._remove) {
        handled_subjects.add(belief.subject)
      }

      // Handle Convergence in base chain: merge component_states
      // Check resolution first - if resolved, only use the resolved branch
      // @ts-ignore - is_union exists on Convergence
      if (s.is_union) {
        // Check if this Convergence was resolved from the perspective of `this`
        // @ts-ignore - get_resolution exists on Convergence
        const resolved_branch = s.get_resolution(this)
        if (resolved_branch) {
          // Resolved: only yield beliefs from the resolved branch
          // @heavy - iterating resolved branch beliefs
          for (const belief of resolved_branch.get_beliefs(seen)) {
            if (removed_ids.has(belief._id)) continue
            handled_subjects.add(belief.subject)
            yield belief
          }
        } else {
          // Unresolved: merge from all components (first-wins by subject)
          // @ts-ignore - component_states exists on Convergence
          for (const component of s.component_states) {
            // @heavy - convergence merges beliefs from multiple component states
            for (const belief of component.get_beliefs(seen)) {
              if (removed_ids.has(belief._id)) continue
              handled_subjects.add(belief.subject)
              yield belief
            }
          }
        }
        break  // Convergence has no base (base is null)
      }
    }

    // Get beliefs from tracked state
    // tracks points directly to the correct State
    // Chaining happens automatically via recursive get_beliefs() calls
    // Only filter by subject here - tracks beliefs are shadowed by local beliefs
    if (this.tracks) {
      // @heavy - iterating tracked state beliefs
      for (const belief of this.tracks.get_beliefs(seen)) {
        if (!handled_subjects.has(belief.subject)) {
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
    // FIXME: Generalize to all tracked states
    // Timeline resolution: If descended from Convergence with resolution,
    // we need to find beliefs in the resolved branch. But we also need to
    // check our own _insert and base chain for beliefs created AFTER the Convergence.
    if (this._convergence_ancestor) {
      // Walk our own state chain (from this to convergence) looking for the belief
      // This finds beliefs created after the Convergence in descendant states
      let s = /** @type {State|null} */ (this)
      while (s && s !== this._convergence_ancestor) {
        for (const b of s._insert) {
          if (b.subject === subject) return b
        }
        for (const b of s._remove) {
          if (b.subject === subject) return null  // Removed
        }
        s = s.base ?? null
      }

      // Not found in post-Convergence states - check if resolved
      // @ts-ignore - get_resolution exists on Convergence
      const resolved_branch = this._convergence_ancestor.get_resolution(this)
      if (resolved_branch) {
        return resolved_branch.get_belief_by_subject(subject)
      }
      // Unresolved: fall through to normal lookup (first-wins from Convergence)
    }

    if (this.locked && this._subject_index?.has(subject)) {
      // TypeScript: .has() check guarantees .get() returns Belief|null, not undefined
      return /** @type {Belief|null} */ (this._subject_index.get(subject))
    }

    // If unlocked, don't cache - just search with early termination
    if (!this.locked) {
      // @heavy - searching for subject (no cache on unlocked state)
      for (const belief of this.get_beliefs()) {
        if (belief.subject === subject) return belief
      }
      return null
    }

    // Locked state - build full index on first miss (O(n) once, then O(1))
    // Note: Progressive indexing with early termination was O(unique_subjects × n)
    if (!this._subject_index) {
      this._subject_index = new Map()
      // @heavy - building subject index (once per locked state)
      // Keep first belief per subject (most recent state wins)
      // @heavy - iteration over get_beliefs()
      for (const belief of this.get_beliefs()) {
        if (!this._subject_index.has(belief.subject)) {
          this._subject_index.set(belief.subject, belief)
        }
      }
    }

    return this._subject_index.get(subject) ?? null
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
   * Resolve which branch(es) to use from a set of belief branches.
   *
   * Used during trait resolution when walking bases and encountering
   * a belief with non-empty promotions Set.
   *
   * @param {Set<Belief>} promotions - Promoted belief versions
   * @param {object} context - Query context (for future extensions)
   * @returns {Belief[]} Array of beliefs (empty, single, or superposition)
   */
  pick_promotion(promotions, context = {}) {
    const valid = [...promotions].filter(b =>
      b.origin_state?.tt != null && this.tt != null && b.origin_state.tt <= this.tt
    )
    if (valid.length === 0) return []
    if (valid.length === 1) return valid  // single → always temporal
    if (valid.some(b => b.certainty !== null)) return valid  // multiple with certainty → probability
    // Multiple temporal: pick most recent
    valid.sort((a, b) => (b.origin_state?.tt ?? 0) - (a.origin_state?.tt ?? 0))
    return [valid[0]]
  }

  /**
   * Get the core state for a nested mind hosted by an entity
   *
   * The core state is the mind's primary operational state: synchronized with
   * this ground state (tt = this.vt), used as the starting point for belief
   * allocation and tree walks.
   * @param {Subject} host - Subject with mind trait (e.g., player, NPC)
   * @returns {State | null} The core mind state, or null if not found in this world branch
   * @throws {Error} If host has no mind, or if multiple states found
   */
  get_core_state_by_host(host) {
    const mind_traittype = Traittype.get_by_label('mind')
    assert(mind_traittype, "Traittype 'mind' not found in registry")
    const host_belief = host.get_belief_by_state(this)
    const host_mind = host_belief.get_trait(this, mind_traittype)
    // Assert mind trait is certain (not null and not Fuzzy)
    assert(host_mind && !(host_mind instanceof Fuzzy),
      `Entity ${host.sid} has no certain mind trait`,
      {host_sid: host.sid, host_label: host.get_label()})

    // Find the core state: latest state where tt <= this.vt
    // Walk up ground_state chain to find states from this world lineage
    let ground = /** @type {State|null} */ (this)
    while (ground) {
      const candidates = [...host_mind.states_at_tt(ground, this.vt)]

      if (candidates.length > 0) {
        // Should be exactly one core state (no superposition)
        const core_tt = candidates[0]?.tt
        assert(candidates.length === 1,
          `Expected single core state at tt=${core_tt}, found ${candidates.length} (superposition)`,
          {
            host_sid: host.sid,
            host_label: host.get_label(),
            mind_label: host_mind.label,
            tt: core_tt,
            vt: this.vt,
            candidates: candidates.map(s => ({id: s._id, tt: s.tt, ground: s.ground_state?._id}))
          })

        return candidates[0]
      }

      ground = ground.base
    }

    // No state found in this world branch - return null to signal need to create one
    return null
  }

  /**
   * Get an active (unlocked) state for a host entity
   * Like get_core_state_by_host(), but ensures the returned state is unlocked.
   * If the core state is locked, branches it forward to create a new unlocked state.
   * @param {Subject} host - Subject with mind trait (e.g., player, NPC)
   * @returns {State} An unlocked state in the host's mind
   */
  get_active_state_by_host(host) {
    // Active states (unlocked) can only be retrieved from unlocked ground states
    assert(!this.locked,
      'Cannot get active state from locked ground state - branch the world state first',
      {
        ground_state_id: this._id,
        ground_state_vt: this.vt,
        ground_state_locked: this.locked,
        host_label: host.get_label()
      })

    const core_state = this.get_core_state_by_host(host)

    // If no core state found (different world branch), create one
    if (!core_state) {
      const host_belief = host.get_belief_by_state(this)
      const mind_traittype = Traittype.get_by_label('mind')
      assert(mind_traittype, "Traittype 'mind' not found in registry")
      const host_mind = host_belief.get_trait(this, mind_traittype)
      // Assert mind trait is certain
      assert(host_mind && !(host_mind instanceof Fuzzy),
        `Entity ${host.sid} has no certain mind trait`,
        {host_sid: host.sid})
      return host_mind.get_or_create_open_state_for_ground(this, host_belief)
    }

    if (core_state.locked) {
      // Branch forward to create unlocked state
      return core_state.branch(this, this.vt)
    }

    return core_state
  }

  /**
   * Get beliefs in this state with a specific archetype
   *
   * @heavy O(n) scan across all beliefs in state chain.
   * This traverses "all of time and space" for this mind.
   * See STYLE.md "Iteration vs Indexing" for when to index vs scan.
   *
   * @param {Archetype} archetype - Archetype to match
   * @returns {Generator<Belief>} Generator of beliefs with this archetype (allows early exit)
   */
  *get_beliefs_by_archetype(archetype) {
    // @heavy - scanning all beliefs filtering by archetype
    for (const belief of this.get_beliefs()) {
      for (const a of belief.get_archetypes()) {
        if (a === archetype) {
          yield belief
          break  // Found match, stop checking other archetypes for this belief
        }
      }
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
   * Certainty level for superposition states (0.0 to 1.0)
   * @returns {number}
   */
  get certainty() {
    return this._certainty
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
    // Only enforce locked requirement during save_mind() serialization
    // (allows toJSON() for testing/inspection on unlocked states)
    if (Serialize.active) {
      assert(this.locked, 'Cannot serialize unlocked state', {
        state_id: this._id,
        mind: this.in_mind?.label
      })

      // Register in_mind as dependency
      if (this.in_mind) {
        Serialize.add_dependency(this.in_mind)
      }
    }

    return {
      _type: this._type,  // Use instance _type property for polymorphism
      _id: this._id,
      tt: this.tt,
      vt: this.vt,
      certainty: this._certainty,
      base: this.base?._id ?? null,
      ground_state: this.ground_state?._id ?? null,
      self: this.self?.toJSON() ?? null,
      about_state: this.about_state?._id ?? null,
      tracks: this.tracks?._id ?? null,
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
   * @returns {{in_mind: Mind, base: State|null, ground_state: State|null, self: Subject|null, about_state: State|null, tracks: State|null}}
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

    // Load tracks
    let tracks = null
    if (data.tracks != null) {
      tracks = DB.get_state_by_id(data.tracks)
      if (!tracks) throw new Error(`Cannot load tracks ${data.tracks} for state ${data._id}`)
    }

    return { in_mind, base, ground_state, self, about_state, tracks }
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
    state._init_properties(refs.in_mind, refs.ground_state, refs.base, data.tt, vt, refs.self, refs.about_state, data._id, data.certainty, refs.tracks)
    state._load_insert_from_json(data)
    state._load_remove_from_json(data)
    state._link_base()

    return state
  }
}
