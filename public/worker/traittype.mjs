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
import { Subject } from './subject.mjs'
import { Mind } from './mind.mjs'
import { State } from './state.mjs'
import { Belief } from './belief.mjs'
import { Fuzzy } from './fuzzy.mjs'
import { deserialize_reference } from './serialize.mjs'
import { register_reset_hook } from './reset.mjs'

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

/**
 * Create handler for literal types (string, number, boolean)
 * @param {string} expected_type
 * @returns {{resolve_trait_value_from_template: Function, validate_value: Function}}
 */
const literal_handler = (expected_type) => ({
  /**
   * @param {Traittype} traittype @param {any} _belief @param {any} data
   * @param _belief
   * @param data
   */
  resolve_trait_value_from_template(traittype, _belief, data) {
    if (data === null) return null
    // Pass through Fuzzy values without validation (uncertainty is always valid)
    if (data instanceof Fuzzy) return data
    // Convert {alternatives: [...]} template syntax to Fuzzy
    if (typeof data === 'object' && data !== null && 'alternatives' in data) {
      return new Fuzzy({ alternatives: data.alternatives })
    }
    if (typeof data !== expected_type) {
      throw new Error(`Expected ${expected_type} for trait '${traittype.label}', got ${typeof data}`)
    }
    if (traittype.values && !traittype.values.includes(data)) {
      throw new Error(`Invalid value '${data}' for trait '${traittype.label}'. Must be one of: ${traittype.values.join(', ')}`)
    }
    return data
  },

  /**
   * Validate that value matches expected literal type
   * @param {Traittype} traittype
   * @param {*} value
   * @throws {Error} If value doesn't match expected type
   */
  validate_value(traittype, value) {
    if (value === null) return  // null always valid (shadowing)

    assert(
      typeof value === expected_type,
      `Expected ${expected_type} for trait '${traittype.label}', got ${typeof value}`,
      {traittype, value, expected_type}
    )

    // Validate enum if specified
    assert(
      !traittype.values || traittype.values.includes(value),
      `Invalid value '${value}' for trait '${traittype.label}'. Must be one of: ${traittype.values?.join(', ')}`,
      {traittype, value, allowed_values: traittype.values}
    )
  }
})

