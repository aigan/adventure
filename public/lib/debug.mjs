/**
 * Log function that respects NODE_ENV
 * @param {...any} args - Arguments to log
 */
export function log(...args) {
  // @ts-ignore - process may not exist in browser context
  if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
    console.log(...args);
  }
}

/**
 * Assert that a condition is true, logging context on failure
 * @param {any} condition - Condition to check
 * @param {string} message - Error message
 * @param {...any} args - Additional context objects to log (explorable in console)
 * @returns {asserts condition}
 */
export function assert(condition, message, ...args) {
  if (!condition) {
    // Skip logging in test environment to keep output clean
    // @ts-ignore - process may not exist in browser context
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      console.error(message, ...args);
    }
    throw new Error(message || 'Assertion failed');
  }
}
