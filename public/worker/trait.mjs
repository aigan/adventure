/**
 * Trait - Reified trait with full context
 *
 * A first-class object representing a trait value along with its context:
 * where it came from (source belief), what it's about (subject), and
 * how certain we are (combined path × belief certainty).
 *
 * Used by recall() to return traits that can be passed around, compared,
 * and presented uniformly regardless of where they originated.
 */

/**
 * @typedef {import('./subject.mjs').Subject} Subject
 * @typedef {import('./traittype.mjs').Traittype} Traittype
 * @typedef {import('./belief.mjs').Belief} Belief
 */

/**
 * Reified trait with subject, type, value, source, and certainty
 */
export class Trait {
  /** @type {Subject} - What entity this trait is about */
  subject

  /** @type {Traittype} - What kind of trait */
  type

  /** @type {*} - The actual value */
  value

  /** @type {Belief} - Where this trait came from */
  source

  /** @type {number} - Combined certainty (0.0-1.0): path_certainty × belief_certainty */
  certainty

  /**
   * @param {Object} params
   * @param {Subject} params.subject - What entity this trait is about
   * @param {Traittype} params.type - What kind of trait
   * @param {*} params.value - The actual value
   * @param {Belief} params.source - Where this trait came from
   * @param {number} [params.certainty=1.0] - Combined certainty (0.0-1.0)
   */
  constructor({subject, type, value, source, certainty = 1.0}) {
    this.subject = subject
    this.type = type
    this.value = value
    this.source = source
    this.certainty = certainty
  }

  /**
   * System designation - compact debug string
   * @returns {string}
   */
  sysdesig() {
    const parts = []

    // Type label
    parts.push(this.type.label)

    // Value representation
    if (this.value === null) {
      parts.push('null')
    } else if (this.value?.sysdesig) {
      parts.push(this.value.sysdesig())
    } else if (typeof this.value === 'string') {
      parts.push(`"${this.value}"`)
    } else {
      parts.push(String(this.value))
    }

    // Subject context (if different from source's subject)
    const subject_label = this.subject.get_label()
    const source_subject_label = this.source?.subject?.get_label()
    if (subject_label && subject_label !== source_subject_label) {
      parts.push(`@${subject_label}`)
    }

    // Certainty (if not certain)
    if (this.certainty < 1.0) {
      parts.push(`(${(this.certainty * 100).toFixed(0)}%)`)
    }

    return parts.join(' ')
  }

  /**
   * Serialize to JSON
   * @returns {{type: string, subject: number, value: *, source: number, certainty: number}}
   */
  toJSON() {
    return {
      type: this.type.label,
      subject: this.subject.sid,
      value: this.value?.toJSON?.() ?? this.value,
      source: this.source._id,
      certainty: this.certainty
    }
  }
}
