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
import { Subject } from './subject.mjs'
import { Fuzzy } from './fuzzy.mjs'
import { eidos } from './eidos.mjs'
import { register_reset_hook } from './reset.mjs'

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
   * Resolve trait template values from strings to Subjects/Archetypes
   * Called after all archetypes are registered during DB.register()
   * Modifies _traits_template in-place to replace string references
   */
  resolve_template_values() {
    const eidos_state = eidos().origin_state
    assert(eidos_state, 'Eidos must have origin_state during archetype resolution')

    for (const [traittype, value] of this._traits_template) {
      if (value === null || typeof value !== 'string') continue

      const resolved = traittype.resolve_archetype_default(value, eidos_state)
      this._traits_template.set(traittype, resolved)
    }
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
   * @heavy O(traits in archetype template) - iterates template traits
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
      const base = /** @type {Archetype} */ (bases.shift())
      if (seen.has(base)) continue

      seen.add(base)
      bases.push(... base._bases)
      yield base
    }
  }

  /**
   * Resolve trait value from template data for archetype references
   * @param {*} traittype - Traittype instance (for accessing label, constraints)
   * @param {*} belief - Belief being constructed (provides origin_state for lookup)
   * @param {*} data - Raw template data (string label, Subject, Archetype, or invalid Belief)
   * @returns {*} Resolved Subject
   */
  static resolve_trait_value_from_template(traittype, belief, data) {
    if (data === null) return null

    // Handle Fuzzy instances directly
    if (data instanceof Fuzzy) return data

    // Handle {alternatives: [...]} template syntax - resolve each alternative's value
    if (typeof data === 'object' && data !== null && 'alternatives' in data) {
      const resolved_alternatives = data.alternatives.map((/** @type {{value: any, certainty: number}} */ alt) => ({
        value: Archetype.resolve_trait_value_from_template(traittype, belief, alt.value),
        certainty: alt.certainty
      }))
      return new Fuzzy({ alternatives: resolved_alternatives })
    }

    // Handle Archetype objects (from archetype templates) - find corresponding prototype
    if (data instanceof Archetype) {
      const subject = Subject.get_by_label(data.label)
      assert(subject,
        `Cannot resolve Archetype '${data.label}' for trait '${traittype.label}': ` +
        `no prototype Subject found with label '${data.label}'`)
      traittype.validate_archetype(subject, belief.origin_state)
      return subject
    }

    const { subject } = Subject._lookup_belief_from_template(traittype, belief, data)

    if (typeof data === 'string') {
      traittype.validate_archetype(subject, belief.origin_state)
    }

    return subject
  }

  /**
   * Validate that value is a Subject instance (for archetype-typed traits)
   * @param {Traittype} traittype
   * @param {*} value
   * @throws {Error} If value is not a Subject instance
   */
  static validate_value(traittype, value) {
    if (value === null) return

    // Archetypes expect Subject instances
    assert(
      value instanceof Subject,
      `Expected Subject instance for trait '${traittype.label}', got ${value?.constructor?.name || typeof value}`,
      {traittype, value, value_type: value?.constructor?.name || typeof value}
    )

    // Note: Could add archetype membership validation here if desired
    // Would require state parameter to look up belief
  }

  /**
   * Create inspection view for when archetype is used as a trait value
   * @param {*} _state - State context (unused, but required by interface)
   * @returns {{_type: string, label: string}} Archetype reference for UI
   */
  to_inspect_view(_state) {
    return {
      _type: 'Archetype',
      label: this.label
    }
  }

  /**
   * Create prototype reference for inspect UI
   * @returns {{label: string, type: 'Archetype'}}
   */
  to_inspect_prototype() {
    return {label: this.label, type: 'Archetype'}
  }

  /**
   * Create base reference for inspect UI
   * @returns {{label: string}}
   */
  to_inspect_base() {
    return {label: this.label}
  }

  /**
   * System designation - compact debug string
   * @returns {string}
   */
  sysdesig() {
    const labels = []
    for (const b of this._bases) labels.push(b.label)
    if (labels.length > 0) {
      return `Archetype ${this.label} (bases: ${labels.join(', ')})`
    }
    return `Archetype ${this.label}`
  }
}

/**
 * Proxy for concise archetype access by label
 * Usage: A.EventPerception instead of Archetype.get_by_label('EventPerception')
 * @type {Record<string, Archetype>}
 */
export const A = new Proxy(/** @type {Record<string, Archetype>} */ ({}), {
  get(_, prop) {
    return Archetype.get_by_label(/** @type {string} */ (prop))
  }
})

register_reset_hook(() => Archetype.reset_registry())
