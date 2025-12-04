/**
 * Belief - represents any entity in the game (objects, NPCs, events, observations)
 *
 * Beliefs are the universal building block. Everything from "hammer" to "Bob saw hammer"
 * to "player thinks Bob is lying" is represented as a Belief with traits.
 *
 * Key concepts:
 * - Archetype composition: Beliefs inherit traits from archetypes (e.g., Player = Actor + Mental)
 * - Immutability: Create new versions via `base` property instead of mutating
 * - Universal structure: Same format for objects, events, NPCs, observations
 *
 * See docs/SPECIFICATION.md for data model design
 * See docs/ALPHA-1.md for how beliefs are used in gameplay
 */

import { assert, log, sysdesig, debug } from './debug.mjs'
import { next_id } from './id_sequence.mjs'
import { Archetype } from './archetype.mjs'
import * as DB from './db.mjs'
import { eidos } from './cosmos.mjs'
import { Subject } from './subject.mjs'
import { Traittype } from './traittype.mjs'
import { State } from './state.mjs'

/**
 * @typedef {import('./mind.mjs').Mind} Mind
 */

/**
 * @typedef {import('./state.mjs').StateReference} StateReference
 * @typedef {import('./mind.mjs').MindReference} MindReference
 */

/**
 * @typedef {number|string|boolean|null|StateReference|MindReference|Array<number|string|boolean|null|StateReference|MindReference>} SerializedTraitValue
 * Trait values in JSON can be:
 * - number (sid or primitive)
 * - string/boolean/null (primitives)
 * - StateReference/MindReference (for State/Mind traits)
 * - Array of any of the above
 */

/**
 * @typedef {object} BeliefJSON
 * @property {string} _type - Always "Belief"
 * @property {number} _id - Unique version identifier
 * @property {number} sid - Subject identifier (stable across versions)
 * @property {string|null} label - Optional label for lookup
 * @property {number|null} about - Parent belief _id (null if not about another belief)
 * @property {string[]} archetypes - Archetype labels for this belief
 * @property {(string|number)[]} bases - Base archetype labels or belief _ids
 * @property {Object<string, SerializedTraitValue>} traits - Trait values (sids, primitives, or references)
 * @property {number|null} origin_state - State _id where this belief was created (null for shared beliefs)
 */

/**
 * Represents a belief about an entity with versioning support
 * @property {number} _id - Unique version identifier
 * @property {Subject} subject - Canonical Subject (identity holder)
 * @property {string|null} label - Optional label for lookup
 * @property {Mind|undefined} in_mind - Mind this belief belongs to (getter from origin_state)
 * @property {Set<Belief|Archetype>} _bases - Base archetypes/beliefs for inheritance
 * @property {Map<Traittype, *>} _traits - Trait values (sids, primitives, State/Mind refs)
 * @property {Map<string, any>} [_deserialized_traits] - Temporary storage during JSON deserialization
 * @property {boolean} locked - Whether belief can be modified
 */
export class Belief {

  /**
   * @param {State} state - State creating this belief
   * @param {Subject|null} [subject] - Subject (provide to create version of existing subject)
   * @param {Array<Archetype|Belief>} [bases] - Archetype or Belief objects (no strings)
   */
  constructor(state, subject = null, bases = []) {
    for (const base of bases) {
      assert(typeof base !== 'string',
             'Constructor received string base - use Belief.from_template() instead',
             {base})
    }

    assert(state instanceof State, "belief must be constructed with a state")

    /** @type {Mind} */
    const mind = state.in_mind // TODO: should not need to check for Eidos

    /** @type {Set<Belief|Archetype>} */ this._bases = new Set(bases)
    // Eidos and descendants: universals (mater=null), Materia under Logos: particulars (mater=mind)
    const mater = mind.in_eidos ? null : mind
    this.subject = subject ?? new Subject(null, mater)

    // Validate: subject.mater must be null (universal) or this mind
    // This prevents beliefs from using subjects from other minds
    assert(this.subject.mater === null || this.subject.mater === mind,
      `Belief can only use subjects with mater=null (universal) or mater=own_mind`,
      {
        subject_sid: this.subject.sid,
        subject_mater: this.subject.mater?.label || 'null',
        belief_in_mind: mind.label
      })

    this._id = next_id()
    this._traits = new Map()
    this._locked = false
    /** @type {Map<Traittype, any>} */
    this._cache = new Map()
    /** @type {State} */
    this.origin_state = state
    /** @type {boolean} - true when all inherited traits are cached */
    this._cached_all = false

    DB.register_belief_by_id(this)
    this.subject.beliefs.add(this)
    DB.register_belief_by_mind(this)
  }

  /**
   * Get locked status of this belief
   * @returns {boolean}
   */
  get locked() {
    return this._locked
  }

