/**
 * Mind - container for beliefs representing an entity's knowledge/perspective
 *
 * REFACTORED VERSION - Uses shared initialization pattern
 * See docs/INHERITANCE_PATTERN.md for full pattern documentation
 */

import { assert, log, debug, sysdesig } from './debug.mjs'
import { next_id } from './id_sequence.mjs'
import * as DB from './db.mjs'
import { State } from './state.mjs'
import * as Cosmos from './cosmos.mjs'
import { Belief } from './belief.mjs'
import { Traittype } from './traittype.mjs'
import { Timeless } from './timeless.mjs'

/**
 * @typedef {import('./belief.mjs').BeliefJSON} BeliefJSON
 * @typedef {import('./state.mjs').StateJSON} StateJSON
 * @typedef {import('./subject.mjs').Subject} Subject
 * @typedef {import('./archetype.mjs').Archetype} Archetype
 * @typedef {import('./convergence.mjs').Convergence} Convergence
 */

/**
 * @typedef {object} MindJSON
 * @property {string} _type - "Mind", "Logos", or "Eidos"
 * @property {number} _id - Mind identifier
 * @property {string|null} label - Optional label for lookup
 * @property {BeliefJSON[]} belief - All beliefs in this mind
 * @property {StateJSON[]} state - All states in this mind
 * @property {MindJSON[]} [nested_minds] - Nested minds discovered during serialization
 */

/**
 * @typedef {object} MindReference
 * @property {string} _type - Always "Mind"
 * @property {number} _id - Mind identifier
 * @property {string|null} label - Mind label
 */

/**
 * Container for beliefs with state tracking
 */
export class Mind {
  // =========================================================================
  // Property Declarations - SINGLE SOURCE OF TRUTH
  // =========================================================================

  /** @type {string} - Type discriminator for polymorphism */
  _type = 'Mind'

  /** @type {number} */ _id
  /** @type {Mind|null} */ _parent  // Null only for Logos
  /** @type {string|null} */ label
  /** @type {Belief|null} */ self
  /** @type {Set<Mind>} */ _child_minds
  /** @type {Set<State>} */ _states
  /** @type {Map<State, Set<State>>} */ _states_by_ground_state
  /** @type {State|null} */ state

  /**
   * Create a new mind
   * @param {Mind|null} parent_mind - Parent mind (null only for Logos)
   * @param {string|null} label - Mind identifier
   * @param {Belief|null} self - What this mind considers "self"
   */
  constructor(parent_mind, label = null, self = null) {
    // Allow null parent for Logos (primordial mind)
    if (parent_mind !== null) {
      // Use _type property instead of instanceof
      assert(
        parent_mind._type === 'Mind' ||
        parent_mind._type === 'Logos' ||
        parent_mind._type === 'Eidos' ||
        parent_mind._type === 'Materia',
        'parent_mind must be a Mind',
        { label, parent_type: parent_mind?._type }
      )
    }

    // Use shared initialization
    this._init_properties(parent_mind, label, self)
  }

  /**
   * Shared initialization - SINGLE SOURCE OF TRUTH for property assignment
   * Used by both constructor and from_json
   * @protected
   * @param {Mind|null} parent_mind
   * @param {string|null} label
   * @param {Belief|null} self
   */
  _init_properties(parent_mind, label, self) {
    // Initialize ALL properties
    this._id = next_id()
    this._parent = parent_mind
    this.label = label
    this.self = self
    this._child_minds = new Set()
    this._states = new Set()
    this._states_by_ground_state = new Map()
    this.state = null

    // Register with parent (skip for Logos)
    if (parent_mind !== null) {
      parent_mind._child_minds.add(this)
    }

    // Register with DB
    DB.register_mind(this)
  }

  /**
   * Get parent mind
   * @returns {Mind|null}
   */
  get parent() {
    return this._parent
  }

  // ... rest of Mind methods unchanged ...

  /**
   * Serialize to JSON
   * @returns {MindJSON}
   */
  toJSON() {
    return {
      _type: this._type,  // ✅ Include type discriminator
      _id: this._id,
      label: this.label,
      belief: Array.from(this._get_all_beliefs()).map(b => b.toJSON()),
      state: Array.from(this._states).map(s => s.toJSON())
    }
  }

  /**
   * Deserialize Mind from JSON
   * @param {MindJSON} data - JSON data
   * @param {Mind} parent_mind - Parent mind
   * @returns {Mind}
   */
  static from_json(data, parent_mind) {
    // Dispatch based on _type (polymorphic deserialization)
    if (data._type === 'Logos') {
      // Will be handled by Logos.from_json once refactored
      throw new Error('Logos.from_json not yet implemented - refactor logos.mjs first')
    }
    if (data._type === 'Eidos') {
      // Eidos already uses clean inheritance, should work as-is
      return Cosmos.Eidos.from_json(data, parent_mind)
    }

    // Create instance using Object.create (bypasses constructor)
    const mind = Object.create(Mind.prototype)

    // Use shared initialization
    mind._init_properties(parent_mind, data.label, null)

    // Override _id to match deserialized value
    mind._id = data._id

    // Restore beliefs
    for (const belief_data of data.belief) {
      Belief.from_json(mind, belief_data)
    }

    // Restore states
    for (const state_data of data.state) {
      const state = State.from_json(mind, state_data)
      // State is already registered via _init_properties
    }

    // Restore nested minds
    if (data.nested_minds) {
      for (const nested_mind_data of data.nested_minds) {
        Mind.from_json(nested_mind_data, mind)
      }
    }

    // Finalize belief traits after all minds/states/beliefs are loaded
    for (const belief of mind._get_all_beliefs()) {
      if (belief._deserialized_traits) {
        belief._finalize_traits_from_json()
      }
    }

    return mind
  }
}
