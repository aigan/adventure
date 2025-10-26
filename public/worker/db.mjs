/**
 * Centralized registry for all database entities
 * This is the data storage layer - classes use these registries to store/lookup instances
 *
 * See docs/SPECIFICATION.md for data model design
 * See .CONTEXT.md for module documentation
 */

import { reset_id_sequence } from './id_sequence.mjs'
import { Archetype } from './archetype.mjs'
import { Traittype } from './traittype.mjs'
import { Subject } from './subject.mjs'
import { Belief } from './belief.mjs'

/**
 * @typedef {import('./mind.mjs').Mind} Mind
 * @typedef {import('./state.mjs').State} State
 */

// ============================================================================
// Mind Registries
// ============================================================================

/** @type {Map<number, Mind>} */
const mind_by_id = new Map()

/** @type {Map<string, Mind>} */
const mind_by_label = new Map()

// ============================================================================
// State Registries
// ============================================================================

/** @type {Map<number, State>} */
const state_by_id = new Map()

/** @type {Record<string, object>} */
const state_by_label = {}

// ============================================================================
// Belief Registries
// ============================================================================

/** @type {Map<number, Belief>} */
const belief_by_id = new Map()

/** @type {Map<Subject, Set<Belief>>} */
const belief_by_subject = new Map()

/** @type {Map<Mind, Set<Belief>>} */
const belief_by_mind = new Map()

/** @type {Map<string, number>} */
const sid_by_label = new Map()

/** @type {Map<number, string>} */
const label_by_sid = new Map()

// ============================================================================
// Subject Registries
// ============================================================================

/** @type {Map<number, Subject>} */
const subject_by_sid = new Map()

// ============================================================================
// Archetype Registries
// ============================================================================

/** @type {Record<string, Archetype>} */
const archetype_by_label = {}

// ============================================================================
// Traittype Registries
// ============================================================================

/** @type {Record<string, Traittype>} */
const traittype_by_label = {}

// ============================================================================
// Reflection (for testing/debugging)
// ============================================================================

/**
 * @internal - For testing and debugging only
 * @returns {object} Internal registry state
 */
