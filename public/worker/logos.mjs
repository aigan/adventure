/**
 * Logos - the primordial mind, ground of being
 *
 * Logos is the ONE mind with parent=null. All other minds descend from Logos.
 * It represents the ultimate ground of existence in the mind hierarchy.
 *
 * Logos has a Timeless (timeless state) as its origin_state, which is the
 * only state with ground_state=null.
 */

import { Mind } from './mind.mjs'
import { Timeless } from './timeless.mjs'
import { next_id } from './id_sequence.mjs'
import * as DB from './db.mjs'

/**
 * @typedef {import('./state.mjs').State} State
 */

/**
 * Logos singleton instance
 * @type {Logos|null}
 */
let _logos = null

/**
 * Primordial mind - ground of being
 * Manually initializes without calling Mind constructor to allow parent=null
 */
export class Logos {
  constructor() {
    // Manual initialization of Mind properties (bypass Mind constructor)
    this._id = next_id()
    this._parent = null  // Logos has no parent (root of hierarchy)
    this.label = 'logos'
    this.self = null
    this._child_minds = new Set()
    this._states = new Set()
    this._states_by_ground_state = new Map()
    this.state = null

    // Bootstrap: Create Timeless state using Object.create and _init
    const timeless = Object.create(Timeless.prototype)
    timeless.ground_state = null  // Bootstrap: Logos has no parent
    timeless._init(/** @type {any} */ (this))

    /** @type {State} */
    this.origin_state = /** @type {State} */ (timeless)

    // Register with DB - Logos inherits Mind methods via prototype
    DB.register_mind(/** @type {any} */ (this))
  }

  /**
   * Logos parent is always null (root of hierarchy)
   * @returns {null}
   */
  get parent() {
    return null
  }
}

// Set up Logos prototype to inherit from Mind
Object.setPrototypeOf(Logos.prototype, Mind.prototype)

/**
 * Access Logos singleton - the primordial mind
 * Logos is the ONE mind with parent=null, all other minds descend from Logos
 * @returns {Mind}
 */
export function logos() {
  if (_logos === null) {
    _logos = new Logos()
  }
  // Logos inherits from Mind via runtime prototype manipulation
  return /** @type {Mind} */ (/** @type {any} */ (_logos))
}

/**
 * Access Logos primordial state - ground of all states
 * Logos state is the ONE state with ground_state=null
 * @returns {State}
 */
export function logos_state() {
  // origin_state is always initialized in Logos constructor, never null
  return /** @type {State} */ (logos().origin_state)
}

/**
 * Reset logos singleton (for testing)
 * @internal
 */
export function _reset_logos() {
  _logos = null
}
