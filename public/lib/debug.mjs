export const log = console.log.bind(console);

/**
 * Assert that a condition is true, logging context on failure
 * @param {boolean} condition - Condition to check
 * @param {...any} args - Message and context objects to log (explorable in console)
 */
export function assert(condition, ...args) {
  if (!condition) {
    console.error(...args);
    throw new Error('Assertion failed');
  }
}
