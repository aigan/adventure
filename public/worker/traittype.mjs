import { Archetype } from './archetype.mjs'

/**
 * Forward declarations - these will be set after imports
 * Needed to avoid circular dependencies
 * @type {any}
 */
let Mind = null
/** @type {any} */
let State = null
/** @type {any} */
let Belief = null

/**
 * Initialize references to avoid circular dependencies
 * Called from db.mjs after all classes are loaded
 * @param {object} refs
 * @param {typeof import('./mind.mjs').Mind} refs.Mind
 * @param {typeof import('./state.mjs').State} refs.State
 * @param {typeof import('./belief.mjs').Belief} refs.Belief
 */
export function init_traittype_refs(refs) {
  Mind = refs.Mind
  State = refs.State
  Belief = refs.Belief

  // Update data_type_map with actual classes
  Traittype.data_type_map = {
    Mind: Mind,
    State: State,
  }
}

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
 * Trait type definition with validation and resolution
 * @property {string} label - Trait type identifier
 * @property {string} data_type - Base type (e.g., 'State', 'Location', 'string')
 * @property {Function|null} container - Container constructor (e.g., Array) or null
 * @property {object|null} constraints - Validation constraints (min, max)
 */
export class Traittype {
  /** @type {Record<string, Traittype>} */
  static by_label = {}

  /** @type {Record<string, any>} */
  static data_type_map = {
    Mind: null,
    State: null,
  }

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
    } else {
      // Object schema: {type: 'State', container: Array, min: 1}
      this.data_type = def.type
      this.container = def.container ?? null
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
    if (Archetype.by_label[type_label]) {
      const archetype = Archetype.by_label[type_label]
      let belief
      if (typeof data === 'string') {
        belief = Belief.by_label.get(data)
      } else {
        belief = data
      }

      if (belief == null) {
        throw new Error(`Belief not found for trait '${this.label}': ${data}`)
      }

      // Check if belief has the required archetype in its chain
      for (const a of belief.get_archetypes()) {
        if (a === archetype) {
          // Store sid (subject ID) instead of object reference
          return belief.sid
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

    // Check if it's a data type (Mind, State)
    if (Traittype.data_type_map[type_label]) {
      const type_constructor = Traittype.data_type_map[type_label]
      if (data instanceof type_constructor) {
        return data
      }
      throw new Error(`Expected ${type_label} instance for trait '${this.label}'`)
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
    // Check for template construction first (_type field)
    if (data?._type) {
      // Type assertion: we know Mind and State both have resolve_template
      const type_class = /** @type {any} */ (Traittype.data_type_map[data._type])
      if (type_class?.resolve_template) {
        const result = type_class.resolve_template(mind, data, owner_belief, creator_state)

        // Wrap in array if container expects it
        if (this.container === Array && !Array.isArray(result)) {
          return [result]
        }
        return result
      }
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
    if (value?.toJSON) return value.toJSON()
    return value
  }

  /**
   * Inspect trait value for shallow reference view (light serialization)
   * Returns only {_ref, _type, label} for Beliefs/States/Minds
   * @param {*} value - Value to inspect
   * @returns {*} Shallow representation with references
   */
  static inspectTraitValue(value) {
    if (Array.isArray(value)) {
      return value.map(item => Traittype.inspectTraitValue(item))
    }
    if (value && (value.constructor.name === 'Belief' || value.constructor.name === 'State' || value.constructor.name === 'Mind')) {
      /** @type {{_ref: number, _type: string, label?: string|null}} */
      const result = {_ref: value._id, _type: value.constructor.name}
      if (value.constructor.name === 'Belief' || value.constructor.name === 'Mind') {
        result.label = value.label
      }
      return result
    }
    if (value?.toJSON) return value.toJSON()
    return value
  }
}
