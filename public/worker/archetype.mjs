import { assert } from '../lib/debug.mjs'

/**
 * Archetype definition for beliefs
 * @property {string} label - Archetype identifier
 * @property {Set<Archetype>} bases - Base archetypes
 * @property {object} traits_template - Trait definitions
 */
export class Archetype {
  /** @type {Record<string, Archetype>} */
  static by_label = {}

  /**
   * @param {string} label
   * @param {object} param1
   * @param {string[]} [param1.bases]
   * @param {object} [param1.traits]
   */
  constructor(label, {bases=[], traits={}}) {
    this.label = label

    //log("Construct archetype with bases", bases)
    /** @type {Set<Archetype>} */
    this.bases = new Set([])
    for (const base_label of bases) {
      const base = Archetype.by_label[base_label]
      assert(base != null, `Archetype '${base_label}' not found in archetype registry`, {base_label, Archetype_by_label: Archetype.by_label})
      this.bases.add(base)
    }

    //this.traits = new Map()
    this.traits_template = traits
  }

  /**
   * @param {Set<any>} seen
   * @returns {Generator<Archetype>}
   */
  *get_archetypes(seen = new Set([])) {
    // bredth first
    /** @type {Archetype[]} */
    const bases = [this]
    while (bases.length > 0) {
      const base = bases.shift()
      if (!base || seen.has(base)) continue

      //log ("Check archetype", base.label)
      seen.add(base)
      bases.push(... base.bases)
      //log("archetype bases now", bases)
      yield base
    }
  }
}
