/**
 * Global ID sequence for all database objects
 * Provides monotonically increasing IDs for Mind, State, and Belief objects
 */

let id_sequence = 0

/**
 * Get the next available ID
 * @returns {number} Next ID in sequence
 */
export function next_id() {
  return ++id_sequence
}

/**
 * Get current ID value without incrementing
 * @returns {number} Current ID value
 */
export function current_id() {
  return id_sequence
}

/**
 * Set the ID sequence to a specific value
 * Used when loading from saved data
 * @param {number} value - New sequence value
 */
export function set_id_sequence(value) {
  id_sequence = value
}

/**
 * Reset ID sequence to 0
 * Used for testing
 */
export function reset_id_sequence() {
  id_sequence = 0
}