  /**
   * Get the mind this belief belongs to
   * @returns {Mind|undefined}
   */
  get in_mind() {
    return this.origin_state?.in_mind
  }

  /**
   * Check if this is a shared belief (prototype/template)
   * Shared beliefs live in Eidos mind (realm of forms)
   * @returns {boolean}
   */
  get is_shared() {
    // Shared beliefs live in Eidos - the realm of forms
    return this.in_mind === eidos()
  }

  /**
   * Extract Subject references from a trait value
   * @param {*} value - Trait value (Subject, array, primitive, etc.)
   * @returns {Subject[]} Array of Subjects found in value
   */
  extract_subjects(value) {
    if (value instanceof Subject) {
      return [value]
    } else if (Array.isArray(value)) {
      return value.filter(item => item instanceof Subject)
    } else {
      return []
    }
  }

  /**
   * Set trait value and update reverse index
   * Computes diff between old and new values to minimize index updates
   * @param {Traittype} traittype - Traittype object
   * @param {*} new_value - New trait value
   * @private
   */
  _set_trait(traittype, new_value) {
    assert(this.origin_state, 'origin_state required for _set_trait', {belief_id: this._id, traittype: traittype.label})

    // Only track reverse graph edges for Subject references
    // Primitives, States, Minds don't create searchable graph relationships
    if (!traittype.is_subject_reference) {
      this._traits.set(traittype, new_value)
      return
    }

    // Get old value from THIS belief's direct traits only (not inherited)
    // Inherited values belong to base beliefs and are tracked separately
    const old_value = this._traits.get(traittype)
    const old_subjects = this.extract_subjects(old_value)
    const new_subjects = this.extract_subjects(new_value)

    // Compute diff - efficient single-pass algorithm
    const old_set = new Set(old_subjects)
    const to_add = []

    for (const subject of new_subjects) {
      if (old_set.has(subject)) {
        old_set.delete(subject)  // Mark as kept
      } else {
        to_add.push(subject)     // New subject
      }
    }

    const to_remove = [...old_set]

    // Update reverse graph edges
    for (const subject of to_remove) {
      this.origin_state.rev_del(subject, traittype, this)
    }

    for (const subject of to_add) {
      this.origin_state.rev_add(subject, traittype, this)
    }

    // Set the new value
    this._traits.set(traittype, new_value)
  }

  /**
   * Add trait from template data (resolves via traittype)
   * @param {State} state - State context for resolution
   * @param {Traittype} traittype - Traittype object
   * @param {*} data - Raw data to be resolved by traittype
   * @param {object} options - Optional parameters
   * @param {State|null} [options.about_state] - State context for belief resolution (for prototype minds)
   */
  add_trait_from_template(state, traittype, data, {about_state=null} = {}) {
    assert(!this.locked, 'Cannot modify locked belief', {belief_id: this._id, label: this.get_label()})

    let value = traittype.resolve_trait_value_from_template(this, data, {about_state})

    // If composable and we have bases with this trait, compose with base values
    // TODO: Support template syntax for replace/remove operations on composable traits
    //   - {replace: [...]} to ignore base values and use only provided values
    //   - {remove: [...]} to compose from bases then filter out specified items
    //   Current: Plain arrays always compose, null blocks composition
    //   Example: inventory: {replace: ['sword']} → only sword, ignore Villager's token
    //            inventory: {remove: ['token']} → compose then remove token
    if (traittype.composable && value !== null) {
      const base_values = this.collect_latest_value_from_all_bases(traittype)
      if (base_values.length > 0) {
        // Compose: base values first, then new value
        const all_values = [...base_values, value]
        value = traittype.compose(this, all_values)
      }
    }

    // Call add_trait with resolved (and possibly composed) value
    this.add_trait(traittype, value)
  }

  /**
   * @param {Traittype} traittype - Traittype object
   * @param {any} data
   */
  add_trait(traittype, data) {
    assert(!this.locked, 'Cannot modify locked belief', {belief_id: this._id, label: this.get_label()})
    assert(this.can_have_trait(traittype), `Belief can't have trait ${traittype.label}`, {label: traittype.label, belief: this.get_label(), data, archetypes: [...this.get_archetypes()].map(a => a.label)})

    if (debug()) {
      const old_value = this.get_trait(this.origin_state, traittype)
      if (old_value !== null) {
        debug([this.origin_state], 'Replacing trait', traittype.label, 'in', this.get_label() ?? `#${this._id}`, 'old:', old_value, 'new:', data)
      }
    }

    this._set_trait(traittype, data)
  }

