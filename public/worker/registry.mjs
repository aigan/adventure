/**
 * Centralized registry for all database entities
 * This is the data storage layer - classes use these registries to store/lookup instances
 */

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

/** @type {Record<string, object>} */
export const state_by_label = {}

// ============================================================================
// Belief Registries
// ============================================================================

/** @type {Map<number, import('./belief.mjs').Belief>} */
export const belief_by_id = new Map()

/** @type {Map<string, import('./belief.mjs').Belief>} */
export const belief_by_label = new Map()

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
 * Get Belief by label
 * @param {string} label
 * @returns {import('./belief.mjs').Belief|undefined}
 */
export function get_belief_by_label(label) {
  return belief_by_label.get(label)
}

/**
 * Reset all registries (for testing)
 */
export function reset_all_registries() {
  mind_by_id.clear()
  mind_by_label.clear()
  belief_by_id.clear()
  belief_by_label.clear()
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
