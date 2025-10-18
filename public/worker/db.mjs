/**
 * Centralized registry for all database entities
 * This is the data storage layer - classes use these registries to store/lookup instances
 */

import { reset_id_sequence } from './id_sequence.mjs'
import { Archetype } from './archetype.mjs'
import { Traittype } from './traittype.mjs'

// ============================================================================
// Mind Registries
// ============================================================================

/** @type {Map<number, import('./mind.mjs').Mind>} */
export const mind_by_id = new Map()

/** @type {Map<string, import('./mind.mjs').Mind>} */
export const mind_by_label = new Map()

// ============================================================================
// State Registries
// ============================================================================

/** @type {Map<number, import('./state.mjs').State>} */
export const state_by_id = new Map()

/** @type {Record<string, object>} */
export const state_by_label = {}

// ============================================================================
// Belief Registries
// ============================================================================

/** @type {Map<number, import('./belief.mjs').Belief>} */
export const belief_by_id = new Map()

/** @type {Map<number, Set<import('./belief.mjs').Belief>>} */
export const belief_by_sid = new Map()

/** @type {Map<string, number>} */
export const sid_by_label = new Map()

/** @type {Map<number, string>} */
export const label_by_sid = new Map()

// ============================================================================
// Archetype Registries
// ============================================================================

/** @type {Record<string, import('./archetype.mjs').Archetype>} */
export const archetype_by_label = {}

// ============================================================================
// Traittype Registries
// ============================================================================

/** @type {Record<string, import('./traittype.mjs').Traittype>} */
export const traittype_by_label = {}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get Mind by ID
 * @param {number} id
 * @returns {import('./mind.mjs').Mind|undefined}
 */
export function get_mind(id) {
  return mind_by_id.get(id)
}

/**
 * Get Mind by label
 * @param {string} label
 * @returns {import('./mind.mjs').Mind|undefined}
 */
export function get_mind_by_label(label) {
  return mind_by_label.get(label)
}

/**
 * Get Belief by ID
 * @param {number} id
 * @returns {import('./belief.mjs').Belief|undefined}
 */
export function get_belief(id) {
  return belief_by_id.get(id)
}

/**
 * Get Belief by label (resolves via sid)
 * Returns the first belief registered with this label's sid
 * @param {string} label
 * @returns {import('./belief.mjs').Belief|undefined}
 */
export function get_belief_by_label(label) {
  const sid = sid_by_label.get(label)
  if (sid === undefined) return undefined

  const beliefs = belief_by_sid.get(sid)
  if (!beliefs || beliefs.size === 0) return undefined

  // Return first belief with this sid
  return [...beliefs][0]
}

/**
 * Get State by ID
 * @param {number} id
 * @returns {import('./state.mjs').State|undefined}
 */
export function get_state(id) {
  return state_by_id.get(id)
}

/**
 * Reset all registries (for testing)
 */
export function reset_all_registries() {
  mind_by_id.clear()
  mind_by_label.clear()
  state_by_id.clear()
  belief_by_id.clear()
  belief_by_sid.clear()
  sid_by_label.clear()
  label_by_sid.clear()

  // Clear object registries by deleting all keys
  for (const key in state_by_label) {
    delete state_by_label[key]
  }
  for (const key in archetype_by_label) {
    delete archetype_by_label[key]
  }
  for (const key in traittype_by_label) {
    delete traittype_by_label[key]
  }
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
 */

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
    //traittypes[label] = def; // TODO: resolve trait datatypes
    traittype_by_label[label] = new Traittype(label, def)
    //log("Registered traittype", label)
  }

  for (const [label, def] of Object.entries(archetypes)) {
    // Check label uniqueness across beliefs and archetypes
    if (archetype_by_label[label]) {
      throw new Error(`Label '${label}' is already used by another archetype`)
    }
    if (sid_by_label.has(label)) {
      throw new Error(`Label '${label}' is already used by a belief`)
    }
    archetype_by_label[label] = new Archetype(label, def)
    //log("Registred archetype", label)
  }
}
