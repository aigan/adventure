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
   * Resolve to Belief in state context
   * @param {import('./state.mjs').State} state
   * @returns {import('./belief.mjs').Belief}
   */
  resolve(state) {
    const belief = state.resolve_subject(this.sid)
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
    const belief = state.resolve_subject(this.sid)
    if (!belief) {
      return {_ref: this.sid, _type: 'Subject'}
    }
    return {_ref: belief._id, _type: 'Belief', label: belief.get_label()}
  }
}
