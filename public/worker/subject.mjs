import * as DB from './db.mjs'
import { Belief } from './belief.mjs'
import { Archetype } from './archetype.mjs'
import { assert } from './debug.mjs'
import { next_id } from './id_sequence.mjs'
import { register_reset_hook } from './reset.mjs'

/**
 * @typedef {import('./state.mjs').State} State
 * @typedef {import('./mind.mjs').Mind} Mind
 * @typedef {import('./traittype.mjs').Traittype} Traittype
 */

/**
 * Canonical identity reference for a belief subject
 * Wraps a stable sid that persists across belief versions
 *
 * Subject scoping via mater property:
 *
 * **mater**: The mind that birthed this particular instance (Latin: mother/matter)
 * - Universals (Eidos): null (eternal forms, unborn)
 * - Particulars (Materia): the mind where instantiated (world, NPC, etc.)
 * - Used for: Access control - beliefs can only use subjects where mater=null OR mater=belief.in_mind
 * - Used for: Debug output (sysdesig shows @mater when set)
 *
 * Example usage:
 * - Universal prototype (GenericHammer in Eidos): mater=null
 * - World entity (tavern in world): mater=world
 * - NPC private belief (memory in npc): mater=npc_mind
 */
export class Subject {
  /**
   * Static registry of all subjects by SID
   * Ensures single Subject instance per sid (critical for === comparisons)
   * @type {Map<number, Subject>}
   */
  static _registry = new Map()

  /**
   * @param {number|null} [sid] - Subject identifier (auto-generated if not provided)
   * @param {Mind|null} [mater] - Mind where this particular is instantiated (null for universals)
   */
  constructor(sid = null, mater = null) {
    this.sid = sid ?? next_id()
    this.mater = mater

    /** @type {Set<Belief>} All beliefs with this subject across time */
    this.beliefs = new Set()

    // Auto-register in static registry
    Subject._registry.set(this.sid, this)
  }

  /**
   * Get Subject by sid from registry
   * @param {number} sid
   * @returns {Subject|null}
   */
  static get_by_sid(sid) {
    return Subject._registry.get(sid) ?? null
  }

  /**
   * Get or create subject with specific sid
   * Ensures subject exists in registry with given sid and mater scope
   * Used for deserialization and cross-references where sid is known
   * @param {number} sid - Subject identifier (required)
   * @param {Mind|null} [mater] - Mind scope (null for universal)
   * @returns {Subject}
   */
  static get_or_create_by_sid(sid, mater = null) {
    assert(typeof sid === 'number', 'sid must be a number', {sid, type: typeof sid})
    return Subject._registry.get(sid) ?? new Subject(sid, mater)
  }

  /**
   * Get Subject by label
   * @param {string} label
   * @returns {Subject|null}
   */
  static get_by_label(label) {
    const sid = DB.get_sid_by_label(label)
    if (sid === undefined) return null
    return Subject.get_by_sid(sid)
  }

  /**
   * Get all beliefs for a subject across time
   * @param {Subject} subject
   * @yields {Belief}
   */
  static *get_beliefs_by_subject(subject) {
    yield* subject.beliefs
  }

  /**
   * Get Belief for this Subject in state context
   * Tries state first, falls back to shared belief (prototype)
   * @param {State} state
   * @returns {Belief}
   */
  get_belief_by_state(state) {
    // Try current state first
    let belief = state.get_belief_by_subject(this)

    // Fall back to shared belief (prototype) if not found in state
    if (!belief) {
      belief = this.get_shared_belief_by_state(state)
    }

    if (!belief) {
      throw new Error(`Subject must have belief in state or shared beliefs (sid ${this.sid})`)
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
    // For timeless states (tt=null), get all beliefs; otherwise filter by tt
    const beliefs = state.tt != null ? [...this.beliefs_at_tt(state.tt)] : [...Subject.get_beliefs_by_subject(this)]

    // Shared beliefs are universals (mater=null) that can be used by any belief
    const shared = beliefs.filter(b => {
      if (!b.is_shared) return false
      // Universal subjects (mater=null) are accessible from any state
      return b.subject.mater === null
    })

    assert(shared.length <= 1,
      'Multiple shared beliefs found for subject at tt',
      {sid: this.sid, tt: state.tt})

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

    if (this.mater) {
      const mind_label = this.mater.label || `Mind#${this.mater._id}`
      parts.push(`@${mind_label}`)
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
    // get_belief_by_state() tries state first, then falls back to shared belief (prototype)
    const belief = this.get_belief_by_state(state)

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
   * Optimized: O(n × depth) via ancestor-set approach instead of O(n²) pairwise checks
   * Future approach: Walk from branch tips or given starting belief
   * Future: Event saving with time/space-based archival for billions of belief versions
   * @param {number} tt - Transaction time to query at
   * @yields {Belief} Outermost beliefs on each branch at tt
   */
  *beliefs_at_tt(tt) {
    // Get all beliefs with tt <= target
    const valid = [...this.beliefs].filter(b => b.get_tt() <= tt)
    const valid_set = new Set(valid)

    // Build set of ancestors that are also in valid set (these are "shadowed")
    // O(n × depth) instead of O(n²)
    const shadowed = new Set()
    for (const belief of valid) {
      // Walk all bases (BFS) - beliefs can have multiple inheritance
      const queue = [...belief._bases]
      const seen = new Set()
      while (queue.length > 0) {
        const base = queue.shift()
        if (!(base instanceof Belief)) continue  // Skip archetypes
        if (seen.has(base)) continue
        seen.add(base)
        if (valid_set.has(base)) shadowed.add(base)
        queue.push(...base._bases)
      }
    }

    // Yield beliefs that aren't shadowed (branch tips)
    for (const belief of valid) {
      if (!shadowed.has(belief)) yield belief
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
      const subject = Subject.get_by_label(data)
      assert(subject, `Belief not found for trait '${traittype.label}': ${data}`)

      // get_belief_by_state() tries state first, then falls back to shared belief (prototype)
      const found_belief = subject.get_belief_by_state(belief.origin_state)

      return { belief: found_belief, subject: subject }
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

  /**
   * Validate that value is a Subject instance
   * @param {Traittype} traittype
   * @param {*} value
   * @throws {Error} If value is not a Subject instance
   */
  static validate_value(traittype, value) {
    if (value === null) return

    assert(
      value instanceof Subject,
      `Expected Subject instance for trait '${traittype.label}', got ${value?.constructor?.name || typeof value}`,
      {traittype, value, value_type: value?.constructor?.name || typeof value}
    )
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

/**
 * Reset subject registry
 */
function reset_subject_registry() {
  Subject._registry.clear()
}

register_reset_hook(reset_subject_registry)
