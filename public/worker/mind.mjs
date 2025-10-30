/**
 * Mind - container for beliefs representing an entity's knowledge/perspective
 *
 * Each entity (world, player, NPC) has a mind containing their beliefs.
 * No objective truth exists - even world_mind holds possibility distributions that
 * collapse on observation, same as NPC minds.
 *
 * Key concepts:
 * - Nested minds: world_mind contains npc_minds, enabling theory of mind
 * - Label-based lookup: Quickly find beliefs by label
 * - State management: Minds track belief states over time
 * - Possibility distributions: Beliefs can exist in superposition until observed
 *
 * Example hierarchy:
 * - world_mind: current state of possibilities (collapses on player observation)
 * - player_mind: what player has observed (subset of collapsed possibilities)
 * - npc_mind: what NPC believes (may differ from world_mind)
 *
 * See docs/SPECIFICATION.md for mind architecture and "No Objective Truth" principle
 * See docs/ALPHA-1.md Stage 1 for basic usage, Stage 5 for NPC minds
 */

import { next_id } from './id_sequence.mjs'
import * as DB from './db.mjs'
import { State } from './state.mjs'
import { Belief } from './belief.mjs'
import { Traittype } from './traittype.mjs'
import { assert } from '../lib/debug.mjs'

/**
 * @typedef {import('./belief.mjs').BeliefJSON} BeliefJSON
 * @typedef {import('./state.mjs').StateJSON} StateJSON
 * @typedef {import('./subject.mjs').Subject} Subject
 * @typedef {import('./archetype.mjs').Archetype} Archetype
 */

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
 * @typedef {object} MindReference
 * @property {string} _type - Always "Mind"
 * @property {number} _id - Mind identifier
 * @property {string|null} label - Mind label
 */

/**
 * Container for beliefs with state tracking
 * @property {number} _id - Unique identifier
 * @property {string|null} label - Optional label for lookup
 * @property {Belief|null} self - What this mind considers "self"
 * @property {Set<State>} state - All states belonging to this mind
 */
export class Mind {

  /**
   * @param {Mind|null} parent_mind - Parent mind (null for root minds like world)
   * @param {string|null} label - Mind identifier
   * @param {Belief|null} self - What this mind considers "self" (can be null, can change)
   */
  constructor(parent_mind, label = null, self = null) {
    // parent_mind must be null or Mind instance
    assert(parent_mind === null || parent_mind instanceof Mind,
      'parent_mind must be null or Mind instance',
      {label, parent_mind})

    this._id = next_id()
    /** @type {Mind|null} */
    this.parent = parent_mind
    this.label = label
    /** @type {Belief|null} */
    this.self = self

    /**
     * Direct child minds (nested minds)
     * Query: O(1) enumeration of children for hierarchy traversal
     * Maintained by: Mind constructor (parent._child_minds.add)
     * Scale: Essential - enables mind hierarchy navigation
     * @type {Set<Mind>}
     */
    this._child_minds = new Set()

    /**
     * All states belonging to this mind
     * Query: O(n) enumeration for states_valid_at(), state iteration
     * Maintained by: register_state() - called by State constructor
     * Scale: Essential - without this, would need to scan global state_by_id registry
     * @type {Set<State>}
     */
    this._states = new Set()

    /**
     * Index: states by their ground_state reference
     * Query: O(1) to get Set<State> of child mind states linked to parent mind state
     * Maintained by: register_state() - populated when state has ground_state
     * Scale: Essential - critical for cascading lock operations and nested mind queries
     *   Example: When parent mind state changes, find all child mind states that reference it
     *   Without this: O(all states in mind), with this: O(matching states)
     * @type {Map<State, Set<State>>}
     */
    this._states_by_ground_state = new Map()

    // Register as child in parent
    if (this.parent) {
      this.parent._child_minds.add(this)
    }

    DB.register_mind(this)
  }

  /**
   * @param {number} id
   * @returns {Mind|undefined}
   */
  static get_by_id(id) {
    return DB.get_mind_by_id(id)
  }

  /**
   * @param {string} label
   * @returns {Mind|undefined}
   */
  static get_by_label(label) {
    return DB.get_mind_by_label(label)
  }

  /**
   * Get states in this mind that have the specified ground_state
   * @param {State} ground_state
   * @returns {Set<State>}
   */
  get_states_by_ground_state(ground_state) {
    return this._states_by_ground_state.get(ground_state) ?? new Set()
  }