  /**
   * Get trait value from this belief only (does not check bases)
   * Polymorphic interface - matches Archetype.get_own_trait_value()
   * @param {Traittype} traittype - Trait type
   * @returns {any} Trait value or undefined if not found
   */
  get_own_trait_value(traittype) {
    assert(traittype instanceof Traittype, "get_own_trait_value requires Traittype", {belief_id: this._id, traittype})
    return this._traits.get(traittype)
  }

  /**
   * Get iterable over trait entries (polymorphic interface)
   * Returns iterable of [traittype, value] pairs for trait operations collection
   * @returns {Generator<[Traittype, any]>} Iterable iterator of trait entries
   */
  *get_trait_entries() {
    for (const [traittype, value] of this._traits) {
      yield [traittype, value]
    }
  }

  /**
   * @param {Traittype} traittype
   * @returns {boolean}
   */
  can_have_trait(traittype) {
    assert(traittype instanceof Traittype, 'can_have_trait requires Traittype', {belief_id: this._id, traittype})
    for (const archetype of this.get_archetypes()) {
      if (archetype.has_trait(traittype)) return true
    }
    return false
  }

  /**
   * Get inherited trait value from bases chain
   * First checks if Traittype has a derivation strategy (composable, etc)
   * Then walks the inheritance chain breadth-first to find the first defined value
   * @param {State} state - State context (used by Traittype for derived values)
   * @param {Traittype} traittype - Traittype to get
   * @returns {*} trait value (Subject, not Belief), or null if not found
   * @private
   */
  _get_inherited_trait(state, traittype) {
    let value = traittype.get_derived_value(this)
    if (value !== undefined) return value

    const queue = [...this._bases]
    const seen = new Set()

    while (queue.length > 0) {
      const base = queue.shift()
      if (!base || seen.has(base)) continue
      seen.add(base)

      // Check for value - early return when found
      value = base.get_own_trait_value(traittype)
      if (value !== undefined) return value

      // Continue to next level
      queue.push(...base._bases)
    }

    return null
  }

  /**
   * Get trait value (Subject/primitive/State/Mind/array) including inherited
   * Returns own trait immediately if present, otherwise looks up inherited value
   * Delegates to Traittype for derived values (composable, etc)
   * Caches inherited traits when belief is locked (cache is belief-level, not state-level)
   * @param {State} state - State context (used by Traittype for derived values)
   * @param {Traittype} traittype - Traittype object
   * @returns {*} trait value (Subject, not Belief), or null if not found
   */
  get_trait(state, traittype) {
    assert(state instanceof State, "get_trait requires State - shared beliefs must use origin_state or appropriate context state", {belief_id: this._id, traittype: traittype?.label, state})
    assert(traittype instanceof Traittype, "get_trait requires Traittype", {belief_id: this._id, traittype})

    let value = this._traits.get(traittype)
    if (value !== undefined) return value

    value = this._get_cached(traittype)
    if (value !== undefined) return value

    value = this._get_inherited_trait(state, traittype)
    if (this.locked) this._set_cache(traittype, value)

    return value
  }

  /**
   * Get beliefs that reference this belief via a trait (reverse lookup)
   * Inverse of get_trait(): finds all beliefs where belief.get_trait(state, traittype) includes this.subject
   * Uses skip list to efficiently traverse only states with relevant changes
   * @param {State} state - State to query
   * @param {Traittype} traittype - Traittype to find reverse references for
   * @yields {Belief} Beliefs in state that reference this belief's subject via traittype
   */
  *rev_trait(state, traittype) {
    assert(state instanceof State, 'rev_trait requires State', {belief_id: this._id, traittype: traittype?.label})
    assert(traittype instanceof Traittype, 'rev_trait requires Traittype', {belief_id: this._id, traittype})

    debug([state], "rev_trait", this, traittype.label)

    // TODO: Update the trait indexes here instead of on modify
    const seen = new Set()
    const yielded = new Set()

    // Walk skip list - only visit states with changes for this (subject, traittype)
    // Use queue to handle Convergence's multiple component_states
    const queue = [state]
    while (queue.length > 0) {
      const current = /** @type {State} */ (queue.shift())

      // Add all deletions to seen set
      const del_beliefs = current._rev_del.get(this.subject)?.get(traittype)
      if (del_beliefs) {
        for (const belief of del_beliefs) {
          seen.add(belief._id)
        }
      }

      // Yield additions (not deleted, not already yielded)
      const add_beliefs = current._rev_add.get(this.subject)?.get(traittype)
      if (add_beliefs) {
        for (const belief of add_beliefs) {
          if (seen.has(belief._id)) continue
          if (yielded.has(belief._id)) continue
          yielded.add(belief._id)
          yield belief
        }
      }

      // Get next state(s) via polymorphic rev_base (handles Convergence components)
      const next_states = current.rev_base(this.subject, traittype)
      queue.push(...next_states)
    }
  }

