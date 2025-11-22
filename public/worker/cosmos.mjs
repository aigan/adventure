/**
 * Cosmos - Re-export hub for core classes
 * Type definitions live in respective class files
 */

import * as DB from './db.mjs'

export { Archetype } from './archetype.mjs'
export { Traittype } from './traittype.mjs'
export { State } from './state.mjs'
export { UnionState } from './union_state.mjs'
export { Mind } from './mind.mjs'
export { TemporalMind } from './temporal_mind.mjs'
export { Belief } from './belief.mjs'
export { Subject } from './subject.mjs'
export { Session } from './session.mjs'
export { Serialize, save_mind, load } from './serialize.mjs'
export { Timeless } from './timeless.mjs'
export { Logos, logos, logos_state, _reset_logos } from './logos.mjs'
export { Eidos, eidos, _reset_eidos } from './eidos.mjs'
export { DB }

// ============================================================================
// Primordial Singletons - Ground of Being
// ============================================================================
// Implementations moved to logos.mjs and eidos.mjs
// This module re-exports for backward compatibility

import { _reset_logos } from './logos.mjs'
import { _reset_eidos } from './eidos.mjs'

/**
 * Reset all singletons (for testing)
 * @internal
 */
export function _reset_singletons() {
  _reset_logos()
  _reset_eidos()
}
