/**
 * Traittype - type system for belief traits
 *
 * Defines what type each trait is (string, number, belief reference, etc.)
 * and handles validation/resolution. This ensures data integrity across the system.
 *
 * Key concepts:
 * - Type validation: Ensures traits have correct types
 * - Reference resolution: Converts IDs to actual Belief/Mind/State objects
 * - Container types: Arrays, Sets, Maps of typed values
 *
 * Supported types:
 * - Primitives: string, number, boolean
 * - References: Belief refs (e.g., 'Location'), Mind refs, State refs
 * - Containers: Arrays/Sets/Maps containing any of the above
 *
 * Example:
 *   location: 'Location'  // Must be a belief with Location archetype
 *   descriptors: { type: 'string', container: Array }  // Array of strings
 *
 * See docs/SPECIFICATION.md for type system
 * See world.mjs for traittype definitions
 */

import { assert } from './debug.mjs'
import { Archetype } from './archetype.mjs'
import * as DB from './db.mjs'
import * as Cosmos from './cosmos.mjs'
import { Subject } from './subject.mjs'
import { Mind } from './mind.mjs'
import { State } from './state.mjs'
import { Belief } from './belief.mjs'
import { deserialize_reference } from './serialize.mjs'

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
 * @property {string} [mind] - Mind scope for Subject resolution ('parent', 'current', 'any')
 * @property {boolean} [composable] - Whether to compose values from multiple bases (default: false)
 * @property {string[]} [values] - Allowed values for enum validation (e.g., ['solid', 'liquid', 'vapor'])
 * @property {string} [exposure] - Observation modality required to perceive this trait (e.g., 'visual', 'tactile', 'spatial', 'internal')
 */

/**
 * Trait type definition with validation and resolution
 * @property {string} label - Trait type identifier
 * @property {string} data_type - Base type (e.g., 'State', 'Location', 'string')
 * @property {Function|null} container - Container constructor (e.g., Array) or null
 * @property {object|null} constraints - Validation constraints (min, max)
 */

export class Traittype {
  /** @type {Record<string, NumberConstructor|StringConstructor|BooleanConstructor>} */
  static literal_type_map = {
    'number': Number,
    'string': String,
    'boolean': Boolean,
  }

  /** @type {Record<string, Function>} */
  static type_class_by_name = {
    'Mind': Mind,
    'State': State,
    'Belief': Belief,
    'Subject': Subject
  }

  /**
   * Static registry: trait type definitions by label
   * Query: O(1) lookup by label (e.g., "@label", "@about", "location")
   * Maintained by: register() - called during world setup
   * Scale: Small, bounded - typically dozens to hundreds of trait types, not billions
   *   Trait types define property schemas, not property instances
   *   Plain object (not Map) acceptable due to small size and static nature
   * @type {Record<string, Traittype>}
   */
  static _registry = {}

  /**
   * Get traittype by label
   * @param {string} label
   * @returns {Traittype|undefined}
   */
  static get_by_label(label) {
    return Traittype._registry[label]
  }

  /**
   * Register traittype in registry
   * @param {string} label
   * @param {Traittype} traittype
   */
  static register(label, traittype) {
    Traittype._registry[label] = traittype
  }

  /**
   * Clear registry (for testing)
   */
  static reset_registry() {
    for (const key in Traittype._registry) {
      delete Traittype._registry[key]
    }
  }

  /**
   * Resolve trait value from template data
   * NOTE: This method is constructed during initialization.
   * For type classes (Mind, State, etc.), delegates to Class.resolve_trait_value_from_template().
   * For other types, uses a compiled resolver built from metadata.
   * @param {Belief} belief - Belief being constructed
   * @param {*} data - Raw data to resolve
   * @returns {*}
   */
  // resolve_trait_value_from_template - assigned in constructor

