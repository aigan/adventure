/**
 * Eidos - the realm of forms, where prototypes dwell
 *
 * Eidos is a child of Logos that holds all universal archetypes and shared beliefs.
 * It represents the realm of eternal forms - templates and prototypes that exist
 * outside of individual minds and time.
 *
 * Eidos has a Timeless (timeless state) as its origin_state, allowing it to hold
 * shared beliefs that exist beyond temporal constraints.
 *
 * Key responsibilities:
 * - Hold shared belief prototypes (cultural knowledge, universal templates)
 * - Provide methods for creating and accessing shared beliefs
 * - Enable prototype inheritance for beliefs across all minds
 */

import { Mind } from './mind.mjs'
import { Timeless } from './timeless.mjs'
import { logos } from './logos.mjs'

/**
 * @typedef {import('./state.mjs').State} State
 */

/**
 * Eidos singleton instance
 * @type {Eidos|null}
 */
let _eidos = null

/**
 * Realm of forms - holds universal prototypes
 * @augments Mind
 */
export class Eidos extends Mind {
  constructor() {
    // Eidos is a child of Logos
    super(logos(), 'Eidos', null)

    // Create timeless origin state for holding shared beliefs
    // Timeless extends State via runtime prototype manipulation
    /** @type {State} */
    this.origin_state = /** @type {State} */ (/** @type {unknown} */ (new Timeless(this)))
  }

  /**
   * Create additional timeless states for shared belief prototypes
   * Eidos can have multiple Timeless instances for organizing shared knowledge
   * @returns {Timeless}
   */
  create_timeless_state() {
    return new Timeless(this)
  }

  /**
   * Create a timed state in Eidos
   * Convenience method that automatically uses logos().origin_state as ground_state
   * @param {number} tt - Transaction time for the new state
   * @returns {State}
   */
  create_timed_state(tt) {
    const logos_state = logos().origin_state
    if (!logos_state) {
      throw new Error('Logos origin_state is not initialized')
    }
    return this.create_state(logos_state, { tt, vt: tt })
  }
}

/**
 * Access Eidos singleton - the realm of forms
 * Eidos is a child of Logos that holds all universal archetypes and prototypes
 * @returns {Mind}
 */
export function eidos() {
  if (_eidos === null) {
    _eidos = new Eidos()
  }
  return _eidos
}

/**
 * Reset eidos singleton (for testing)
 * @internal
 */
export function _reset_eidos() {
  _eidos = null
}