  /**
   * Iterate over all reverse trait references (beliefs referencing this subject)
   * Corresponds to get_defined_traits() - includes traittypes even when all beliefs are deleted
   * @param {State} state - State to query
   * @yields {[Traittype, Belief]} [traittype, belief] pairs for all referencing beliefs
   */
  *rev_defined_traits(state) {
    assert(state instanceof State, 'rev_defined_traits requires State', {belief_id: this._id})

    const yielded_traittypes = new Set()
    const queue = [state]
    const visited_states = new Set()

    while (queue.length > 0) {
      const current = /** @type {State} */ (queue.shift())
      if (visited_states.has(current._id)) continue
      visited_states.add(current._id)

      // Collect traittypes from both add and del maps for this state
      const traittypes_here = new Set()

      const add_map = current._rev_add.get(this.subject)
      if (add_map) {
        for (const traittype of add_map.keys()) {
          traittypes_here.add(traittype)
        }
      }

      const del_map = current._rev_del.get(this.subject)
      if (del_map) {
        for (const traittype of del_map.keys()) {
          traittypes_here.add(traittype)
        }
      }

      // Yield beliefs for new traittypes (rev_trait walks full state chain)
      for (const traittype of traittypes_here) {
        if (yielded_traittypes.has(traittype)) continue
        yielded_traittypes.add(traittype)

        for (const belief of this.rev_trait(state, traittype)) {
          yield [traittype, belief]
        }
      }

      // Walk to base state
      if (current.base) queue.push(current.base)
    }
  }

  /**
   * Iterate over reverse trait references with non-null values
   * Corresponds to get_traits() - excludes traittypes where all beliefs were deleted
   * @param {State} state - State to query
   * @yields {[Traittype, Belief]} [traittype, belief] pairs for all referencing beliefs
   */
  *rev_traits(state) {
    for (const pair of this.rev_defined_traits(state)) {
      yield pair
    }
  }

  /**
   * Collect trait values from all direct bases for composition
   * Called by Traittype.get_derived_value() for composable traits
   * Collects ONE value per direct base (stops at first found in each base's chain)
   * This implements the "latest version" semantics: each base's chain has one latest value
   * @param {Traittype} traittype - Traittype to collect
   * @returns {Array<any>} Array of values (one per direct base that has the trait)
   */
  collect_latest_value_from_all_bases(traittype) {
    const values = []
    const queue = [...this._bases]
    const seen = new Set()

    while (queue.length > 0) {
      const base = queue.shift()
      if (!base || seen.has(base)) continue
      seen.add(base)

      // Polymorphic call - both Archetype and Belief accept Traittype
      const value = base.get_own_trait_value(traittype)

      if (value !== undefined) {
        if (value !== null) values.push(value)
        continue  // Stop - found this base's value, don't search its ancestors
      }

      // Not found - continue searching this base's ancestors
      queue.push(...base._bases)
    }

    return values
  }

  /**
   * Get cached trait value
   * @param {Traittype} traittype - Traittype object
   * @returns {any|undefined} Cached value or undefined if not cached
   * @private
   */
  _get_cached(traittype) {
    return this._cache.get(traittype)
  }

  /**
   * Set cached trait value
   * @param {Traittype} traittype - Traittype object
   * @param {any} value - Value to cache
   * @private
   */
  _set_cache(traittype, value) {
    this._cache.set(traittype, value)
  }

  /**
   * Iterate over all defined traits (own and inherited) including those with null values
   * Own traits shadow inherited traits with the same name
   * Delegates to Traittype for derived values (composable, etc) - same logic as get_trait()
   * Caches inherited traits when belief is locked (belief-level cache)
   * Includes all trait definitions from archetypes (even null/unset values)
   * @returns {Generator<[Traittype, *]>} Yields [traittype, value] pairs
   */
  *get_defined_traits() {
    const yielded = new Set()

    // Yield own traits first
    for (const [traittype, value] of this._traits) {
      yield [traittype, value]
      yielded.add(traittype)
    }

    for (const [traittype, value] of this._cache) {
      yield [traittype, value]
      yielded.add(traittype)
    }
    if (this._cached_all) return

    // Walk bases chain for inherited traits
    const queue = [...this._bases]
    const seen = new Set()

    while (queue.length > 0) {
      const base = queue.shift()
      if (!base || seen.has(base)) continue
      seen.add(base)

      // Yield base's own traits
      for (const [traittype, trait_value] of base.get_trait_entries()) {
        if (yielded.has(traittype)) continue

        let value = trait_value
        const derived_value = traittype.get_derived_value(this)
        if (derived_value !== undefined) value = derived_value
        if (this.locked) this._set_cache(traittype, value)

        yield [traittype, value]
        yielded.add(traittype)
      }

      // If base belief has fully cached traits, use its cache instead of walking deeper
      if (!(base instanceof Belief && base._cached_all)) {
        queue.push(...base._bases)
        continue
      }

      // Base has complete cache - iterate it instead of walking base._bases
      for (const [traittype, cached_value] of base._cache) {
        if (yielded.has(traittype)) continue

        let value = cached_value
        const derived_value = traittype.get_derived_value(this)
        if (derived_value !== undefined) value = derived_value
        if (this.locked) this._set_cache(traittype, value)

        yield [traittype, value]
        yielded.add(traittype)
      }
    }

    if (this.locked) this._cached_all = true
  }

