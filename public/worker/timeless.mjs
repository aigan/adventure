/**
 * Timeless - timeless state without ground_state restrictions
 *
 * Special State subclass that allows null values for ground_state, tt, and vt.
 * Used for primordial states (Logos, Eidos) and timeless constructs that exist
 * outside normal temporal flow.
 *
 * Unlike regular State, Timeless:
 * - Has ground_state=null (no external reference)
 * - Has tt=null and vt=null (timeless)
 * - Bypasses State constructor validation
 *
 * Usage:
 *   const timeless = new Timeless(mind)
 */

import { next_id } from './id_sequence.mjs'
import * as DB from './db.mjs'

// Note: Cannot import State here due to circular dependency
// State imports Timeless for instanceof checks
// Instead, we set up prototype chain after State is loaded via _setup_timeless_inheritance

/**
 * @typedef {import('./mind.mjs').Mind} Mind
 */

/**
 * Timeless state - exists outside normal temporal flow
 * Prototype will be set to extend State after module initialization
 */
export class Timeless {
  /**
   * @param {Mind} mind - Mind this timeless state belongs to
   */
  constructor(mind) {
    this.ground_state = mind.parent.origin_state  // Ground state is parent mind's origin_state
    this._init(mind)
  }

  /**
   * Initialize Timeless state (used by constructor and Logos bootstrap)
   * NOTE: ground_state must be set before calling this
   * @param {Mind} mind - Mind this timeless state belongs to
   */
  _init(mind) {
    // Initialize all State properties without calling State constructor
    this._id = next_id()
    this.in_mind = mind
    /** @type {number|null} */
    this.tt = null            // Timeless - no transaction time
    /** @type {number|null} */
    this.vt = null            // Timeless - no valid time
    /** @type {import('./state.mjs').State|null} */
    this.base = null
    /** @type {import('./subject.mjs').Subject|null} */
    this.self = null
    /** @type {number[]} */
    this.insert = []
    /** @type {number[]} */
    this.remove = []
    this.locked = false
    /** @type {import('./state.mjs').State[]} */
    this._branches = []
    /** @type {Map<number, import('./belief.mjs').Belief>|null} */
    this._subject_index = null

    // Register with mind and global DB
    // Timeless extends State via runtime prototype manipulation (_setup_timeless_inheritance)
    this.in_mind.register_state(/** @type {any} */ (this))
    DB.register_state(/** @type {any} */ (this))
  }
}

/**
 * Set up Timeless to extend State
 * Called by State module after it's loaded to avoid circular dependency
 * @param {any} StateClass - State class constructor
 */
export function _setup_timeless_inheritance(StateClass) {
  Object.setPrototypeOf(Timeless.prototype, StateClass.prototype)
}
