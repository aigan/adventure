/**
 * Centralized registry for all database entities
 *
 * All indexes below are designed for external DB scalability (billions of items).
 * See inline comments on each index for query patterns and scale justification.
 * See CLAUDE.md for instance-specific indexes (Mind, State classes).
 */

import { register_reset_hook, reset_registries } from './reset.mjs'
export { reset_registries }
import { Archetype } from './archetype.mjs'
import { Traittype } from './traittype.mjs'
import { Belief } from './belief.mjs'
import { assert } from './debug.mjs';
import { Mind } from './mind.mjs'
import { State } from './state.mjs'
import { eidos } from './eidos.mjs'

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
 * Query: O(1) lookup by human-readable label (e.g., "world", "person1", "person2")
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
 * Mind-based belief index (tracks which beliefs belong to which mind)
 * Query: O(1) to get Set<Belief> containing all beliefs in a mind
 * Maintained by: register_belief_by_mind() - populated during belief creation
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
// Reflection (for testing/debugging)
// ============================================================================

/**
 * @internal
 * @returns {object} Internal registry state
 */
export function _reflect() {
  return {
    mind_by_id,
    mind_by_label,
    state_by_id,
    state_by_label,
    belief_by_id,
    belief_by_mind,
    sid_by_label,
    label_by_sid
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
export function get_belief_by_id(id) {
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
 * Get beliefs by mind
 * @param {Mind} mind
 * @returns {Generator<Belief>} Iterator over beliefs (empty if mind has no beliefs)
 */
export function* get_beliefs_by_mind(mind) {
  const beliefs = belief_by_mind.get(mind)
  if (beliefs) {
    yield* beliefs
  }
}

/**
 * Register belief in mind registry
 * Note: Beliefs register with their subject directly via subject.beliefs.add()
 * @param {Belief} belief - Belief to register
 */
export function register_belief_by_mind(belief) {
  // Register by mind (skip for shared beliefs with null mind)
  if (belief.in_mind !== null) {
    if (!belief_by_mind.has(belief.in_mind)) {
      belief_by_mind.set(belief.in_mind, new Set())
    }
    /** @type {Set<Belief>} */ (belief_by_mind.get(belief.in_mind)).add(belief)
  }
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
 * Reset db.mjs internal registries
 */
function reset_db_registries() {
  mind_by_id.clear()
  mind_by_label.clear()
  state_by_id.clear()
  belief_by_id.clear()
  belief_by_mind.clear()
  sid_by_label.clear()
  label_by_sid.clear()
  for (const key in state_by_label) delete state_by_label[key]
}

register_reset_hook(reset_db_registries)

// ============================================================================
// Database Operations
// ============================================================================

/**
 * @typedef {object} ArchetypeDefinition
 * @property {string[]} [bases] - Base archetype labels
 * @property {Object<string, *>} [traits] - Default trait values (use @ prefix for meta-traits)
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
 * @property {boolean} [composable] - Whether to compose values from multiple bases (default: false)
 * @property {string[]} [values] - Allowed values for enum validation (e.g., ['solid', 'liquid', 'vapor'])
 * @property {string} [exposure] - Observation modality required to perceive this trait (e.g., 'visual', 'tactile', 'spatial', 'internal')
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
 * Register trait types, archetypes, and prototypes into the database
 * @param {Object<string, string|TraitTypeSchema>} traittypes - Trait type definitions {label: type or schema}
 * @param {Object<string, ArchetypeDefinition>} archetypes - Archetype definitions {label: definition}
 * @param {Object<string, {bases: string[], traits?: Object}>} prototypes - Prototype definitions (timeless shared beliefs)
 */
export function register(traittypes, archetypes, prototypes = {}) {
  // Register trait types first
  for (const [label, def] of Object.entries(traittypes)) {
    const traittype = new Traittype(label, def)
    Traittype.register(label, traittype)
  }

  // Register archetypes second
  for (const [label, def] of Object.entries(archetypes)) {
    assert(!Archetype.get_by_label(label), `Duplicate archetype '${label}'`, {label})
    const archetype = new Archetype(label, def.bases ?? [], def.traits ?? {})
    Archetype.register(label, archetype)
  }

  // Register prototypes third (shared beliefs in Eidos)
  const eidos_mind = eidos()
  assert(eidos_mind.origin_state instanceof State, 'Eidos origin_state must be State', {eidos_mind})

  for (const [label, def] of Object.entries(prototypes)) {
    // Validate required fields
    assert(def.bases && Array.isArray(def.bases), `Prototype '${label}' must have 'bases' array`, {label, def})

    // Create prototype in Eidos origin_state
    const prototype = eidos_mind.origin_state.add_belief_from_template({
      bases: def.bases,
      traits: def.traits || {},
      label
    })
    // Lock prototypes (must be immutable before use as bases)
    prototype.lock(eidos_mind.origin_state)
  }
}
