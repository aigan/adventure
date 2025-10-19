/**
 * Typed reference to a belief subject
 * Wraps a sid with archetype type information
 */
export class Subject {
  /**
   * @param {number} sid - Subject identifier
   * @param {string} archetype_label - Expected archetype type
   */
  constructor(sid, archetype_label) {
    this.sid = sid
    this.archetype = archetype_label
  }

  /**
   * Resolve to Belief in state context
   * @param {import('./state.mjs').State} state
   * @returns {import('./belief.mjs').Belief}
   */
  resolve(state) {
    const belief = state.resolve_subject(this.sid)
    if (!belief) {
      throw new Error(`Cannot resolve Subject with sid ${this.sid} (expected archetype: ${this.archetype})`)
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
      return {_ref: this.sid, _type: 'Subject', archetype: this.archetype}
    }
    return {_ref: belief._id, _type: 'Belief', label: belief.get_label()}
  }
}
