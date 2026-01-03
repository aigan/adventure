/**
 * Materia - Mind subclass for time-aware entities
 *
 * Represents minds that exist within time (worlds, NPCs, players).
 * All materia minds have a non-null parent in the mind hierarchy.
 *
 * Mind hierarchy:
 * - Logos (timeless root, parent = null)
 *   - Eidos (timeless forms/prototypes)
 *   - Materia instances (world minds, NPC minds, player minds)
 *
 * See docs/SPECIFICATION.md for mind architecture
 */

import { assert } from './debug.mjs'
import { Mind } from './mind.mjs'
import { State } from './state.mjs'
import { Belief } from './belief.mjs'
import * as DB from './db.mjs'
import { logos } from './logos.mjs'
import { learn_about } from './perception.mjs'
import { Temporal } from './temporal.mjs'
import { Convergence } from './convergence.mjs'

/**
 * @typedef {import('./subject.mjs').Subject} Subject
 * @typedef {import('./mind.mjs').MindJSON} MindJSON
 * @typedef {import('./traittype.mjs').Traittype} Traittype
 */

/**
 * Time-aware mind for entities existing within temporal flow
 * @augments Mind
 */
export class Materia extends Mind {
  /** @type {string} - Type discriminator */
  _type = 'Materia'

  /**
   * @param {Mind} parent_mind - Parent mind (required - cannot be null)
   * @param {string|null} label - Mind identifier
   * @param {Belief|null} self - What this mind considers "self"
   */
  constructor(parent_mind, label = null, self = null) {
    // Materia minds MUST have a parent
    assert(parent_mind !== null, 'Materia requires non-null parent_mind', {label})

    super(parent_mind, label, self)

    this._type = 'Materia'
  }

  /**
   * Create a world mind with logos as parent
   * Convenience helper for creating root-level world minds
   * @param {string} label - World label (default: 'world')
   * @returns {Materia} World mind with logos as parent
   */
  static create_world(label = 'world') {
    const logos_mind = logos()
    return new Materia(logos_mind, label)
  }

  /**
   * Get all states in this mind for a ground_state that were valid at a specific tt
   * Yields the outermost state on each branch at or before the given tt
   * (states that have no descendants also at or before the tt)
   *
   * @param {State} ground_state - Parent mind state to filter by
   * @param {number} tt - Transaction time (when the mind recorded beliefs)
   * @yields {State} Outermost states on each branch at tt for this ground_state
   */
  *states_at_tt(ground_state, tt) {
    // Get states for this ground_state, then filter by tt
    // @heavy - temporal query requires scanning all states for this ground
    const all_states = this.get_states_by_ground_state(ground_state)
    if (all_states.size === 0) return

    // Build valid set directly (states with tt <= target)
    const valid_set = new Set()
    for (const s of all_states) {
      if (s.tt != null && s.tt <= tt) valid_set.add(s)
    }
    if (valid_set.size === 0) return

    // Build set of ancestors that are in valid set (these are "shadowed")
    // O(n × depth) instead of O(n²)
    const shadowed = new Set()
    for (const state of valid_set) {
      let current = state.base
      while (current) {
        if (valid_set.has(current)) shadowed.add(current)
        current = current.base
      }
    }

    // Yield states that aren't shadowed (branch tips)
    for (const state of valid_set) {
      if (!shadowed.has(state)) yield state
    }
  }

  /**
   * Compose multiple Mind instances into a single Materia with Convergence
   * Called by Traittype.compose() when a belief has multiple bases with mind traits
   * @param {Traittype} _traittype - The mind traittype
   * @param {Belief} belief - The belief being composed for
   * @param {Mind[]} minds - Array of Mind instances to compose
   * @param {object} _options - Optional parameters (unused)
   * @returns {Materia} New Materia instance with Convergence merging all component states
   */
  static compose(_traittype, belief, minds, _options = {}) {
    assert(Array.isArray(minds), 'compose() requires array of minds', {minds})
    assert(minds.length >= 2, 'compose() requires at least 2 minds', {minds})

    // Extract states from each Mind (use state or origin_state)
    const component_states = minds.map(m => {
      assert(m instanceof Mind, 'All values must be Mind instances', {mind: m})
      const state = m.state ?? m.origin_state
      assert(state instanceof State, 'Mind must have state or origin_state', {mind: m})
      return state
    })

    // Component states must be locked to ensure consistent Convergence view
    // Mind states are automatically locked during template resolution (see Mind.resolve_trait_value_from_template)
    // If this assertion fails, ensure all source minds were created before the state was locked
    for (const state of component_states) {
      assert(state.locked, 'All component states must be locked', {state})
    }

    const ground_state = belief.origin_state
    assert(ground_state instanceof State, 'belief.origin_state must be State', {belief})

    const parent_mind = ground_state.in_mind
    const self_subject = belief.subject

    // Create composed mind (self_subject is Subject, belief.subject is the actual instance)
    const composed_mind = new Materia(parent_mind, self_subject?.get_label() ?? null, null)

    // Convergence will derive tt from ground_state.vt (fork invariant)
    // Mark as derivation: this is a computed view, not a mutation of the knowledge base
    const convergence = new Convergence(
      composed_mind,
      ground_state,
      component_states,
      {self: /** @type {Subject|null} */ (self_subject), derivation: true}
    )

    composed_mind.origin_state = convergence
    composed_mind.state = convergence

    return composed_mind
  }