  /**
   * @param {string} label
   * @param {string|TraitTypeSchema} def
   */
  constructor(label, def) {
    this.label = label

    // Parse definition
    if (typeof def === 'string') {
      // Simple type: 'State', 'Location', 'string', etc
      this.data_type = def
      this.container = null
      this.constraints = null
      this.mind_scope = null
      this.composable = false
      this.values = null
      this.exposure = null
    } else {
      // Object schema: {type: 'State', container: Array, min: 1, mind: 'parent', composable: true, values: ['a', 'b'], exposure: 'visual'}
      this.data_type = def.type
      this.container = def.container ?? null
      this.mind_scope = def.mind ?? null
      this.composable = def.composable ?? false
      this.values = def.values ?? null
      this.exposure = def.exposure ?? null
      this.constraints = {
        min: def.min ?? null,
        max: def.max ?? null
      }
    }

    // Construct template resolver once during initialization
    // This method is built once here and reused for all template resolutions
    this.resolve_trait_value_from_template = this._build_trait_value_from_template_resolver()
  }

  /**
   * Determine if this trait type stores Subject references (for reverse indexing)
   * True for 'Subject' type and all archetype types (Location, Actor, etc.)
   * Getter allows runtime archetype lookup (archetypes registered after traittypes)
   * @returns {boolean}
   */
  get is_subject_reference() {
    return this.data_type === 'Subject' || !!Archetype.get_by_label(this.data_type)
  }

  /**
   * Deserialize trait value from JSON (handles all JSON value types)
   * Called during JSON deserialization only
   * @param {Belief} belief - Belief being deserialized (for context)
   * @param {*} value - JSON value (array, object reference, number sid, or primitive)
   * @param {object} [options] - Optional parameters
   * @returns {*} Deserialized value
   */
  deserialize_value(belief, value, options = {}) {
    // Handle arrays recursively
    if (Array.isArray(value)) {
      return value.map(item => this.deserialize_value(belief, item, options))
    }

    // Handle object references ({_type, _id} format) - delegate to Serialize
    if (value && typeof value === 'object' && value._type) {
      return deserialize_reference(value)
    }

    // Handle number sids - convert to Subjects for reference types
    if (typeof value === 'number' && this.is_subject_reference) {
      return DB.get_or_create_subject(belief.in_mind.parent, value)
    }

    // Primitives and literal numbers
    return value
  }

  /**
   * Compose multiple values from bases into a single value
   * Delegates to type_class.compose() if available (e.g., Mind.compose())
   * Falls back to Array deduplication logic for Array containers
   * @param {Belief} belief - Belief context for composition
   * @param {Array<any>} values - Values to compose
   * @param {object} options - Optional parameters
   * @returns {any} Composed value
   */
  compose(belief, values, options = {}) {
    // Delegate to type_class if it has a compose method (Mind, etc.)
    const type_class = /** @type {any} */ (Traittype.type_class_by_name[this.data_type] ?? null)
    if (type_class?.compose) {
      return type_class.compose(this, belief, values, options)
    }

    // Fallback: Array container logic
    if (this.container === Array) {
      // Deduplicate by Subject reference, maintain breadth-first order
      const seen = new Set()
      const result = []

      for (const array of values) {
        if (!Array.isArray(array)) continue

        for (const subject of array) {
          // Skip if not a Subject or already seen
          if (!subject || seen.has(subject)) continue

          seen.add(subject)
          result.push(subject)
        }
      }

      return result
    }

    // No compose method available
    throw new Error(`compose() not implemented for type ${this.data_type}`)
  }

  /**
   * Get derived trait value from bases (delegates to type-specific derivation logic)
   * @param {Belief} belief - Belief to derive value for
   * @returns {*} Derived value or undefined if no derivation needed
   */
  get_derived_value(belief) {
    if (this.composable) {
      const values = belief.collect_latest_value_from_all_bases(this.label)

      if (values.length < 2) {
        return values[0] ?? null
      }

      return this.compose(belief, values)
    }

    return undefined
  }

