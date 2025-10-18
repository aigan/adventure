import { next_id } from './id_sequence.mjs'

/**
 * Forward declarations to avoid circular dependencies
 * @type {any}
 */
let Belief = null
/** @type {any} */
let State = null

/**
 * Initialize references after all modules are loaded
 * @param {object} refs
 * @param {typeof import('./belief.mjs').Belief} refs.Belief
 * @param {typeof import('./state.mjs').State} refs.State
 */
export function init_mind_refs(refs) {
  Belief = refs.Belief
  State = refs.State
}

/**
 * @typedef {object} MindJSON
 * @property {string} _type - Always "Mind"
 * @property {number} _id - Mind identifier
 * @property {string|null} label - Optional label for lookup
 * @property {import('./belief.mjs').BeliefJSON[]} belief - All beliefs in this mind
 * @property {import('./state.mjs').StateJSON[]} state - All states in this mind
 * @property {MindJSON[]} [nested_minds] - Nested minds discovered during serialization
 */

/**
 * Container for beliefs with state tracking
 * @property {number} _id - Unique identifier
 * @property {string|null} label - Optional label for lookup
 * @property {import('./belief.mjs').Belief|null} self - What this mind considers "self"
 * @property {Set<import('./state.mjs').State>} state - All states belonging to this mind
 */
export class Mind {
  /** @type {Map<number, Mind>} */
  static by_id = new Map()
  /** @type {Map<string, Mind>} */
  static by_label = new Map()

  /**
   * @param {string|null|MindJSON} label - Mind identifier or JSON data
   * @param {import('./belief.mjs').Belief|null} self - What this mind considers "self" (can be null, can change)
   */
  constructor(label = null, self = null) {
    // Check if loading from JSON
    if (label && typeof label === 'object' && label._type === 'Mind') {
      const data = /** @type {MindJSON} */ (label)
      this._id = data._id
      this.label = data.label
      this.self = null // Will be resolved later if needed
      this.state = new Set()

      // Register globally
      Mind.by_id.set(this._id, this)
      if (this.label) {
        Mind.by_label.set(this.label, this)
      }
      return
    }

    // Normal construction
    this._id = next_id()
    this.label = /** @type {string|null} */ (label)
    this.self = self
    /** @type {Set<import('./state.mjs').State>} */
    this.state = new Set([])

    // Register globally
    Mind.by_id.set(this._id, this)
    if (this.label) {
      Mind.by_label.set(this.label, this)
    }

    //log(`Created mind ${this._id}`)
  }

  /**
   * @param {number} id
   * @returns {Mind|undefined}
   */
  static get_by_id(id) {
    //log(`Get mind by id ${id}`)
    return Mind.by_id.get(id)
  }

  /**
   * @param {string} label
   * @returns {Mind|undefined}
   */
  static get_by_label(label) {
    //log(`Get mind by label ${label}`)
    return Mind.by_label.get(label)
  }

  /**
   * @param {object} belief_def
   * @returns {import('./belief.mjs').Belief}
   */
  add(belief_def) {
    const belief = new Belief(this, belief_def)
    return belief
  }

  /**
   * @param {number} timestamp
   * @param {import('./state.mjs').State|null} ground_state
   * @returns {import('./state.mjs').State}
   */
  create_state(timestamp, ground_state = null) {
    const state = new State(this, timestamp, null, ground_state)
    return state
  }

  /**
   * @returns {Omit<MindJSON, 'nested_minds'>}
   */
  toJSON() {
    // Filter beliefs from global registry that belong to this mind
    const mind_beliefs = []
    for (const belief of Belief.by_id.values()) {
      if (belief.in_mind === this) {
        mind_beliefs.push(belief.toJSON())
      }
    }

    return {
      _type: 'Mind',
      _id: this._id,
      label: this.label,
      belief: mind_beliefs,
      state: [...this.state].map(s => s.toJSON())
    }
  }

  /**
   * Create Mind from JSON data with lazy loading
   * @param {MindJSON} data - JSON data with _type: 'Mind'
   * @returns {Mind}
   */
  static from_json(data) {
    // Create mind shell (constructor handles lazy setup)
    const mind = new Mind(data)

    // Create belief shells
    for (const belief_data of data.belief) {
      Belief.from_json(mind, belief_data)
    }

    // Create state shells and add to their respective minds
    for (const state_data of data.state) {
      const state = State.from_json(mind, state_data)
      // Add to the state's in_mind (which might be different from mind if nested)
      state.in_mind.state.add(state)
    }

    // Load nested minds AFTER parent states (so ground_state references can be resolved)
    if (data.nested_minds) {
      for (const nested_mind_data of data.nested_minds) {
        Mind.from_json(nested_mind_data)
      }
    }

    // Finalize beliefs for THIS mind (resolve State/Mind references in traits)
    // Do this AFTER loading nested minds so all State/Mind references can be resolved
    for (const belief_data of data.belief) {
      const belief = Belief.by_id.get(belief_data._id)
      if (belief) {
        belief._finalize_traits()
      }
    }

    return mind
  }
}
