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

import { Archetype } from './archetype.mjs'
import * as DB from './db.mjs'
import * as Cosmos from './cosmos.mjs'
import { Subject } from './subject.mjs'
import { Mind } from './mind.mjs'
import { State } from './state.mjs'
import { Belief } from './belief.mjs'

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
    } else {
      // Object schema: {type: 'State', container: Array, min: 1, mind: 'parent'}
      this.data_type = def.type
      this.container = def.container ?? null
      this.mind_scope = def.mind ?? null
      this.constraints = {
        min: def.min ?? null,
        max: def.max ?? null
      }
    }

    // Build resolver function once during construction
    this._resolver = this._build_resolver()
  }

  /**
   * Build the resolver function based on container type
   * @returns {Function}
   */
  _build_resolver() {
    if (this.container === Array) {
      return (/** @type {any} */ mind, /** @type {any} */ data) => {
        if (!Array.isArray(data)) {
          throw new Error(`Expected array for trait '${this.label}', got ${typeof data}`)
        }

        if (this.constraints?.min != null && data.length < this.constraints.min) {
          throw new Error(`Array for trait '${this.label}' has length ${data.length}, min is ${this.constraints.min}`)
        }

        if (this.constraints?.max != null && data.length > this.constraints.max) {
          throw new Error(`Array for trait '${this.label}' has length ${data.length}, max is ${this.constraints.max}`)
        }

        // Resolve each item
        return data.map(item => this._resolve_item(mind, item))
      }
    } else {
      // No container - single value
      return (/** @type {any} */ mind, /** @type {any} */ data) => this._resolve_item(mind, data)
    }
  }

  /**
   * Resolve a single item (not an array)
   * @param {any} mind
   * @param {*} data
   * @returns {*}
   */
  _resolve_item(mind, data) {
    const type_label = this.data_type

    // Check if it's an Archetype reference
    if (DB.archetype_by_label[type_label]) {
      const archetype = DB.archetype_by_label[type_label]
      let belief
      if (typeof data === 'string') {
        belief = DB.get_belief_by_label(data)
      } else if (data instanceof Subject) {
        // Already a Subject - return as-is
        return data
      } else {
        belief = data
      }

      if (belief == null) {
        throw new Error(`Belief not found for trait '${this.label}': ${data}`)
      }

      // Check if belief has the required archetype in its chain
      for (const a of belief.get_archetypes()) {
        if (a === archetype) {
          // Return the canonical Subject (one per sid)
          return belief.subject
        }
      }

      throw new Error(`Belief does not have required archetype '${type_label}' for trait '${this.label}'`)
    }

    // Check if it's a literal type (string, number, boolean)
    if (Traittype.literal_type_map[type_label]) {
      if (typeof data === type_label) {
        return data
      }
      throw new Error(`Expected ${type_label} for trait '${this.label}', got ${typeof data}`)
    }

    // Check if it's a data type (Mind, State, Subject)
    if (type_label === 'Mind') {
      if (data instanceof Mind) {
        return data
      }
      throw new Error(`Expected Mind instance for trait '${this.label}'`)
    }
    if (type_label === 'State') {
      if (data instanceof State) {
        return data
      }
      throw new Error(`Expected State instance for trait '${this.label}'`)
    }
    if (type_label === 'Subject') {
      // Subject type accepts a Belief and returns its subject
      if (data instanceof Subject) {
        return data
      }
      if (data instanceof Belief) {
        // Return the belief's subject (canonical identity with null archetype)
        return data.subject
      }
      throw new Error(`Expected Belief or Subject instance for trait '${this.label}'`)
    }

    throw new Error(`Unknown type '${type_label}' for trait '${this.label}'`)
  }

  /**
   * @param {any} mind
   * @param {*} data
   * @param {any} owner_belief - Belief being constructed (for setting mind owner)
   * @param {any} [creator_state] - State creating the belief (for inferring ground_state)
   * @returns {*}
   */
  resolve(mind, data, owner_belief = null, creator_state = null) {
    // Check for Mind template (plain object learn spec)
    if (this.data_type === 'Mind' &&
        data &&
        typeof data === 'object' &&
        !data._type &&
        !(data instanceof Mind)) {
      // It's a learn spec - call Mind.resolve_template
      return /** @type {any} */ (Cosmos.Mind).resolve_template(
        mind,
        data,
        owner_belief?.subject ?? null,
        creator_state
      )
    }

    // Check for template construction with _type field (Mind only)
    if (data?._type === 'Mind') {
      // TypeScript: Call resolve_template as any to avoid type check on static method
      return /** @type {any} */ (Cosmos.Mind).resolve_template(mind, data, owner_belief, creator_state)
    }

    return this._resolver(mind, data)
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
    if (value instanceof Subject) return value.toJSON()
    if (value?.toJSON) return value.toJSON()
    return value
  }

  /**
   * Inspect trait value using this traittype's mind_scope
   * @param {import('./state.mjs').State} state - State context for resolving sids
   * @param {*} value - Value to inspect
   * @returns {*} Shallow representation with references
   */
  inspect(state, value) {
    if (Array.isArray(value)) {
      return value.map(item => this.inspect(state, item))
    }
    if (value instanceof Subject) {
      // Determine which state to resolve in based on mind_scope
      let resolve_state = state
      if (this.mind_scope === 'parent' && state?.ground_state) {
        resolve_state = state.ground_state
      }
      return value.inspect(resolve_state)
    }
    if (typeof value === 'number') {
      return value
    }
    if (value instanceof Belief) {
      return {_ref: value._id, _type: 'Belief', label: value.get_label()}
    }
    if (value instanceof State) {
      return {_ref: value._id, _type: 'State'}
    }
    if (value instanceof Mind) {
      return {
        _ref: value._id,
        _type: 'Mind',
        label: value.label,
        states: [...value.state].map(s => ({_ref: s._id, _type: 'State'}))
      }
    }
    if (value?.toJSON) return value.toJSON()
    return value
  }
}