  /**
   * Iterate over traits that have non-null values (excludes null/undefined traits)
   * @returns {Generator<[Traittype, *]>} Yields [traittype, value] pairs for set traits only
   */
  *get_traits() {
    for (const pair of this.get_defined_traits()) {
      if (pair[1] != null) yield pair
    }
  }

  /**
   * Iterate over available trait slots from archetypes
   * Shows what traits CAN be set based on archetype composition
   * @returns {Generator<Traittype>} Yields traittypes available from archetypes
   */
  *get_slots() {
    const yielded = new Set()

    for (const archetype of this.get_archetypes()) {
      for (const traittype of archetype._traits_template.keys()) {
        if (!yielded.has(traittype)) {
          yield traittype
          yielded.add(traittype)
        }
      }
    }
  }

  /**
   * Get the belief this is about (resolves `@about` trait)
   * @param {State} belief_state - The state where this belief exists (must have ground_state)
   * @returns {Belief|null} The belief this is about, or null
   */
  get_about(belief_state) {
    // Use get_trait to check own and inherited @about trait
    const t_about = Traittype.get_by_label('@about')
    assert(t_about, "Traittype '@about' not found in registry")
    const about_trait = this.get_trait(belief_state, t_about)

    //log("belief about", this, about_trait);
    if (!(about_trait instanceof Subject)) return null

    assert(belief_state instanceof State, 'get_about requires State where belief exists', {belief_state})

    // Check about_state first (for prototypes referencing world beliefs), then ground_state
    const resolve_state = belief_state.about_state ?? belief_state.ground_state
    assert(resolve_state instanceof State, 'belief_state with @about must have about_state or ground_state', {belief_state})

    const belief = resolve_state.get_belief_by_subject(about_trait)
    assert(belief instanceof Belief, 'Belief referenced by @about must exist in resolve_state', {about_trait, resolve_state_id: resolve_state._id, resolve_state_mind: resolve_state.in_mind?.label})
    return belief
  }

  /**
   * Get tt for this belief
   * Returns transaction time from origin_state, or -Infinity for timeless prototypes
   * @returns {number} Transaction time when this belief was created, or -Infinity for timeless shared beliefs
   */
  get_tt() {
    return this.origin_state?.tt ?? -Infinity
  }

  /**
   * @param {Set<Belief|Archetype>} seen
   * @returns {Generator<Archetype>}
   */
  *get_archetypes(seen = new Set()) {
    // breadth first
    /** @type {(Belief|Archetype)[]} */ const bases = [this]
    while (bases.length > 0) {
      const base = bases.shift()
      if (!base || seen.has(base)) continue

      if (base instanceof Archetype) {
        yield* base.get_archetypes(seen)
      } else {
        seen.add(base)
        bases.push(... base._bases)
      }
    }
  }

  /**
   * Get prototype chain (both Archetypes and shared Beliefs with labels)
   *
   * Prototypes are inheritance templates: Archetypes (global) and shared Beliefs (cultural knowledge).
   * Unlike observable beliefs in states, prototypes have no ownership (in_mind = null) and exist
   * only for inheritance via bases. They cannot be learned about, only inherited from.
   * @param {Set<Belief|Archetype>} [seen]
   * @returns {Generator<Belief|Archetype>}
   */
  *get_prototypes(seen = new Set()) {
    /** @type {(Belief|Archetype)[]} */ const bases = [this]
    while (bases.length > 0) {
      const base = bases.shift()
      if (!base || seen.has(base)) continue
      seen.add(base)

      if (base instanceof Archetype) {
        yield base
      } else if (base.is_shared && base.get_label() !== null) {
        yield base
      }
      bases.push(...base._bases)
    }
  }

