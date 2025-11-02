/**
 * Centralized registry for all database entities
 *
 * All indexes below are designed for external DB scalability (billions of items).
 * See inline comments on each index for query patterns and scale justification.
 * See .CONTEXT.md for instance-specific indexes (Mind, State classes).
 */

import { reset_id_sequence, next_id } from './id_sequence.mjs'
import { Archetype } from './archetype.mjs'
import { Traittype } from './traittype.mjs'
import { Subject } from './subject.mjs'
import { Belief } from './belief.mjs'
import { log } from '../lib/debug.mjs';

/**
 * @typedef {import('./mind.mjs').Mind} Mind
 * @typedef {import('./state.mjs').State} State
 */

// ============================================================================
// Mind Registries
// ============================================================================

/**
 * Primary key index for minds
 * Query: O(1) lookup by unique ID
 * Maintained by: register_mind()
 * Scale: Essential - enables direct mind access without scanning
 * @type {Map<number, Mind>}
 */
const mind_by_id = new Map()

/**
 * Label-based mind lookup
 * Query: O(1) lookup by human-readable label (e.g., "world", "player", "npc_guard_1")
 * Maintained by: register_mind()
 * Scale: Essential - frequently used for named mind access (world_mind, player_mind, NPCs)
 * @type {Map<string, Mind>}
 */
const mind_by_label = new Map()

// ============================================================================
// State Registries
// ============================================================================

/**
 * Primary key index for states
 * Query: O(1) lookup by unique ID
 * Maintained by: register_state()
 * Scale: Essential - enables direct state access for deserialization and references
 * @type {Map<number, State>}
 */
const state_by_id = new Map()

/**
 * Prototype state templates (currently unused - planned feature)
 * Future use: Share belief lists across many similar nodes (e.g., "generic_room")
 * Query: O(1) lookup by template label
 * Scale: Optimization for memory efficiency with millions of similar states
 * @type {Record<string, object>}
 */
const state_by_label = {}

// ============================================================================
// Belief Registries
// ============================================================================

/**
 * Primary key index for beliefs (individual versions)
 * Query: O(1) lookup by unique belief version ID
 * Maintained by: register_belief_by_id()
 * Scale: Essential - enables direct belief access for references and deserialization
 * @type {Map<number, Belief>}
 */
const belief_by_id = new Map()

/**
 * Subject-based belief index (tracks all versions of same entity)
 * Query: O(1) to get Set<Belief> containing all versions of a subject across time
 * Maintained by: register_belief_by_subject() - populated during belief creation
 * Scale: Essential - enables version queries without scanning all beliefs
 *   Example: Get all versions of "hammer" entity → O(versions) not O(all beliefs)
 * @type {Map<Subject, Set<Belief>>}
 */
const belief_by_subject = new Map()

/**
 * Mind-based belief index (tracks which beliefs belong to which mind)
 * Query: O(1) to get Set<Belief> containing all beliefs in a mind
 * Maintained by: register_belief_by_subject() - populated during belief creation
 * Scale: Essential - enables mind-scoped queries without scanning all beliefs
 *   Example: find_beliefs_about_subject() → O(beliefs in mind) not O(all beliefs)
 *   Without this index, queries would be O(billions) instead of O(thousands)
 * @type {Map<Mind, Set<Belief>>}
 */
const belief_by_mind = new Map()

/**
 * Label-to-SID index (bidirectional mapping, part 1)
 * Query: O(1) label → sid lookup (e.g., "hammer" → 42)
 * Maintained by: register_label() - keeps both directions in sync
 * Scale: Essential - enables label-based queries without scanning subjects
 * @type {Map<string, number>}
 */
const sid_by_label = new Map()

/**
 * SID-to-label index (bidirectional mapping, part 2)
 * Query: O(1) sid → label lookup (e.g., 42 → "hammer")
 * Maintained by: register_label() - keeps both directions in sync
 * Scale: Essential - enables display/serialization without scanning label mappings
 * Note: Both directions needed - not redundant (forward vs reverse lookup)
 * @type {Map<number, string>}
 */
const label_by_sid = new Map()

// ============================================================================
// Subject Registries
// ============================================================================

/**
 * Canonical subject instances by SID
 * Query: O(1) lookup by subject ID
 * Maintained by: get_or_create_subject() - ensures single Subject instance per sid
 * Scale: Essential - guarantees subject identity (prevents duplicate Subject objects)
 *   Critical for === comparisons and Map/Set usage
 * @type {Map<number, Subject>}
 */
const subject_by_sid = new Map()

// ============================================================================
// Reflection (for testing/debugging)
// ============================================================================

/**
 * @internal - For testing and debugging only
 * @returns {object} Internal registry state
 */
