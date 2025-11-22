/**
 * Temporal - State subclass for time-aware states
 *
 * Represents states that exist within time (world states, NPC states, player states).
 * All temporal states have temporal grounding via ground_state.
 *
 * State hierarchy:
 * - State (abstract base)
 *   - Temporal (normal temporal states)
 *   - Timeless (timeless states for Logos/Eidos)
 *   - Convergence (composition of multiple states)
 *
 * See docs/SPECIFICATION.md for state architecture
 */

import { assert } from './debug.mjs'
import { State } from './state.mjs'
import * as DB from './db.mjs'
import { Subject } from './subject.mjs'

/**
 * @typedef {import('./mind.mjs').Mind} Mind
 * @typedef {import('./state.mjs').StateJSON} StateJSON
 */

/**
 * Time-aware state for entities existing within temporal flow
 *
 * Type narrowing from base State:
 * @property {State} ground_state - Always present for Temporal
 * @property {number} tt - Always present for Temporal
 * @augments State
 */
export class Temporal extends State {
  /** @type {string} - Type discriminator */
  _type = 'Temporal'

  /**
   * @param {Mind} mind
   * @param {State} ground_state - Ground state (required for Temporal)
   * @param {State|null} base
   * @param {object} options - Optional meta-parameters
   * @param {number|null} [options.tt] - Transaction time (explicit for timeless ground states)
   * @param {number|null} [options.vt] - Valid time (defaults to tt)
   * @param {Subject|null} [options.self] - Self identity (defaults to base.self)
   * @param {State|null} [options.about_state] - State context for belief resolution
   * @param {boolean} [options.derivation] - True if this state is a derivation
   */
  constructor(mind, ground_state, base=null, {tt, vt, self, about_state, derivation} = {}) {
    // Call State constructor which handles all validation
    super(mind, ground_state, base, {tt, vt, self, about_state, derivation})

    // Set type (overrides State's default)
    this._type = 'Temporal'
  }

  /**
   * Create Temporal from JSON data
   * @param {Mind} mind - Mind this state belongs to (or context for resolution)
   * @param {StateJSON} data - JSON data with _type: 'Temporal'
   * @returns {Temporal}
   */
  static from_json(mind, data) {
    const refs = State._load_refs_from_json(mind, data)
    const state = Object.create(Temporal.prototype)
    state._type = 'Temporal'

    const vt = data.vt ?? data.tt
    state._init_properties(refs.in_mind, refs.ground_state, refs.base, data.tt, vt, refs.self, refs.about_state, data._id)
    state._load_insert_from_json(data)
    state._load_remove_from_json(data)
    state._link_base()

    return state
  }
}
