/**
 * Convergence - Flyweight composition for multi-parent prototype minds
 *
 * Convergence enables combining beliefs from multiple parent states without data duplication.
 * Used for prototype composition like VillageBlacksmith = Villager + Blacksmith.
 *
 * Key differences from State:
 * - Has component_states array instead of single base
 * - Merges beliefs from all components (last wins for overlaps)
 * - Restricted operations: No remove() (only insert/replace)
 * - Supports nested Convergence states (recursively traverses components)
 */

import { assert, debug } from './debug.mjs'
import * as DB from './db.mjs'
import { State } from './state.mjs'

/**
 * @typedef {import('./mind.mjs').Mind} Mind
 * @typedef {import('./belief.mjs').Belief} Belief
 * @typedef {import('./state.mjs').StateJSON} StateJSON
 * @typedef {import('./subject.mjs').Subject} Subject
 * @typedef {import('./traittype.mjs').Traittype} Traittype
 */

/**
 * Convergence for multi-parent composition
 */
export class Convergence extends State {
  /** @type {string} - Type discriminator */
  _type = 'Convergence'

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

    // Call State constructor with base=null (Convergence doesn't use base chain)
    // Convergence states are derivations - computed views that don't mutate the knowledge base
    super(mind, ground_state, null, {tt, vt, self, about_state, derivation: derivation ?? true})

    // Set type (overrides State's default)
    this._type = 'Convergence'

    // Convergence-specific properties
    this.component_states = Object.freeze([...component_states])
    this.is_union = true
  }

  /**
   * Iterator that merges beliefs from all component states
   * - Iterates components left-to-right
   * - Recursively traverses nested Convergence states
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
        // Nested Convergence - recurse into its components
        // @ts-ignore - Runtime type narrowing
        yield* this._get_beliefs_from_convergence(component, seen)
      } else {
        // Regular State - yield its direct beliefs only (no base chain)
        yield* this._get_beliefs_from_state(component, seen)
      }
    }

    // Finally, yield our own insert operations (override component beliefs)
    for (const belief of this._insert) {
      if (!seen.has(belief.subject.sid)) {
        seen.add(belief.subject.sid)
        yield belief
      }
    }
  }

  /**
   * Helper: Get beliefs from a nested Convergence
   * @param {Convergence} convergence
   * @param {Set<number>} seen - Set of subject IDs already yielded
   * @returns {Generator<Belief, void, unknown>}
   */
  *_get_beliefs_from_convergence(convergence, seen) {
    // Recurse through convergence's components
    for (const component of convergence.component_states) {
      // @ts-ignore - is_union property for runtime type detection
      if (component.is_union) {
        // @ts-ignore - Runtime type narrowing to Convergence
        yield* this._get_beliefs_from_convergence(component, seen)
      } else {
        yield* this._get_beliefs_from_state(component, seen)
      }
    }

    // Then yield convergence's own insert operations
    for (const belief of convergence._insert) {
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
   * Override: Get next state(s) for reverse trait lookup traversal
   * Returns all component next states (polymorphic with State.rev_base)
   * @param {Subject} subject - Subject being queried in reverse lookup
   * @param {Traittype} traittype - Traittype being queried
   * @returns {State[]} Array of next states from all components
   */
  rev_base(subject, traittype) {
    return [...this.component_states]
  }

  /**
   * Override remove to throw error (not supported in Convergence)
   * @throws {Error} Always throws - remove operations not allowed in Convergence
   */
  remove_beliefs() {
    throw new Error(
      'Convergence does not support remove operations. ' +
      'Convergence is a read-only composition of component states. ' +
      'To remove beliefs, create a new State via branch() and use remove there.'
    )
  }

  /**
   * Serialize to JSON
   * @returns {{_type: string, _id: number, tt: number|null, vt: number|null, base: null, component_states: number[], ground_state: number, self: number|null, insert: number[], remove: number[], in_mind: number}}
   */
  toJSON() {
    return {
      _type: 'Convergence',
      _id: this._id,
      tt: this.tt,
      vt: this.vt,
      base: null,  // Convergence doesn't use base, always null
      component_states: this.component_states.map(s => s._id),
      ground_state: /** @type {State} */ (this.ground_state)._id,  // ground_state is always required for Convergence
      self: this.self?.toJSON() ?? null,
      insert: this._insert.map(b => b._id),
      remove: this._remove.map(b => b._id),
      in_mind: this.in_mind._id
    }
  }

  /**
   * Deserialize from JSON
   * @param {Mind} mind - Mind context for resolution
   * @param {StateJSON} data
   * @returns {Convergence}
   */
  static from_json(mind, data) {
    assert(data._type === 'Convergence', 'data._type must be Convergence')
    assert(Array.isArray(data.component_states), 'data.component_states must be an array')

    const refs = State._load_refs_from_json(mind, data)
    const state = Object.create(Convergence.prototype)
    state._type = 'Convergence'

    const vt = data.vt ?? data.tt
    state._init_properties(refs.in_mind, refs.ground_state, null, data.tt, vt, refs.self, refs.about_state, data._id)

    // Convergence-specific: resolve and set component_states
    const component_states = data.component_states.map((id) => {
      const component = DB.get_state_by_id(id)
      assert(component, `Component state ${id} not found`)
      return component
    })
    state.component_states = Object.freeze(component_states)
    state.is_union = true

    state._load_insert_from_json(data)
    state._load_remove_from_json(data)
    // No _link_base() needed - Convergence doesn't use base chain

    return state
  }

  /**
   * System designation - compact debug string
   * Decorates parent State.sysdesig() with Convergence-specific info
   * @returns {string}
   */
  sysdesig() {
    // Get base State sysdesig output
    const base = super.sysdesig()

    // Replace "State#" with "Convergence#" and add component count
    return base.replace(/State#(\d+)/, `Convergence#$1 (${this.component_states.length} components)`)
  }
}

// Register for polymorphic deserialization
State.register_type('Convergence', Convergence)