export function _reflect() {
  return {
    mind_by_id,
    mind_by_label,
    state_by_id,
    state_by_label,
    belief_by_id,
    belief_by_subject,
    belief_by_mind,
    sid_by_label,
    label_by_sid,
    subject_by_sid,
    archetype_by_label,
    traittype_by_label
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Register mind in registries
 * @param {Mind} mind - Mind to register
 */
export function register_mind(mind) {
  mind_by_id.set(mind._id, mind)
  if (mind.label) {
    mind_by_label.set(mind.label, mind)
  }
}

/**
 * Get Mind by ID
 * @param {number} id
 * @returns {Mind|undefined}
 */
export function get_mind_by_id(id) {
  return mind_by_id.get(id)
}

/**
 * Get Mind by label
 * @param {string} label
 * @returns {Mind|undefined}
 */
export function get_mind_by_label(label) {
  return mind_by_label.get(label)
}

/**
 * Register belief in belief_by_id registry
 * @param {Belief} belief - Belief to register
 */
export function register_belief_by_id(belief) {
  belief_by_id.set(belief._id, belief)
}

/**
 * Get Belief by ID
 * @param {number} id
 * @returns {Belief|undefined}
 */
export function get_belief(id) {
  return belief_by_id.get(id)
}

/**
 * Get first Belief by label (resolves via sid)
 * @param {string} label
 * @returns {Belief|null}
 */
export function get_first_belief_by_label(label) {
  const sid = sid_by_label.get(label)
  if (sid === undefined) return null

  const subject = get_or_create_subject(sid)
  const beliefs = belief_by_subject.get(subject)
  if (!beliefs || beliefs.size === 0) return null

  return beliefs.values().next().value ?? null
}

/**
 * Get Archetype by label
 * @param {string} label
 * @returns {Archetype|undefined}
 */
export function get_archetype_by_label(label) {
  return archetype_by_label[label]
}

/**
 * Get Traittype by label
 * @param {string} label
 * @returns {Traittype|undefined}
 */
export function get_traittype_by_label(label) {
  return traittype_by_label[label]
}

/**
 * Get SID by label
 * @param {string} label
 * @returns {number|undefined}
 */
export function get_sid_by_label(label) {
  return sid_by_label.get(label)
}

/**
 * Get label by SID
 * @param {number} sid
 * @returns {string|undefined}
 */
export function get_label_by_sid(sid) {
  return label_by_sid.get(sid)
}

/**
 * Check if label is already registered
 * @param {string} label
 * @returns {boolean}
 */
export function has_label(label) {
  return sid_by_label.has(label)
}

/**
 * Register label-sid mapping (keeps both registries in sync)
 * @param {string} label
 * @param {number} sid
 */
export function register_label(label, sid) {
  sid_by_label.set(label, sid)
  label_by_sid.set(sid, label)
}

/**
 * Get beliefs by subject
 * @param {Subject} subject
 * @returns {Set<Belief>|undefined}
 */
export function get_beliefs_by_subject(subject) {
  return belief_by_subject.get(subject)
}

/**
 * Get beliefs by mind
 * @param {Mind} mind
 * @returns {Set<Belief>|undefined}
 */
export function get_beliefs_by_mind(mind) {
  return belief_by_mind.get(mind)
}

/**
 * Register belief in belief_by_subject and belief_by_mind registries
 * @param {Belief} belief - Belief to register
 */
export function register_belief_by_subject(belief) {
  // Add to belief_by_subject (Set already initialized by get_or_create_subject)
  /** @type {Set<Belief>} */ (belief_by_subject.get(belief.subject)).add(belief)

  // Register by mind (skip for shared beliefs with null mind)
  if (belief.in_mind !== null) {
    if (!belief_by_mind.has(belief.in_mind)) {
      belief_by_mind.set(belief.in_mind, new Set())
    }
    /** @type {Set<Belief>} */ (belief_by_mind.get(belief.in_mind)).add(belief)
  }
}

/**
 * Get or create the canonical Subject for a given SID
 * @param {number} sid - Subject ID
 * @returns {Subject}
 */
export function get_or_create_subject(sid) {
  if (!subject_by_sid.has(sid)) {
    const subject = new Subject(sid)
    subject_by_sid.set(sid, subject)
    belief_by_subject.set(subject, new Set())
  }
  return /** @type {Subject} */ (subject_by_sid.get(sid))
}

/**
 * Find beliefs in a mind that are about a specific subject
 * @param {Mind} mind - Mind to search in
 * @param {Subject} about_subject - Subject to find beliefs about
 * @param {State} state - State context for resolving @about trait
 * @returns {Array<Belief>} Array of beliefs about the subject (may be empty)
 */
export function find_beliefs_about_subject(mind, about_subject, state) {
  const mind_beliefs = belief_by_mind.get(mind)
  if (!mind_beliefs) return []

  const results = []
  for (const belief of mind_beliefs) {
    const b_about = belief.get_about(state)
    if (b_about?.subject === about_subject) {
      results.push(belief)
    }
  }
  return results
}


/**
 * Register state in registries
 * @param {State} state - State to register
 */
export function register_state(state) {
  state_by_id.set(state._id, state)
}

/**
 * Get State by ID
 * @param {number} id
 * @returns {State|undefined}
 */
export function get_state_by_id(id) {
  return state_by_id.get(id)
}

/**
 * Get State by ID (alias for backward compatibility)
 * @param {number} id
 * @returns {State|undefined}
 */
export function get_state(id) {
  return state_by_id.get(id)
}

/**
 * Get Subject by label
 * @param {string} label
 * @returns {Subject|null}
 */
export function get_subject_by_label(label) {
  const sid = sid_by_label.get(label)
  if (sid === undefined) return null
  return subject_by_sid.get(sid) ?? null
}

/**
 * Reset all registries (for testing)
 */
export function reset_all_registries() {
  mind_by_id.clear()
  mind_by_label.clear()
  state_by_id.clear()
  belief_by_id.clear()
  belief_by_subject.clear()
  belief_by_mind.clear()
  sid_by_label.clear()
  label_by_sid.clear()
  subject_by_sid.clear()

  for (const key in state_by_label) delete state_by_label[key]
  for (const key in archetype_by_label) delete archetype_by_label[key]
  for (const key in traittype_by_label) delete traittype_by_label[key]
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * @typedef {object} ArchetypeDefinition
 * @property {string[]} [bases] - Base archetype labels
 * @property {Object<string, *>} [traits] - Default trait values
 */

/**
 * @typedef {string|TraitTypeSchema} TraitTypeDefinition
 * Can be either:
 * - Simple string: "Location", "string", "number", "boolean", "State", "Mind"
 * - Complex schema object for arrays/validation
 */

/**
 * @typedef {object} TraitTypeSchema
 * @property {string} type - Base type (e.g., "State", "Location", "string")
 * @property {Function} [container] - Container constructor (e.g., Array)
 * @property {number} [min] - Minimum array length
 * @property {number} [max] - Maximum array length
 * @property {string} [mind] - Mind scope for Subject resolution ('parent', 'current', 'any')
 */

/**
 * Get all trait names that are Mind-typed (including arrays of Minds)
 * @returns {string[]} Array of trait names with Mind data_type
 */
export function get_mind_trait_names() {
  const mind_traits = []
  for (const [label, traittype] of Object.entries(traittype_by_label)) {
    if (traittype.data_type === 'Mind') {
      mind_traits.push(label)
    }
  }
  return mind_traits
}

/**
 * Reset all registries (for testing)
 */
export function reset_registries() {
  reset_all_registries()
  reset_id_sequence()
}

/**
 * Register archetypes and trait types into the database
 * @param {Object<string, ArchetypeDefinition>} archetypes - Archetype definitions {label: definition}
 * @param {Object<string, string|TraitTypeSchema>} traittypes - Trait type definitions {label: type or schema}
 */
export function register( archetypes, traittypes ) {
  for (const [label, def] of Object.entries(traittypes)) {
    traittype_by_label[label] = new Traittype(label, def)
  }

  for (const [label, def] of Object.entries(archetypes)) {
    if (archetype_by_label[label]) {
      throw new Error(`Label '${label}' is already used by another archetype`)
    }
    if (sid_by_label.has(label)) {
      throw new Error(`Label '${label}' is already used by a belief`)
    }
    archetype_by_label[label] = new Archetype(label, def)
  }
}
