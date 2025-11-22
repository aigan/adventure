/* global process */

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
 * Parse log arguments for optional config array and state
 * @param {any[]} args - Raw arguments
 * @returns {{state: any|null, values: any[]}} Parsed config and values
 */
function parse_log_args(args) {
  let state = null
  let values = args

  // Check if first arg is array (config)
  if (Array.isArray(args[0])) {
    const config = args[0]
    values = args.slice(1)

    // Parse config array for state (duck typing to avoid circular dependency)
    // Check for State-specific properties: in_mind, tt, and get_beliefs method
    for (const item of config) {
      if (item && typeof item === 'object' && 'in_mind' in item && 'tt' in item && typeof item.get_beliefs === 'function') {
        state = item
        break
      }
    }
  }

  return {state, values}
}

/**
 * Log function that respects NODE_ENV
 *
 * Usage:
 * log('message', obj)           // No state - objects as-is
 * log([state], 'msg', obj)      // Auto-dump objects with state
 * log([state, ...], 'msg', obj) // Config array (state + future options)
 * @param {...any} args - Arguments to log (first can be config array)
 */
export function log(...args) {
  if (!is_test) {
    const {state, values} = parse_log_args(args)

    // Apply dump to all values if we have a state
    if (state) {
      console.log(...values.map(v => dump(state, v)))
    } else {
      console.log(...values)
    }
  }
}

/**
 * Debug function that only logs when DEBUG=1 or LOG_LEVEL=debug|trace
 * Respects NODE_ENV=test (silent during tests)
 * When called with no args, returns true if debug is enabled
 *
 * Usage:
 * debug('message', obj)           // No state - objects as-is
 * debug([state], 'msg', obj)      // Auto-dump objects with state
 * debug([state, ...], 'msg', obj) // Config array (state + future options)
 * @param {...any} args - Arguments to log (first can be config array)
 * @returns {boolean} True if debug is enabled
 */
export function debug(...args) {
  const enabled = !is_test && debug_enabled
  if (args.length > 0 && enabled) {
    const {state, values} = parse_log_args(args)

    // Apply dump to all values if we have a state
    if (state) {
      console.debug(...values.map(v => dump(state, v)))
    } else {
      console.debug(...values)
    }
  }
  return enabled
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
    if (!is_test) {
      console.error(message, ...args)
    }
    throw new Error(message || 'Assertion failed')
  }
}

/**
 * System designation - get debug string for objects
 * Like log(), but applies sysdesig transformation to each argument
 * Calls obj.sysdesig(state) if available, otherwise returns obj for default presentation
 * For arrays, returns array of sysdesig for each element
 * For plain objects, returns object with sysdesig for each value
 * @param {any} state - State context (can be null/undefined for objects that don't need it)
 * @param {...any} args - Objects to get debug strings for
 * @returns {any|any[]} Single result if one arg, array if multiple args
 */
export function sysdesig(state, ...args) {
  const results = args.map(obj => dump(state, obj))
  return results.length === 1 ? results[0] : results
}

/**
 * Dump object to debug-friendly representation (applies sysdesig recursively)
 * @param {any} state - State context
 * @param {any} obj - Object to dump
 * @returns {string|any} Debug string if sysdesig exists, otherwise original object
 */
function dump(state, obj) {
  // Handle null/undefined
  if (obj == null) {
    return obj
  }

  // If object has sysdesig method, use it
  if (typeof obj.sysdesig === 'function') {
    return obj.sysdesig(state)
  }

  // Handle arrays - map each element through dump
  if (Array.isArray(obj)) {
    return obj.map(item => dump(state, item))
  }

  // Handle plain objects (not class instances) - map each value through dump
  if (obj.constructor === Object) {
    /** @type {Record<string, any>} */
    const result = {}
    for (const key in obj) {
      result[key] = dump(state, obj[key])
    }
    return result
  }

  // Return as-is for primitives and other types
  return obj
}
