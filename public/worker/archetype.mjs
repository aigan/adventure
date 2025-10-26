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

import { assert } from '../lib/debug.mjs'
import * as DB from './db.mjs'

/**
 * Archetype definition for beliefs
 * @property {string} label - Archetype identifier
 * @property {Set<Archetype>} bases - Base archetypes
 * @property {object} traits_template - Trait definitions
 */
export class Archetype {
  /**
   * @param {string} label
   * @param {string[]} [bases]
   * @param {object} [traits]
   */
  constructor(label, bases = [], traits = {}) {
    this.label = label

    /** @type {Set<Archetype>} */ this._bases = new Set()
    for (const base_label of bases) {
      const base = DB.get_archetype_by_label(base_label)
      assert(base instanceof Archetype, `Archetype '${base_label}' not found in archetype registry`, {base_label})
      this._bases.add(base)
    }

    this._traits_template = traits
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
}
