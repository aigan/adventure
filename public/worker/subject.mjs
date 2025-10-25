import * as DB from './db.mjs'

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
   * @param {import('./state.mjs').State} state
   * @returns {import('./belief.mjs').Belief}
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
   * Shallow inspection for debugging
   * @param {import('./state.mjs').State} state
   * @returns {object}
   */
  inspect(state) {
    let belief = state.get_belief_by_subject(this)

    // Fallback to global registry if not found in state
    if (!belief) {
      const beliefs = DB.belief_by_subject.get(this)
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
      mind_id: belief.in_mind._id,
      mind_label: belief.in_mind.label
    }
  }
}
