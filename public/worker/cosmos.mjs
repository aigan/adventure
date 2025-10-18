import * as DB from './db.mjs'

// Import all classes
import { Archetype } from './archetype.mjs'
import { Traittype } from './traittype.mjs'
import { Mind } from './mind.mjs'
import { State } from './state.mjs'
import { Belief } from './belief.mjs'
import { Session } from './session.mjs'
import { Serialize, save_mind, load } from './serialize.mjs'

// No more init function calls needed! Classes use factory functions from this module.

// ============================================================================
// Factory Functions (to eliminate circular dependencies in class files)
// ============================================================================

/**
 * Create a new Mind instance
 * @param {string|null} label - Mind identifier
 * @param {import('./belief.mjs').Belief|null} self - What this mind considers "self"
 * @returns {Mind}
 */
export function create_mind(label = null, self = null) {
  return new Mind(label, self)
}

/**
 * Create a new Belief instance from template
 * @param {Mind} mind - Mind this belief belongs to
 * @param {object} def - Belief definition (template with potential string bases and trait templates)
 * @param {import('./state.mjs').State|null} [creator_state] - State creating this belief
 * @returns {import('./belief.mjs').Belief}
 */
export function create_belief(mind, def, creator_state = null) {
  return Belief.from_template(mind, def, creator_state)
}

/**
 * Create a new State instance
 * @param {Mind} mind - Mind this state belongs to
 * @param {number} timestamp - State timestamp/tick
 * @param {import('./state.mjs').State|null} base - Base state
 * @param {import('./state.mjs').State|null} ground_state - Ground state reference
 * @returns {import('./state.mjs').State}
 */
export function create_state(mind, timestamp, base = null, ground_state = null) {
  return new State(mind, timestamp, base, ground_state)
}

// ============================================================================
// Type Checking Functions (to replace instanceof checks)
// ============================================================================

/**
 * @param {*} obj
 * @returns {boolean}
 */
export function is_mind(obj) {
  return obj instanceof Mind
}

/**
 * @param {*} obj
 * @returns {boolean}
 */
export function is_state(obj) {
  return obj instanceof State
}

/**
 * @param {*} obj
 * @returns {boolean}
 */
export function is_belief(obj) {
  return obj instanceof Belief
}

// ============================================================================
// Serialization State Management
// ============================================================================

let _serializing = false

/**
 * @returns {boolean}
 */
export function is_serializing() {
  return _serializing
}

/**
 * @param {boolean} val
 */
export function set_serializing(val) {
  _serializing = val
}

/**
 * @param {Mind} mind
 */
export function add_serialization_dependency(mind) {
  if (Serialize.dependency_queue !== null) {
    Serialize.dependency_queue.push(mind)
  }
}

// ============================================================================
// Registry Access Functions
// ============================================================================

/**
 * Get Traittype by label
 * @param {string} label
 * @returns {import('./traittype.mjs').Traittype|undefined}
 */
export function get_traittype(label) {
  return DB.traittype_by_label[label]
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * @typedef {object} MindJSON
 * @property {string} _type - Always "Mind"
 * @property {number} _id - Mind identifier
 * @property {string|null} label - Optional label for lookup
 * @property {BeliefJSON[]} belief - All beliefs in this mind
 * @property {StateJSON[]} state - All states in this mind
 * @property {MindJSON[]} [nested_minds] - Nested minds discovered during serialization
 */

/**
 * @typedef {object} StateJSON
 * @property {string} _type - Always "State"
 * @property {number} _id - State identifier
 * @property {number} timestamp - State timestamp/tick
 * @property {number|null} base - Base state _id (null for root states)
 * @property {number|null} ground_state - Ground state _id (null if no external reference)
 * @property {number[]} insert - Belief _ids present in this state
 * @property {number[]} remove - Belief _ids removed in this state
 * @property {number} in_mind - Mind _id this state belongs to
 */

/**
 * @typedef {object} BeliefJSON
 * @property {string} _type - Always "Belief"
 * @property {number} _id - Unique version identifier
 * @property {number} sid - Subject identifier (stable across versions)
 * @property {string|null} label - Optional label for lookup
 * @property {number|null} about - Parent belief _id (null if not about another belief)
 * @property {string[]} archetypes - Archetype labels for this belief
 * @property {(string|number)[]} bases - Base archetype labels or belief _ids
 * @property {Object<string, SerializedTraitValue>} traits - Trait values (sids, primitives, or references)
 */

/**
 * @typedef {number|string|boolean|null|StateReference|MindReference|Array<number|string|boolean|null|StateReference|MindReference>} SerializedTraitValue
 * Trait values in JSON can be:
 * - number (sid or primitive)
 * - string/boolean/null (primitives)
 * - StateReference/MindReference (for State/Mind traits)
 * - Array of any of the above
 */

/**
 * @typedef {object} StateReference
 * @property {string} _type - Always "State"
 * @property {number} _id - State identifier
 */

/**
 * @typedef {object} MindReference
 * @property {string} _type - Always "Mind"
 * @property {number} _id - Mind identifier
 * @property {string|null} label - Mind label
 */

// Re-export all classes and functions
export {
  Archetype,
  Traittype,
  Mind,
  State,
  Belief,
  Session,
  Serialize,
  save_mind,
  load,
  DB
}
