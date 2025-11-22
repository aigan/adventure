/**
 * State - immutable snapshot of beliefs at a specific time/tick
 *
 * REFACTORED VERSION - Uses shared initialization pattern
 * See docs/INHERITANCE_PATTERN.md for full pattern documentation
 */

import { assert, log, debug } from './debug.mjs'
import { next_id } from './id_sequence.mjs'
import * as DB from './db.mjs'
import * as Cosmos from './cosmos.mjs'
import { Subject } from './subject.mjs'
import { Belief } from './belief.mjs'
import { Serialize } from './serialize.mjs'
// REMOVED: import { Timeless } from './timeless.mjs'  // ❌ Creates circular dependency
import { Traittype } from './traittype.mjs'

/**
 * @typedef {import('./mind.mjs').Mind} Mind
 */

/**
 * @typedef {object} StateJSON
 * @property {string} _type - "State", "Timeless", or "Convergence"
 * @property {number} _id - State identifier
 * @property {number|null} tt - State transaction time/tick (null for timeless states)
 * @property {number|null} vt - State valid time (null for timeless states)
 * @property {number|null} base - Base state _id (null for root states)
 * @property {number|null} ground_state - Ground state _id (null for Timeless/Logos bootstrap)
 * @property {number|null} self - Subject sid (null if no self identity)
 * @property {number|null} [about_state] - State _id this state is about (meta-level reasoning)
 * @property {number[]} insert - Belief _ids present in this state
 * @property {number[]} remove - Belief _ids removed in this state
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
  // =========================================================================
  // Property Declarations - SINGLE SOURCE OF TRUTH
  // =========================================================================

  /** @type {string} - Type discriminator for polymorphism */
  _type = 'State'

  /** @type {number} */ _id
  /** @type {Mind} */ in_mind
  /** @type {State|null} */ base
  /** @type {State|null} */ ground_state  // Null only for Timeless (Logos bootstrap)
  /** @type {number|null} */ tt
  /** @type {number|null} */ vt
  /** @type {Subject|null} */ self
  /** @type {State|null} */ about_state
  /** @type {Belief[]} */ _insert
  /** @type {Belief[]} */ _remove
  /** @type {boolean} */ locked
  /** @type {State[]} */ _branches
  /** @type {Map<Subject, Belief|null>|null} */ _subject_index
  /** @type {Map<Subject, Map<Traittype, State|null>>} */ _rev_base
  /** @type {Map<Subject, Map<Traittype, Set<Belief>>>} */ _rev_add
  /** @type {Map<Subject, Map<Traittype, Set<Belief>>>} */ _rev_del

  /**
   * Create a new state
   * @param {Mind} mind
   * @param {State|null} ground_state - Ground state (null only for Timeless with Logos)
   * @param {State|null} base
   * @param {object} options - Optional meta-parameters
   * @param {number|null} [options.tt] - Transaction time (explicit for timeless states)
   * @param {number|null} [options.vt] - Valid time (defaults to tt)
   * @param {Subject|null} [options.self] - Self identity (defaults to base.self)
   * @param {State|null} [options.about_state] - State context for belief resolution
   * @param {boolean} [options.derivation] - True if this is a derivation (computed view)
   */
  constructor(mind, ground_state, base = null, options = {}) {
    const { tt: tt_option, vt, self, about_state, derivation } = options

    // Validation
    assert(base === null || base.locked, 'Cannot create state from unlocked base state')

    // Allow null ground_state for Timeless (Logos bootstrap)
    if (ground_state !== null) {
      // Use _type property instead of instanceof (breaks circular dependency!)
      assert(
        ground_state._type === 'State' ||
        ground_state._type === 'Timeless' ||
        ground_state._type === 'Convergence',
        'ground_state must be a State',
        { ground_type: ground_state?._type }
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

    // Derive tt from ground_state.vt
    // Exception: When ground_state is timeless (vt === null), allow explicit tt
    const tt = tt_option ?? ground_state?.vt ?? null

    // If tt was explicitly provided, validate it's only for timeless ground_state
    if (tt_option != null && ground_state !== null) {
      assert(
        ground_state.vt === null,  // ✅ Duck typing instead of instanceof Timeless
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
    this._init_properties(mind, ground_state, base, tt, effective_vt, effective_self, about_state)
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
   */
  _init_properties(in_mind, ground_state, base, tt, vt, self, about_state) {
    // Initialize ALL properties
    this._id = next_id()
    this.in_mind = in_mind
    this.base = base
    this.ground_state = ground_state
    this.tt = tt
    this.vt = vt
    this.self = self
    this.about_state = about_state
    this._insert = []
    this._remove = []
    this.locked = false
    this._branches = []
    this._subject_index = null
    this._rev_base = new Map()
    this._rev_add = new Map()
    this._rev_del = new Map()

    // Register with mind and DB
    this.in_mind.register_state(this)
    DB.register_state(this)
  }

  // ... rest of State methods unchanged ...
  // (All methods from original state.mjs would go here)

  /**
   * Serialize to JSON
   * @returns {StateJSON}
   */
  toJSON() {
    return {
      _type: this._type,  // ✅ Include type discriminator
      _id: this._id,
      tt: this.tt,
      vt: this.vt,
      base: this.base?._id ?? null,
      ground_state: this.ground_state?._id ?? null,
      self: this.self?.sid ?? null,
      about_state: this.about_state?._id ?? null,
      insert: this._insert.map(b => b._id),
      remove: this._remove.map(b => b._id),
      in_mind: this.in_mind._id
    }
  }

  /**
   * Deserialize State from JSON
   * @param {Mind} mind - Mind context for resolution
   * @param {StateJSON} data - JSON data
   * @returns {State}
   */
  static from_json(mind, data) {
    // Dispatch based on _type (polymorphic deserialization)
    if (data._type === 'Convergence') {
      return Cosmos.Convergence.from_json(mind, data)
    }
    if (data._type === 'Timeless') {
      // Will be handled by Timeless.from_json once refactored
      // For now, throw error to catch during migration
      throw new Error('Timeless.from_json not yet implemented - refactor timeless.mjs first')
    }

    // Resolve references
    const resolved_mind = data.in_mind ? DB.get_mind_by_id(data.in_mind) : mind
    if (!resolved_mind) {
      throw new Error(`Cannot resolve in_mind ${data.in_mind} for state ${data._id}`)
    }

    const base = data.base ? DB.get_state_by_id(data.base) : null
    if (data.base && !base) {
      throw new Error(`Cannot resolve base state ${data.base} for state ${data._id}`)
    }

    const ground_state = data.ground_state ? DB.get_state_by_id(data.ground_state) : null
    if (data.ground_state && !ground_state) {
      throw new Error(`Cannot resolve ground_state ${data.ground_state} for state ${data._id}`)
    }

    const self = data.self ? DB.get_or_create_subject(mind.parent, data.self) : null

    const about_state = data.about_state ? DB.get_state_by_id(data.about_state) : null

    // Create instance using Object.create (bypasses constructor)
    const state = Object.create(State.prototype)

    // Use shared initialization
    state._init_properties(resolved_mind, ground_state, base, data.tt, data.vt, self, about_state)

    // Override _id to match deserialized value
    state._id = data._id

    // Restore insert beliefs
    for (const belief_id of data.insert) {
      const belief = DB.get_belief_by_id(belief_id)
      if (!belief) {
        throw new Error(`Cannot resolve insert belief ${belief_id} for state ${data._id}`)
      }
      state._insert.push(belief)
    }

    // Restore remove beliefs
    for (const belief_id of data.remove) {
      const belief = DB.get_belief_by_id(belief_id)
      if (!belief) {
        throw new Error(`Cannot resolve remove belief ${belief_id} for state ${data._id}`)
      }
      state._remove.push(belief)
    }

    return state
  }
}

// NOTE: The rest of State methods would remain unchanged
// This is just showing the refactored constructor, _init_properties, toJSON, and from_json