export function _reflect() {
  return {
    mind_by_id,
    mind_by_label,
    state_by_id,
    state_by_label,
    belief_by_id,
    belief_by_subject,
    belief_by_mind,
    sid_by_label,
    label_by_sid,
    subject_by_sid,
    archetype_by_label: Archetype._registry,
    traittype_by_label: Traittype._registry
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Register mind in registries
 * @param {Mind} mind - Mind to register
 */
export function register_mind(mind) {
  mind_by_id.set(mind._id, mind)
  if (mind.label) {
    mind_by_label.set(mind.label, mind)
  }
}

/**
 * Get Mind by ID
 * @param {number} id
 * @returns {Mind|undefined}
 */
export function get_mind_by_id(id) {
  return mind_by_id.get(id)
}

/**
 * Get Mind by label
 * @param {string} label
 * @returns {Mind|undefined}
 */
export function get_mind_by_label(label) {
  return mind_by_label.get(label)
}

/**
 * Register belief in belief_by_id registry
 * @param {Belief} belief - Belief to register
 */
export function register_belief_by_id(belief) {
  belief_by_id.set(belief._id, belief)
}

/**
 * Get Belief by ID
 * @param {number} id
 * @returns {Belief|undefined}
 */
export function get_belief(id) {
  return belief_by_id.get(id)
}


/**
 * Get SID by label
 * @param {string} label
 * @returns {number|undefined}
 */
export function get_sid_by_label(label) {
  return sid_by_label.get(label)
}

/**
 * Get label by SID
 * @param {number} sid
 * @returns {string|undefined}
 */
export function get_label_by_sid(sid) {
  return label_by_sid.get(sid)
}

/**
 * Check if label is already registered
 * @param {string} label
 * @returns {boolean}
 */
export function has_label(label) {
  return sid_by_label.has(label)
}

/**
 * Register label-sid mapping (keeps both registries in sync)
 * @param {string} label
 * @param {number} sid
 */
export function register_label(label, sid) {
  sid_by_label.set(label, sid)
  label_by_sid.set(sid, label)
}

/**
 * Get beliefs by subject
 * @param {Subject} subject
 * @returns {Set<Belief>|undefined}
 */
export function get_beliefs_by_subject(subject) {
  return belief_by_subject.get(subject)
}

/**
 * Get beliefs by mind
 * @param {Mind} mind
 * @returns {Set<Belief>|undefined}
 */
export function get_beliefs_by_mind(mind) {
  return belief_by_mind.get(mind)
}

/**
 * Register belief in belief_by_subject and belief_by_mind registries
 * @param {Belief} belief - Belief to register
 */
export function register_belief_by_subject(belief) {
  // Add to belief_by_subject (Set already initialized by get_or_create_subject)
  /** @type {Set<Belief>} */ (belief_by_subject.get(belief.subject)).add(belief)

  // Register by mind (skip for shared beliefs with null mind)
  if (belief.in_mind !== null) {
    if (!belief_by_mind.has(belief.in_mind)) {
      belief_by_mind.set(belief.in_mind, new Set())
    }
    /** @type {Set<Belief>} */ (belief_by_mind.get(belief.in_mind)).add(belief)
  }
}

/**
 * Get or create the canonical Subject for a given SID
 * @param {import('./mind.mjs').Mind|null} ground_mind - Parent mind context (null for global subjects)
 * @param {number|null} [sid] - Subject ID (auto-generated if not provided)
 * @returns {Subject}
 */
export function get_or_create_subject(ground_mind, sid = null) {
  sid ??= next_id()
  if (!subject_by_sid.has(sid)) {
    const subject = new Subject(ground_mind, sid)
    subject_by_sid.set(sid, subject)
    belief_by_subject.set(subject, new Set())
  }
  return /** @type {Subject} */ (subject_by_sid.get(sid))
}

/**
 * Find beliefs in a mind that are about a specific subject
 * NOTE: O(n) iteration over beliefs in mind - candidate for compound index
 * With external DB, would use: SELECT * FROM beliefs WHERE mind_id = ? AND about_subject = ?
 * Compound index: belief_by_mind_and_about: Map<Mind, Map<Subject, Set<Belief>>>
 *
 * @param {Mind} mind - Mind to search in
 * @param {Subject} about_subject - Subject to find beliefs about
 * @param {State} state - State context for resolving @about trait
 * @returns {Array<Belief>} Array of beliefs about the subject (may be empty)
 */
export function find_beliefs_about_subject_in_state(mind, about_subject, state) {
  const mind_beliefs = belief_by_mind.get(mind)
  if (!mind_beliefs) return []

  const results = []
  for (const belief of mind_beliefs) {
    const b_about = belief.get_about(state)
    if (b_about?.subject === about_subject) {
      results.push(belief)
    }
  }
  return results
}

/**
 * Get the belief for a state and subject
 * Returns the belief in state.in_mind where @about points to about_subject
 * @param {State} state - State to search in
 * @param {Subject} about_subject - Subject that the belief is about
 * @returns {Belief|null} The belief about the subject, or null
 */
export function get_belief_for_state_subject(state, about_subject) {
  const results = find_beliefs_about_subject_in_state(state.in_mind, about_subject, state)
  return results.length > 0 ? results[0] : null
}


/**
 * Register state in registries
 * @param {State} state - State to register
 */
export function register_state(state) {
  state_by_id.set(state._id, state)
}

/**
 * Get State by ID
 * @param {number} id
 * @returns {State|undefined}
 */
export function get_state_by_id(id) {
  return state_by_id.get(id)
}

/**
 * Get State by ID (alias for backward compatibility)
 * @param {number} id
 * @returns {State|undefined}
 */
export function get_state(id) {
  return state_by_id.get(id)
}

/**
 * Get Subject by label
 * @param {string} label
 * @returns {Subject|null}
 */
export function get_subject_by_label(label) {
  const sid = sid_by_label.get(label)
  if (sid === undefined) return null
  return subject_by_sid.get(sid) ?? null
}

/**
 * Reset all registries (for testing)
 */
export function reset_all_registries() {
  mind_by_id.clear()
  mind_by_label.clear()
  state_by_id.clear()
  belief_by_id.clear()
  belief_by_subject.clear()
  belief_by_mind.clear()
  sid_by_label.clear()
  label_by_sid.clear()
  subject_by_sid.clear()

  for (const key in state_by_label) delete state_by_label[key]
  Archetype.reset_registry()
  Traittype.reset_registry()
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * @typedef {object} ArchetypeDefinition
 * @property {string[]} [bases] - Base archetype labels
 * @property {Object<string, *>} [traits] - Default trait values
 */

/**
 * @typedef {string|TraitTypeSchema} TraitTypeDefinition
 * Can be either:
 * - Simple string: "Location", "string", "number", "boolean", "State", "Mind"
 * - Complex schema object for arrays/validation
 */

/**
 * @typedef {object} TraitTypeSchema
 * @property {string} type - Base type (e.g., "State", "Location", "string")
 * @property {ArrayConstructor} [container] - Container constructor (e.g., Array)
 * @property {number} [min] - Minimum array length
 * @property {number} [max] - Maximum array length
 * @property {string} [mind] - Mind scope for Subject resolution ('parent', 'current', 'any')
 */

/**
 * Get all trait names that are Mind-typed (including arrays of Minds)
 * @returns {string[]} Array of trait names with Mind data_type
 */
export function get_mind_trait_names() {
  const mind_traits = []
  for (const [label, traittype] of Object.entries(Traittype._registry)) {
    if (traittype.data_type === 'Mind') {
      mind_traits.push(label)
    }
  }
  return mind_traits
}

/**
 * Reset all registries (for testing)
 */
export function reset_registries() {
  reset_all_registries()
  reset_id_sequence()
}

/**
 * Register trait types, archetypes, and prototypes into the database
 * @param {Object<string, string|TraitTypeSchema>} traittypes - Trait type definitions {label: type or schema}
 * @param {Object<string, ArchetypeDefinition>} archetypes - Archetype definitions {label: definition}
 * @param {Object<string, {bases: string[], traits?: Object}>} prototypes - Prototype definitions (timeless shared beliefs)
 */
export function register(traittypes, archetypes, prototypes) {
  // Register trait types first
  for (const [label, def] of Object.entries(traittypes)) {
    const traittype = new Traittype(label, def)
    Traittype.register(label, traittype)
  }

  // Register archetypes second
  for (const [label, def] of Object.entries(archetypes)) {
    if (Archetype.get_by_label(label)) {
      throw new Error(`Label '${label}' is already used by another archetype`)
    }
    if (sid_by_label.has(label)) {
      throw new Error(`Label '${label}' is already used by a belief`)
    }
    const archetype = new Archetype(label, def.bases ?? [], def.traits ?? {})
    Archetype.register(label, archetype)
  }

  // Register prototypes third (timeless shared beliefs)
  for (const [label, def] of Object.entries(prototypes)) {
    // Validate required fields
    if (!def.bases || !Array.isArray(def.bases)) {
      throw new Error(`Prototype '${label}' must have 'bases' array`)
    }

    // Check for label conflicts
    if (Archetype.get_by_label(label)) {
      throw new Error(`Label '${label}' is already used by an archetype`)
    }
    if (sid_by_label.has(label)) {
      throw new Error(`Label '${label}' is already used by another prototype or belief`)
    }

    // Resolve bases from strings to Archetypes or prototype Beliefs
    const resolved_bases = def.bases.map(base_label => {
      // Try archetype first
      const archetype = Archetype.get_by_label(base_label)
      if (archetype) return archetype

      // Try prototype (previously registered shared belief)
      const subject = get_subject_by_label(base_label)
      if (subject) {
        const beliefs = [...subject.beliefs_at_tt(-Infinity)]
        if (beliefs.length === 1) {
          return beliefs[0]
        }
      }

      throw new Error(`Base '${base_label}' not found as archetype or prototype for '${label}'`)
    })

    // Create timeless shared belief (no @tt, origin_state=null, in_mind=null)
    const subject = get_or_create_subject(null)
    const belief = new Belief(null, subject, resolved_bases)

    // Register label first so subsequent prototypes can reference this one
    register_label(label, subject.sid)

    // Add label trait and any additional traits
    belief.add_trait('@label', label)
    if (def.traits) {
      for (const [trait_name, trait_value] of Object.entries(def.traits)) {
        belief.add_trait(trait_name, trait_value)
      }
    }
  }
}
