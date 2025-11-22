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
 *   - UnionState (composition states, handles both temporal and timeless)
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
 * @augments State
 */
export class Temporal extends State {
  /** @type {string} - Type discriminator */
  _type = 'Temporal'

  /**
   * @param {Mind} mind
   * @param {State|null} ground_state - Ground state (required for Temporal)
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
    // Resolve in_mind reference (if present in data, otherwise use parameter)
    let resolved_mind = mind
    if (data.in_mind != null) {
      const found_mind = DB.get_mind_by_id(data.in_mind)
      if (!found_mind) {
        throw new Error(`Cannot resolve in_mind ${data.in_mind} for state ${data._id}`)
      }
      resolved_mind = found_mind
    }

    // Resolve base reference
    let base = null
    if (data.base != null) {
      base = DB.get_state_by_id(data.base)
      if (!base) {
        throw new Error(`Cannot resolve base state ${data.base} for state ${data._id}`)
      }
    }

    // Resolve ground_state reference
    let ground_state = null
    if (data.ground_state != null) {
      ground_state = DB.get_state_by_id(data.ground_state)
      if (!ground_state) {
        throw new Error(`Cannot resolve ground_state ${data.ground_state} for state ${data._id}`)
      }
    }

    // Resolve self reference
    let self = null
    if (data.self != null) {
      const ground_mind = mind.parent
      self = DB.get_or_create_subject(ground_mind, data.self)
    }

    // Resolve about_state reference
    let about_state = null
    if (data.about_state != null) {
      about_state = DB.get_state_by_id(data.about_state)
      if (!about_state) {
        throw new Error(`Cannot resolve about_state ${data.about_state} for state ${data._id}`)
      }
    }

    // Create instance using Object.create (bypasses constructor)
    const state = Object.create(Temporal.prototype)

    // Set _type (class field initializers don't run with Object.create)
    state._type = 'Temporal'

    // Use shared initialization with deserialized ID
    const vt = data.vt ?? data.tt  // Default vt to tt for backward compatibility
    state._init_properties(resolved_mind, ground_state, base, data.tt, vt, self, about_state, data._id)

    // Restore insert/remove arrays
    for (const belief_id of data.insert) {
      const belief = DB.get_belief_by_id(belief_id)
      if (!belief) {
        throw new Error(`Cannot resolve insert belief ${belief_id} for state ${data._id}`)
      }
      state._insert.push(belief)
    }

    for (const belief_id of data.remove) {
      const belief = DB.get_belief_by_id(belief_id)
      if (!belief) {
        throw new Error(`Cannot resolve remove belief ${belief_id} for state ${data._id}`)
      }
      state._remove.push(belief)
    }

    // Update branches
    if (base) {
      base._branches.push(state)
    }

    return state
  }
}
