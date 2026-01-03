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
import { Subject } from './subject.mjs'
import { Traittype } from './traittype.mjs'
import { State } from './state.mjs'
import { Fuzzy } from './fuzzy.mjs'

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
 * @property {number[]} [promotions] - Belief _ids registered as promotions of this belief
 * @property {number} [certainty] - Probability weight (0 < x < 1)
 * @property {boolean} [promotable] - Whether this belief can have promotions registered on it
 * @property {number|null} [_promotable_epoch] - Cache invalidation epoch for promotable beliefs
 * @property {number} [resolution] - Belief _id that this belief resolves (for uncertainty collapse)
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
 * @property {number|null} certainty - Probability weight (null = not a probability)
 * @property {boolean} promotable - Whether this belief can have promotions registered on it
 */
export class Belief {

  /**
   * @param {State} state - State creating this belief
   * @param {Subject|null} [subject] - Subject (provide to create version of existing subject)
   * @param {Array<Archetype|Belief>} [bases] - Archetype or Belief objects (no strings)
   * @param {Object} [options] - Optional parameters
   * @param {boolean} [options.promotable] - Whether this belief can have promotions registered on it
   */
  constructor(state, subject = null, bases = [], {promotable = false} = {}) {
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
    /** @type {Map<Belief, number>|null} - promotable beliefs this cache depends on */
    this._cache_deps = null

    /**
     * Promoted versions that propagate to children of this belief
     * @type {Set<Belief>}
     */
    this.promotions = new Set()

    /**
     * Probability weight for this belief as a promotion (null = not a probability)
     * @type {number|null}
     */
    this.certainty = null

    /**
     * Constraints for this belief as a promotion (future: exclusion rules, validity periods)
     * @type {Object}
     */
    this.constraints = {}

    /**
     * Reference to belief this resolves (null = not a resolution belief)
     * When set, this belief "collapses" uncertainty in the referenced belief.
     * Query flow checks Subject.resolutions before normal trait lookup.
     * @type {Belief|null}
     */
    this.resolution = null

    /**
     * Whether this belief can have promotions registered on it
     * @type {boolean}
     */
    this.promotable = promotable

    /**
     * Cache invalidation epoch for promotable beliefs
     * Bumped when a promotion is added, causing dependent caches to invalidate
     * @type {number|null}
     */
    this._promotable_epoch = promotable ? next_id() : null

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
    if (!this.in_mind) return false
    // Use Mind registry to avoid circular import (belief→eidos→mind→belief)
    // @ts-ignore - in_mind.constructor is Mind class with static get_function
    const eidos = this.in_mind.constructor.get_function('eidos')
    return this.in_mind === eidos()
  }

