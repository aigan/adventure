/**
 * Notion - Materialized view of what a Mind believes about a subject
 *
 * A Notion is a snapshot of recalled beliefs, combining certainties from
 * multiple sources (trait × belief × state) into a unified view.
 *
 * Used by recall() to answer questions like "where is the black hammer?"
 * NPCs can respond based on what they're certain about and express uncertainty.
 *
 * Trait values in a Notion are one of:
 * - null: Explicitly no value
 * - Concrete value: Single known value (no uncertainty)
 * - Fuzzy: Multiple possibilities with certainties
 */

/**
 * @typedef {import('./subject.mjs').Subject} Subject
 * @typedef {import('./traittype.mjs').Traittype} Traittype
 * @typedef {import('./fuzzy.mjs').Fuzzy} Fuzzy
 * @typedef {import('./state.mjs').State} State
 */

/**
 * Materialized belief view for a subject
 */
export class Notion {
  /** @type {Subject} - What this notion is about */
  subject

  /** @type {Map<Traittype, null|*|Fuzzy>} - Materialized traits */
  traits

  /**
   * @param {Object} params
   * @param {Subject} params.subject - What entity this notion is about
   * @param {Map<Traittype, null|*|Fuzzy>} [params.traits] - Trait values
   */
  constructor({ subject, traits = new Map() }) {
    this.subject = subject
    this.traits = traits
    Object.freeze(this)
  }

  /**
   * Get a trait value
   * @param {Traittype} traittype
   * @returns {null|*|Fuzzy}
   */
  get(traittype) {
    return this.traits.get(traittype) ?? null
  }

  /**
   * Check if notion has a trait
   * @param {Traittype} traittype
   * @returns {boolean}
   */
  has(traittype) {
    return this.traits.has(traittype)
  }

  /**
   * System designation - compact debug string
   * @returns {string}
   */
  sysdesig() {
    const label = this.subject.get_label?.() ?? `#${this.subject.sid}`
    const count = this.traits.size
    return `Notion(${label})[${count}]`
  }

  /**
   * Convert to inspection view
   * @param {State} state
   * @returns {Object}
   */
  to_inspect_view(state) {
    /** @type {Record<string, *>} */
    const traits_obj = {}
    for (const [tt, value] of this.traits) {
      if (value === null) {
        traits_obj[tt.label] = null
      } else if (value?.to_inspect_view) {
        traits_obj[tt.label] = value.to_inspect_view(state)
      } else {
        traits_obj[tt.label] = value
      }
    }
    return {
      _type: 'Notion',
      subject: this.subject.sid,
      traits: traits_obj
    }
  }

  /**
   * Serialize to JSON
   * @returns {{_type: 'Notion', subject: number, traits: Object}}
   */
  toJSON() {
    /** @type {Record<string, *>} */
    const traits_obj = {}
    for (const [tt, value] of this.traits) {
      traits_obj[tt.label] = value?.toJSON?.() ?? value
    }
    return {
      _type: 'Notion',
      subject: this.subject.sid,
      traits: traits_obj
    }
  }
}