  /**
   * Lock this belief and cascade to child mind states
   * @param {State} state - State context being locked
   */
  lock(state) {
    assert(state._insert.includes(this),
      'Cannot lock belief not in state._insert',
      {belief_id: this._id, label: this.get_label(), state_id: state._id})

    this._locked = true

    // Cascade to child mind states
    // Note: Only checks _traits (directly set on this belief), not inherited traits.
    // Inherited Mind traits come from base beliefs that must already be locked,
    // so they were already cascaded when the base belief locked.
    for (const [traittype, trait_value] of this._traits) {
      // Skip non-Mind traits
      if (traittype.data_type !== 'Mind') continue
      if (!trait_value) continue

      // Handle array of Mind references
      if (Array.isArray(trait_value)) {
        for (const mind of trait_value) {
          const child_states = mind.get_states_by_ground_state(state)
          for (const child_state of child_states) {
            if (!child_state.locked) {
              child_state.lock()
            }
          }
        }
      }
      // Handle single Mind reference
      else {
        const child_states = trait_value.get_states_by_ground_state(state)
        for (const child_state of child_states) {
          if (!child_state.locked) {
            child_state.lock()  // This will cascade to state's beliefs, which cascade to their minds, etc.
          }
        }
      }
    }
  }

  /**
   * Get label for this belief's subject (sid)
   * @returns {string|null}
   */
  get_label() {
    return this.subject.get_label()
  }

  /**
   * Generate a designation string for this belief
   * @param {State} state - State context for resolving `@about`
   * @returns {string} Designation string (e.g., "hammer [PortableObject] #42")
   */
  sysdesig(state) {
    assert(state instanceof State, 'sysdesig requires State parameter', {belief_id: this._id, label: this.get_label()})

    const parts = []

    const label = this.get_label()
    if (label) {
      parts.push(label)
    }

    const edge_archetypes = []
    const seen = new Set()
    /** @type {Belief[]} */ const bases_to_check = [this]

    while (bases_to_check.length > 0) {
      const base = bases_to_check.shift()
      if (!base || seen.has(base)) continue
      seen.add(base)

      for (const b of base._bases) {
        if (b instanceof Archetype) {
          edge_archetypes.push(b)
        } else if (b instanceof Belief) {
          bases_to_check.push(b)
        }
      }

      if (edge_archetypes.length > 0) break
    }

    if (edge_archetypes.length > 0) {
      parts.push(`[${edge_archetypes.map(a => a.label).join(', ')}]`)
    }

    // Include subject label if this belief is about something
    const about_belief = this.get_about(state)
    if (about_belief) {
      const about_label = about_belief.get_label()
      if (about_label) {
        parts.push(`about ${about_label}`)
      }
    }

    parts.push(`#${this._id}`)

    // Add Eidos marker for shared beliefs
    if (this.is_shared) {
      parts.push('◊')
    }

    // Only show lock symbol when locked (unlocked is default)
    if (this.locked) {
      parts.push('🔒')
    }

    return parts.join(' ')
  }

  toJSON() {
    const t_about = Traittype.get_by_label('@about')
    const about_trait = t_about ? this._traits.get(t_about) : null
    return {
      _type: 'Belief',
      _id: this._id,
      sid: this.subject.sid,
      label: this.get_label(),
      about: about_trait?.toJSON() ?? null,
      archetypes: [...this.get_archetypes()].map(a => a.label),
      bases: [...this._bases].map(b => b instanceof Archetype ? b.label : b._id),
      traits: Object.fromEntries(
        [...this._traits].map(([traittype, v]) => [traittype.label, Traittype.serializeTraitValue(v)])
      ),
      origin_state: this.origin_state?._id ?? null
    }
  }

  /**
   * Create prototype reference for inspect UI
   * @returns {{label: string|null, type: 'Belief', id: number}}
   */
  to_inspect_prototype() {
    return {label: this.get_label(), type: 'Belief', id: this._id}
  }

  /**
   * Create base reference for inspect UI
   * @returns {{label: string|null, id: number}}
   */
  to_inspect_base() {
    return {label: this.get_label(), id: this._id}
  }

