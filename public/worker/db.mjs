import { reset_id_sequence } from './id_sequence.mjs'

// Import all classes
import { Archetype } from './archetype.mjs'
import { Traittype, init_traittype_refs } from './traittype.mjs'
import { Mind, init_mind_refs } from './mind.mjs'
import { State, init_state_refs } from './state.mjs'
import { Belief, init_belief_refs } from './belief.mjs'
import { Serialize, init_serialize_refs, save_mind, load } from './serialize.mjs'

// Initialize circular dependencies
init_traittype_refs({ Mind, State, Belief })
init_mind_refs({ Belief, State })
init_state_refs({ Belief, Mind, Serialize })
init_belief_refs({ Traittype, Mind, State })
init_serialize_refs({ Mind, Belief, State })

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * @typedef {object} MindJSON
 * @property {string} _type - Always "Mind"
 * @property {number} _id - Mind identifier
 * @property {string|null} label - Optional label for lookup
 * @property {BeliefJSON[]} belief - All beliefs in this mind
 * @property {StateJSON[]} state - All states in this mind
 * @property {MindJSON[]} [nested_minds] - Nested minds discovered during serialization
 */

/**
 * @typedef {object} StateJSON
 * @property {string} _type - Always "State"
 * @property {number} _id - State identifier
 * @property {number} timestamp - State timestamp/tick
 * @property {number|null} base - Base state _id (null for root states)
 * @property {number|null} ground_state - Ground state _id (null if no external reference)
 * @property {number[]} insert - Belief _ids present in this state
 * @property {number[]} remove - Belief _ids removed in this state
 * @property {number} in_mind - Mind _id this state belongs to
 */

/**
 * @typedef {object} BeliefJSON
 * @property {string} _type - Always "Belief"
 * @property {number} _id - Unique version identifier
 * @property {number} sid - Subject identifier (stable across versions)
 * @property {string|null} label - Optional label for lookup
 * @property {number|null} about - Parent belief _id (null if not about another belief)
 * @property {string[]} archetypes - Archetype labels for this belief
 * @property {(string|number)[]} bases - Base archetype labels or belief _ids
 * @property {Object<string, SerializedTraitValue>} traits - Trait values (sids, primitives, or references)
 */

/**
 * @typedef {number|string|boolean|null|StateReference|MindReference|Array<number|string|boolean|null|StateReference|MindReference>} SerializedTraitValue
 * Trait values in JSON can be:
 * - number (sid or primitive)
 * - string/boolean/null (primitives)
 * - StateReference/MindReference (for State/Mind traits)
 * - Array of any of the above
 */

/**
 * @typedef {object} StateReference
 * @property {string} _type - Always "State"
 * @property {number} _id - State identifier
 */

/**
 * @typedef {object} MindReference
 * @property {string} _type - Always "Mind"
 * @property {number} _id - Mind identifier
 * @property {string|null} label - Mind label
 */

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
 * @property {Function} [container] - Container constructor (e.g., Array)
 * @property {number} [min] - Minimum array length
 * @property {number} [max] - Maximum array length
 */

/**
 * Reset all registries (for testing)
 */
export function reset_registries() {
  Mind.by_id.clear()
  Mind.by_label.clear()
  Belief.by_id.clear()
  Belief.by_label.clear()
  Belief.by_sid.clear()
  Belief.sid_by_label.clear()
  Belief.label_by_sid.clear()
  Archetype.by_label = {}
  Traittype.by_label = {}
  reset_id_sequence()
}

/**
 * Register archetypes and trait types into the database
 * @param {Object<string, ArchetypeDefinition>} archetypes - Archetype definitions {label: definition}
 * @param {Object<string, string|TraitTypeSchema>} traittypes - Trait type definitions {label: type or schema}
 */
export function register( archetypes, traittypes ) {
  for (const [label, def] of Object.entries(traittypes)) {
    //traittypes[label] = def; // TODO: resolve trait datatypes
    Traittype.by_label[label] = new Traittype(label, def)
    //log("Registered traittype", label)
  }

  for (const [label, def] of Object.entries(archetypes)) {
    // Check label uniqueness across beliefs and archetypes
    if (Archetype.by_label[label]) {
      throw new Error(`Label '${label}' is already used by another archetype`)
    }
    if (Belief.by_label.has(label)) {
      throw new Error(`Label '${label}' is already used by a belief`)
    }
    Archetype.by_label[label] = new Archetype(label, def)
    //log("Registred archetype", label)
  }
}

// Re-export all classes and functions
export {
  Archetype,
  Traittype,
  Mind,
  State,
  Belief,
  Serialize,
  save_mind,
  load
}
