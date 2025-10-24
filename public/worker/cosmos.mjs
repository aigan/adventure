/**
 * Cosmos - mediator providing unified access to all core classes
 *
 * Implements the Mediator pattern: single point to import Mind, Belief, State, etc.
 * Keeps modules from directly depending on each other.
 *
 * Just a re-export hub - the less in here, the better.
 *
 * See .CONTEXT.md for module details
 */

import * as DB from './db.mjs'

// Import all classes
import { Archetype } from './archetype.mjs'
import { Traittype } from './traittype.mjs'
import { Mind } from './mind.mjs'
import { State } from './state.mjs'
import { Belief } from './belief.mjs'
import { Subject } from './subject.mjs'
import { Session } from './session.mjs'
import { Serialize, save_mind, load } from './serialize.mjs'

// No more init function calls needed! Classes import each other directly where possible.
// Serialization state management lives in Serialize class (serialize.mjs)

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
 * @property {number|null} self - Subject sid (null if no self identity)
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
  Subject,
  Session,
  Serialize,
  save_mind,
  load,
  DB
}
