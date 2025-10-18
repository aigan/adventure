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
   * @param {object} param1
   * @param {string[]} [param1.bases]
   * @param {object} [param1.traits]
   */
  constructor(label, {bases=[], traits={}}) {
    this.label = label

    /** @type {Set<Archetype>} */ this.bases = new Set()
    for (const base_label of bases) {
      const base = DB.archetype_by_label[base_label]
      assert(base != null, `Archetype '${base_label}' not found in archetype registry`, {base_label, Archetype_by_label: DB.archetype_by_label})
      this.bases.add(base)
    }

    this.traits_template = traits
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
      bases.push(... base.bases)
      yield base
    }
  }
}
