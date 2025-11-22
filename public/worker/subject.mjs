import * as DB from './db.mjs'
import { eidos, logos } from './cosmos.mjs'
import { Belief } from './belief.mjs'
import { Archetype } from './archetype.mjs'
import { assert, log } from './debug.mjs'
import { next_id } from './id_sequence.mjs'

/**
 * @typedef {import('./state.mjs').State} State
 * @typedef {import('./mind.mjs').Mind} Mind
 */

/**
 * Canonical identity reference for a belief subject
 * Wraps a stable sid that persists across belief versions
 */
export class Subject {
  /**
   * @param {Mind|null} ground_mind - Parent mind context (null for truly global subjects like archetypes)
   * @param {number|null} [sid] - Subject identifier (auto-generated if not provided)
   */
  constructor(ground_mind, sid = null) {
    this.ground_mind = ground_mind
    this.sid = sid ?? next_id()
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
   * Get shared belief (prototype) for this Subject at state's tt
   * Only returns shared beliefs (is_shared === true)
   * @param {State} state
   * @returns {Belief|null}
   */
  get_shared_belief_by_state(state) {
    const query_parent = state.in_mind.parent
    // For timeless states (tt=null), get all beliefs; otherwise filter by tt
    const beliefs = state.tt != null ? [...this.beliefs_at_tt(state.tt)] : [...DB.get_beliefs_by_subject(this)]

    const shared = beliefs.filter(b => {
      if (!b.is_shared) return false

      // Check ground_mind scoping
      const belief_ground_mind = b.subject.ground_mind

      // Global: ground_mind is null or logos
      if (belief_ground_mind === null || belief_ground_mind === logos()) return true

      // Scoped: accessible if ground_mind matches query's parent
      return belief_ground_mind === query_parent
    })

    assert(shared.length <= 1,
      'Multiple shared beliefs found for subject at tt',
      {sid: this.sid, tt: state.tt, parent: query_parent?._id})

    return shared[0] ?? null
  }

  /**
   * Serialize for JSON (backward compatible - returns sid)
   * @returns {number}
   */
  toJSON() {
    return this.sid
  }

  /**
   * System designation - compact debug string
   * @returns {string}
   */
  sysdesig() {
    const parts = []

    const label = this.get_label()
    if (label) {
      parts.push(label)
    }

    parts.push(`Subject sid=${this.sid}`)

    if (this.ground_mind) {
      const mind_label = this.ground_mind.label || `Mind#${this.ground_mind._id}`
      parts.push(`@${mind_label}`)
    } else {
      parts.push('@global')
    }

    return parts.join(' ')
  }

  /**
   * Get label for this subject (sid)
   * @returns {string|null}
   */
  get_label() {
    return DB.get_label_by_sid(this.sid) ?? null
  }

  /**
   * Set label for this subject (sid)
   * @param {string} label
   */
  set_label(label) {
    const existing_label = this.get_label()
    if (existing_label == label) return

    assert(existing_label === null, `Subject sid ${this.sid} already has label '${existing_label}'`, {sid: this.sid, existing_label, new_label: label})

    assert(!DB.has_label(label), `Label '${label}' is already used by another belief`, {label})
    assert(!Archetype.get_by_label(label), `Label '${label}' is already used by an archetype`, {label})

    DB.register_label(label, this.sid)
  }

  /**
   * Shallow inspection view for the inspect UI
   * Resolves subject to belief in the given state context
   * @param {State} state - State where this subject should be resolved
   * @returns {{_ref: number, _type: string, label: string|null, mind_id: number|null, mind_label: string|null, about_label?: string|null}} Belief reference with optional about label for knowledge beliefs
   */
  to_inspect_view(state) {
    // Try to find belief in state
    let belief = state.get_belief_by_subject(this)

    // If not found in state, try shared beliefs (prototypes)
    if (!belief) {
      belief = this.get_shared_belief_by_state(state)
    }

    assert(belief instanceof Belief, 'Subject must have belief in state or shared beliefs', {sid: this.sid, state_id: state._id, mind: state.in_mind.label})

    const result = /** @type {{_ref: number, _type: string, label: string|null, mind_id: number|null, mind_label: string|null, about_label?: string|null}} */ ({
      _ref: belief._id,
      _type: 'Belief',
      label: belief.get_label(),
      mind_id: belief.in_mind?._id ?? null,
      mind_label: belief.in_mind?.label ?? null
    })

    // Add "about" info if this is knowledge about something
    // For cross-mind beliefs, use the belief's own state context to resolve @about
    const belief_state = belief.origin_state ?? state
    const about_belief = belief.get_about(belief_state)
    if (about_belief) {
      result.about_label = about_belief.get_label()
    }

    return result
  }

  /**
   * Get all beliefs for this subject that exist at a specific tt
   * Yields the outermost belief on each branch at or before the given tt
   * (beliefs that have no descendants also at or before the tt)
   *
   * Note: Timeless shared beliefs have get_tt() === -Infinity, so they're always included
   *
   * TODO: Refactor to walk tree from starting belief instead of scanning all versions
   * Current: O(n²) over all belief versions - doesn't scale to millions of versions per subject
   * Future approach: Walk from branch tips or given starting belief
   * Future: Event saving with time/space-based archival for billions of belief versions
   * @param {number} tt - Transaction time to query at
   * @yields {Belief} Outermost beliefs on each branch at tt
   */
  *beliefs_at_tt(tt) {
    // Get all beliefs with tt <= target
    const valid_beliefs = [...DB.get_beliefs_by_subject(this)].filter(b => b.get_tt() <= tt)

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

  /**
   * Internal helper: Lookup belief from template data
   * Shared by Subject.resolve_trait_value_from_template and Archetype.resolve_trait_value_from_template
   * Note: Underscore prefix indicates internal use, but intentionally accessible by Archetype
   * @param {*} traittype - Traittype instance
   * @param {*} belief - Belief being constructed
   * @param {*} data - Raw template data
   * @returns {{belief: Belief|null, subject: Subject|*}} Lookup result
   * @internal
   */
  static _lookup_belief_from_template(traittype, belief, data) {
    // String input: lookup belief by label
    if (typeof data === 'string') {
      // First try local state
      let found_belief = belief.origin_state.get_belief_by_label(data)

      // If not found, try shared beliefs (prototypes in Eidos)
      if (found_belief == null) {
        const subject = DB.get_subject_by_label(data)
        found_belief = subject?.get_shared_belief_by_state(belief.origin_state)
      }

      assert(found_belief, `Belief not found for trait '${traittype.label}': ${data}`)

      return { belief: found_belief, subject: found_belief.subject }
    }

    // Belief input: reject - this is a programming error
    assert(
      !(data?.subject && typeof data.get_archetypes === 'function'),
      `Template data for trait '${traittype.label}' should use belief labels (strings) or Subject objects, not Belief objects`,
      { trait: traittype.label, data_type: typeof data }
    )

    // Subject or other: pass through (no belief lookup needed)
    return { belief: null, subject: data }
  }

  /**
   * Resolve trait value from template data for generic Subject references
   * Accepts any archetype (no validation)
   * @param {*} traittype - Traittype instance (for accessing label, constraints)
   * @param {*} belief - Belief being constructed (provides origin_state for lookup)
   * @param {*} data - Raw template data (string label, Subject, or invalid Belief)
   * @returns {*} Resolved Subject
   */
  static resolve_trait_value_from_template(traittype, belief, data) {
    if (data === null) return null  // Allow explicit null to block composition
    const { subject } = Subject._lookup_belief_from_template(traittype, belief, data)
    return subject
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
