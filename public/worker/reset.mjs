/**
 * Reset hook registry
 * Separate module to avoid circular dependencies
 * All modules register their reset functions here
 */

/** @type {Array<() => void>} */
const hooks = []

/**
 * Register a reset hook to be called by reset_registries()
 * @param {() => void} fn
 */
export function register_reset_hook(fn) {
  hooks.push(fn)
}

/**
 * Reset all registered modules (for testing)
 * Each module registers its own cleanup via register_reset_hook()
 */
export function reset_registries() {
  for (const hook of hooks) hook()
}
