/**
 * Archetype - defines what traits entities have and supports inheritance
 *
 * Archetypes define the structure for beliefs - what properties they can have.
 * Multiple inheritance via `bases` array allows composing traits from multiple sources.
 * Also intended to support methods and virtual (computed) traits.
 *
 * Key concepts:
 * - Trait definitions: What properties this type of entity can have
 * - Multiple inheritance: Combine traits from multiple archetypes
 * - Type validation: Ensures beliefs have appropriate traits
 *
 * Example: Player archetype has bases ['Actor', 'Mental']
 * - Inherits location, inventory from Actor
 * - Inherits mind, beliefs from Mental
 *
 * See docs/SPECIFICATION.md for archetype design
 * See world.mjs for archetype definitions
 */

import { assert } from './debug.mjs'
import * as DB from './db.mjs'
import { Traittype } from './traittype.mjs'

/**
 * Archetype definition for beliefs
 * @property {string} label - Archetype identifier
 * @property {Set<Archetype>} _bases - Base archetypes
 * @property {Map<Traittype, any>} _traits_template - Trait definitions (traittype -> default value or null)
 */
export class Archetype {
  /**
   * Static registry: archetype definitions by label
   * Query: O(1) lookup by label (e.g., "Actor", "ObjectPhysical")
   * Maintained by: register() - called during world setup
   * Scale: Small, bounded - typically dozens of archetypes, not billions
   *   Archetypes define entity types/templates, not entity instances
   *   Plain object (not Map) acceptable due to small size and static nature
   * @type {Record<string, Archetype>}
   */
  static _registry = {}

  /**
   * Get archetype by label
   * @param {string} label
   * @returns {Archetype|undefined}
   */
  static get_by_label(label) {
    return Archetype._registry[label]
  }

  /**
   * Register archetype in registry
   * @param {string} label
   * @param {Archetype} archetype
   */
  static register(label, archetype) {
    Archetype._registry[label] = archetype
  }

  /**
   * Clear registry (for testing)
   */
  static reset_registry() {
    for (const key in Archetype._registry) {
      delete Archetype._registry[key]
    }
  }

  /**
   * @param {string} label
   * @param {string[]} [bases]
   * @param {object} [traits]
   */
  constructor(label, bases = [], traits = {}) {
    this.label = label

    /** @type {Set<Archetype>} */ this._bases = new Set()
    for (const base_label of bases) {
      const base = Archetype.get_by_label(base_label)
      assert(base instanceof Archetype, `Archetype '${base_label}' not found in archetype registry`, {base_label})
      this._bases.add(base)
    }

    // Convert traits object to Map<Traittype, any>
    // NOTE: Requires Traittypes to be registered before Archetypes (guaranteed by DB.register order)
    /** @type {Map<Traittype, any>} */
    this._traits_template = new Map()
    for (const [trait_name, value] of Object.entries(traits)) {
      const traittype = Traittype.get_by_label(trait_name)
      assert(traittype, `Traittype '${trait_name}' not found in registry. Ensure DB.register() is called with traittypes before archetypes.`, {archetype: label, trait_name})
      this._traits_template.set(traittype, value)
    }
  }

  /**
   * Check if this archetype defines a trait (does not check bases)
   * @param {Traittype} traittype - Trait type
   * @returns {boolean}
   */
  has_trait(traittype) {
    assert(traittype instanceof Traittype, "has_trait requires Traittype", {archetype: this.label, traittype})
    return this._traits_template.has(traittype)
  }

  /**
   * Get trait value from this archetype only (does not check bases)
   * Polymorphic interface - matches Belief.get_own_trait_value()
   * @param {Traittype} traittype - Trait type
   * @returns {any} Trait template value or undefined if not found
   */
  get_own_trait_value(traittype) {
    assert(traittype instanceof Traittype, "get_own_trait_value requires Traittype", {archetype: this.label, traittype})
    return this._traits_template.get(traittype)
  }

  /**
   * Get iterable over trait entries (polymorphic interface)
   * Returns iterable of [Traittype, value] pairs for trait operations collection
   * @returns {IterableIterator<[Traittype, any]>} Iterator of trait entries
   */
  get_trait_entries() {
    return this._traits_template.entries()
  }

  /**
   * Iterate over all defined traits in this archetype's template including nulls (does not check bases)
   * @returns {Generator<[Traittype, any]>} Yields [traittype, value] pairs
   */
  *get_defined_traits() {
    for (const [traittype, value] of this._traits_template) {
      yield [traittype, value]
    }
  }

  /**
   * Iterate over traits with non-null values in this archetype's template (does not check bases)
   * @returns {Generator<[Traittype, any]>} Yields [traittype, value] pairs for set traits only
   */
  *get_traits() {
    for (const [traittype, value] of this._traits_template) {
      if (value != null) yield [traittype, value]
    }
  }

  /**
   * @param {Set<any>} seen
   * @returns {Generator<Archetype>}
   */
  *get_archetypes(seen = new Set()) {
    // breadth first
    /** @type {Archetype[]} */ const bases = [this]
    while (bases.length > 0) {
      const base = bases.shift()
      if (!base || seen.has(base)) continue

      seen.add(base)
      bases.push(... base._bases)
      yield base
    }
  }

  /**
   * Resolve trait value from template data for archetype references
   * @param {*} traittype - Traittype instance (for accessing label, constraints)
   * @param {*} belief - Belief being constructed (provides origin_state for lookup)
   * @param {*} data - Raw template data (string label, Subject, or invalid Belief)
   * @returns {*} Resolved Subject
   */
  static resolve_trait_value_from_template(traittype, belief, data) {
    // String input: lookup belief by label and return its subject
    if (typeof data === 'string') {
      // First try local state
      let found_belief = belief.origin_state.get_belief_by_label(data)

      // If not found, try shared beliefs (prototypes in Eidos)
      if (found_belief == null) {
        const subject = DB.get_subject_by_label(data)
        found_belief = subject?.get_shared_belief_by_state(belief.origin_state)
      }

      if (found_belief == null) {
        throw new Error(`Belief not found for trait '${traittype.label}': ${data}`)
      }

      // Validate archetype
      const required_archetype = Archetype.get_by_label(traittype.data_type)
      for (const a of found_belief.get_archetypes()) {
        if (a === required_archetype) {
          return found_belief.subject
        }
      }
      throw new Error(`Belief '${data}' does not have required archetype '${traittype.data_type}' for trait '${traittype.label}'`)
    }

    // Belief input: reject - this is a programming error
    if (data?.subject && typeof data.get_archetypes === 'function') {
      throw new Error(`Template data for trait '${traittype.label}' should use belief labels (strings) or Subject objects, not Belief objects`)
    }

    // Subject input (or other): return as-is
    return data
  }

  /**
   * System designation - compact debug string
   * @returns {string}
   */
  sysdesig() {
    const bases = [...this._bases].map(b => b.label).join(', ')
    if (bases) {
      return `Archetype ${this.label} (bases: ${bases})`
    }
    return `Archetype ${this.label}`
  }
}
