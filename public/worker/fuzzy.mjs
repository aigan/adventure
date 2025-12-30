/**
 * Fuzzy - Represents uncertain trait values
 *
 * Enables the system's core philosophy: "everything is fuzzy until observed."
 * Uncertainty is the norm, concrete values emerge from constraints and observation.
 *
 * Value space for get_trait() returns:
 * - value: Concrete (string, number, Subject, etc.)
 * - null: Explicitly no value (blocks inheritance)
 * - unknown(): Unknown - not set in chain OR exists but undetermined
 * - new Fuzzy({...}): Multiple possibilities with certainties
 *
 * Note: undefined is NOT a valid return value - it indicates a bug.
 */

/** @typedef {import('./state.mjs').State} State */
/** @typedef {import('./traittype.mjs').Traittype} Traittype */

/** @type {Fuzzy|null} */
let _unknown = null

export class Fuzzy {
  /** @type {ReadonlyArray<{value: any, certainty: number}>} */
  alternatives

  /**
   * @param {{alternatives?: Array<{value: any, certainty: number}>}} options
   */
  constructor({ alternatives = [] } = {}) {
    this.alternatives = Object.freeze([...alternatives])
    Object.freeze(this)
  }

  /**
   * Check if this is the unknown singleton (no alternatives)
   * @returns {boolean}
   */
  get is_unknown() {
    return this.alternatives.length === 0
  }

  /**
   * Serialize to JSON
   * @returns {{_type: 'Fuzzy', alternatives: ReadonlyArray<{value: any, certainty: number}>}}
   */
  toJSON() {
    return { _type: 'Fuzzy', alternatives: this.alternatives }
  }

  /**
   * Convert to inspection view
   * @param {State} state
   * @returns {Object}
   */
  to_inspect_view(state) {
    if (this.is_unknown) return { _type: 'Fuzzy', unknown: true }
    return {
      _type: 'Fuzzy',
      alternatives: this.alternatives.map(a => ({
        value: a.value?.to_inspect_view?.(state) ?? a.value,
        certainty: a.certainty
      }))
    }
  }

  /**
   * System designation - compact debug string
   * @returns {string}
   */
  sysdesig() {
    if (this.is_unknown) return 'unknown()'
    return `Fuzzy[${this.alternatives.length}]`
  }

  /**
   * Check if value is certain (not fuzzy)
   * Used by Traittype delegation pattern
   * @param {Traittype} _traittype
   * @param {*} value
   * @returns {boolean}
   */
  static is_certain(_traittype, value) {
    return !(value instanceof Fuzzy)
  }
}

/**
 * Access the Unknown singleton - represents undetermined value
 * Follows the same pattern as logos() and logos_state()
 * @returns {Fuzzy}
 */
export function unknown() {
  if (_unknown === null) {
    _unknown = new Fuzzy({ alternatives: [] })
  }
  return _unknown
}

/**
 * Reset unknown singleton (for testing)
 * @internal
 */
export function _reset_unknown() {
  _unknown = null
}
