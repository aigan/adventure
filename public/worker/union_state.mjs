/**
 * UnionState - Flyweight composition for multi-parent prototype minds
 *
 * UnionState enables combining beliefs from multiple parent states without data duplication.
 * Used for prototype composition like VillageBlacksmith = Villager + Blacksmith.
 *
 * Key differences from State:
 * - Has component_states array instead of single base
 * - Merges beliefs from all components (last wins for overlaps)
 * - Restricted operations: No remove() (only insert/replace)
 * - Supports nested UnionStates (recursively traverses components)
 *
 * See docs/plans/union-state.md for design details
 */

import { assert } from './debug.mjs'
import * as DB from './db.mjs'
import { State } from './state.mjs'

/**
 * @typedef {import('./mind.mjs').Mind} Mind
 * @typedef {import('./belief.mjs').Belief} Belief
 * @typedef {import('./state.mjs').StateJSON} StateJSON
 * @typedef {import('./subject.mjs').Subject} Subject
 */

/**
 * UnionState for multi-parent composition
 */
export class UnionState extends State {
  /** @type {ReadonlyArray<State>} */
  component_states
  /** @type {boolean} */
  is_union

  /**
   * @param {Mind} mind
   * @param {State} ground_state
   * @param {State[]} component_states - Array of states to merge (ordered, immutable)
   * @param {object} options - Optional meta-parameters
   * @param {number|null} [options.tt] - Transaction time (only when ground_state.vt is null)
   * @param {number|null} [options.vt] - Valid time (defaults to tt)
   * @param {Subject|null} [options.self] - Self identity
   * @param {State|null} [options.about_state] - State context for belief resolution
   * @param {boolean} [options.derivation] - True if this is a derivation (computed view, non-mutating)
   */
  constructor(mind, ground_state, component_states, {tt, vt, self, about_state, derivation} = {}) {
    assert(Array.isArray(component_states), 'component_states must be an array')
    assert(component_states.length > 0, 'component_states cannot be empty')

    // Validate all components are locked
    for (const component of component_states) {
      assert(component instanceof State, 'All component_states must be State instances')
      assert(component.locked, 'All component_states must be locked')
    }

    // Validate ground_state is in parent mind
    assert(ground_state instanceof State, 'ground_state is required and must be a State')
    assert(
      ground_state.in_mind === mind.parent,
      'ground_state must be in parent mind',
      {
        mind: mind.label,
        parent: mind.parent?.label ?? null,
        ground_state_mind: ground_state.in_mind?.label ?? 'unknown'
      }
    )

    // Call State constructor with base=null (UnionState doesn't use base chain)
    // UnionStates are derivations - computed views that don't mutate the knowledge base
    super(mind, ground_state, null, {tt, vt, self, about_state, derivation: derivation ?? true})

    // UnionState-specific properties
    this.component_states = Object.freeze([...component_states])
    this.is_union = true
  }

  /**
   * Iterator that merges beliefs from all component states
   * - Iterates components left-to-right
   * - Recursively traverses nested UnionStates
   * - Uses seen set to avoid duplicates (last component wins)
   * - Then yields own insert operations
   * @yields {Belief}
   */
  *get_beliefs() {
    const seen = new Set()  // Track subject IDs to avoid duplicates

    // Iterate component_states left-to-right
    for (const component of this.component_states) {
      // @ts-ignore - is_union marker for runtime type detection
      if (component.is_union) {
        // Nested UnionState - recurse into its components
        // @ts-ignore - Runtime type narrowing
        yield* this._get_beliefs_from_union(component, seen)
      } else {
        // Regular State - yield its direct beliefs only (no base chain)
        yield* this._get_beliefs_from_state(component, seen)
      }
    }

    // Finally, yield our own insert operations (override component beliefs)
    for (const belief of this.insert) {
      if (!seen.has(belief.subject.sid)) {
        seen.add(belief.subject.sid)
        yield belief
      }
    }
  }

