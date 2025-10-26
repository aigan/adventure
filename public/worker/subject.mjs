import * as DB from './db.mjs'
import { Belief } from './belief.mjs'

/**
 * @typedef {import('./state.mjs').State} State
 */

/**
 * Canonical identity reference for a belief subject
 * Wraps a stable sid that persists across belief versions
 */
export class Subject {
  /**
   * @param {number} sid - Subject identifier
   */
  constructor(sid) {
    this.sid = sid
  }

  /**
   * Get Belief for this Subject in state context
   * @param {State} state
   * @returns {Belief}
   */
  get_belief_by_state(state) {
    const belief = state.get_belief_by_subject(this)
    if (!belief) {
      throw new Error(`Cannot resolve Subject with sid ${this.sid}`)
    }
    return belief
  }

  /**
   * Serialize for JSON (backward compatible - returns sid)
   * @returns {number}
   */
  toJSON() {
    return this.sid
  }

  /**
   * Shallow inspection view for the inspect UI
   * @param {State} state
   * @returns {object}
   */
  to_inspect_view(state) {
    let belief = state.get_belief_by_subject(this)

    // Fallback to global registry if not found in state
    if (!belief) {
      const beliefs = DB.get_beliefs_by_subject(this)
      if (beliefs?.size) {
        belief = beliefs.values().next().value ?? null
      }
    }

    if (!belief) {
      return {_ref: this.sid, _type: 'Subject'}
    }
    return {
      _ref: belief._id,
      _type: 'Belief',
      label: belief.get_label(),
      mind_id: belief.in_mind?._id ?? null,
      mind_label: belief.in_mind?.label ?? null
    }
  }

  /**
   * Get all beliefs for this subject that were valid at a specific timestamp
   * Yields the outermost belief on each branch at or before the given timestamp
   * (beliefs that have no descendants also at or before the timestamp)
   * @param {number} timestamp - Timestamp to query at
   * @yields {Belief} Outermost beliefs on each branch at timestamp
   */
  *beliefs_valid_at(timestamp) {
    const beliefs = DB.get_beliefs_by_subject(this)
    if (!beliefs || beliefs.size === 0) return

    // Get all beliefs with timestamp <= target
    const valid_beliefs = [...beliefs].filter(b => b.get_timestamp() <= timestamp)

    // Yield beliefs that have no descendants in the valid set
    for (const belief of valid_beliefs) {
      const has_descendant = valid_beliefs.some(other =>
        other !== belief && _has_base_in_chain(other, belief)
      )

      if (!has_descendant) {
        yield belief
      }
    }
  }
}

/**
 * Check if a belief has another belief in its base chain
 * @param {Belief} descendant - Belief to check
 * @param {Belief} ancestor - Potential ancestor to find
 * @returns {boolean} True if ancestor is in descendant's base chain
 */
function _has_base_in_chain(descendant, ancestor) {
  const visited = new Set()
  const queue = [descendant]

  while (queue.length > 0) {
    const current = /** @type {Belief} */ (queue.shift())

    if (visited.has(current)) continue
    visited.add(current)

    for (const base of current._bases) {
      if (base === ancestor) return true
      if (base instanceof Belief) {
        queue.push(base)
      }
    }
  }

  return false
}
