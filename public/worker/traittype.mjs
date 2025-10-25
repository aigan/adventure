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

import { assert } from '../lib/debug.mjs'
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
      return (/** @type {Belief} */ owner_belief, /** @type {any} */ data, /** @type {State|null} */ creator_state) => {
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
        return data.map(item => this._resolve_item(owner_belief, item, creator_state))
      }
    } else {
      // No container - single value
      return (/** @type {Belief} */ owner_belief, /** @type {any} */ data, /** @type {State|null} */ creator_state) => this._resolve_item(owner_belief, data, creator_state)
    }
  }

  /**
   * Resolve a single item (not an array)
   * @param {Belief} owner_belief
   * @param {*} data
   * @param {State|null} creator_state
   * @returns {*}
   */
  _resolve_item(owner_belief, data, creator_state) {
    const type_label = this.data_type

    //creator_state ??= owner_belief.origin_state

    // Check if it's an Archetype reference
    if (DB.get_archetype_by_label(type_label)) {
      const archetype = DB.get_archetype_by_label(type_label)

      // Handle different input types
      if (typeof data === 'string') {

        // TODO: Get archtypes either from shared subject directly, or provided creator_State

        //const subject = DB.get_subject_by_label(data);
        //const belief = creator_state.resolve_subject(sid);

        // String label - lookup and validate
        const belief = DB.get_first_belief_by_label(data)
        if (belief == null) {
          throw new Error(`Belief not found for trait '${this.label}': ${data}`)
        }

        // Validate archetype
        for (const a of belief.get_archetypes()) {
          if (a === archetype) {
            return belief.subject
          }
        }
        throw new Error(`Belief '${data}' does not have required archetype '${type_label}' for trait '${this.label}'`)

      } else if (data.subject) {
        // Belief - validate and return subject
        for (const a of data.get_archetypes()) {
          if (a === archetype) {
            return data.subject
          }
        }
        throw new Error(`Belief does not have required archetype '${type_label}' for trait '${this.label}'`)

      } else {
        // Subject - already validated, return as-is
        return data
      }
    }

    // Check if it's a literal type (string, number, boolean)
    if (Traittype.literal_type_map[type_label]) {
      if (typeof data === type_label) {
        return data
      }
      throw new Error(`Expected ${type_label} for trait '${this.label}', got ${typeof data}`)
    }

    // For all other registered types (Mind, State, Subject, etc.), just return data as-is
    // The caller is responsible for passing the correct type
    return data
  }

  /**
   * @param {Belief} owner_belief - Belief being constructed
   * @param {*} data - Raw data to resolve
   * @param {State|null} [creator_state] - State creating the belief
   * @returns {*}
   */
  resolve(owner_belief, data, creator_state = null) {
    // Check for Mind template (plain object learn spec)
    if (this.data_type === 'Mind' &&
        data &&
        typeof data === 'object' &&
        !data._type &&
        !(data.state instanceof Set)) {
      // It's a learn spec (plain object without Mind's state Set) - call Mind.resolve_template
      return /** @type {any} */ (Cosmos.Mind).resolve_template(
        owner_belief.in_mind,
        data,
        owner_belief.subject ?? null,
        creator_state
      )
    }

    // Check for template construction with _type field (Mind only)
    if (data?._type === 'Mind') {
      // TypeScript: Call resolve_template as any to avoid type check on static method
      return /** @type {any} */ (Cosmos.Mind).resolve_template(owner_belief.in_mind, data, owner_belief, creator_state)
    }

    return this._resolver(owner_belief, data, creator_state)
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
   * Inspect trait value using this traittype's mind_scope
   * @param {State} state - State context for resolving sids
   * @param {*} value - Value to inspect
   * @returns {*} Shallow representation with references
   */
  inspect(state, value) {
    if (Array.isArray(value)) {
      return value.map(item => this.inspect(state, item))
    }
    if (typeof value === 'number' || typeof value === 'string') {
      return value
    }
    // If it's a registered class (Mind, State, Belief, Subject), call inspect
    if (typeof value?.inspect === 'function') {
      // Determine which state to resolve in based on mind_scope
      let resolve_state = state
      if (this.mind_scope === 'parent' && state?.ground_state) {
        resolve_state = state.ground_state
      }
      return value.inspect(resolve_state)
    }
    // Fallback for other objects
    if (value?.toJSON) return value.toJSON()
    return value
  }
}
