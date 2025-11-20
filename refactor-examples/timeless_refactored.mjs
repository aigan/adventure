/**
 * Timeless - timeless state without temporal restrictions
 *
 * REFACTORED VERSION - Uses clean extends State with shared initialization
 * See docs/INHERITANCE_PATTERN.md for full pattern documentation
 *
 * Special State subclass for states that exist outside normal temporal flow.
 * Used for primordial states (Logos, Eidos) that don't have tt/vt.
 *
 * Unlike regular State:
 * - Has tt=null and vt=null (timeless)
 * - ground_state can be null (for Logos) or parent's origin_state
 */

import { State } from './state.mjs'  // ✅ No circular dependency!
import * as DB from './db.mjs'

/**
 * @typedef {import('./mind.mjs').Mind} Mind
 * @typedef {import('./belief.mjs').Belief} Belief
 * @typedef {import('./subject.mjs').Subject} Subject
 * @typedef {import('./traittype.mjs').Traittype} Traittype
 * @typedef {import('./state.mjs').StateJSON} StateJSON
 */

/**
 * Timeless state - exists outside normal temporal flow
 */
export class Timeless extends State {  // ✅ Clean extends!
  /**
   * Override type discriminator
   * @type {string}
   */
  _type = 'Timeless'

  /**
   * Create a timeless state
   * @param {Mind} mind - Mind this timeless state belongs to
   */
  constructor(mind) {
    // Resolve ground_state:
    // - For Logos: mind.parent is null, so ground_state will be null
    // - For Eidos/others: mind.parent exists, so ground_state is parent's origin_state
    const ground_state = mind.parent?.origin_state ?? null

    // Call State constructor with timeless options
    super(mind, ground_state, null, {
      tt: null,   // Timeless - no transaction time
      vt: null    // Timeless - no valid time
    })
  }

  /**
   * Deserialize Timeless from JSON
   * @param {Mind} mind - Mind context for resolution
   * @param {StateJSON} data - JSON data with _type: 'Timeless'
   * @returns {Timeless}
   */
  static from_json(mind, data) {
    // Resolve references
    const resolved_mind = data.in_mind ? DB.get_mind_by_id(data.in_mind) : mind
    if (!resolved_mind) {
      throw new Error(`Cannot resolve in_mind ${data.in_mind} for timeless state ${data._id}`)
    }

    const ground_state = data.ground_state ? DB.get_state_by_id(data.ground_state) : null
    // Note: ground_state can be null for Logos bootstrap

    const self = data.self ? DB.get_or_create_subject(mind.parent, data.self) : null

    // Create instance using Object.create (bypasses constructor)
    const timeless = Object.create(Timeless.prototype)

    // Use inherited _init_properties from State
    timeless._init_properties(
      resolved_mind,
      ground_state,
      null,        // base is always null for timeless
      null,        // tt is always null for timeless
      null,        // vt is always null for timeless
      self,
      null         // about_state
    )

    // Override _id to match deserialized value
    timeless._id = data._id

    // Restore insert beliefs
    for (const belief_id of data.insert) {
      const belief = DB.get_belief_by_id(belief_id)
      if (!belief) {
        throw new Error(`Cannot resolve insert belief ${belief_id} for timeless state ${data._id}`)
      }
      timeless._insert.push(belief)
    }

    // Restore remove beliefs
    for (const belief_id of data.remove) {
      const belief = DB.get_belief_by_id(belief_id)
      if (!belief) {
        throw new Error(`Cannot resolve remove belief ${belief_id} for timeless state ${data._id}`)
      }
      timeless._remove.push(belief)
    }

    return timeless
  }

  /**
   * Serialize to JSON
   * @returns {StateJSON}
   */
  toJSON() {
    return {
      _type: 'Timeless',  // ✅ Override to specify correct type
      _id: this._id,
      tt: null,  // Always null for Timeless
      vt: null,  // Always null for Timeless
      base: null,  // Always null for Timeless
      ground_state: this.ground_state?._id ?? null,  // Can be null for Logos
      self: this.self?.sid ?? null,
      about_state: null,  // Timeless states don't have about_state
      insert: this._insert.map(b => b._id),
      remove: this._remove.map(b => b._id),
      in_mind: this.in_mind._id
    }
  }
}

// ✅ NO MORE _init() method - use inherited constructor
// ✅ NO MORE _setup_timeless_inheritance() callback
// ✅ NO MORE Object.setPrototypeOf hack
// ✅ Clean extends State with proper super() call
