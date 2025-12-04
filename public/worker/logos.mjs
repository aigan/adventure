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
import * as DB from './db.mjs'
import { Belief } from './belief.mjs'
import { State } from './state.mjs'

/**
 * @typedef {import('./mind.mjs').MindJSON} MindJSON
 */

/**
 * Logos singleton instance
 * @type {Logos|null}
 */
let _logos = null

/**
 * Primordial mind - ground of being
 */
export class Logos extends Mind {
  /**
   * Override type discriminator
   * @type {string}
   */
  _type = 'Logos'

  /** @type {State} */
  origin_state

  constructor() {
    // Call Mind constructor with null parent (allowed in refactored Mind)
    super(null, 'logos', null)

    // Bootstrap: Create Timeless origin state
    // Timeless constructor will handle ground_state resolution:
    //   this.parent is null, so ground_state will be null
    this.origin_state = new Timeless(this)
  }

  /**
   * Logos parent is always null (root of hierarchy)
   * @returns {null}
   */
  get parent() {
    return null
  }

  /**
   * Deserialize Logos from JSON
   * @param {MindJSON} data - JSON data with _type: 'Logos'
   * @returns {Logos}
   */
  static from_json(data) {
    // Logos is a singleton, but we need to reconstruct it during deserialization
    // Create instance using Object.create (bypasses constructor)
    const logos_instance = Object.create(Logos.prototype)

    // Set _type (class field initializers don't run with Object.create)
    logos_instance._type = 'Logos'

    // Use inherited _init_properties from Mind with deserialized ID
    logos_instance._init_properties(null, 'logos', null, data._id)

    // Restore beliefs
    for (const belief_data of data.belief) {
      Belief.from_json(logos_instance, belief_data)
    }

    // Restore states (including origin_state)
    for (const state_data of data.state) {
      const state = State.from_json(logos_instance, state_data)

      // Identify origin_state (the Timeless state)
      if (state._type === 'Timeless' && state.ground_state === null) {
        logos_instance.origin_state = state
      }
    }

    // Restore nested minds (child minds of Logos, like Eidos)
    if (data.nested_minds) {
      for (const nested_mind_data of data.nested_minds) {
        Mind.from_json(nested_mind_data, logos_instance)
      }
    }

    // Finalize belief traits
    for (const belief of DB.get_beliefs_by_mind(logos_instance)) {
      // @ts-expect-error - _deserialized_traits is set dynamically during from_json()
      if (belief._deserialized_traits) {
        belief._finalize_traits_from_json()
      }
    }

    return logos_instance
  }
}

/**
 * Access Logos singleton - the primordial mind
 * Logos is the ONE mind with parent=null, all other minds descend from Logos
 * @returns {Mind}
 */
export function logos() {
  if (_logos === null) {
    _logos = new Logos()
  }
  return _logos
}

/**
 * Access Logos primordial state - ground of all states
 * Logos state is the ONE state with ground_state=null
 * @returns {State}
 */
export function logos_state() {
  // origin_state is always initialized in Logos constructor
  return /** @type {State} */ (logos().origin_state)
}

/**
 * Reset logos singleton (for testing)
 * @internal
 */
export function _reset_logos() {
  _logos = null
}

// Register singleton function for access without importing
Mind.register_function('logos', logos)