  /**
   * Extract Subject references from a trait value
   * @param {*} value - Trait value (Subject, array, Fuzzy, primitive, etc.)
   * @returns {Subject[]} Array of Subjects found in value
   */
  extract_subjects(value) {
    if (value instanceof Subject) {
      return [value]
    } else if (Array.isArray(value)) {
      return value.filter(item => item instanceof Subject)
    } else if (value instanceof Fuzzy) {
      return value.alternatives.flatMap(alt => this.extract_subjects(alt.value))
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

    for (const subject of old_set) {
      this.origin_state.rev_del(subject, traittype, this)
    }

    for (const subject of to_add) {
      this.origin_state.rev_add(subject, traittype, this)
    }

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

    // Resolve template data to actual value
    // For composable traits: own value replaces inherited (composition happens at query time if no own)
    // TODO: Support template syntax for replace/remove operations on composable traits
    //   - {replace: [...]} to ignore base values and use only provided values
    //   - {remove: [...]} to compose from bases then filter out specified items
    const value = traittype.resolve_trait_value_from_template(this, data, {about_state})

    this.add_trait(traittype, value)
  }

  /**
   * @param {Traittype} traittype - Traittype object
   * @param {any} data
   */
  add_trait(traittype, data) {
    assert(!this.locked, 'Cannot modify locked belief', {belief_id: this._id, label: this.get_label()})
    assert(this.can_have_trait(traittype), `Belief can't have trait ${traittype.label}`, {label: traittype.label, belief: this.get_label(), data, archetypes: [...this.get_archetypes()].map(a => a.label)})

    // Validate type before setting
    traittype.validate_value(data)

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
   * For composable traits: collects one value per base chain and composes them
   * For non-composable traits: walks BFS with promotion checking to find first value
   * @param {State} state - State context (used for promotion resolution)
   * @param {Traittype} traittype - Traittype to get
   * @param {Set<Belief>} [skip_promotions] - Beliefs whose promotions should be skipped (prevents infinite recursion)
   * @param {{deps: Map<Belief, number>, last_promotable?: Belief, min_cache_tt: number}} [context] - Mutable context to track cache deps
   * @returns {*} trait value (Subject, not Belief), or null if not found
   * @private
   */
  _get_uncached_trait(state, traittype, skip_promotions = new Set(), context = {deps: new Map(), min_cache_tt: -Infinity}) {

    // Composable: BFS walk, merging from all Convergence components if unresolved
    if (traittype.composable) {
      const values = []
      const seen = new Set()

      // @ts-ignore - Convergence properties/methods
      const conv = state.is_union ? state : state._convergence_ancestor
      // @ts-ignore
      const sources = conv?.get_resolution(state) === null ? [...conv.get_all_beliefs_by_subject(this.subject)] : [this]

      for (const source of sources) {
        const queue = [/** @type {Belief|Archetype} */ (source)]

        while (queue.length > 0) {
          const node = /** @type {Belief|Archetype} */ (queue.shift())
          if (seen.has(node)) continue
          seen.add(node)

          // Track promotable beliefs for cache invalidation (skip this)
          if (node !== this && node instanceof Belief) {
            if (node.promotions.size > 0 && node._promotable_epoch !== null) {
              context.deps.set(node, node._promotable_epoch)
            } else if (node.promotable) {
              context.last_promotable = node
            }
          }

          const value = node.get_own_trait_value(traittype)
          if (value === undefined) {
            queue.push(...node._bases)
          } else if (value !== null) {
            values.push(value)
          }
        }
      }

      // Add last_promotable if no promotable edge found yet (epoch is non-null when promotable=true)
      if (context.last_promotable && context.deps.size === 0) {
        context.deps.set(context.last_promotable, /** @type {number} */ (context.last_promotable._promotable_epoch))
      }

      if (values.length === 0) return null
      if (values.length === 1) return values[0]
      return traittype.compose(this, values)
    }

    // Non-composable traits: full BFS with promotion checking
    if (this.promotions.size > 0) {
      // Track max tt of temporal promotions - can cache if caching belief's tt >= this
      for (const p of this.promotions) {
        if (p.certainty === null && p.origin_state.tt != null) {
          context.min_cache_tt = Math.max(context.min_cache_tt, p.origin_state.tt)
        }
      }
    }
    const own_promo = this._get_trait_from_promotions(state, this, traittype, skip_promotions)
    if (own_promo !== undefined) return own_promo

    const own = this._traits.get(traittype)
    if (own !== undefined) return own

    const queue = [...this._bases]
    const seen = new Set()

    while (queue.length > 0) {
      const node = /** @type {Belief|Archetype} */ (queue.shift())
      if (seen.has(node)) continue
      seen.add(node)

      if (node instanceof Belief) {
        if (skip_promotions.has(node)) {
          for (const b of node._bases) {
            if (b instanceof Belief) skip_promotions.add(b)
          }
        } else if (node.promotions.size > 0 && node._promotable_epoch !== null) {
          // First belief with promotions - record as cache dependency
          context.deps.set(node, node._promotable_epoch)
          // Track max tt of temporal promotions - can cache if caching belief's tt >= this
          for (const p of node.promotions) {
            if (p.certainty === null && p.origin_state.tt != null) {
              context.min_cache_tt = Math.max(context.min_cache_tt, p.origin_state.tt)
            }
          }
          const value = this._get_trait_from_promotions(state, node, traittype, skip_promotions)
          if (value !== undefined) return value
        } else if (node.promotable) {
          // Track last promotable as potential cache dependency
          context.last_promotable = node
        }
      }

      const own = node.get_own_trait_value(traittype)
      if (own !== undefined) {
        // Found value - add last_promotable to deps if not already tracking a promotable edge
        if (context.last_promotable && !context.deps.has(context.last_promotable)) {
          context.deps.set(context.last_promotable, /** @type {number} */ (context.last_promotable._promotable_epoch))
        }
        return own
      }

      queue.push(...node._bases)
    }

    // No value found - still add last_promotable to deps
    if (context.last_promotable && !context.deps.has(context.last_promotable)) {
      context.deps.set(context.last_promotable, /** @type {number} */ (context.last_promotable._promotable_epoch))
    }
    return null
  }

  /**
   * Get trait value from a belief's promotions (lazy propagation)
   *
   * Resolution algorithm: Only the FIRST promotion encountered is resolved.
   * When resolving B→C, we add B AND B.bases to skip_promotions, preventing
   * any deeper promotions from being followed.
   *
   * Rules:
   * 1. When processing a node with promotions (not in skip_promotions):
   *    resolve promotion, add node + its bases to skip_promotions
   * 2. When processing a node in skip_promotions:
   *    skip its promotions, add its bases to skip_promotions (propagate)
   * 3. Chained promotions (v1→v2→v3) work because resolved belief is not in skip_promotions
   *
   * @param {State} state
   * @param {Belief} belief - Belief whose promotions to check
   * @param {Traittype} traittype
   * @param {Set<Belief>} skip_promotions - Beliefs whose promotions to skip
   * @returns {*} Trait value if found, undefined if not
   * @private
   */
  _get_trait_from_promotions(state, belief, traittype, skip_promotions) {
    if (belief.promotions.size === 0) return undefined
    if (skip_promotions.has(belief)) return undefined

    const promos = state.pick_promotion(belief.promotions, {})
    if (promos.length === 0) return undefined

    // Add belief AND its bases to skip_promotions (first promotion only rule)
    const new_skip = new Set(skip_promotions)
    new_skip.add(belief)
    for (const base of belief._bases) {
      if (base instanceof Belief) new_skip.add(base)
    }

    // Multiple probability promotions - collect values from each
    if (promos.length > 1) {
      const result = this._collect_fuzzy_from_promotions(state, promos, traittype, new_skip)
      if (result instanceof Fuzzy && result.alternatives.length > 0) return result
      if (result !== undefined && !(result instanceof Fuzzy)) return result
      return undefined
    }

    // Single promotion - get trait from it
    const value = promos[0]._get_trait_skip_promotions(state, traittype, new_skip)
    if (value === undefined) return undefined

    return this._apply_certainty(value, promos[0].certainty)
  }

  /**
   * Apply certainty to a trait value, wrapping in Fuzzy if needed
   * @param {*} value - The trait value
   * @param {number|null} certainty - Certainty to apply (null = no wrapping)
   * @returns {*} Original value if certainty is null, otherwise Fuzzy
   * @private
   */
  _apply_certainty(value, certainty) {
    if (certainty === null) return value

    if (value instanceof Fuzzy) {
      return new Fuzzy({
        alternatives: value.alternatives.map(alt => ({
          value: alt.value,
          certainty: alt.certainty * certainty
        }))
      })
    }

    return new Fuzzy({
      alternatives: [{ value, certainty }]
    })
  }

  /**
   * Collect trait values from probability promotions into Fuzzy
   * @param {State} state
   * @param {Belief[]} promotions - Array of probability promotions
   * @param {Traittype} traittype
   * @param {Set<Belief>} skip_promotions - Beliefs whose promotions should be skipped (prevents infinite recursion)
   * @returns {Fuzzy|*} Fuzzy if values differ, or the common value if all promotions agree
   * @private
   */
  _collect_fuzzy_from_promotions(state, promotions, traittype, skip_promotions) {
    const alternatives = []

    for (const promotion of promotions) {
      // Only include traits the promotion actually sets (not inherited from before the split)
      // If trait comes from archetype/shared ancestor, it shouldn't have promotion's certainty
      if (!promotion._traits.has(traittype)) continue

      const value = promotion._traits.get(traittype)
      const certainty = promotion.certainty ?? 1.0

      if (value instanceof Fuzzy) {
        // Expand nested Fuzzy, multiply certainties
        for (const alt of value.alternatives) {
          alternatives.push({ value: alt.value, certainty: certainty * alt.certainty })
        }
      } else if (value !== undefined && value !== null) {
        alternatives.push({ value, certainty })
      }
    }

    // If no promotions set this trait, return undefined so caller falls through
    // to find the trait from the common ancestor (without certainty)
    if (alternatives.length === 0) {
      return undefined
    }

    return new Fuzzy({ alternatives })
  }

  /**
   * Get trait value, skipping promotion resolution for specified beliefs
   * Used to prevent infinite recursion when resolving promotions
   * @param {State} state
   * @param {Traittype} traittype
   * @param {Set<Belief>} skip_promotions - Beliefs whose promotions should be skipped
   * @returns {*}
   * @private
   */
  _get_trait_skip_promotions(state, traittype, skip_promotions) {
    // Check own promotions first (enables chained promotions)
    const promo = this._get_trait_from_promotions(state, this, traittype, skip_promotions)
    if (promo !== undefined) return promo

    // Check own traits
    const own = this._traits.get(traittype)
    if (own !== undefined) return own

    // Check cache
    const cached = this._get_cached(traittype)
    if (cached !== undefined) return cached

    // Walk bases with skip_promotions
    /** @type {{deps: Map<Belief, number>, last_promotable?: Belief, min_cache_tt: number}} */
    const ctx = {deps: new Map(), min_cache_tt: -Infinity}
    const value = this._get_uncached_trait(state, traittype, skip_promotions, ctx)
    // Cache if locked and all temporal promotions are resolved (tt <= origin_state.tt)
    const can_cache = ctx.min_cache_tt <= (this.origin_state.tt ?? Infinity)
    if (this.locked && can_cache) {
      // Store cache dependencies on promotable beliefs
      if (ctx.deps.size > 0) {
        this._cache_deps ??= new Map()
        for (const [b, e] of ctx.deps) this._cache_deps.set(b, e)
      }
      this._set_cache(traittype, value)
    }
    return value
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
    // Temporal beliefs must be queried at tt >= origin_state.tt (timeless beliefs skip this check)
    if (this.origin_state.tt != null) {
      assert(state.tt != null && state.tt >= this.origin_state.tt,
        "get_trait query state.tt must be >= belief.origin_state.tt",
        {belief_id: this._id, state_tt: state.tt, origin_tt: this.origin_state.tt})
    }

    // Check for timeline resolution (Phase 4) - Convergence resolves to specific branch
    // This must be checked before belief resolution since timeline resolution affects all beliefs
    // When branched from Convergence, queries should see Convergence's view (resolved or first-wins)
    // Only redirect if this belief predates the Convergence (beliefs created after are authoritative)
    // @ts-ignore - _convergence_ancestor exists on states branched from Convergence
    const conv_ancestor = state._convergence_ancestor
    // @ts-ignore - conv_ancestor.tt is always set for Convergence states
    if (conv_ancestor && (this.origin_state.tt === null || this.origin_state.tt < conv_ancestor.tt)) {
      // @ts-ignore - get_resolution exists on Convergence
      const resolved_branch = conv_ancestor.get_resolution(state)
      if (resolved_branch) {
        // Resolved: get belief from specific branch
        const resolved_belief = resolved_branch.get_belief_by_subject(this.subject)
        if (resolved_belief && resolved_belief !== this) {
          return resolved_belief.get_trait(resolved_branch, traittype)
        }
      } else {
        // Unresolved: get belief from Convergence (first-wins behavior)
        const conv_belief = conv_ancestor.get_belief_by_subject(this.subject)
        if (conv_belief && conv_belief !== this) {
          // Pass original state (not conv) to preserve context for belief resolution lookup
          return conv_belief.get_trait(state, traittype)
        }
      }
    }

    // Check for belief resolution (Phase 3) BEFORE cache lookup
    // Resolution beliefs short-circuit the entire cache/walk path
    const resolution = this.subject.get_resolution(state)
    if (resolution && resolution !== this) {
      return resolution.get_trait(state, traittype)
    }

    let value = this._get_cached(traittype)
    if (value !== undefined) return value

    /** @type {{deps: Map<Belief, number>, last_promotable?: Belief, min_cache_tt: number}} */
    const ctx = {deps: new Map(), min_cache_tt: -Infinity}
    value = this._get_uncached_trait(state, traittype, undefined, ctx)
    // Cache if locked and all temporal promotions are resolved (tt <= origin_state.tt)
    const can_cache = ctx.min_cache_tt <= (this.origin_state.tt ?? Infinity)
    if (this.locked && can_cache) {
      // Store cache dependencies on promotable beliefs
      if (ctx.deps.size > 0) {
        this._cache_deps ??= new Map()
        for (const [b, e] of ctx.deps) this._cache_deps.set(b, e)
      }
      this._set_cache(traittype, value)
    }

    return value
  }

  /**
   * Get trait value following a path through Subject references
   * Enables dot notation like 'handle.color' for compositional access
   * @param {State} state - State context for resolution
   * @param {string|string[]} path - Path like 'handle.color' or ['handle', 'color']
   * @returns {*|undefined} Trait value at end of path, or undefined if path broken
   */
  get_trait_path(state, path) {
    const segments = typeof path === 'string' ? path.split('.') : path
    let belief = /** @type {Belief} */ (this)

    // Walk intermediate segments (all but last)
    for (const seg of segments.slice(0, -1)) {
      const tt = Traittype.get_by_label(seg)
      const subject = tt && belief.get_trait(state, tt)
      if (!(subject instanceof Subject)) return undefined
      const next = state.get_belief_by_subject(subject)
      if (!next) return undefined
      belief = next
    }

    // Get final trait value
    const final_tt = Traittype.get_by_label(/** @type {string} */ (segments.at(-1)))
    if (!final_tt) return undefined
    return belief.get_trait(state, final_tt)
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
      // Pass original query state for resolution checks in Convergence
      const next_states = current.rev_base(this.subject, traittype, state)
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
   * Called by add_trait_from_template() for composable traits at template time
   * Collects ONE value per base chain (stops at first found in each chain)
   * This implements the "latest version" semantics: each base's chain has one latest value
   * @param {Traittype} traittype - Traittype to collect
   * @returns {Array<any>} Array of values (one per base chain that has the trait)
   */
  collect_latest_value_from_all_bases(traittype) {
    const values = []
    const queue = [...this._bases]
    const seen = new Set()

    while (queue.length > 0) {
      const base = /** @type {Belief|Archetype} */ (queue.shift())
      if (seen.has(base)) continue
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

  // ============================================================================
  // Trait Caching
  // ============================================================================
  //
  // CURRENT APPROACH (simple, correct):
  // - Don't cache values from Eidos hierarchy (in_mind.in_eidos) - promotions may be added
  //
  // This is conservative but avoids complex invalidation. Since promotions only
  // happen in Eidos, world beliefs that inherit from Eidos won't cache those values.
  // Certainties are applied from state chain at query time, not stored in cache.
  //
  // FUTURE OPTIMIZATION IDEAS (see docs/notes/Claude-Cultural knowledge using flyweight model.md):
  //
  // 1. Epoch-based invalidation:
  //    - Each belief has _own_epoch (incremented when promotion added)
  //    - Cache entries store {value, source_belief, source_epoch}
  //    - On cache read: if source_belief._own_epoch === source_epoch → hit
  //    - O(1) per read, but requires storing source reference
  //
  // 2. @resolution pattern (META-PLAN Phase 3):
  //    - Record collapse in Subject.resolutions index
  //    - Check resolutions BEFORE walking bases
  //    - Recorded collapses short-circuit the walk entirely
  //
  // 3. Flattening with source tracking:
  //    - When resolving, record which base the value came from
  //    - Future queries check that one source's epoch directly
  //    - Amortizes walk cost across multiple queries
  //
  // 4. resolved_for tracking (from flyweight doc):
  //    - Base tracks which states have resolved it
  //    - Clear on promotion add (O(1))
  //    - Inheritors check if they're in resolved_for set
  //
  // ============================================================================

  /**
   * Get cached trait value
   * Validates cache dependencies before returning - if any promotable belief
   * has a different epoch than when cached, invalidates the entire cache
   * @param {Traittype} traittype - Traittype object
   * @returns {any|undefined} Cached value or undefined if not cached
   * @private
   */
  _get_cached(traittype) {
    // Validate cache deps - if any promotable belief has changed, invalidate
    if (this._cache_deps) {
      for (const [belief, epoch] of this._cache_deps) {
        if (belief._promotable_epoch !== epoch) {
          this._invalidate_cache()
          return undefined
        }
      }
    }
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
   * Invalidate all cached trait values
   * Called when a promotable belief's epoch changes
   * @private
   */
  _invalidate_cache() {
    this._cache.clear()
    this._cache_deps = null
    this._cached_all = false
  }

  /**
   * Iterate over traits that have non-null values (excludes null/undefined traits)
   * @heavy O(traits in belief + base chain) - iterates all traits
   * @returns {Generator<[Traittype, *]>} Yields [traittype, value] pairs for set traits only
   */
  *get_traits() {
    for (const pair of this.get_defined_traits()) {
      if (pair[1] != null) yield pair
    }
  }

  /**
   * Iterate over all defined traits (own and inherited) including those with null values
   * Own traits shadow inherited traits with the same name
   * Caches inherited traits when belief is locked (belief-level cache)
   * Includes all trait definitions from archetypes (even null/unset values)
   * Caches inherited traits when belief is locked
   * @returns {Generator<[Traittype, any]>}
   */
  *get_defined_traits() {
    const yielded = new Set()
    const composables = new Map()  // traittype → values[]
    const composable_contributors = new Map()  // traittype → Set<nodes that contributed>

    // Check if base_node is in derived_node's ancestor chain
    const is_base_of = (/** @type {Belief|Archetype} */ base_node, /** @type {Belief|Archetype} */ derived_node) => {
      const q = [...derived_node._bases]
      const s = new Set()
      for (let i = 0; i < q.length; i++) {
        const n = q[i]
        if (n === base_node) return true
        if (s.has(n)) continue
        s.add(n)
        q.push(...n._bases)
      }
      return false
    }

    /** @type {Map<Belief, number>} */
    const deps = new Map()  // Track promotable beliefs for cache invalidation
    /** @type {Belief|null} */
    let last_promotable = null
    let min_cache_tt = -Infinity  // Track max tt of temporal promotions
    const origin_tt = this.origin_state.tt ?? Infinity

    // Yield cached traits first
    for (const [traittype, value] of this._cache) {
      yield /** @type {[Traittype, any]} */ ([traittype, value])
      yielded.add(traittype)
    }
    if (this._cached_all) return

    // BFS walk starting from this
    /** @type {(Belief|Archetype)[]} */
    const queue = [this]
    const seen = new Set()

    while (queue.length > 0) {
      const node = /** @type {Belief|Archetype} */ (queue.shift())
      if (seen.has(node)) continue
      seen.add(node)

      // If node has promotions, resolve and process
      if (node instanceof Belief && node.promotions.size > 0 && node._promotable_epoch !== null) {
        // Record as cache dependency
        deps.set(node, node._promotable_epoch)
        const promos = this.origin_state.pick_promotion(node.promotions, {})
        if (promos.length === 1 && promos[0].certainty === null) {
          queue.unshift(promos[0])  // Temporal: add to queue
          if (promos[0].origin_state.tt != null) {
            min_cache_tt = Math.max(min_cache_tt, promos[0].origin_state.tt)
          }
        } else if (promos.length > 0) {
          // Probability promotions return Fuzzy - can cache with epoch tracking
          const can_cache = min_cache_tt <= origin_tt
          yield* this._collect_fuzzy_promotions(promos, yielded, this.locked && can_cache)
        }
      } else if (node instanceof Belief && node.promotable) {
        // Track last promotable as potential cache dependency
        last_promotable = node
      }

      for (const [traittype, value] of node.get_trait_entries()) {
        if (yielded.has(traittype)) continue

        if (traittype.composable) {
          if (node === this) {
            // Own value: yield directly (replaces any inherited)
            const can_cache = min_cache_tt <= origin_tt
            if (this.locked && can_cache) this._set_cache(traittype, value)
            yield /** @type {[Traittype, any]} */ ([traittype, value])
            yielded.add(traittype)
          } else if (value !== null) {
            // Base value: check if shadowed by a more-derived node that already contributed
            const contributors = composable_contributors.get(traittype)
            const shadowed = contributors && [...contributors].some(c => is_base_of(node, c))
            if (!shadowed) {
              if (!composables.has(traittype)) composables.set(traittype, [])
              composables.get(traittype).push(value)
              if (!composable_contributors.has(traittype)) composable_contributors.set(traittype, new Set())
              composable_contributors.get(traittype).add(node)
            }
          }
          continue
        }

        // Non-composable: yield immediately
        const can_cache = min_cache_tt <= origin_tt
        if (this.locked && can_cache) this._set_cache(traittype, value)
        yield /** @type {[Traittype, any]} */ ([traittype, value])
        yielded.add(traittype)
      }

      // Always add bases - per-traittype shadowing handled above
      queue.push(...node._bases)
    }

    // Add last_promotable if no promotable edge found yet
    if (last_promotable && deps.size === 0) {
      deps.set(last_promotable, /** @type {number} */ (last_promotable._promotable_epoch))
    }

    // Compose and yield all composables at the end
    const can_cache_final = min_cache_tt <= origin_tt
    for (const [traittype, values] of composables) {
      if (yielded.has(traittype)) continue
      const composed = values.length < 2 ? values[0] : traittype.compose(this, values)
      if (this.locked && can_cache_final) this._set_cache(traittype, composed)
      yield /** @type {[Traittype, any]} */ ([traittype, composed])
      yielded.add(traittype)
    }

    // Store cache deps and mark fully cached (only if temporal promotions resolved)
    if (this.locked && can_cache_final) {
      if (deps.size > 0) {
        this._cache_deps ??= new Map()
        for (const [b, e] of deps) this._cache_deps.set(b, e)
      }
      this._cached_all = true
    }
  }

  /**
   * Collect Fuzzy trait values from probability promotions
   * @param {Belief[]} promotions
   * @param {Set<Traittype>} yielded - Traittypes already yielded (mutated)
   * @param {boolean} [should_cache] - Whether to cache the yielded values
   * @returns {Generator<[Traittype, Fuzzy]>}
   */
  *_collect_fuzzy_promotions(promotions, yielded, should_cache = false) {
    const traittypes = new Set()
    for (const p of promotions) {
      for (const [tt] of p.get_trait_entries()) traittypes.add(tt)
    }
    for (const tt of traittypes) {
      if (yielded.has(tt)) continue
      const alternatives = promotions
        .map(p => ({ value: p._traits.get(tt), certainty: p.certainty ?? 1.0 }))
        .filter(a => a.value != null)
      if (alternatives.length > 0) {
        const fuzzy = new Fuzzy({ alternatives })
        if (should_cache) this._set_cache(tt, fuzzy)
        yield /** @type {[Traittype, Fuzzy]} */ ([tt, fuzzy])
        yielded.add(tt)
      }
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

    const belief = about_trait.get_belief_by_state(resolve_state)
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
      const base = /** @type {Belief|Archetype} */ (bases.shift())
      if (seen.has(base)) continue

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
      const base = /** @type {Belief|Archetype} */ (bases.shift())
      if (seen.has(base)) continue
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
   * Validate that all Subject trait values have beliefs in the state
   * Only validates same-mind references (subject.mater === this.in_mind)
   * Cross-mind and universal (mater=null) references are allowed
   * @param {State} state - State to check against
   * @private
   */
  _validate_subject_traits(state) {
    for (const [traittype, value] of this._traits.entries()) {
      if (value instanceof Subject) {
        // Only validate if Subject is from same mind (same-mind references must exist in state)
        // Cross-mind and universal references are allowed to be in different states
        if (value.mater === this.in_mind) {
          const belief = state.get_belief_by_subject(value)
          assert(belief,
            `Lock validation failed for belief ${this._id}: ` +
            `trait '${traittype.label}' references Subject ${value.sid} ` +
            `which has no belief in state ${state.in_mind.label}. ` +
            `Did you forget to call state.insert_beliefs()?`,
            {
              belief_id: this._id,
              trait: traittype.label,
              subject_sid: value.sid,
              state_mind: state.in_mind.label
            }
          )
        }
      } else if (Array.isArray(value)) {
        // Check array elements
        for (const item of value) {
          if (item instanceof Subject) {
            // Only validate same-mind references
            if (item.mater === this.in_mind) {
              const belief = state.get_belief_by_subject(item)
              assert(belief,
                `Lock validation failed for belief ${this._id}: ` +
                `trait '${traittype.label}' array contains Subject ${item.sid} ` +
                `which has no belief in state ${state.in_mind.label}. ` +
                `Did you forget to call state.insert_beliefs()?`,
                {
                  belief_id: this._id,
                  trait: traittype.label,
                  subject_sid: item.sid,
                  state_mind: state.in_mind.label
                }
              )
            }
          }
        }
      }
    }
  }

  /**
   * Lock this belief and cascade to child mind states
   * @param {State} state - State context being locked
   */
  lock(state) {
    // Note: Removed O(n) includes() check - callers guarantee belief is in _insert
    // Validate Subject trait values before locking
    this._validate_subject_traits(state)

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
          const child_states = mind.get_states_by_ground_state(state) // @heavy - lock cascade
          for (const child_state of child_states) {
            if (!child_state.locked) {
              child_state.lock()
            }
          }
        }
      }
      // Handle single Mind reference
      else {
        const child_states = trait_value.get_states_by_ground_state(state) // @heavy - lock cascade
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
   * Get promotions of this belief
   * @returns {Set<Belief>}
   */
  get_promotions() {
    return this.promotions
  }

  /**
   * DFS to find first promotion in bases chain.
   * Returns the resolved promotion and path from start to it.
   *
   * @param {State} state - State context for pick_promotion()
   * @param {Belief} node - Current node to check
   * @param {Belief[]} path - Path from start to current node (exclusive)
   * @param {Set<Belief>} visited - Already visited nodes
   * @returns {{resolved: Belief|Belief[], path: Belief[]}|null}
   * @private
   */
  static _find_first_promotion(state, node, path, visited) {
    if (visited.has(node)) return null
    visited.add(node)

    // Check if this node has a promotion
    if (node.promotions.size > 0) {
      const resolved = state.pick_promotion(node.promotions, {})
      // Return both single and array (probability) results
      if (resolved.length > 0) {
        return { resolved, path: [...path, node] }
      }
    }

    // Continue searching in bases
    for (const base of node._bases) {
      if (base instanceof Belief) {
        const result = Belief._find_first_promotion(state, base, [...path, node], visited)
        if (result) return result
      }
    }

    return null
  }

  /**
   * Join traits from multiple probability promotions into a Map of possibly-Fuzzy values.
   *
   * When probability promotions exist, we need to create a single belief that captures
   * all the uncertainty. This helper collects traits from all promotions and joins them:
   * - If all promotions have same value → plain value
   * - If promotions differ → Fuzzy with alternatives weighted by promotion certainty
   *
   * @param {State} state - State context for get_trait()
   * @param {Belief[]} promotions - Array of probability promotions (must have same subject)
   * @returns {Map<Traittype, any>} - Joined traits (values may be Fuzzy)
   * @private
   */
  static _join_traits_from_promotions(state, promotions) {
    // Assertions per plan
    const subject = promotions[0].subject
    assert(promotions.every(p => p.subject === subject), 'All promotions must have same subject')

    const first_tt = promotions[0].origin_state?.tt
    assert(promotions.every(p => p.origin_state?.tt === first_tt), 'All promotions must have same tt')

    const first_constraints = /** @type {Record<string, any>} */ (promotions[0].constraints ?? {})
    // Simple constraints equality check (they're objects, typically empty)
    assert(promotions.every(p => {
      const c = /** @type {Record<string, any>} */ (p.constraints ?? {})
      const keys1 = Object.keys(first_constraints)
      const keys2 = Object.keys(c)
      if (keys1.length !== keys2.length) return false
      return keys1.every(k => first_constraints[k] === c[k])
    }), 'All promotions must have same constraints')

    // Collect all trait slots from all promotions
    const all_slots = new Set()
    for (const promo of promotions) {
      for (const [tt] of promo.get_trait_entries()) {
        all_slots.add(tt)
      }
    }

    const joined = new Map()
    for (const tt of all_slots) {
      const alternatives = []
      for (const promo of promotions) {
        const value = promo.get_trait(state, tt)  // May be Fuzzy
        const certainty = promo.certainty ?? 1.0

        if (value instanceof Fuzzy && !value.is_unknown) {
          // Expand and multiply certainties
          for (const alt of value.alternatives) {
            alternatives.push({ value: alt.value, certainty: certainty * alt.certainty })
          }
        } else if (value != null && !(value instanceof Fuzzy)) {
          alternatives.push({ value, certainty })
        }
        // Skip null and unknown values
      }

      if (alternatives.length > 0) {
        // Check if all same value - no need for Fuzzy
        const first_value = alternatives[0].value
        const all_same = alternatives.every(a => a.value === first_value)
        joined.set(tt, all_same ? first_value : new Fuzzy({ alternatives }))
      }
    }
    return joined
  }

  /**
   * Walk bases chain to find first promotion, create intermediate versions.
   *
   * Example: city → country → region, where ONLY region has promotion → region_v2
   * When city creates a promotion:
   * 1. Walk bases: country → region
   * 2. Find region has promotion → region_v2
   * 3. Create country_v2 = [country, region_v2]
   * 4. Return country_v2 (so city_v2.bases = [city, country_v2])
   *
   * For probability promotions (array from pick_promotion), joins traits into
   * a single belief with Fuzzy values to preserve uncertainty.
   *
   * Currently called only when creating promotions. Future optimization: call when
   * creating any new belief in Eidos to give it cleaner inheritance without nested
   * promotions to resolve at trait lookup time.
   *
   * @param {State} state - State context for pick_promotion()
   * @returns {Belief|null} - Intermediate belief to include, or null if no promotions
   * @private
   */
  _materialize_promotion_chain(state) {
    const visited = new Set()

    // Search from each immediate Belief base
    for (const base of this._bases) {
      if (!(base instanceof Belief)) continue

      const result = Belief._find_first_promotion(state, base, [], visited)
      if (!result) continue

      const { resolved, path } = result

      // Handle single vs probability (array) promotions
      const promotions = Array.isArray(resolved) ? resolved : [resolved]
      let current_resolved

      if (promotions.length === 1) {
        // Single promotion - use directly
        current_resolved = promotions[0]
      } else {
        // Multiple probability promotions - join traits into single belief
        // The node with promotions is the last in path
        const node_with_promotions = path[path.length - 1]

        // Join traits from all promotions into Fuzzy values
        const joined_traits = Belief._join_traits_from_promotions(state, promotions)

        // Create joined belief with original node as base (inherits non-overridden traits)
        // Uses same subject since all promotions represent same entity
        const joined = new Belief(state, promotions[0].subject, [node_with_promotions])
        // Not a promotion itself - certainty is captured IN the Fuzzy trait values
        joined.certainty = null
        // All promotions have same constraints (asserted in helper)
        joined.constraints = promotions[0].constraints

        // Set joined traits
        for (const [tt, value] of joined_traits) {
          joined.add_trait(tt, value)
        }

        state.insert_beliefs(joined)
        current_resolved = joined
      }

      // Create intermediate versions bottom-up
      // path = [country, region] for city → country → region
      // We create: country_v2 = [country, region_v2]
      for (let i = path.length - 2; i >= 0; i--) {
        const intermediate = path[i]
        // Remove intermediate from state to avoid duplicate subjects
        state.remove_beliefs(intermediate)
        /** @type {Belief} */
        const intermediate_v2 = new Belief(state, intermediate.subject, [intermediate, current_resolved])
        // Copy certainty and constraints from resolved promotion
        intermediate_v2.certainty = current_resolved.certainty
        intermediate_v2.constraints = current_resolved.constraints
        state.insert_beliefs(intermediate_v2)
        current_resolved = intermediate_v2
      }

      return current_resolved
    }

    return null
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

    // Walk bases breadth-first, stop at first named prototype or archetypes
    /** @type {Archetype[]} */
    const edge_archetypes = []
    /** @type {Belief[]} */
    const queue = [this]
    const seen = new Set()

    while (queue.length > 0 && edge_archetypes.length === 0) {
      const current = /** @type {Belief} */ (queue.shift())
      if (!current || seen.has(current)) continue
      seen.add(current)

      for (const b of current._bases) {
        if (b instanceof Archetype) {
          edge_archetypes.push(b)
        } else if (b instanceof Belief) {
          // Stop at named prototypes
          if (b.is_shared && b.get_label()) {
            for (const archetype of b._bases) {
              if (archetype instanceof Archetype) edge_archetypes.push(archetype)
            }
          } else {
            queue.push(b)
          }
        }
      }
    }

    if (edge_archetypes.length > 0) {
      // Filter to keep only "leaf" archetypes - remove any that are bases of others in the list
      const leaf_archetypes = edge_archetypes.filter(archetype => {
        // Check if this archetype is a base of any other archetype in the list
        return !edge_archetypes.some(other => {
          if (other === archetype) return false
          // Walk other's bases to see if archetype appears
          const queue = [other]
          const seen = new Set()
          while (queue.length > 0) {
            const current = queue.shift()
            if (!current || seen.has(current)) continue
            seen.add(current)
            if (current === archetype) return true
            for (const base of current._bases) {
              if (base instanceof Archetype) queue.push(base)
            }
          }
          return false
        })
      })

      parts.push(`[${leaf_archetypes.map(a => a.label).join(', ')}]`)
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
    const result = /** @type {{_type: string, _id: number, sid: number, label: string|null, about: any, archetypes: string[], bases: (string|number)[], traits: any, origin_state: number|null, promotions?: number[], certainty?: number, promotable?: boolean, _promotable_epoch?: number|null, resolution?: number}} */ ({
      _type: 'Belief',
      _id: this._id,
      sid: this.subject.sid,
      label: this.get_label(),
      about: about_trait?.toJSON() ?? null,
      archetypes: [...this.get_archetypes().map(a => a.label)],
      bases: [...this._bases.values().map(b => b instanceof Archetype ? b.label : b._id)],
      traits: Object.fromEntries(
        this._traits.entries().map(([traittype, v]) => [traittype.label, Traittype.serializeTraitValue(v)])
      ),
      origin_state: this.origin_state?._id ?? null
    })
    // Save promotions as array of belief IDs
    if (this.promotions.size > 0) {
      result.promotions = [...this.promotions].map(p => p._id)
    }
    // Save certainty if set (for probability beliefs)
    if (this.certainty !== null) {
      result.certainty = this.certainty
    }
    // Save promotable if true (beliefs that can have promotions)
    if (this.promotable) {
      result.promotable = this.promotable
      result._promotable_epoch = this._promotable_epoch
    }
    // Save resolution if set (for resolution beliefs that collapse uncertainty)
    if (this.resolution !== null) {
      result.resolution = this.resolution._id
    }
    return result
  }

  /**
   * Create prototype reference for inspect UI
   * @returns {{label: string|null, type: 'Belief', id: number}}
   */
  to_inspect_prototype() {
    return {label: this.get_label(), type: 'Belief', id: this._id}
  }

  /**
   * Find beliefs that have this belief as a base (excluding promotions)
   * INSPECT-ONLY: expensive scan, only for debugging/inspection UI
   * @returns {Array<{_id: number, label: string|null}>}
   */
  get_children_for_inspect() {
    if (!this.in_mind) return []
    const children = []
    // @heavy - iterates all beliefs in mind to find children
    for (const belief of DB.get_beliefs_by_mind(this.in_mind)) {
      // Check if this belief is in their bases (but not a promotion)
      if (belief._bases.has(this) && !this.promotions.has(belief)) {
        children.push({
          _id: belief._id,
          label: belief.get_label()
        })
      }
    }
    return children
  }

  /**
   * Create base reference for inspect UI
   * @returns {{label: string|null, id: number, has_promotions?: boolean}}
   */
  to_inspect_base() {
    const result = /** @type {{label: string|null, id: number, has_promotions?: boolean}} */ ({label: this.get_label(), id: this._id})
    if (this.promotions.size > 0) {
      result.has_promotions = true
    }
    return result
  }

  /**
   * Create shallow inspection view of this belief for the inspect UI
   * @param {State} state - State context for resolving trait sids
   * @returns {{_type: string, _id: number, label: string|null, archetypes: string[], prototypes: Array<{label: string|null, type: string, id?: number}>, bases: Array<{label: string|null, id?: number}>, traits: any, mind_id?: number, mind_label?: string|null, about_label?: string|null, locked?: boolean, has_promotions?: boolean, promotions?: Array<{_id: number, label: string|null, certainty: number|null}>, promotable?: boolean, certainty?: number|null, children?: Array<{_id: number, label: string|null}>}} Shallow representation with references, including mind context and what this knowledge is about (for cross-mind knowledge beliefs)
   */
  to_inspect_view(state) {
    assert(state instanceof State, "should be State", state);

    // Build traits object using get_trait() for each slot to resolve promotions
    const traits_obj = /** @type {Record<string, any>} */ ({})
    // @heavy - iterating all trait slots for inspection view
    for (const traittype of this.get_slots()) {
      const v = this.get_trait(state, traittype)
      if (v != null) {
        traits_obj[traittype.label] = traittype.to_inspect_view(state, v)
      }
    }

    const result = /** @type {{_type: string, _id: number, label: string|null, archetypes: string[], prototypes: Array<{label: string|null, type: string, id?: number}>, bases: Array<{label: string|null, id?: number}>, traits: any, mind_id?: number, mind_label?: string|null, about_label?: string|null, locked?: boolean, has_promotions?: boolean, promotions?: Array<{_id: number, label: string|null, certainty: number|null}>, promotable?: boolean, certainty?: number|null, children?: Array<{_id: number, label: string|null}>}} */ ({
      _type: 'Belief',
      _id: this._id,
      label: this.get_label(),
      archetypes: [...this.get_archetypes().map(a => a.label)],
      prototypes: [...this.get_prototypes().map(p => p.to_inspect_prototype())],
      bases: [...this._bases.values().map(b => b.to_inspect_base())],
      traits: traits_obj
    })

    if (this.in_mind) {
      result.mind_id = this.in_mind._id
      result.mind_label = this.in_mind.label
    }

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

    // Indicate if belief has promotions (lazy version propagation)
    if (this.promotions.size > 0) {
      result.has_promotions = true
      result.promotions = [...this.promotions].map(p => ({
        _id: p._id,
        label: p.get_label(),
        certainty: p.certainty
      }))
    }

    // Include promotable if true
    if (this.promotable) {
      result.promotable = true
    }

    // Include certainty if set
    if (this.certainty !== null) {
      result.certainty = this.certainty
    }

    // @heavy - scan for children (beliefs that inherit from this one)
    const children = this.get_children_for_inspect()
    if (children.length > 0) {
      result.children = children
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
        const value = traittype.deserialize_value(this, trait_value)
        this._traits.set(traittype, value)

        // Build reverse index for Subject trait values
        if (this.origin_state && value instanceof Subject) {
          this.origin_state.rev_add(value, traittype, this)
        } else if (this.origin_state && Array.isArray(value)) {
          // Handle arrays of Subjects
          for (const item of value) {
            if (item instanceof Subject) {
              this.origin_state.rev_add(item, traittype, this)
            }
          }
        }
      }
      // If no traittype found, skip (invalid trait)
    }
    // Clean up temporary storage
    // @ts-expect-error - cleaning up dynamically set property
    delete this._deserialized_traits
  }

  /**
   * Finalize promotions after JSON deserialization - resolve belief ID references
   * Called after all beliefs are loaded from JSON
   */
  _finalize_promotions_from_json() {
    // @ts-expect-error - _promotion_ids is set dynamically in from_json()
    const promotion_ids = this._promotion_ids
    if (!promotion_ids) return

    for (const promotion_id of promotion_ids) {
      const promotion = DB.get_belief_by_id(promotion_id)
      if (promotion) {
        this.promotions.add(promotion)
      }
    }

    // Clean up temporary storage
    // @ts-expect-error - cleaning up dynamically set property
    delete this._promotion_ids
  }

  /**
   * Finalize resolution after JSON deserialization - resolve belief ID reference
   * Called after all beliefs are loaded from JSON
   */
  _finalize_resolution_from_json() {
    // @ts-expect-error - _resolution_id is set dynamically in from_json()
    const resolution_id = this._resolution_id
    if (!resolution_id) return

    const resolved_belief = DB.get_belief_by_id(resolution_id)
    if (resolved_belief) {
      this.resolution = resolved_belief
    }

    // Clean up temporary storage
    // @ts-expect-error - cleaning up dynamically set property
    delete this._resolution_id
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
    belief._cache_deps = null
    belief.promotions = new Set()
    belief.certainty = data.certainty ?? null
    belief.promotable = data.promotable ?? false
    belief._promotable_epoch = data._promotable_epoch ?? (data.promotable ? next_id() : null)
    belief.constraints = {}
    belief.resolution = null
    // Store promotion IDs for deferred resolution (after all beliefs are loaded)
    belief._promotion_ids = data.promotions ?? null
    // Store resolution ID for deferred resolution (after all beliefs are loaded)
    belief._resolution_id = data.resolution ?? null

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
   * @param {any} template - Template with sid, bases, traits, about_state, label, promotable, certainty
   * @returns {Belief}
   */
  static from_template(state, {sid=null, bases=[], traits={}, about_state=null, label=null, promotable=false, certainty=null} = {}) {
    assert(state instanceof State, 'from_template requires State as first argument', {state})
    // Promotable beliefs must be in temporal states (not timeless Eidos/Logos)
    assert(!promotable || state.tt != null,
      'Promotable beliefs require temporal state (state.tt must not be null)',
      {promotable, state_tt: state.tt, mind: state.in_mind?.label})

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

    const belief = new Belief(state, subject, resolved_bases, {promotable})
    belief.certainty = certainty

    for (const [trait_label, trait_data] of Object.entries(traits)) {
      debug("  add trait", trait_label)
      const traittype = Traittype.get_by_label(trait_label)
      assert(traittype instanceof Traittype, `Trait ${trait_label} do not exist`, {trait_label, belief: belief.get_label(), trait_data})
      belief.add_trait_from_template(state, traittype, trait_data, {about_state})
    }

    state.insert_beliefs(belief)

    return belief
  }

  /**
   * Create belief without template
   * The belief is automatically inserted into the state.
   * @param {State} state - State creating this belief
   * @param {Array<Belief|Archetype>} [bases] - Base beliefs/archetypes
   * @param {Record<string, any>} [traits] - Trait values (already resolved, not template data)
   * @returns {Belief} The created and inserted belief
   */
  static from(state, bases = [], traits = {}) {
    const belief = new Belief(state, null, bases)

    for (const [trait_label, trait_data] of Object.entries(traits)) {
      const traittype = Traittype.get_by_label(trait_label)
      assert(traittype instanceof Traittype, `Trait ${trait_label} do not exist`, {trait_label})
      belief.add_trait(traittype, trait_data)
    }

    state.insert_beliefs(belief)
    return belief
  }

  /**
   * Replace this belief with a new version having updated traits.
   * Removes old belief and inserts new one (only new version exists in state).
   * Works even when this belief is locked (creates new belief, doesn't modify old).
   *
   * **Promotions** (`promote: true`):
   * Use promotions for shared beliefs in Eidos that many other beliefs inherit from.
   * When a shared belief updates (e.g., "winter arrives"), all inheriting beliefs
   * should automatically see the new version. Without promotions, you'd need to
   * create new versions for every city and NPC - millions of belief objects.
   *
   * With promotions, only one new belief is created. The promotion is registered
   * on the original belief, and trait resolution automatically picks the promoted
   * version based on timestamp. This enables O(1) updates instead of O(NPCs).
   *
   * - **Temporal promotions** (certainty: null): Resolver picks by timestamp,
   *   returns concrete values. Use for seasonal changes, news events, etc.
   * - **Probability promotions** (certainty: 0-1): Multiple possible outcomes,
   *   joined into Fuzzy trait values. Use for uncertain states like "king might be dead".
   *
   * @param {State} state - State context for the new belief (must be unlocked)
   * @param {Record<string, any>} traits - Trait updates (already resolved, not templates)
   * @param {object} [options] - Optional promotion/resolution options
   * @param {boolean} [options.promote] - Register as promotion (propagates to inheritors)
   * @param {number} [options.certainty] - Probability weight (0 < x < 1, null = temporal)
   * @param {object} [options.constraints] - Future: exclusion rules, validity periods
   * @param {Belief} [options.resolution] - Belief this resolves (collapses uncertainty)
   * @returns {Belief} New belief with this belief as base
   *
   * @example
   * // Temporal promotion - country updates to winter
   * country.replace(state, { season: 'winter' }, { promote: true })
   * // All NPCs inheriting from country now see 'winter' at this timestamp
   *
   * @example
   * // Probability promotion - king's fate uncertain
   * king.replace(state, { status: 'dead' }, { promote: true, certainty: 0.6 })
   * king.replace(state, { status: 'alive' }, { promote: true, certainty: 0.4 })
   * // Trait resolution returns Fuzzy with both alternatives
   *
   * @example
   * // Resolution - collapse uncertainty to concrete value
   * hammer.replace(state, { location: 'workshop' }, { resolution: uncertain_hammer })
   * // Future queries for uncertain_hammer's subject see this resolved value
   */
  replace(state, traits = {}, { promote, certainty, constraints, resolution } = {}) {
    assert(state instanceof State, 'replace requires State parameter', {belief_id: this._id})
    assert(!state.locked, 'Cannot replace into locked state', {state_id: state._id, belief_id: this._id})

    // Remove this belief from state (idempotent - skips if already removed)
    state.remove_beliefs(this)

    // For Eidos promotions, materialize intermediate versions for any promotions in bases chain
    // This ensures the new belief has a "clean" inheritance chain without nested promotions
    /** @type {Array<Belief|Archetype>} */
    let bases = [this]
    if (promote) {
      assert(this.in_mind?.in_eidos,
        'Promotions can only be created in Eidos hierarchy (shared beliefs)',
        {mind: this.in_mind?.label, belief_id: this._id, belief_label: this.get_label()})

      // Promotions require the parent belief to be marked as promotable
      assert(this.promotable,
        'Promotions require promotable=true on parent belief',
        {belief_id: this._id, belief_label: this.get_label(), promotable: this.promotable})

      const materialized = this._materialize_promotion_chain(state)
      if (materialized) bases = [this, materialized]
    }
    const replaced = new Belief(state, this.subject, bases)

    // Add traits directly (no template resolution)
    for (const [trait_label, trait_value] of Object.entries(traits)) {
      const traittype = Traittype.get_by_label(trait_label)
      assert(traittype instanceof Traittype, `Traittype '${trait_label}' not found`, {trait_label})
      replaced.add_trait(traittype, trait_value)
    }

    // If promote is set, register as promotion
    if (promote) {
      // Validate certainty: must be null/undefined (not a probability) or strictly between 0 and 1
      if (certainty != null) {
        assert(typeof certainty === 'number', 'certainty must be number or null', {certainty})
        assert(certainty > 0 && certainty < 1,
          'certainty must be > 0 and < 1 (probability weight), not boundary values',
          {certainty, hint: 'Use null for non-probability promotions, or value like 0.5 for probability'}
        )
      }

      // Set direct properties on the promoted belief
      // Note: origin_state is already set in constructor
      // Auto-copy certainty/constraints/promotable from this belief if not explicitly provided
      replaced.certainty = certainty ?? this.certainty
      replaced.constraints = constraints ?? this.constraints
      // Inherit promotable for chained promotions (new epoch for new belief)
      replaced.promotable = this.promotable
      replaced._promotable_epoch = this.promotable ? next_id() : null

      // Register in parent's promotions set and bump parent's epoch
      this.promotions.add(replaced)
      this._promotable_epoch = next_id()  // Invalidate caches depending on this belief
    }

    // If resolution is set, this belief collapses uncertainty in the referenced belief
    if (resolution) {
      assert(resolution instanceof Belief, 'resolution must be a Belief', {resolution})
      replaced.resolution = resolution
      // Note: Subject.resolutions index is updated in insert_beliefs()
    }

    // Insert into state automatically
    state.insert_beliefs(replaced)

    return replaced
  }

  /**
   * @deprecated Use replace() instead. branch() is an alias for backwards compatibility.
   * @param {State} state
   * @param {Record<string, any>} traits
   * @param {object} options
   * @returns {Belief}
   */
  branch(state, traits = {}, options = {}) {
    return this.replace(state, traits, options)
  }

}