  /**
   * Create shallow inspection view of this belief for the inspect UI
   * @param {State} state - State context for resolving trait sids
   * @returns {{_type: string, _id: number, label: string|null, archetypes: string[], prototypes: Array<{label: string|null, type: string, id?: number}>, bases: Array<{label: string|null, id?: number}>, traits: any, mind_id?: number, mind_label?: string|null, about_label?: string|null, locked?: boolean}} Shallow representation with references, including mind context and what this knowledge is about (for cross-mind knowledge beliefs)
   */
  to_inspect_view(state) {
    assert(state instanceof State, "should be State", state);

    // Build traits object from get_traits() (includes all traits, even nulls, for complete schema view)
    const traits_obj = /** @type {Record<string, any>} */ ({})
    for (const [traittype, v] of this.get_traits()) {
      traits_obj[traittype.label] = traittype.to_inspect_view(state, v)
    }

    const result = /** @type {{_type: string, _id: number, label: string|null, archetypes: string[], prototypes: Array<{label: string|null, type: string, id?: number}>, bases: Array<{label: string|null, id?: number}>, traits: any, mind_id?: number, mind_label?: string|null, about_label?: string|null, locked?: boolean}} */ ({
      _type: 'Belief',
      _id: this._id,
      label: this.get_label(),
      archetypes: [...this.get_archetypes()].map(a => a.label),
      prototypes: [...this.get_prototypes()].map(p => p.to_inspect_prototype()),
      bases: [...this._bases].map(b => b.to_inspect_base()),
      traits: traits_obj
    })

    // Add mind info if this belief is in a mind
    if (this.in_mind) {
      result.mind_id = this.in_mind._id
      result.mind_label = this.in_mind.label
    }

    // Add "about" info if this is knowledge about something
    // For cross-mind beliefs, use the belief's own state context to resolve @about
    const belief_state = this.origin_state ?? state
    const about_belief = this.get_about(belief_state)
    if (about_belief) {
      result.about_label = about_belief.get_label()
    }

    // Only include locked field if unlocked (to highlight mutable state)
    if (!this.locked) {
      result.locked = false
    }
    return result
  }

  /**
   * Finalize traits after JSON deserialization - resolve State/Mind reference objects
   * Called after all entities are loaded from JSON
   * Converts string-keyed _traits Map (from JSON) to Traittype-keyed Map
   */
  _finalize_traits_from_json() {
    // Convert from temporary string-keyed storage to Traittype-keyed Map
    /** @type {Map<string, any>} */
    // @ts-expect-error - _deserialized_traits is set dynamically in from_json()
    const temp = this._deserialized_traits
    for (const [trait_name, trait_value] of temp) {
      const traittype = Traittype.get_by_label(trait_name)
      if (traittype) {
        this._traits.set(traittype, traittype.deserialize_value(this, trait_value))
      }
      // If no traittype found, skip (invalid trait)
    }
    // Clean up temporary storage
    // @ts-expect-error - cleaning up dynamically set property
    delete this._deserialized_traits
  }

  /**
   * Load belief from JSON data
   * @param {Mind} mind
   * @param {BeliefJSON} data
   * @returns {Belief}
   */
  static from_json(mind, data) {
    // Create belief shell without going through normal constructor
    const belief = Object.create(Belief.prototype)

    belief._id = data._id
    // Eidos: universals (mater=null), Materia: particulars (mater=mind)
    const mater = mind._type === 'Eidos' ? null : mind
    belief.subject = Subject.get_or_create_by_sid(data.sid, mater)
    belief._locked = false
    belief._cache = new Map()
    belief._cached_all = false

    // Resolve 'bases' (archetype labels or belief IDs)
    belief._bases = new Set()
    for (const base_ref of data.bases) {
      if (typeof base_ref === 'string') {
        const archetype = Archetype.get_by_label(base_ref)
        if (!archetype) {
          throw new Error(`Archetype '${base_ref}' not found for belief ${belief._id}`)
        }
        belief._bases.add(archetype)
      } else if (typeof base_ref === 'number') {
        const base_belief = DB.get_belief_by_id(base_ref)
        if (!base_belief) {
          throw new Error(`Cannot resolve base belief ${base_ref} for belief ${belief._id}`)
        }
        belief._bases.add(base_belief)
      }
    }

    // Copy traits as-is - sids, primitives, and State/Mind reference objects
    // Use temporary storage with string keys - _finalize_traits_from_json() converts to Traittype Map
    /** @type {Map<string, any>} */
    belief._deserialized_traits = new Map()
    for (const [trait_name, trait_value] of Object.entries(data.traits)) {
      belief._deserialized_traits.set(trait_name, trait_value)
    }

    // If about field exists in JSON (for backward compat or from @about trait serialization),
    // store it as sid in @about trait
    if (data.about != null && !belief._deserialized_traits.has('@about')) {
      // data.about is a sid (from Subject.toJSON()), store it directly
      belief._deserialized_traits.set('@about', data.about)
    }

    // _traits will be initialized by _finalize_traits_from_json()
    belief._traits = new Map()

    // Register globally
    DB.register_belief_by_id(belief)
    belief.subject.beliefs.add(belief)

    // Register label-sid mappings (for first belief with this label loaded)
    if (data.label) {
      if (!DB.has_label(data.label)) {
        if (Archetype.get_by_label(data.label)) {
          throw new Error(`Label '${data.label}' is already used by an archetype`)
        }
        DB.register_label(data.label, belief.subject.sid)
      }
    }

    return belief
  }

