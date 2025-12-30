/**
 * Cosmos - Re-export hub for core classes
 * Type definitions live in respective class files
 */

import * as DB from './db.mjs'
import { register_reset_hook } from './reset.mjs'

export { Archetype } from './archetype.mjs'
export { Traittype } from './traittype.mjs'
export { State } from './state.mjs'
export { Temporal } from './temporal.mjs'
export { Convergence } from './convergence.mjs'
export { Mind } from './mind.mjs'
export { Materia } from './materia.mjs'
export { Belief } from './belief.mjs'
export { Subject } from './subject.mjs'
export { Trait } from './trait.mjs'
export { Session } from './session.mjs'
export { Serialize, save_mind, load } from './serialize.mjs'
export { Timeless } from './timeless.mjs'
export { Logos, logos, logos_state, _reset_logos } from './logos.mjs'
export { Eidos, eidos, _reset_eidos } from './eidos.mjs'
export { Fuzzy, unknown, _reset_unknown } from './fuzzy.mjs'
export { DB }

// ============================================================================
// Primordial Singletons - Ground of Being
// ============================================================================
// Implementations moved to logos.mjs and eidos.mjs
// This module re-exports for backward compatibility

import { _reset_logos } from './logos.mjs'
import { _reset_eidos } from './eidos.mjs'
import { _reset_unknown } from './fuzzy.mjs'

/**
 * Reset all singletons (for testing)
 * @internal
 */
export function _reset_singletons() {
  _reset_logos()
  _reset_eidos()
  _reset_unknown()
}

register_reset_hook(_reset_singletons)