  /**
   * Create Materia with initial state from declarative template
   * Returns the mind - access unlocked state via mind.state property
   * @param {State} ground_state - State context for belief resolution and ground_state
   * @param {Belief} ground_belief - The belief that owns this mind trait
   * @param {Object<string, string[]>} traits - {belief_label: [trait_names]} to learn
   * @param {object} options - Optional meta-parameters
   * @param {State|null} [options.about_state] - State context for belief resolution (where beliefs exist)
   * @param {State|null} [options.base_mind_state] - State from base mind to use as base for knowledge inheritance
   * @param {State[]|null} [options.component_states] - States for multi-parent composition (creates Convergence)
   * @returns {Materia} The created mind (access unlocked state via mind.state)
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

    const parent_mind = ground_state.in_mind
    const entity_mind = new Materia(parent_mind, self_subject.get_label())

    // Create initial state with self reference - fork invariant: child.tt = parent_state.vt
    // When ground_state is Timeless (vt=null), must provide explicit tt
    // If component_states provided (multi-parent), use Convergence, otherwise use State
    let state
    if (component_states && component_states.length > 1) {
      // Multi-parent composition - create Convergence
      state = new Convergence(
        entity_mind,
        ground_state,
        component_states,
        {
          self: self_subject,
          about_state,
          // When ground_state is Timeless (vt=null), must provide explicit tt
          ...(ground_state.vt === null ? { tt: null } : {})
        }
      )
    } else {
      // Single or no base - use regular Temporal state
      state = new Temporal(
        entity_mind,
        ground_state,             // ground_state (where body exists)
        base_mind_state ?? null,  // base state for knowledge inheritance
        {
          self: self_subject,  // self (WHO is experiencing this)
          about_state,  // State context for belief resolution (where beliefs to learn about exist)
          // When ground_state is Timeless (vt=null), must provide explicit tt
          ...(ground_state.vt === null ? { tt: 0 } : {})
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
        learn_about(state, belief, {traits: trait_names})
      }
    }

    return entity_mind
  }

  /**
   * Create Materia from JSON data
   * @param {MindJSON} data - JSON data with _type: 'Materia'
   * @param {Mind} parent_mind - Parent mind (required for Materia)
   * @returns {Materia}
   */
  static from_json(data, parent_mind) {
    assert(parent_mind !== null, 'Materia.from_json requires parent_mind', {data})

    const mind = Object.create(Materia.prototype)

    // Set _type (class field initializers don't run with Object.create)
    mind._type = 'Materia'

    // Use shared initialization with deserialized ID
    mind._init_properties(parent_mind, data.label, null, data._id)

    for (const belief_data of data.belief) {
      Belief.from_json(mind, belief_data)
    }

    for (const state_data of data.state) {
      const state = State.from_json(mind, state_data)
      // Add to the state's in_mind (which might be different from mind if nested)
      state.in_mind.register_state(state)
    }

    // Lock all states after loading (preserves base.locked invariant)
    // Must be done before loading nested minds (they reference these as ground_state)
    // Uses lock() to also lock beliefs in _insert
    for (const state of mind._states) {
      state.lock()
    }

    // Load nested minds AFTER parent states (so ground_state references can be resolved)
    if (data.nested_minds) {
      for (const nested_mind_data of data.nested_minds) {
        Mind.from_json(nested_mind_data, mind)  // Pass current mind as parent
      }
    }

    // Patch origin_state on beliefs AFTER states are loaded
    // This enables reverse index building during trait finalization
    for (const belief_data of data.belief) {
      const belief = DB.get_belief_by_id(belief_data._id)
      if (belief && belief_data.origin_state != null) {
        const origin_state = DB.get_state_by_id(belief_data.origin_state)
        if (origin_state) {
          belief.origin_state = origin_state
          DB.register_belief_by_mind(belief)  // Register now that origin_state is set
        }
      }
    }

    // Finalize beliefs for THIS mind (resolve State/Mind references in traits)
    // Do this AFTER loading nested minds so all State/Mind references can be resolved
    // This also builds reverse indexes now that origin_state is set
    for (const belief_data of data.belief) {
      const belief = DB.get_belief_by_id(belief_data._id)
      if (belief) {
        belief._finalize_traits_from_json()
      }
    }

    // Finalize promotions and resolutions AFTER all beliefs are loaded and finalized
    // This resolves promotion IDs and resolution IDs to belief references
    for (const belief_data of data.belief) {
      const belief = DB.get_belief_by_id(belief_data._id)
      if (belief) {
        belief._finalize_promotions_from_json()
        belief._finalize_resolution_from_json()
      }
    }

    // Finalize Convergence resolutions (timeline resolution)
    for (const state_data of data.state) {
      if (state_data._type === 'Convergence') {
        const state = DB.get_state_by_id(state_data._id)
        // @ts-ignore - _finalize_resolutions_from_json exists on Convergence
        if (state?._finalize_resolutions_from_json) {
          // @ts-ignore - _finalize_resolutions_from_json exists on Convergence
          state._finalize_resolutions_from_json()
        }
      }
    }

    return mind
  }
}

// Register for polymorphic deserialization and class access
Mind.register_type('Materia', Materia)
Mind.register_function('Materia', Materia)

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
