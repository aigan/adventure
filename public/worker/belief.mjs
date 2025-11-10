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
 */

/**
 * Represents a belief about an entity with versioning support
 * @property {number} _id - Unique version identifier
 * @property {Subject} subject - Canonical Subject (identity holder)
 * @property {string|null} label - Optional label for lookup
 * @property {Mind} in_mind - Mind this belief belongs to (eidos() for prototypes)
 * @property {Set<Belief|Archetype>} _bases - Base archetypes/beliefs for inheritance
 * @property {Map<string, *>} _traits - Trait values (sids, primitives, State/Mind refs)
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
    const mind = state.in_mind
    const ground_mind = mind.parent

    /** @type {Set<Belief|Archetype>} */ this._bases = new Set(bases)
    this.subject = subject ?? DB.get_or_create_subject(ground_mind)
    this._id = next_id()
    /** @type {Mind} */
    this.in_mind = mind
    this._traits = new Map()
    this._locked = false
    /** @type {Map<State, Map<string, any>>} */
    this._cache = new Map()
    /** @type {State} */
    this.origin_state = state

    DB.register_belief_by_id(this)
    DB.register_belief_by_subject(this)
  }

  /**
   * Get locked status of this belief
   * @returns {boolean}
   */
  get locked() {
    return this._locked
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
   * Add trait from template data (resolves via traittype)
   * @param {State} state - State context for resolution
   * @param {string} label - Trait label
   * @param {*} data - Raw data to be resolved by traittype
   * @param {object} options - Optional parameters
   * @param {State|null} [options.about_state] - State context for belief resolution (for prototype minds)
   */
  add_trait_from_template(state, label, data, {about_state=null} = {}) {
    assert(!this.locked, 'Cannot modify locked belief', {belief_id: this._id, label: this.get_label()})

    // Resolve via traittype, then call add_trait with resolved value
    const traittype = Traittype.get_by_label(label)
    assert(traittype instanceof Traittype, `Trait ${label} do not exist`, {label, belief: this.get_label(), data})

    let value = /** @type {Traittype} */ (traittype).resolve_trait_value_from_template(this, data, {about_state})

    // If composable and we have bases with this trait, compose with base values
    // TODO: Support template syntax for replace/remove operations on composable traits
    //   - {replace: [...]} to ignore base values and use only provided values
    //   - {remove: [...]} to compose from bases then filter out specified items
    //   Current: Plain arrays always compose, null blocks composition
    //   Example: inventory: {replace: ['sword']} → only sword, ignore Villager's token
    //            inventory: {remove: ['token']} → compose then remove token
    if (traittype.composable && value !== null) {
      const base_values = this._collect_all_trait_values(label)
      if (base_values.length > 0) {
        // Compose: base values first, then new value
        const all_values = [...base_values, value]
        value = traittype.compose(this, all_values)
      }
    }

    // Call add_trait with resolved (and possibly composed) value
    this.add_trait(label, value)
  }

  /**
   * @param {string} label
   * @param {any} data
   */
  add_trait(label, data) {
    assert(!this.locked, 'Cannot modify locked belief', {belief_id: this._id, label: this.get_label()})

    // Invalidate cache when trait is added/changed
    this._cache.clear()

    const traittype = Traittype.get_by_label(label)
    assert(traittype instanceof Traittype, `Trait ${label} do not exist`, {label, belief: this.get_label(), data})

    assert(this.can_have_trait(label), `Belief can't have trait ${label}`, {label, belief: this.get_label(), data, archetypes: [...this.get_archetypes()].map(a => a.label)})

    if (debug()) {
      const old_value = this.get_trait(this.origin_state, label)
      if (old_value !== null) {
        debug([this.origin_state], 'Replacing trait', label, 'in', this.get_label() ?? `#${this._id}`, 'old:', old_value, 'new:', data)
      }
    }

    this._traits.set(label, data)
  }

  /**
   * Get trait value from this belief only (does not check bases)
   * Polymorphic interface - matches Archetype.get_own_trait_value()
   * @param {string} name - Trait name
   * @returns {any} Trait value or undefined if not found
   */
  get_own_trait_value(name) {
    return this._traits.get(name)
  }

  /**
   * Get iterable over trait entries (polymorphic interface)
   * Returns iterable of [key, value] pairs for trait operations collection
   * @returns {IterableIterator<[string, any]>} Iterable iterator of trait entries
   */
  get_trait_entries() {
    return this._traits.entries()
  }

  /**
   * @param {string} label
   * @returns {boolean}
   */
  can_have_trait(label) {
    for (const archetype of this.get_archetypes()) {
      if (archetype.has_trait(label)) return true
    }
    return false
  }

  /**
   * Get trait value (Subject/primitive/State/Mind/array) including inherited
   * Walks the bases chain to find inherited trait values (prototype pattern)
   * For composable traits, composes values from all bases and caches result
   * @param {State} state - State context for trait resolution
   * @param {string} trait_name - Name of the trait to get
   * @returns {*} trait value (Subject, not Belief), or null if not found
   */
  get_trait(state, trait_name) {
    assert(state instanceof State, "get_trait requires State - shared beliefs must use origin_state or appropriate context state", {belief_id: this._id, trait_name, state})

    // FIXME: simplify. Remove repeated _set_cache. Only cache at the end, and only if the value can
    // not change, as for when the state is locked, and only for heavy lookups. Perhaps move to
    // traittype.

    // Check cache first
    const cached = this._get_cached(state, trait_name)
    if (cached !== undefined) {
      //log('  return cached trait', this._id, trait_name, cached)
      return cached
    }

    // Check own value - blocks base search (override)
    if (this._traits.has(trait_name)) {
      const value = this._traits.get(trait_name)
      this._set_cache(state, trait_name, value)
      return value
    }

    // Get traittype to check if composable
    const traittype = Traittype.get_by_label(trait_name)

    // If composable, collect all values and compose
    if (traittype?.composable) {
      const values = this._collect_all_trait_values(trait_name)

      if (values.length === 0) {
        this._set_cache(state, trait_name, null)
        return null
      }

      if (values.length === 1) {
        this._set_cache(state, trait_name, values[0])
        return values[0]
      }

      // Compose multiple values
      const composed = traittype.compose(this, values)
      this._set_cache(state, trait_name, composed)
      return composed
    }

    // Non-composable: first-wins breadth-first search (original behavior)
    const queue = [...this._bases]
    const seen = new Set()

    while (queue.length > 0) {
      const base = queue.shift()
      if (!base || seen.has(base)) continue
      seen.add(base)

      // Check for value - early return when found
      const value = base.get_own_trait_value(trait_name)
      if (value !== undefined) {
        this._set_cache(state, trait_name, value)
        return value
      }

      // Continue to next level
      queue.push(...base._bases)
    }

    // Not found
    this._set_cache(state, trait_name, null)
    return null
  }

  /**
   * Collect all trait values from bases (breadth-first traversal)
   * Used for composable traits
   * @param {string} trait_name - Trait name to collect
   * @returns {Array<any>} Array of values from all bases
   * @private
   */
  _collect_all_trait_values(trait_name) {
    const values = []
    const queue = [...this._bases]
    const seen = new Set()

    while (queue.length > 0) {
      const base = queue.shift()
      if (!base || seen.has(base)) continue
      seen.add(base)

      const value = base.get_own_trait_value(trait_name)

      // Explicit null blocks this branch (don't search further up)
      if (value === null) {
        continue
      }

      // Collect non-null, non-undefined values
      if (value !== undefined) {
        values.push(value)
      }

      // Continue searching up the chain (only if value wasn't explicit null)
      queue.push(...base._bases)
    }

    return values
  }

  /**
   * Get cached trait value for a state
   * @param {State} state - State context
   * @param {string} trait_name - Trait name
   * @returns {any|undefined} Cached value or undefined if not cached
   * @private
   */
  _get_cached(state, trait_name) {
    if (!this._cache.has(state)) return undefined
    const state_cache = this._cache.get(state)
    if (!state_cache) return undefined
    return state_cache.has(trait_name) ? state_cache.get(trait_name) : undefined
  }

  /**
   * Set cached trait value for a state
   * @param {State} state - State context
   * @param {string} trait_name - Trait name
   * @param {any} value - Value to cache
   * @private
   */
  _set_cache(state, trait_name, value) {
    //console.warn('cached', this._id, trait_name, value)
    if (!state.locked) return

    if (!this._cache.has(state)) {
      this._cache.set(state, new Map())
    }
    const state_cache = this._cache.get(state)
    if (state_cache) {
      state_cache.set(trait_name, value)
    }
  }

  /**
   * Iterate over all traits (own and inherited) with their values
   * Own traits shadow inherited traits with the same name
   * Includes archetype default values (non-null values from archetype traits_template)
   * @returns {Generator<[string, *]>} Yields [trait_name, value] pairs
   */
  *get_traits() {
    const yielded = new Set()

    // FIXME: Need to use the same logic as get_trait, for example for composed traits.  Also cache
    // the result if it will not change, and if it was a heavy lookup

    // Yield own traits first
    for (const [name, value] of this._traits) {
      yield [name, value]
      yielded.add(name)
    }

    // Walk bases chain for inherited traits
    const queue = [...this._bases]
    const seen = new Set()

    while (queue.length > 0) {
      const base = queue.shift()
      if (!base || seen.has(base)) continue
      seen.add(base)

      if (base instanceof Belief) {
        // Belief bases: yield trait values
        for (const [name, value] of base._traits) {
          if (!yielded.has(name)) {
            yield [name, value]
            yielded.add(name)
          }
        }
      } else {
        // Archetype bases: yield traits with non-null default values
        for (const [name, value] of Object.entries(base._traits_template)) {
          if (value !== null && !yielded.has(name)) {
            yield [name, value]
            yielded.add(name)
          }
        }
      }

      queue.push(...base._bases)
    }
  }

  /**
   * Iterate over available trait slots from archetypes
   * Shows what traits CAN be set based on archetype composition
   * @returns {Generator<string>} Yields trait names available from archetypes
   */
  *get_slots() {
    const yielded = new Set()

    for (const archetype of this.get_archetypes()) {
      for (const trait_name of Object.keys(archetype._traits_template)) {
        if (!yielded.has(trait_name)) {
          yield trait_name
          yielded.add(trait_name)
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
    const about_trait = this.get_trait(belief_state, '@about')

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
   *
   * @param {Set<Belief|Archetype>} [seen]
   * @returns {Generator<{label: string, type: 'Archetype'|'Belief'}>}
   */
  *get_prototypes(seen = new Set()) {
    /** @type {(Belief|Archetype)[]} */ const bases = [this]
    while (bases.length > 0) {
      const base = bases.shift()
      if (!base || seen.has(base)) continue

      if (base instanceof Archetype) {
        seen.add(base)
        yield {label: base.label, type: 'Archetype'}
        bases.push(...base._bases)
      } else {
        seen.add(base)
        // Only include shared beliefs (prototypes) with labels
        const label = base.get_label()
        if (base.is_shared && label !== null) {
          yield {label, type: 'Belief'}
        }
        bases.push(...base._bases)
      }
    }
  }

  /**
   * Lock this belief and cascade to child mind states
   * @param {State} state - State context being locked
   */
  lock(state) {
    this._locked = true

    // Cascade to child mind states
    // Note: Only checks _traits (directly set on this belief), not inherited traits.
    // Inherited Mind traits come from base beliefs that must already be locked,
    // so they were already cascaded when the base belief locked.
    const mind_trait_names = DB.get_mind_trait_names()
    for (const trait_name of mind_trait_names) {
      const trait_value = this._traits.get(trait_name)
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
    const about_trait = this._traits.get('@about')
    return {
      _type: 'Belief',
      _id: this._id,
      sid: this.subject.sid,
      label: this.get_label(),
      about: about_trait?.toJSON() ?? null,
      archetypes: [...this.get_archetypes()].map(a => a.label),
      bases: [...this._bases].map(b => b instanceof Archetype ? b.label : b._id),
      traits: Object.fromEntries(
        [...this._traits].map(([k, v]) => [k, Traittype.serializeTraitValue(v)])
      )
    }
  }

  /**
   * Create shallow inspection view of this belief for the inspect UI
   * @param {State} state - State context for resolving trait sids
   * @returns {{_type: string, _id: number, label: string|null, archetypes: string[], prototypes: Array<{label: string, type: string}>, bases: (string|number)[], traits: any, mind_id?: number, mind_label?: string|null, about_label?: string|null, locked?: boolean}} Shallow representation with references, including mind context and what this knowledge is about (for cross-mind knowledge beliefs)
   */
  to_inspect_view(state) {
    assert(state instanceof State, "should be State", state);

    // Build traits object using get_trait() for composable traits
    const traits_obj = /** @type {Record<string, any>} */ ({})
    for (const [k, v] of this.get_traits()) {
      const traittype = Traittype.get_by_label(k)
      assert(traittype instanceof Traittype, `Traittype '${k}' not found`)

      // FIXME: the get_traits must give the same result as get_trait. Should bot have to call get_trait() again

      // For composable traits, use get_trait() to trigger composition
      // Otherwise use the value from get_traits() (first-wins)
      const value = traittype.composable ? this.get_trait(state, k) : v
      traits_obj[k] = traittype.to_inspect_view(state, value)
    }

    const result = /** @type {{_type: string, _id: number, label: string|null, archetypes: string[], prototypes: Array<{label: string, type: string}>, bases: (string|number)[], traits: any, mind_id?: number, mind_label?: string|null, about_label?: string|null, locked?: boolean}} */ ({
      _type: 'Belief',
      _id: this._id,
      label: this.get_label(),
      archetypes: [...this.get_archetypes()].map(a => a.label),
      prototypes: [...this.get_prototypes()],
      bases: [...this._bases].map(b => b instanceof Archetype ? b.label : b._id),
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
   */
  _finalize_traits_from_json() {
    for (const [trait_name, trait_value] of this._traits) {
      const traittype = Traittype.get_by_label(trait_name)
      if (traittype) {
        this._traits.set(trait_name, traittype.deserialize_value(this, trait_value))
      }
      // If no traittype found, keep value as-is
    }
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
    const ground_mind = mind?.parent ?? null
    belief.subject = DB.get_or_create_subject(ground_mind, data.sid)
    belief.in_mind = mind
    belief._locked = false
    belief._cache = new Map()

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
    // Resolution happens via _finalize_traits_from_json() after all entities loaded
    belief._traits = new Map()
    for (const [trait_name, trait_value] of Object.entries(data.traits)) {
      belief._traits.set(trait_name, trait_value)
    }

    // If about field exists in JSON (for backward compat or from @about trait serialization),
    // store it as sid in @about trait
    if (data.about != null && !belief._traits.has('@about')) {
      // data.about is a sid (from Subject.toJSON()), store it directly
      belief._traits.set('@about', data.about)
    }

    // Register globally
    DB.register_belief_by_id(belief)
    DB.register_belief_by_subject(belief)

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
   * @param {any} template - Template with sid, bases, traits, about_state
   * @returns {Belief}
   */
  static from_template(state, {sid=null, bases=[], traits={}, about_state=null} = {}) {
    assert(state instanceof State, 'from_template requires State as first argument', {state})

    const resolved_bases = bases.map((/** @type {string|Belief|Archetype} */ base_in) => {
      if (typeof base_in === 'string') {

        // Try archetype first (lighter)
        const archetype = Archetype.get_by_label(base_in)
        if (archetype) return archetype

        // Try shared belief (prototype only - prevents same-state inheritance)
        // TODO: Future - support versioned subjects (bases from earlier states with tt < state.tt)
        const subject = DB.get_subject_by_label(base_in)
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
                   creating_belief_label: traits['@label'] ?? 'unlabeled',
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

    const ground_mind = state.in_mind.parent
    const subject = DB.get_or_create_subject(ground_mind, sid)

    // Handle @label first (must be set before other traits or creating belief)
    if ('@label' in traits) {
      const label_value = traits['@label']
      delete traits['@label']
      subject.set_label(label_value)
    }

    debug([state], "Create belief with", ...resolved_bases)

    const belief = new Belief(state, subject, resolved_bases)

    // Add remaining traits
    for (const [trait_label, trait_data] of Object.entries(traits)) {
      debug("  add trait", trait_label)
      belief.add_trait_from_template(state, trait_label, trait_data, {about_state})
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
      belief.add_trait(trait_label, trait_data)
    }

    return belief
  }

  /**
   * Create shared belief from template (limbo - no mind/state ownership)
   * @param {Mind} parent_mind - Parent mind context for scoping
   * @param {Array<string|Belief|Archetype>} bases - Base archetypes/beliefs (can be strings)
   * @param {Object<string, any>} traits - Traits (including optional @label)
   * @param {((subject: Subject) => Belief|Archetype|null)|null} [decider] - Function to decide which belief to use for a subject
   * @returns {Belief}
   */
  static create_shared_from_template(parent_mind, bases, traits, decider = null) {
    // Resolve bases from strings
    const resolved_bases = bases.map(base => {
      if (typeof base === 'string') {
        // Try archetype first
        const archetype = Archetype.get_by_label(base)
        if (archetype) return archetype

        // Get subject by label
        const subject = DB.get_subject_by_label(base)
        assert(subject instanceof Subject, `Base '${base}' not found as archetype or subject label`, {base})

        // Use decider to get appropriate belief
        assert(typeof decider === 'function', `Decider required for string base '${base}'`, {base})
        const belief= decider(subject)
        assert(belief instanceof Belief, `Decider returned invalid type for base '${base}'`, {base, subject, belief})

        assert(belief.is_shared, `Decider must return a shared belief for base '${base}'`, {base, subject, belief})

        return belief
      }
      return base
    })

    // Create belief in Eidos (realm of forms)
    const eidos_state = eidos().origin_state
    assert(eidos_state instanceof State, 'Eidos origin_state must be State', {eidos_state})
    const belief = new Belief(eidos_state, null, resolved_bases)

    // Set ground_mind on auto-created subject for scoping
    belief.subject.ground_mind = parent_mind

    // Handle @label first (must be set before other traits)
    if ('@label' in traits) {
      const label_value = traits['@label']
      assert(typeof label_value === 'string', '@label must be a string', {label: label_value})
      belief.subject.set_label(label_value)
    }

    // Add remaining traits
    for (const [trait_label, trait_data] of Object.entries(traits)) {
      if (trait_label === '@label') continue
      belief.add_trait_from_template(eidos_state, trait_label, trait_data)
    }

    // Lock shared belief (prototypes must be immutable before use as bases)
    belief.lock(eidos_state)

    return belief
  }

}

