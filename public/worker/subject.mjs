import * as DB from './db.mjs'
import { eidos } from './cosmos.mjs'
import { Belief } from './belief.mjs'
import { Archetype } from './archetype.mjs'
import { assert, log } from '../lib/debug.mjs'
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
   * @param {Mind} ground_mind - Parent mind context (null for truly global subjects like archetypes)
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
    const shared = beliefs.filter(
      b => {
        if (!b.is_shared) return false

        // FIXME: simplify

        // Check ground_mind scoping
        // Eidos beliefs with ground_mind=logos are globally accessible
        // Eidos beliefs with specific ground_mind are scoped to that hierarchy
        if (b.in_mind === eidos()) {
          const belief_ground_mind = b.subject.ground_mind
          // Global if ground_mind is null or logos
          if (belief_ground_mind === null || belief_ground_mind?.label === 'logos') return true
          // Scoped: only accessible if query_parent matches
          return belief_ground_mind === query_parent
        }

        // Legacy: Global or matching parent
        return b.subject.ground_mind === null || b.subject.ground_mind === query_parent
      }
    )

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
   * @returns {object} Belief reference
   */
  to_inspect_view(state) {
    const belief = state.get_belief_by_subject(this)

    assert(belief instanceof Belief, 'Subject must have belief in inspection state', {sid: this.sid, state_id: state._id, mind: state.in_mind.label})

    return {
      _ref: belief._id,
      _type: 'Belief',
      label: belief.get_label(),
      mind_id: belief.in_mind?._id ?? null,
      mind_label: belief.in_mind?.label ?? null
    }
  }

  /**
   * Get all beliefs for this subject that exist at a specific tt
   * Yields the outermost belief on each branch at or before the given tt
   * (beliefs that have no descendants also at or before the tt)
   *
   * Note: Shared beliefs without @tt have get_tt() === -Infinity, so they're always included
   *
   * TODO: Refactor to walk tree from starting belief instead of scanning all versions
   * Current: O(n²) over all belief versions - doesn't scale to millions of versions per subject
   * Future approach: Walk from branch tips or given starting belief
   * Future: Event saving with time/space-based archival for billions of belief versions
   *
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
