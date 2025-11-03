/**
 * Cosmos - Re-export hub for core classes
 * Type definitions live in respective class files
 */

import * as DB from './db.mjs'
import { Mind } from './mind.mjs'
import { State } from './state.mjs'

export { Archetype } from './archetype.mjs'
export { Traittype } from './traittype.mjs'
export { Mind } from './mind.mjs'
export { State } from './state.mjs'
export { Belief } from './belief.mjs'
export { Subject } from './subject.mjs'
export { Session } from './session.mjs'
export { Serialize, save_mind, load } from './serialize.mjs'
export { DB }

// ============================================================================
// Primordial Singletons - Ground of Being
// ============================================================================

/**
 * Logos singleton - the ground of being, ultimate parent of all minds
 * @type {Mind|null}
 */
let _logos_mind = null

/**
 * Logos primordial state - the ground of all states
 * @type {State|null}
 */
let _logos_state = null

/**
 * Eidos singleton - realm of forms/prototypes
 * @type {Mind|null}
 */
let _eidos_mind = null

/**
 * Access Logos - the primordial mind, ground of being
 * Logos is the ONE mind with parent=null, all other minds descend from Logos
 * @returns {Mind}
 */
export function logos() {
  if (_logos_mind === null) {
    _logos_mind = new Mind(null, 'logos')
  }
  return _logos_mind
}

/**
 * Access Logos primordial state - ground of all states
 * Logos state is the ONE state with ground_state=null
 * @returns {State}
 */
export function logos_state() {
  if (_logos_state === null) {
    _logos_state = new State(logos(), 0, null, null)
  }
  return _logos_state
}

/**
 * Access Eidos - the realm of forms, where prototypes dwell
 * Eidos is a child of Logos that holds all universal archetypes and prototypes
 * @returns {Mind}
 */
export function eidos() {
  if (_eidos_mind === null) {
    _eidos_mind = new Mind(logos(), 'Eidos')
    // Create origin_state for Eidos
    _eidos_mind.origin_state = _eidos_mind.create_state(0, logos_state())
  }
  return _eidos_mind
}

/**
 * Reset all singletons (for testing)
 * @internal
 */
export function _reset_singletons() {
  _logos_mind = null
  _logos_state = null
  _eidos_mind = null
}
