// @ts-ignore - process may not exist in browser context
const is_test = typeof process !== 'undefined' && process.env.NODE_ENV === 'test'

// In browser: always enable (Chrome console has its own filtering)
// In Node.js: check DEBUG/LOG_LEVEL env vars
// @ts-ignore - process may not exist in browser context
const debug_enabled = typeof process === 'undefined' || (
  // @ts-ignore - process may not exist in browser context
  process.env.DEBUG === '1' ||
  // @ts-ignore - process may not exist in browser context
  process.env.LOG_LEVEL === 'debug' ||
  // @ts-ignore - process may not exist in browser context
  process.env.LOG_LEVEL === 'trace'
)

/**
 * Log function that respects NODE_ENV
 * @param {...any} args - Arguments to log
 */
export function log(...args) {
  if (!is_test) {
    console.log(...args)
  }
}

/**
 * Debug function that only logs when DEBUG=1 or LOG_LEVEL=debug|trace
 * Respects NODE_ENV=test (silent during tests)
 * When called with no args, returns true if debug is enabled
 * @param {...any} args - Arguments to log
 * @returns {boolean} True if debug is enabled
 */
export function debug(...args) {
  const enabled = !is_test && debug_enabled
  if (args.length > 0 && enabled) {
    console.debug(...args)
  }
  return enabled
}

/**
 * Assert that a condition is true, logging context on failure
 * @param {any} condition - Condition to check
 * @param {string} message - Error message
 * @param {...any} args - Additional context
 * @returns {asserts condition}
 */
export function assert(condition, message, ...args) {
  if (!condition) {
    // Skip logging in test environment to keep output clean
    if (!is_test) {
      console.error(message, ...args)
    }
    throw new Error(message || 'Assertion failed')
  }
}
