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

import { assert, log, debug, sysdesig } from './debug.mjs'
import { next_id } from './id_sequence.mjs'
import * as DB from './db.mjs'
import { State } from './state.mjs'
import * as Cosmos from './cosmos.mjs'
import { Belief } from './belief.mjs'
import { Traittype } from './traittype.mjs'
import { Timeless } from './timeless.mjs'

/**
 * @typedef {import('./belief.mjs').BeliefJSON} BeliefJSON
 * @typedef {import('./state.mjs').StateJSON} StateJSON
 * @typedef {import('./subject.mjs').Subject} Subject
 * @typedef {import('./archetype.mjs').Archetype} Archetype
 * @typedef {import('./union_state.mjs').UnionState} UnionState
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
   * @param {Mind} parent_mind - Parent mind
   * @param {string|null} label - Mind identifier
   * @param {Belief|null} self - What this mind considers "self" (can be null, can change)
   */
  constructor(parent_mind, label = null, self = null) {
    // parent_mind must be Mind instance
    assert(parent_mind instanceof Mind, 'parent_mind must be Mind instance', {label, parent_mind})

    this._id = next_id()
    /** @type {Mind} - Internal storage, use getter/setter to access */
    this._parent = parent_mind
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

    /**
     * Latest unlocked state, or null if all states are locked
     * Updated by register_state() when unlocked state is registered
     * Cleared by State.lock() when this state is locked
     * @type {State|null}
     */
    this.state = null

    /**
     * Origin state - primordial state for this mind (used for prototypes)
     * Set on first create_state() call or explicitly during initialization
     * @type {State|null}
     */
    this.origin_state = null

    // Register as child in parent
    if (this.parent) {
      this.parent._child_minds.add(this)
    }

    DB.register_mind(this)
  }

  /**
   * Get parent mind (never null - all Minds descend from Logos)
   * Note: Logos overrides this to return null
   * @returns {Mind}
   */
  get parent() {
    return this._parent
  }

  /**
   * Set parent mind (used during deserialization)
   * @param {Mind} value
   */
  set parent(value) {
    this._parent = value
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
   * Create a world mind with logos as parent
   * Convenience helper for creating root-level world minds
   * @param {string} label - World label (default: 'world')
   * @returns {Mind} World mind with logos as parent
   */
  static create_world(label = 'world') {
    const logos = DB.get_logos_mind()
    return new Mind(logos, label)
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
   * Get all states in this mind that were valid at a specific tt
   * Yields the outermost state on each branch at or before the given tt
   * (states that have no descendants also at or before the tt)
   *
   * TODO: Refactor to walk tree from starting state instead of scanning all states
   * Current: O(n²) over all states in mind - doesn't scale to millions of states
   * Future approach: Walk from branch tips or given starting state
   * Future: Event saving with time/space-based archival for billions of states
   *
   * @param {number} tt - Transaction time to query at
   * @yields {State} Outermost states on each branch at tt
   */
  *states_at_tt(tt) {
    if (this._states.size === 0) return

    // Get all states with tt <= target (exclude timeless states with tt=null)
    const valid_states = [...this._states].filter(s => s.tt != null && s.tt <= tt)

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
   * Tracks unlocked states in this.state property
   * @param {State} state
   */
  register_state(state) {
    this._states.add(state)

    // Track latest unlocked state
    if (!state.locked) {
      this.state = state
    }

    if (state.ground_state) {
      if (!this._states_by_ground_state.has(state.ground_state)) {
        this._states_by_ground_state.set(state.ground_state, new Set())
      }
      // TypeScript: We just ensured the key exists above
      /** @type {Set<State>} */ (this._states_by_ground_state.get(state.ground_state)).add(state)
    }
  }

  /**
   * @param {State} ground_state - Required ground state (parent's state)
   * @param {object} options - Optional parameters
   * @param {number|null} [options.tt] - Transaction time (only when ground_state.vt is null)
   * @param {number|null} [options.vt] - Valid time (defaults to tt)
   * @param {Subject|null} [options.self] - Self identity
   * @returns {State}
   */
  create_state(ground_state, options = {}) {
    const state = new State(this, ground_state, null, options)

    // Track first state as origin
    if (this.origin_state === null) {
      this.origin_state = state
    }

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
   * System designation - compact debug string
   * @returns {string}
   */
  sysdesig() {
    const parts = []

    if (this.label) {
      parts.push(this.label)
    }

    parts.push(`Mind#${this._id}`)

    if (this.parent) {
      const parent_label = this.parent.label || `#${this.parent._id}`
      parts.push(`(child of ${parent_label})`)
    }

    return parts.join(' ')
  }

  /**
   * @returns {Omit<MindJSON, 'nested_minds'>}
   */
  toJSON() {
    // Get beliefs from belief_by_mind index
    const mind_beliefs = [...DB.get_beliefs_by_mind(this)].map(b => b.toJSON())

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
   * @param {Mind} [parent_mind] - Parent mind (required for non-logos minds, null only for logos)
   * @returns {Mind}
   */
  static from_json(data, parent_mind) {
    // Create mind shell manually (can't use constructor due to ID/registration requirements)
    const mind = Object.create(Mind.prototype)

    // Set properties from JSON
    mind._id = data._id
    mind.label = data.label
    mind.self = null
    mind._parent = parent_mind
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
      const belief = DB.get_belief_by_id(belief_data._id)
      if (belief) {
        belief._finalize_traits_from_json()
      }
    }

    return mind
  }

  /**
   * Compose multiple Mind instances into a single Mind with UnionState
   * Called by Traittype.compose() when a belief has multiple bases with mind traits
   * @param {Traittype} traittype - The mind traittype
   * @param {Belief} belief - The belief being composed for
   * @param {Mind[]} minds - Array of Mind instances to compose
   * @param {object} options - Optional parameters
   * @returns {Mind} New Mind instance with UnionState merging all component states
   */
  static compose(traittype, belief, minds, options = {}) {
    assert(Array.isArray(minds), 'compose() requires array of minds', {minds})
    assert(minds.length >= 2, 'compose() requires at least 2 minds', {minds})

    // Extract states from each Mind (use state or origin_state)
    const component_states = minds.map(m => {
      assert(m instanceof Mind, 'All values must be Mind instances', {mind: m})
      const state = m.state ?? m.origin_state
      assert(state instanceof State, 'Mind must have state or origin_state', {mind: m})
      return state
    })

    // All component states must be locked (UnionState requirement)
    for (const state of component_states) {
      assert(state.locked, 'All component states must be locked', {state})
    }

    // Get ground_state from belief context
    const ground_state = belief.origin_state
    assert(ground_state instanceof State, 'belief.origin_state must be State', {belief})

    const parent_mind = ground_state.in_mind
    const self_subject = belief.subject

    const { UnionState } = Cosmos

    // Create composed mind (self_subject is Subject, belief.subject is the actual instance)
    const composed_mind = new Mind(parent_mind, self_subject?.get_label() ?? null, null)

    // UnionState will derive tt from ground_state.vt (fork invariant)
    // Mark as derivation: this is a computed view, not a mutation of the knowledge base
    const union_state = new UnionState(
      composed_mind,
      ground_state,
      component_states,
      {self: /** @type {Subject|null} */ (self_subject), derivation: true}
    )

    // Set as origin state and track
    composed_mind.origin_state = union_state
    composed_mind.state = union_state

    return composed_mind
  }

  /**
   * Resolve trait value from template data (delegation pattern)
   * Called by Traittype to handle Mind-specific template resolution
   * @param {Traittype} traittype - Traittype definition with metadata
   * @param {Belief} belief - Belief being constructed
   * @param {*} data - Raw template data or Mind instance
   * @param {object} options - Optional parameters
   * @param {State|null} [options.about_state] - State context for belief resolution (for prototype minds)
   * @returns {Mind|*} Resolved Mind instance or data as-is
   */
  static resolve_trait_value_from_template(traittype, belief, data, {about_state} = {}) {
    assert(belief.is_shared || belief.origin_state instanceof State, "belief must have origin_state", {belief})
    const creator_state = /** @type {State} */ (belief.origin_state)

    // Check for Mind traits from ALL bases (for multi-parent composition)
    // belief._bases is set before traits are resolved, so get_trait works here
    // Filter to only Belief bases (skip Archetypes which don't have get_trait)
    const base_minds = []
    for (const base of belief._bases) {
      // Skip archetypes - they don't have mind traits
      if (!(base instanceof Belief)) continue

      const mind = base.get_trait(creator_state, 'mind')
      if (mind) {
        base_minds.push(mind)
      }
    }

    // Extract states from base minds
    const base_mind_states = base_minds.map(m => m.state ?? m.origin_state).filter(s => s !== null)

    // For backward compatibility: single base_mind_state
    const base_mind_state = base_mind_states.length === 1 ? base_mind_states[0] : null

    if (base_mind_states.length > 0) {
      debug(`Mind extension: ${belief.get_label()} extending ${base_mind_states.length} Mind(s): ${base_minds.map(m => `Mind#${m._id}`).join(', ')}`)
    }

    // Detect plain object Mind template (learn spec)
    // Plain object: has properties but no _type field and no _states Set
    if (data &&
        typeof data === 'object' &&
        !data._type &&
        !(data._states instanceof Set)) {

      debug("create mind from template with", sysdesig(creator_state, data))

      // It's a learn spec - call create_from_template
      // Pass component_states for multi-parent composition
      const mind = Mind.create_from_template(creator_state, belief, data, {
        about_state,
        base_mind_state,
        component_states: base_mind_states.length > 1 ? base_mind_states : undefined
      })
      assert(mind.state instanceof State, 'create_from_template must create unlocked state', {mind})
      return mind.state.lock().in_mind
    }

    // Detect explicit Mind template with _type field
    if (data?._type === 'Mind') {
      // Strip _type from template before passing to create_from_template
      const {_type, ...traits} = data
      const mind = Mind.create_from_template(creator_state, belief, traits, {
        about_state,
        base_mind_state,
        component_states: base_mind_states.length > 1 ? base_mind_states : undefined
      })
      assert(mind.state instanceof State, 'create_from_template must create unlocked state', {mind})
      return mind.state.lock().in_mind
    }

    // Not a template - return as-is (Mind instance, null, undefined, etc.)
    return data
  }

  /**
   * Get or create an open (unlocked) state for the given ground context
   * Determines whether to reuse existing state or create new based on ground_belief.locked
   * @param {State} ground_state - External world state
   * @param {Belief} ground_belief - The belief that owns this mind trait
   * @returns {State} An unlocked state ready for modifications
   */
  get_or_create_open_state_for_ground(ground_state, ground_belief) {
    assert(ground_state instanceof State, 'ground_state must be State', {ground_state})
    assert(ground_belief instanceof Belief, 'ground_belief must be Belief', {ground_belief})

    // CONSTRUCTION PATH: If ground_belief unlocked, check for existing unlocked state to reuse
    if (!ground_belief.locked) {
      const existing_states = this._states_by_ground_state.get(ground_state)
      if (existing_states) {
        for (const state of existing_states) {
          if (!state.locked) return state
        }
      }
    }

    // Create new state (either versioning or initial construction)
    // For timeless ground states (vt=null), get all states; otherwise filter by vt
    const latest_states = ground_state.vt != null
      ? [...this.states_at_tt(ground_state.vt)]
      : [...this._states]
    const latest = latest_states[0]

    // VERSIONING PATH: ground_belief locked requires existing state
    if (ground_belief.locked && !latest) {
      throw new Error('No existing state found for versioning')
    }

    // Fork invariant: child.tt = parent_state.vt (handled by State constructor)
    return new State(
      this,
      ground_state,
      latest ?? null,               // Inherit from latest or null for initial
      {
        self: latest?.self ?? ground_belief.subject  // self from latest or ground_belief
        // vt defaults to tt (from ground_state.vt)
      }
    )
  }

  /**
   * Create Mind with initial state from declarative template
   * Returns the mind - access unlocked state via mind.state property
   * @param {State} ground_state - State context for belief resolution and ground_state
   * @param {Belief} ground_belief - The belief that owns this mind trait
   * @param {Object<string, string[]>} traits - {belief_label: [trait_names]} to learn
   * @param {object} options - Optional meta-parameters
   * @param {State|null} [options.about_state] - State context for belief resolution (where beliefs exist)
   * @param {State|null} [options.base_mind_state] - State from base mind to use as base for knowledge inheritance
   * @param {State[]|null} [options.component_states] - States for multi-parent composition (creates UnionState)
   * @returns {Mind} The created mind (access unlocked state via mind.state)
   */
  static create_from_template(ground_state, ground_belief, traits, {about_state, base_mind_state, component_states} = {}) {
    const assert = (/** @type {any} */ condition, /** @type {string} */ message, /** @type {any} */ context) => {
      if (!condition) throw new Error(message + (context ? ': ' + JSON.stringify(context) : ''))
    }

    assert(ground_state instanceof State, `create_from_template requires State for ground_state`, null)
    assert(ground_belief instanceof Belief, `create_from_template requires Belief for ground_belief`, null)

    // Validate base_mind_state if provided
    if (base_mind_state) {
      assert(base_mind_state instanceof State,
        `base_mind_state must be State`,
        {base_mind_state})
      assert(base_mind_state.locked,
        `base_mind_state must be locked`,
        {state_id: base_mind_state._id, locked: base_mind_state.locked})
      // Note: No constraint on which mind the base state comes from
      // State.base can reference states in different minds (e.g., Eidos prototypes)
    }

    // Validate component_states if provided (for multi-parent composition)
    if (component_states) {
      assert(Array.isArray(component_states),
        `component_states must be array`,
        {component_states})
      for (const component of component_states) {
        assert(component instanceof State,
          `All component_states must be State`,
          {component})
        assert(component.locked,
          `All component_states must be locked`,
          {state_id: component._id, locked: component.locked})
      }
    }

    // Extract self_subject from ground_belief
    const self_subject = ground_belief.subject

    // Create the mind (parent is the mind where ground_state exists)
    const parent_mind = ground_state.in_mind
    const entity_mind = new Mind(parent_mind, self_subject.get_label())

    // Create initial state with self reference - fork invariant: child.tt = parent_state.vt
    // When ground_state is Timeless (vt=null), must provide explicit tt
    // If component_states provided (multi-parent), use UnionState, otherwise use State
    let state
    if (component_states && component_states.length > 1) {
      // Multi-parent composition - create UnionState
      const { UnionState } = Cosmos
      state = new UnionState(
        entity_mind,
        ground_state,
        component_states,
        {
          self: self_subject,
          about_state,
          // When ground_state is Timeless (vt=null), must provide explicit tt
          ...(ground_state instanceof Timeless ? { tt: null } : {})
        }
      )
    } else {
      // Single or no base - use regular State
      state = new State(
        entity_mind,
        ground_state,             // ground_state (where body exists)
        base_mind_state ?? null,  // base state for knowledge inheritance
        {
          self: self_subject,  // self (WHO is experiencing this)
          about_state,  // State context for belief resolution (where beliefs to learn about exist)
          // When ground_state is Timeless (vt=null), must provide explicit tt
          ...(ground_state instanceof Timeless ? { tt: 0 } : {})
          // Otherwise tt and vt both derive from ground_state.vt (fork invariant)
        }
      )
    }

    // Track as origin state (first state created for this mind)
    entity_mind.origin_state = state

    // Execute learning
    for (const [label, trait_names] of Object.entries(traits)) {
      // Search in about_state first (if provided), then ground_state, then shared beliefs
      const belief = about_state?.get_belief_by_label(label) ?? ground_state.get_belief_by_label(label)

      if (!belief) {
        throw new Error(
          `Cannot learn about '${label}': belief not found in ` +
          (about_state ? `about_state (${about_state.in_mind?.label}) or ` : '') +
          `ground_state (${ground_state.in_mind?.label})`
        )
      }
      // Assert belief is in the correct mind context
      const valid_mind = about_state ? about_state.in_mind : ground_state.in_mind
      assert(belief.in_mind === valid_mind,
        `Cannot learn about belief '${label}': must be in ${about_state ? 'about_state' : 'ground_state'}'s mind (not shared belief)`,
        {belief_in_mind: belief.in_mind?.label ?? null, expected_mind: valid_mind?.label ?? null})
      if (trait_names.length > 0) {
        state.learn_about(belief, trait_names)
      }
    }

    // Return mind - caller can access unlocked state via mind.state
    return entity_mind
  }

  /**
   * Apply trait operations to this mind
   * Used by trait operations pattern to compose knowledge from multiple archetypes
   * @param {State} ground_state - External world state to learn from
   * @param {Belief} ground_belief - The belief that owns this mind trait
   * @param {Array<{key: string, value: any, source: Belief|Archetype}>} operations - Operations to apply
   * @returns {Mind} This mind (state created/modified as side effect)
   */
  state_data(ground_state, ground_belief, operations) {
    assert(ground_state instanceof State, 'state_data requires State for ground_state', {ground_state})
    assert(ground_belief instanceof Belief, 'state_data requires Belief for ground_belief', {ground_belief})

    // Get or create appropriate state (handles both construction and versioning)
    const state = this.get_or_create_open_state_for_ground(ground_state, ground_belief)

    // Process operations
    for (const {key, value, source} of operations) {
      if (key === 'append') {
        // Append operations add knowledge
        for (const [label, trait_names] of Object.entries(value)) {
          const belief = ground_state.get_belief_by_label(label)
          assert(belief, `Cannot find belief with label '${label}' in ground_state for mind.append operation`, {label, ground_state_id: ground_state._id, available_labels: [...ground_state.get_beliefs()].map(b => b.get_label()).filter(Boolean)})
          assert(trait_names.length > 0, `Empty trait_names array for mind.append operation on belief '${label}'`, {label, trait_names})
          state.learn_about(belief, trait_names)
        }
        continue
      }

      throw new Error(`Unsupported operation '${key}' in mind trait composition (only 'append' is currently supported)`);
      // Future: Support 'remove', 'replace', etc.
    }

    return this  // Return Mind instance (state created/modified as side effect)
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
