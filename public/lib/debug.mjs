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
 * @param {boolean} condition - Condition to check
 * @param {...any} args - Message and context objects to log (explorable in console)
 */
export function assert(condition, ...args) {
  if (!condition) {
    // Skip logging in test environment to keep output clean
    // @ts-ignore - process may not exist in browser context
    if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
      console.error(...args);
    }
    throw new Error('Assertion failed');
  }
}