  /**
   * Helper: Get beliefs from a nested UnionState
   * @param {UnionState} union_state
   * @param {Set<number>} seen - Set of subject IDs already yielded
   * @returns {Generator<Belief, void, unknown>}
   */
  *_get_beliefs_from_union(union_state, seen) {
    // Recurse through union's components
    for (const component of union_state.component_states) {
      // @ts-ignore - is_union property for runtime type detection
      if (component.is_union) {
        // @ts-ignore - Runtime type narrowing to UnionState
        yield* this._get_beliefs_from_union(component, seen)
      } else {
        yield* this._get_beliefs_from_state(component, seen)
      }
    }

    // Then yield union's own insert operations
    for (const belief of union_state.insert) {
      if (!seen.has(belief.subject.sid)) {
        seen.add(belief.subject.sid)
        yield belief
      }
    }
  }

  /**
   * Helper: Get beliefs from a regular State (includes base chain)
   * @param {State} state
   * @param {Set<number>} seen - Set of subject IDs already yielded
   * @yields {Belief}
   */
  *_get_beliefs_from_state(state, seen) {
    // Delegate to state's get_beliefs() which handles base chain traversal
    // This ensures we get all beliefs including those inherited via state.base
    for (const belief of state.get_beliefs()) {
      if (!seen.has(belief.subject.sid)) {
        seen.add(belief.subject.sid)
        yield belief
      }
    }
  }

  /**
   * Override remove to throw error (not supported in UnionState)
   * @throws {Error} Always throws - remove operations not allowed in UnionState
   */
  remove_beliefs() {
    throw new Error(
      'UnionState does not support remove operations. ' +
      'UnionState is a read-only composition of component states. ' +
      'To remove beliefs, create a new State via branch_state() and use remove there.'
    )
  }

  /**
   * Serialize to JSON
   * @returns {{_type: string, _id: number, tt: number|null, vt: number|null, base: null, component_states: number[], ground_state: number, self: number|null, insert: number[], remove: number[], in_mind: number}}
   */
  toJSON() {
    return {
      _type: 'UnionState',
      _id: this._id,
      tt: this.tt,
      vt: this.vt,
      base: null,  // UnionState doesn't use base, always null
      component_states: this.component_states.map(s => s._id),
      ground_state: this.ground_state._id,  // ground_state is always required for UnionState
      self: this.self?.toJSON() ?? null,
      insert: this.insert.map(b => b._id),
      remove: this.remove.map(b => b._id),
      in_mind: this.in_mind._id
    }
  }

  /**
   * Deserialize from JSON
   * @param {Mind} _mind - Mind context (unused, for signature compatibility with State)
   * @param {StateJSON} data
   * @returns {UnionState}
   */
  static from_json(_mind, data) {
    assert(data._type === 'UnionState', 'data._type must be UnionState')
    assert(Array.isArray(data.component_states), 'data.component_states must be an array')

    // Look up mind from data
    const mind = DB.get_mind_by_id(data.in_mind)
    assert(mind, `Mind ${data.in_mind} not found`)

    // Resolve component_states from IDs
    const component_states = data.component_states.map((id) => {
      const state = DB.get_state_by_id(id)
      assert(state, `Component state ${id} not found`)
      return state
    })

    // Resolve ground_state
    const ground_state = data.ground_state ? DB.get_state_by_id(data.ground_state) : null
    assert(ground_state, `Ground state ${data.ground_state} not found`)

    // Resolve self
    const self = data.self ? DB.get_or_create_subject(mind.parent, data.self) : null

    // Create UnionState instance
    const union_state = new UnionState(
      mind,
      ground_state,
      component_states,
      {tt: data.tt, vt: data.vt, self}
    )

    // Override _id to match deserialized value
    union_state._id = data._id

    // Resolve insert beliefs
    for (const belief_id of data.insert) {
      const belief = DB.get_belief_by_id(belief_id)
      assert(belief, `Belief ${belief_id} not found`)
      union_state.insert.push(belief)
    }

    // Resolve remove beliefs
    for (const belief_id of data.remove) {
      const belief = DB.get_belief_by_id(belief_id)
      assert(belief, `Belief ${belief_id} not found`)
      union_state.remove.push(belief)
    }

    return union_state
  }
}