export class Traittype {
  /** @type {Record<string, any>} */
  static type_class_by_name = {
    'Mind': Mind,
    'State': State,
    'Belief': Belief,
    'Subject': Subject,
    'Fuzzy': Fuzzy,
    'string': literal_handler('string'),
    'number': literal_handler('number'),
    'boolean': literal_handler('boolean'),
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

    // Construct template converter once during initialization
    this.resolve_trait_value_from_template = this._build_trait_value_from_template()
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
   * Validate that a subject has the required archetype for this traittype
   * Only validates when data_type is an archetype label
   * @param {Subject} subject - Subject to validate
   * @param {State} state - State context for belief lookup
   * @returns {void}
   * @throws {Error} If subject's belief doesn't have required archetype
   */
  validate_archetype(subject, state) {
    const required_archetype = Archetype.get_by_label(this.data_type)
    if (!required_archetype) return

    const belief = subject.get_belief_by_state(state)
    for (const a of belief.get_archetypes()) {
      if (a === required_archetype) return
    }

    throw new Error(
      `Subject does not have required archetype '${this.data_type}' ` +
      `for trait '${this.label}'`
    )
  }

  /**
   * Validate that value matches this traittype's expected type
   * Delegates to type_class.validate_value()
   * @param {*} value - Value to validate (already resolved, not template)
   * @throws {Error} If value doesn't match expected type
   */
  validate_value(value) {
    // Fuzzy is always valid (represents uncertainty)
    if (value instanceof Fuzzy) return

    // null is always valid (shadowing)
    if (value === null) return

    // Handle arrays
    if (this.container === Array) {
      assert(
        Array.isArray(value),
        `Expected array for trait '${this.label}', got ${typeof value}`,
        {traittype: this, value}
      )

      // Validate constraints
      assert(
        this.constraints?.min == null || value.length >= this.constraints.min,
        `Array for '${this.label}' has length ${value.length}, min is ${this.constraints?.min}`,
        {traittype: this, value, length: value.length, min: this.constraints?.min}
      )
      assert(
        this.constraints?.max == null || value.length <= this.constraints.max,
        `Array for '${this.label}' has length ${value.length}, max is ${this.constraints?.max}`,
        {traittype: this, value, length: value.length, max: this.constraints?.max}
      )

      // Validate each element by delegating to type_class
      for (let i = 0; i < value.length; i++) {
        try {
          this._validate_single_value(value[i])
        } catch (/** @type {any} */ err) {
          throw new Error(`Array element ${i} for trait '${this.label}': ${err.message}`)
        }
      }
      return
    }

    // Single value - delegate to type_class
    this._validate_single_value(value)
  }

  /**
   * Validate single value (not array) by delegating to type_class
   * @param {*} value
   * @throws {Error}
   * @private
   */
  _validate_single_value(value) {
    const type_class = this._get_type_class()

    if (type_class && typeof type_class.validate_value === 'function') {
      type_class.validate_value(this, value)
    }
    // If no validate_value method, allow (backward compatibility for unknown types)
  }

  /**
   * Get type_class for this traittype
   * @returns {any} Type class (Mind, State, literal_handler object, etc.)
   * @private
   */
  _get_type_class() {
    // Check literal types first
    const type_class = Traittype.type_class_by_name[this.data_type]
    if (type_class) return type_class

    // Check if it's an archetype type
    const archetype = Archetype.get_by_label(this.data_type)
    if (archetype) return Archetype

    return null
  }

  /**
   * Check if value is certain (not fuzzy/uncertain)
   * Delegates to type_class.is_certain() if available
   * @param {*} value - Value to check
   * @returns {boolean} True if value is certain (not Fuzzy)
   */
  is_certain(value) {
    if (value instanceof Fuzzy) return false
    const type_class = this._get_type_class()
    if (type_class?.is_certain) {
      return type_class.is_certain(this, value)
    }
    return true  // Default: non-Fuzzy values are certain
  }

  /**
   * Resolve string label to typed value for archetype trait defaults
   * Determines resolution strategy based on traittype's data_type
   * @param {string} label - String label to resolve
   * @param {State} eidos_state - Eidos origin state for prototype lookup
   * @returns {*} Resolved value (Archetype, Subject, or string for literals)
   * @throws {Error} If reference type label cannot be resolved
   */
  resolve_archetype_default(label, eidos_state) {
    // Literal types keep string values (they validate at belief construction time)
    const type_class = Traittype.type_class_by_name[this.data_type]
    if (type_class) return label

    // Try archetype (stored as template marker, resolved during belief creation)
    const archetype = Archetype.get_by_label(label)
    if (archetype) return archetype

    // Try prototype (shared belief in Eidos)
    const subject = Subject.get_by_label(label)
    if (subject) {
      const prototype = subject.get_shared_belief_by_state(eidos_state)
      assert(prototype, `Prototype '${label}' found but has no belief in Eidos origin_state`, {label, trait: this.label})
      return prototype.subject
    }

    throw new Error(
      `Cannot resolve archetype trait default '${this.label}': ` +
      `'${label}' not found in archetypes or prototypes`
    )
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
      return Subject.get_or_create_by_sid(value, belief.in_mind)  // mater = belief's mind
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
    if (belief instanceof Archetype) return undefined // FIXME: generalize
    if (this.composable) {
      const values = belief.collect_latest_value_from_all_bases(this)

      if (values.length < 2) {
        return values[0]
      }

      return this.compose(belief, values)
    }

    return undefined
  }

  /**
   * Build function to convert template data to trait values
   * @returns {Function}
   */
  _build_trait_value_from_template() {
    // Check type_class_by_name at construction time (includes Mind, State, literals)
    const type_class = /** @type {any} */ (Traittype.type_class_by_name[this.data_type])

    let convert
    if (type_class?.resolve_trait_value_from_template) {
      convert = (/** @type {Belief} */ belief, /** @type {any} */ data, /** @type {any} */ opts = {}) =>
        type_class.resolve_trait_value_from_template(this, belief, data, opts)
    } else {
      // Archetype lookup must happen at runtime (archetypes registered after traittypes)
      convert = (/** @type {Belief} */ belief, /** @type {any} */ data) => {
        if (Archetype.get_by_label(this.data_type)) {
          return Archetype.resolve_trait_value_from_template(this, belief, data)
        }
        return data  // passthrough for unknown types
      }
    }

    if (this.container !== Array) {
      return convert
    }

    // Array container: validate then map
    return (/** @type {Belief} */ belief, /** @type {any} */ data) => {
      if (data === null) return null
      if (!Array.isArray(data)) {
        throw new Error(`Expected array for trait '${this.label}', got ${typeof data}`)
      }
      if (this.constraints?.min != null && data.length < this.constraints.min) {
        throw new Error(`Array for trait '${this.label}' has length ${data.length}, min is ${this.constraints.min}`)
      }
      if (this.constraints?.max != null && data.length > this.constraints.max) {
        throw new Error(`Array for trait '${this.label}' has length ${data.length}, max is ${this.constraints.max}`)
      }
      return data.map(v => convert(belief, v))
    }
  }

  /**
   * Serialize trait value for full data dump (deep serialization)
   * Calls toJSON() on objects to get complete structure
   * @param {*} value - Value to serialize
   * @returns {*} Fully serialized value
   */
  static serializeTraitValue(value) {
    // Handle Fuzzy early
    if (value instanceof Fuzzy) return value.toJSON()
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
    // Handle Fuzzy early - delegates to Fuzzy.to_inspect_view
    if (value instanceof Fuzzy) {
      return value.to_inspect_view(state)
    }
    // Handle null/undefined early
    if (value === null || value === undefined) {
      return value
    }
    // Functions should never be trait values - indicates a bug
    if (typeof value === 'function') {
      console.error('to_inspect_view received function as value:', value)
      return '[function - serialization error]'
    }
    if (Array.isArray(value)) {
      return value.map(item => this.to_inspect_view(state, item))
    }
    if (typeof value === 'number' || typeof value === 'string') {
      return value
    }
    // Guard against Traittype instances accidentally being passed as values
    if (value instanceof Traittype) {
      console.error('to_inspect_view received Traittype as value:', value.label)
      return `[Traittype: ${value.label}]`
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
          if (state.ground_state) {
            const ground_belief = state.ground_state.get_belief_by_subject(value) ?? value.get_shared_belief_by_state(state.ground_state)
            resolve_state = ground_belief ? state.ground_state : state
          }
        } else {
          resolve_state = state.ground_state ?? state
        }
      }
      return value.to_inspect_view(resolve_state)
    }
    // Fallback for other objects
    if (value?.toJSON) return value.toJSON()
    // Safety check: if object has any function properties, serialize to JSON string
    // to avoid postMessage errors
    if (typeof value === 'object' && value !== null) {
      for (const v of Object.values(value)) {
        if (typeof v === 'function') {
          console.error('to_inspect_view: object with function property:', value)
          return JSON.stringify(value, (k, v) => typeof v === 'function' ? '[Function]' : v)
        }
      }
    }
    return value
  }

  /**
   * System designation - compact debug string
   * @returns {string}
   */
  sysdesig() {
    const parts = []

    // Always show label
    parts.push(`Traittype '${this.label}'`)

    // Show data type
    parts.push(`type=${this.data_type}`)

    // Show container if present
    if (this.container === Array) {
      parts.push('Array')
    }

    // Show composable flag if true
    if (this.composable) {
      parts.push('composable')
    }

    // Show enum values if present
    if (this.values) {
      parts.push(`values=[${this.values.join(', ')}]`)
    }

    // Show exposure if present
    if (this.exposure) {
      parts.push(`exposure=${this.exposure}`)
    }

    // Show mind scope if present
    if (this.mind_scope) {
      parts.push(`mind=${this.mind_scope}`)
    }

    return parts.join(' ')
  }
}

/**
 * Proxy for concise traittype access by label
 * Usage: T.location instead of Traittype.get_by_label('location')
 * @type {Record<string, Traittype>}
 */
export const T = new Proxy(/** @type {Record<string, Traittype>} */ ({}), {
  get(_, prop) {
    return Traittype.get_by_label(/** @type {string} */ (prop))
  }
})

register_reset_hook(() => Traittype.reset_registry())
