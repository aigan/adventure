/**
 * Timeless - timeless state without temporal restrictions
 *
 * Special State subclass for states that exist outside normal temporal flow.
 * Used for primordial states (Logos, Eidos) that don't have tt/vt.
 *
 * Unlike regular State:
 * - Has tt=null and vt=null (timeless)
 * - ground_state can be null (for Logos) or parent's origin_state
 */

import { State } from './state.mjs'
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
export class Timeless extends State {
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
    const refs = State._load_refs_from_json(mind, data)
    const state = Object.create(Timeless.prototype)
    state._type = 'Timeless'

    // Timeless: base=null, tt=null, vt=null, about_state=null
    state._init_properties(refs.in_mind, refs.ground_state, null, null, null, refs.self, null, data._id)
    state._load_insert_from_json(data)
    state._load_remove_from_json(data)
    // No _link_base() needed - Timeless has no base chain

    return state
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
      self: this.self?.toJSON() ?? null,
      about_state: null,  // Timeless states don't have about_state
      insert: this._insert.map(b => b._id),
      remove: this._remove.map(b => b._id),
      in_mind: this.in_mind._id
    }
  }
}

// Register for polymorphic deserialization
State.register_type('Timeless', Timeless)
