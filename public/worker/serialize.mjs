import { set_id_sequence } from './id_sequence.mjs'

/**
 * Forward declarations to avoid circular dependencies
 * @type {any}
 */
let Mind = null
/** @type {any} */
let Belief = null
/** @type {any} */
let State = null

/**
 * Initialize references after all modules are loaded
 * @param {object} refs
 * @param {typeof import('./mind.mjs').Mind} refs.Mind
 * @param {typeof import('./belief.mjs').Belief} refs.Belief
 * @param {typeof import('./state.mjs').State} refs.State
 */
export function init_serialize_refs(refs) {
  Mind = refs.Mind
  Belief = refs.Belief
  State = refs.State
}

/**
 * Serialization coordinator with dependency tracking
 */
export class Serialize {
  /** @type {import('./mind.mjs').Mind[]|null} */
  static dependency_queue = null
  /** @type {Set<number>|null} */
  static seen = null

  /**
   * Save mind to JSON string with automatic nested mind discovery
   * @param {import('./mind.mjs').Mind} mind - Mind to serialize
   * @returns {string} JSON string
   */
  static save_mind(mind) {
    // Set up tracking
    Serialize.dependency_queue = []
    Serialize.seen = new Set([mind._id]) // Mark root as seen

    // Serialize root mind
    /** @type {import('./mind.mjs').MindJSON} */
    const root = /** @type {any} */ (mind.toJSON())

    // Process dependencies discovered during serialization
    const nested_minds = []
    while (Serialize.dependency_queue.length > 0) {
      const dep_mind = Serialize.dependency_queue.shift()
      if (dep_mind && !Serialize.seen.has(dep_mind._id)) {
        Serialize.seen.add(dep_mind._id)
        nested_minds.push(dep_mind.toJSON())
      }
    }

    // Clean up
    Serialize.dependency_queue = null
    Serialize.seen = null

    // Add nested minds to root
    if (nested_minds.length > 0) {
      root.nested_minds = nested_minds
    }

    return JSON.stringify(root, null, 2)
  }
}

/**
 * Save mind to JSON string
 * @param {import('./mind.mjs').Mind} mind - Mind to serialize
 * @returns {string} JSON string
 */
export function save_mind(mind) {
  return Serialize.save_mind(mind)
}

/**
 * Load from JSON string (dispatches on _type field)
 * Assumes empty DB - updates id_sequence from loaded data
 * @param {string} json_string - JSON string to load
 * @returns {import('./mind.mjs').Mind|import('./belief.mjs').Belief|import('./state.mjs').State} Loaded object
 */
export function load(json_string) {
  const data = /** @type {import('./mind.mjs').MindJSON|import('./belief.mjs').BeliefJSON|import('./state.mjs').StateJSON} */ (JSON.parse(json_string))

  if (!data._type) {
    throw new Error('JSON data missing _type field')
  }

  let result
  switch (data._type) {
    case 'Mind':
      result = Mind.from_json(/** @type {import('./mind.mjs').MindJSON} */ (data))
      break
    case 'Belief':
      throw new Error('Loading individual Belief not yet implemented')
    case 'State':
      throw new Error('Loading individual State not yet implemented')
    default:
      throw new Error(`Unknown _type: ${data._type}`)
  }

  // Update id_sequence to continue from highest loaded ID
  update_id_sequence_from_data(data)

  return result
}

/**
 * Update id_sequence from loaded data
 * @param {import('./mind.mjs').MindJSON|import('./belief.mjs').BeliefJSON|import('./state.mjs').StateJSON} data - Loaded JSON data
 */
function update_id_sequence_from_data(data) {
  /**
   * @param {any} obj
   * @param {number} [max]
   * @returns {number}
   */
  const find_max_id = (obj, max = 0) => {
    if (!obj || typeof obj !== 'object') return max

    if (obj._id != null && typeof obj._id === 'number') {
      max = Math.max(max, obj._id)
    }

    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          max = find_max_id(item, max)
        }
      } else if (typeof value === 'object') {
        max = find_max_id(value, max)
      }
    }

    return max
  }

  set_id_sequence(find_max_id(data))
}
