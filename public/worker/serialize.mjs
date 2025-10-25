import { set_id_sequence } from './id_sequence.mjs'
import { Mind } from './mind.mjs'

/**
 * @typedef {import('./belief.mjs').Belief} Belief
 * @typedef {import('./state.mjs').State} State
 * @typedef {import('./mind.mjs').MindJSON} MindJSON
 * @typedef {import('./belief.mjs').BeliefJSON} BeliefJSON
 * @typedef {import('./state.mjs').StateJSON} StateJSON
 */

/**
 * Serialization coordinator with dependency tracking
 */
export class Serialize {
  /** @type {Mind[]|null} */
  static dependency_queue = null
  /** @type {Set<number>|null} */
  static seen = null
  /** @type {boolean} */
  static active = false

  /**
   * @param {Mind} mind
   */
  static add_dependency(mind) {
    if (Serialize.dependency_queue !== null) {
      Serialize.dependency_queue.push(mind)
    }
  }

  /**
   * Save mind to JSON string with automatic nested mind discovery
   * @param {Mind} mind - Mind to serialize
   * @returns {string} JSON string
   */
  static save_mind(mind) {
    Serialize.active = true
    Serialize.dependency_queue = []
    Serialize.seen = new Set([mind._id])

    /** @type {MindJSON} */ const root = /** @type {any} */ (mind.toJSON())

    const nested_minds = []
    while (Serialize.dependency_queue.length > 0) {
      const dep_mind = Serialize.dependency_queue.shift()
      if (dep_mind && !Serialize.seen.has(dep_mind._id)) {
        Serialize.seen.add(dep_mind._id)
        nested_minds.push(dep_mind.toJSON())
      }
    }

    Serialize.active = false
    Serialize.dependency_queue = null
    Serialize.seen = null

    if (nested_minds.length > 0) {
      root.nested_minds = nested_minds
    }

    return JSON.stringify(root, null, 2)
  }
}

/**
 * Save mind to JSON string
 * @param {Mind} mind - Mind to serialize
 * @returns {string} JSON string
 */
export function save_mind(mind) {
  return Serialize.save_mind(mind)
}

/**
 * Load from JSON string (dispatches on _type field)
 * Assumes empty DB - updates id_sequence from loaded data
 * @param {string} json_string - JSON string to load
 * @returns {Mind|Belief|State} Loaded object
 */
export function load(json_string) {
  const data = /** @type {MindJSON|BeliefJSON|StateJSON} */ (JSON.parse(json_string))

  if (!data._type) {
    throw new Error('JSON data missing _type field')
  }

  let result
  switch (data._type) {
    case 'Mind':
      result = Mind.from_json(/** @type {MindJSON} */ (data))
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
 * @param {MindJSON|BeliefJSON|StateJSON} data
 */
function update_id_sequence_from_data(data) {
  /** @param {any} obj @param {number} [max] @returns {number} */
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