  /**
   * Get all states in this mind that were valid at a specific timestamp
   * Yields the outermost state on each branch at or before the given timestamp
   * (states that have no descendants also at or before the timestamp)
   *
   * TODO: Refactor to walk tree from starting state instead of scanning all states
   * Current: O(n²) over all states in mind - doesn't scale to millions of states
   * Future approach: Walk from branch tips or given starting state
   * Future: Event saving with time/space-based archival for billions of states
   *
   * @param {number} timestamp - Timestamp to query at
   * @yields {State} Outermost states on each branch at timestamp
   */
  *states_valid_at(timestamp) {
    if (this._states.size === 0) return

    // Get all states with timestamp <= target
    const valid_states = [...this._states].filter(s => s.timestamp <= timestamp)

    // Yield states that have no descendants in the valid set
    for (const state of valid_states) {
      const has_descendant = valid_states.some(other =>
        other !== state && _has_base_in_chain(other, state)
      )

      if (!has_descendant) {
        yield state
      }
    }
  }

  /**
   * Register a state in this mind (called by State constructor)
   * Adds to both _states Set and _states_by_ground_state index
   * @param {State} state
   */
  register_state(state) {
    this._states.add(state)

    if (state.ground_state) {
      if (!this._states_by_ground_state.has(state.ground_state)) {
        this._states_by_ground_state.set(state.ground_state, new Set())
      }
      // TypeScript: We just ensured the key exists above
      /** @type {Set<State>} */ (this._states_by_ground_state.get(state.ground_state)).add(state)
    }
  }

  /**
   * @param {number} timestamp
   * @param {State|null} ground_state
   * @returns {State}
   */
  create_state(timestamp, ground_state = null) {
    assert(
      !ground_state || ground_state.in_mind === this.parent,
      'ground_state must be in parent mind',
      {mind: this.label, parent: this.parent?.label, ground_state_mind: ground_state?.in_mind?.label}
    )

    const state = new State(this, timestamp, null, ground_state)
    return state
  }

  /**
   * Shallow inspection view for the inspect UI
   * @param {State} state
   * @returns {object}
   */
  to_inspect_view(state) {
    return {
      _ref: this._id,
      _type: 'Mind',
      label: this.label,
      states: [...this._states].map(s => ({_ref: s._id, _type: 'State'}))
    }
  }

  /**
   * @returns {Omit<MindJSON, 'nested_minds'>}
   */
  toJSON() {
    // Get beliefs from belief_by_mind index
    const beliefs = DB.get_beliefs_by_mind(this) || new Set()
    const mind_beliefs = [...beliefs].map(b => b.toJSON())

    return {
      _type: 'Mind',
      _id: this._id,
      label: this.label,
      belief: mind_beliefs,
      state: [...this._states].map(s => s.toJSON())
    }
  }

  /**
   * Create Mind from JSON data with lazy loading
   * @param {MindJSON} data - JSON data with _type: 'Mind'
   * @param {Mind|null} [parent_mind] - Parent mind (null for root minds)
   * @returns {Mind}
   */
  static from_json(data, parent_mind = null) {
    // Create mind shell manually (can't use constructor due to ID/registration requirements)
    const mind = Object.create(Mind.prototype)

    // Set properties from JSON
    mind._id = data._id
    mind.label = data.label
    mind.self = null
    mind.parent = parent_mind
    mind._child_minds = new Set()
    mind._states = new Set()
    mind._states_by_ground_state = new Map()

    // Register as child in parent
    if (parent_mind) {
      parent_mind._child_minds.add(mind)
    }

    // Register in DB
    DB.register_mind(mind)

    // Create belief shells
    for (const belief_data of data.belief) {
      Belief.from_json(mind, belief_data)
    }

    // Create state shells and add to their respective minds
    for (const state_data of data.state) {
      const state = State.from_json(mind, state_data)
      // Add to the state's in_mind (which might be different from mind if nested)
      state.in_mind.register_state(state)
    }

    // Load nested minds AFTER parent states (so ground_state references can be resolved)
    if (data.nested_minds) {
      for (const nested_mind_data of data.nested_minds) {
        Mind.from_json(nested_mind_data, mind)  // Pass current mind as parent
      }
    }

    // Finalize beliefs for THIS mind (resolve State/Mind references in traits)
    // Do this AFTER loading nested minds so all State/Mind references can be resolved
    for (const belief_data of data.belief) {
      const belief = DB.get_belief(belief_data._id)
      if (belief) {
        belief._finalize_traits()
      }
    }

    return mind
  }