  /**
   * Create belief from template with string resolution and trait templates
   * @param {State} state - State context (provides mind and creator_state)
   * @param {any} template - Template with sid, bases, traits, about_state, label
   * @returns {Belief}
   */
  static from_template(state, {sid=null, bases=[], traits={}, about_state=null, label=null} = {}) {
    assert(state instanceof State, 'from_template requires State as first argument', {state})

    const resolved_bases = bases.map((/** @type {string|Belief|Archetype} */ base_in) => {
      if (typeof base_in === 'string') {

        // Try archetype first (lighter)
        const archetype = Archetype.get_by_label(base_in)
        if (archetype) return archetype

        // Try shared belief (prototype only - prevents same-state inheritance)
        // TODO: Future - support versioned subjects (bases from earlier states with tt < state.tt)
        const subject = Subject.get_by_label(base_in)
        const base = subject?.get_shared_belief_by_state(state)
        if (base) {
          const origin_state_label = base.origin_state?.in_mind?.label ?? 'unknown'
          assert(base.locked,
                 `Cannot add belief with unlocked base '${base.get_label()}' (in ${base.in_mind?.label}) - ` +
                 `must lock in ${origin_state_label}.origin_state before using as base`,
                 {
                   unlocked_base_id: base._id,
                   unlocked_base_label: base.get_label(),
                   unlocked_base_in_state: base.origin_state?._id,
                   unlocked_base_in_mind: base.in_mind?.label,
                   needs_lock_call: `${base.get_label()}.lock(${origin_state_label}.origin_state)`,
                   creating_belief_label: label ?? 'unlabeled',
                   creating_belief_in_state: state._id,
                   creating_belief_in_mind: state.in_mind?.label,
                   base_name_resolved: base_in
                 })
          return base
        }

        // Not found
        assert(false, `Base '${base_in}' not found as archetype or shared belief (prototype). Only archetypes and prototypes can be used as bases.`, {base_in, note: 'To use an entity as a base, convert it to a prototype (shared belief with in_mind=null, origin_state=null)'})
      }
      return base_in
    })

    // Eidos: universals (mater=null), Materia: particulars (mater=mind)
    const mater = state.in_mind._type === 'Eidos' ? null : state.in_mind
    const subject = sid != null ? Subject.get_or_create_by_sid(sid, mater) : new Subject(null, mater)
    if (label) subject.set_label(label)

    debug([state], "Create belief with", ...resolved_bases)

    const belief = new Belief(state, subject, resolved_bases)

    // Add remaining traits
    for (const [trait_label, trait_data] of Object.entries(traits)) {
      debug("  add trait", trait_label)
      const traittype = Traittype.get_by_label(trait_label)
      assert(traittype instanceof Traittype, `Trait ${trait_label} do not exist`, {trait_label, belief: belief.get_label(), trait_data})
      belief.add_trait_from_template(state, traittype, trait_data, {about_state})
    }

    // Add belief to state's insert list (validates locked state and origin_state)
    state.insert_beliefs(belief)

    return belief
  }

  /**
   * Create belief without template
   * @param {State} state - State creating this belief
   * @param {Array<Belief|Archetype>} [bases] - Base beliefs/archetypes
   * @param {Record<string, any>} [traits] - Trait values (already resolved, not template data)
   * @returns {Belief}
   */
  static from(state, bases = [], traits = {}) {
    const belief = new Belief(state, null, bases)

    for (const [trait_label, trait_data] of Object.entries(traits)) {
      const traittype = Traittype.get_by_label(trait_label)
      assert(traittype instanceof Traittype, `Trait ${trait_label} do not exist`, {trait_label})
      belief.add_trait(traittype, trait_data)
    }

    return belief
  }

  /**
   * Create a new version of this belief with updated traits
   * Similar to State.branch() pattern - creates versioned belief with same subject
   * @param {State} state - State context for the new belief
   * @param {Record<string, any>} traits - Trait updates (already resolved, not templates)
   * @returns {Belief} New belief with this belief as base
   */
  branch(state, traits = {}) {
    assert(state instanceof State, 'branch requires State parameter', {belief_id: this._id})
    assert(!state.locked, 'Cannot branch into locked state', {state_id: state._id, belief_id: this._id})

    // Create new belief with same subject (versioning) and current belief as base
    const branched = new Belief(state, this.subject, [this])

    // Add traits directly (no template resolution)
    for (const [trait_label, trait_value] of Object.entries(traits)) {
      const traittype = Traittype.get_by_label(trait_label)
      assert(traittype instanceof Traittype, `Traittype '${trait_label}' not found`, {trait_label})
      branched.add_trait(traittype, trait_value)
    }

    // Insert into state automatically (convenience - mirrors from_template)
    state.insert_beliefs(branched)

    return branched
  }

}
