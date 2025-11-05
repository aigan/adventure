/**
 * Eidos - the realm of forms, where prototypes dwell
 *
 * Eidos is a child of Logos that holds all universal archetypes and shared beliefs.
 * It represents the realm of eternal forms - templates and prototypes that exist
 * outside of individual minds and time.
 *
 * Eidos has a Pleroma (timeless state) as its origin_state, allowing it to hold
 * shared beliefs that exist beyond temporal constraints.
 *
 * Key responsibilities:
 * - Hold shared belief prototypes (cultural knowledge, universal templates)
 * - Provide methods for creating and accessing shared beliefs
 * - Enable prototype inheritance for beliefs across all minds
 */

import { Mind } from './mind.mjs'
import { Pleroma } from './pleroma.mjs'
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
    // Pleroma extends State via runtime prototype manipulation
    /** @type {State} */
    this.origin_state = /** @type {State} */ (new Pleroma(this))
  }

  /**
   * Create additional timeless states for shared belief prototypes
   * Eidos can have multiple Pleroma instances for organizing shared knowledge
   * @returns {Pleroma}
   */
  create_timeless_state() {
    return new Pleroma(this)
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