  /**
   * Resolve trait value from template data (delegation pattern)
   * Called by Traittype to handle Mind-specific template resolution
   * @param {Traittype} traittype - Traittype definition with metadata
   * @param {Belief} belief - Belief being constructed
   * @param {*} data - Raw template data or Mind instance
   * @returns {Mind|*} Resolved Mind instance or data as-is
   */
  static resolve_trait_value_from_template(traittype, belief, data) {
    assert(belief.origin_state instanceof State, "belief must have origin_state", belief)
    const creator_state = /** @type {State} */ (belief.origin_state)

    // Detect plain object Mind template (learn spec)
    // Plain object: has properties but no _type field and no _states Set
    if (data &&
        typeof data === 'object' &&
        !data._type &&
        !(data._states instanceof Set)) {
      // It's a learn spec - call create_from_template
      assert(belief.in_mind instanceof Mind, 'Shared beliefs cannot have Mind traits', {belief})
      return Mind.create_from_template(creator_state, data, belief.subject ?? null)
    }

    // Detect explicit Mind template with _type field
    if (data?._type === 'Mind') {
      assert(belief.in_mind instanceof Mind, 'Shared beliefs cannot have Mind traits', {belief})
      // Strip _type from template before passing to create_from_template
      const {_type, ...traits} = data
      return Mind.create_from_template(creator_state, traits, belief.subject)
    }

    // Not a template - return as-is (Mind instance, null, undefined, etc.)
    return data
  }

  /**
   * Create Mind with initial state from declarative template
   * @param {State} ground_state - State context for belief resolution and ground_state
   * @param {Object<string, string[]>} traits - {belief_label: [trait_names]} to learn
   * @param {Subject|null} self_subject - Subject that becomes state.self
   * @returns {Mind}
   */
  static create_from_template(ground_state, traits, self_subject) {
    const assert = (/** @type {any} */ condition, /** @type {string} */ message, /** @type {any} */ context) => {
      if (!condition) throw new Error(message + (context ? ': ' + JSON.stringify(context) : ''))
    }

    assert(ground_state instanceof State, `create_from_template requires State for ground_state`, null)

    // Create the mind (parent is the mind that contains ground_state)
    const parent_mind = ground_state.in_mind
    const entity_mind = new Mind(parent_mind)

    // Create initial state with self reference
    const state = new State(
      entity_mind,
      1,  // timestamp
      null,  // no base
      ground_state,  // ground_state (where body exists)
      self_subject  // self (WHO is experiencing this)
    )

    // Execute learning
    for (const [label, trait_names] of Object.entries(traits)) {
      const belief = ground_state.get_belief_by_label(label)
      if (!belief) {
        throw new Error(`Cannot learn about '${label}': belief not found`)
      }
      // Assert belief is in ground_state's mind, not a shared belief
      assert(belief.in_mind === ground_state.in_mind,
        `Cannot learn about belief '${label}': must be in ground_state's mind (not shared belief)`,
        {belief_in_mind: belief.in_mind?.label ?? null, ground_state_mind: ground_state.in_mind?.label ?? null})
      if (trait_names.length > 0) {
        state.learn_about(belief, trait_names)
      }
    }

    state.lock()
    return entity_mind  // Return Mind, not State
  }

  /**
   * Apply trait operations to this mind (creates new state)
   * Used by trait operations pattern to compose knowledge from multiple archetypes
   * @param {State} ground_state - External world state to learn from
   * @param {Array<{key: string, value: any, source: Belief|Archetype}>} operations - Operations to apply
   * @returns {Mind} This mind (new state created as side effect)
   */
  state_data(ground_state, operations) {
    assert(ground_state instanceof State, 'state_data requires State for ground_state', {ground_state})

    // Find latest state in this mind
    const latest_states = [...this.states_valid_at(ground_state.timestamp)]
    const latest = latest_states[0]

    if (!latest) {
      throw new Error('Mind has no states - cannot apply operations')
    }

    // Create new state inheriting from latest
    const new_state = new State(
      this,
      latest.timestamp + 1,  // Next tick
      latest,                // Inherit from previous state
      ground_state,          // Ground state for learning
      latest.self            // Preserve self reference
    )

    // Process operations
    for (const {key, value, source} of operations) {
      if (key === 'append') {
        // Append operations add knowledge
        for (const [label, trait_names] of Object.entries(value)) {
          const belief = ground_state.get_belief_by_label(label)
          if (belief && trait_names.length > 0) {
            new_state.learn_about(belief, trait_names)
          }
        }
      }
      // Future: Support 'remove', 'replace', etc.
    }

    new_state.lock()
    return this  // Return Mind instance (new state created as side effect)
  }
}

/**
 * Check if a state has another state in its base chain
 * @param {State} descendant - State to check
 * @param {State} ancestor - Potential ancestor to find
 * @returns {boolean} True if ancestor is in descendant's base chain
 */
function _has_base_in_chain(descendant, ancestor) {
  const visited = new Set()
  let current = descendant.base

  while (current !== null) {
    if (visited.has(current)) break
    visited.add(current)

    if (current === ancestor) return true
    current = current.base
  }

  return false
}