  /**
   * Build resolver function for converting template data to trait values
   * Handles type class delegation and container/constraint resolution
   * @returns {Function}
   */
  _build_trait_value_from_template_resolver() {
    // Build single-item resolver based on data_type
    let item_resolver;

    // Type class (Mind, State, Belief, Subject)
    const type_class = /** @type {any} */ (Traittype.type_class_by_name[this.data_type] ?? null)
    if (type_class?.resolve_trait_value_from_template) {
      item_resolver = (/** @type {Belief} */ belief, /** @type {any} */ data, /** @type {any} */ options = {}) =>
        type_class.resolve_trait_value_from_template(this, belief, data, options)
    }
    // Literal type (string, number, boolean) with optional enum validation
    else if (Traittype.literal_type_map[this.data_type]) {
      const expected_type = this.data_type
      const allowed_values = this.values  // Capture in closure for enum validation
      item_resolver = (/** @type {Belief} */ belief, /** @type {any} */ data) => {
        if (typeof data !== expected_type) {
          throw new Error(`Expected ${expected_type} for trait '${this.label}', got ${typeof data}`)
        }

        // Enum validation if values are specified
        if (allowed_values && !allowed_values.includes(data)) {
          throw new Error(`Invalid value '${data}' for trait '${this.label}'. Must be one of: ${allowed_values.join(', ')}`)
        }

        return data
      }
    }
    // Archetype or other - check archetype at runtime (lightweight map lookup)
    else {
      item_resolver = (/** @type {Belief} */ belief, /** @type {any} */ data) => {
        // Runtime archetype lookup (handles registration order and late additions)
        const archetype = Archetype.get_by_label(this.data_type)
        if (archetype) {
          return Archetype.resolve_trait_value_from_template(this, belief, data)
        }
        // Fallback for unrecognized types - pass through as-is
        // Caller is responsible for passing correct type
        return data
      }
    }

    // Wrap in array container handler if needed
    if (this.container === Array) {
      return (/** @type {Belief} */ belief, /** @type {any} */ data) => {
        // Allow null to explicitly clear inherited array values
        if (data === null) {
          return null
        }

        if (!Array.isArray(data)) {
          throw new Error(`Expected array for trait '${this.label}', got ${typeof data}`)
        }

        if (this.constraints?.min != null && data.length < this.constraints.min) {
          throw new Error(`Array for trait '${this.label}' has length ${data.length}, min is ${this.constraints.min}`)
        }

        if (this.constraints?.max != null && data.length > this.constraints.max) {
          throw new Error(`Array for trait '${this.label}' has length ${data.length}, max is ${this.constraints.max}`)
        }

        // Resolve each item using the item resolver
        return data.map(item => item_resolver(belief, item))
      }
    }

    // No container - return single item resolver
    return item_resolver
  }

  /**
   * Serialize trait value for full data dump (deep serialization)
   * Calls toJSON() on objects to get complete structure
   * @param {*} value - Value to serialize
   * @returns {*} Fully serialized value
   */
  static serializeTraitValue(value) {
    if (Array.isArray(value)) {
      return value.map(item => Traittype.serializeTraitValue(item))
    }
    if (value?.toJSON) return value.toJSON()
    return value
  }

  /**
   * Convert trait value to inspect view using this traittype's mind_scope
   * @param {State} state - State context for resolving sids
   * @param {*} value - Value to convert
   * @returns {*} Shallow representation with references
   */
  to_inspect_view(state, value) {
    assert(state instanceof State, "should be State", state, value);
    if (Array.isArray(value)) {
      return value.map(item => this.to_inspect_view(state, item))
    }
    if (typeof value === 'number' || typeof value === 'string') {
      return value
    }
    // If it's a registered class (Mind, State, Belief, Subject), call to_inspect_view
    if (typeof value?.to_inspect_view === 'function') {
      // Determine which state to resolve in based on mind_scope
      let resolve_state = state
      if (this.mind_scope === 'parent') {
        // Check about_state first (for prototypes referencing world beliefs)
        if (state.about_state) {
          resolve_state = state.about_state
        } else if (value instanceof Subject) {
          // For Subjects, try ground_state first, fall back to current state
          const ground_belief = state.ground_state?.get_belief_by_subject(value) ?? value.get_shared_belief_by_state(state.ground_state)
          resolve_state = ground_belief ? state.ground_state : state
        } else {
          resolve_state = state.ground_state
        }
      }
      return value.to_inspect_view(resolve_state)
    }
    // Fallback for other objects
    if (value?.toJSON) return value.toJSON()
    return value
  }
}
