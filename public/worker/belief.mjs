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

import { assert } from '../lib/debug.mjs'
import { next_id } from './id_sequence.mjs'
import { Archetype } from './archetype.mjs'
import * as DB from './db.mjs'
import * as Cosmos from './cosmos.mjs'
import { Subject } from './subject.mjs'

/**
 * @typedef {object} BeliefJSON
 * @property {string} _type - Always "Belief"
 * @property {number} _id - Unique version identifier
 * @property {number} sid - Subject identifier (stable across versions)
 * @property {string|null} label - Optional label for lookup
 * @property {number|null} about - Parent belief _id (null if not about another belief)
 * @property {string[]} archetypes - Archetype labels for this belief
 * @property {(string|number)[]} bases - Base archetype labels or belief _ids
 * @property {Object<string, any>} traits - Trait values (sids, primitives, or references)
 */

/**
 * Represents a belief about an entity with versioning support
 * @property {number} _id - Unique version identifier
 * @property {import('./subject.mjs').Subject} subject - Canonical Subject (identity holder)
 * @property {string|null} label - Optional label for lookup
 * @property {import('./mind.mjs').Mind} in_mind - Mind this belief belongs to
 * @property {Set<Belief|Archetype>} _bases - Base archetypes/beliefs for inheritance
 * @property {Map<string, *>} _traits - Trait values (sids, primitives, State/Mind refs)
 * @property {boolean} locked - Whether belief can be modified
 */
export class Belief {

  /**
   * @param {import('./mind.mjs').Mind} mind
   * @param {object} param1
   * @param {import('./subject.mjs').Subject|null} [param1.subject] - Subject (provide to create version of existing subject)
   * @param {Array<Archetype|Belief>} [param1.bases] - Archetype or Belief objects (no strings)
   * @param {import('./state.mjs').State|null} [creator_state] - State that's creating this belief (for inferring ground_state)
   */
  constructor(mind, {subject=null, bases=[]}, creator_state = null) {
    for (const base of bases) {
      assert(typeof base !== 'string',
        'Constructor received string base - use Belief.from_template() instead',
        {base})
    }

    /** @type {Set<Belief|Archetype>} */ this._bases = new Set(bases)
    this.subject = subject ?? DB.get_or_create_subject(next_id())
    this._id = next_id()
    this.in_mind = mind
    this._traits = new Map()
    this.locked = false

    DB.belief_by_id.set(this._id, this)
    DB.register_belief_by_sid(this)

    // TODO: add default trait values
  }

  /**
   * @param {string} label
   * @param {*} data - Raw data to be resolved by traittype
   * @param {import('./state.mjs').State|null} [creator_state] - State creating this belief (for inferring ground_state)
   */
  resolve_and_add_trait(label, data, creator_state = null) {
    assert(!this.locked, 'Cannot modify locked belief', {belief_id: this._id, label: this.get_label()})

    const traittype = Cosmos.get_traittype(label)
    assert(traittype != null, `Trait ${label} do not exist`, {label, belief: this.get_label(), data, Traittype_by_label: DB.traittype_by_label})

    const value = /** @type {import('./traittype.mjs').Traittype} */ (traittype).resolve(this.in_mind, data, this, creator_state)

    assert(this.can_have_trait(label), `Belief can't have trait ${label}`, {label, belief: this.get_label(), value, archetypes: [...this.get_archetypes()].map(a => a.label)})

    this._traits.set(label, value)
  }

  /**
   * @param {string} label
   * @returns {boolean}
   */
  can_have_trait(label) {
    for (const archetype of this.get_archetypes()) {
      // @ts-ignore - generator always yields valid archetypes
      if (label in archetype.traits_template) return true
    }
    return false
  }

  /**
   * Get a trait value with sids resolved to Beliefs
   * @param {import('./state.mjs').State} state - State context for resolving sids
   * @param {string} trait_name - Name of the trait to get
   * @returns {*} Resolved trait value (Beliefs instead of sids)
   */
  get_trait(state, trait_name) {
    const raw_value = this.traits.get(trait_name)
    return this._resolve_trait_value(raw_value, state)
  }

  /**
   * Get the belief this is about (resolves @about trait)
   * @param {import('./state.mjs').State} state - State context for resolving Subject
   * @returns {Belief|null} The belief this is about, or null
   */
  get_about(state) {
    const about_trait = this.traits.get('@about')
    if (about_trait instanceof Subject) {
      // Check if @about traittype specifies mind scope
      let resolve_state = state
      if (Cosmos.get_traittype('@about')?.mind_scope === 'parent' && state?.ground_state) {
        resolve_state = state.ground_state
      }

      // Try to resolve in the determined state
      const belief = resolve_state?.resolve_subject?.(about_trait.sid)
      if (belief) return belief

      // Fallback to global registry (cross-mind reference)
      const beliefs = DB.belief_by_sid.get(about_trait.sid)
      if (beliefs?.size) return [...beliefs][0]
      return null
    }
    // No @about trait set
    return null
  }

  /**
   * @private
   * @param {*} value - Raw trait value (may contain sids or State/Mind refs)
   * @param {import('./state.mjs').State} state - State context for resolving sids
   * @returns {*} Resolved value
   */
  _resolve_trait_value(value, state) {
    if (Array.isArray(value)) {
      return value.map(item => this._resolve_trait_value(item, state))
    } else if (value instanceof Subject) {
      return value.resolve(state)
    } else if (value && typeof value === 'object' && value._type) {
      // State/Mind reference object from JSON - deserialize it
      return deserialize_trait_value(value)
    } else {
      return value
    }
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
        bases.push(... base.bases)
      }
    }
  }

  lock() {
    this.locked = true
  }

  /**
   * Get label for this belief's subject (sid)
   * @returns {string|null}
   */
  get_label() {
    return DB.label_by_sid.get(this.subject.sid) ?? null
  }

  /**
   * Set label for this belief's subject (sid)
   * @param {string} label
   */
  set_label(label) {
    const existing_label = this.get_label()
    if (existing_label !== null) {
      throw new Error(`Subject sid ${this.subject.sid} already has label '${existing_label}', cannot set to '${label}'`)
    }

    if (DB.sid_by_label.has(label)) {
      throw new Error(`Label '${label}' is already used by another belief`)
    }
    if (DB.archetype_by_label[label]) {
      throw new Error(`Label '${label}' is already used by an archetype`)
    }

    DB.sid_by_label.set(label, this.subject.sid)
    DB.label_by_sid.set(this.subject.sid, label)
  }

  sysdesig() {
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

      for (const b of base.bases) {
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

    parts.push(`#${this._id}`)

    return parts.join(' ')
  }

  toJSON() {
    const about_trait = this.traits.get('@about')
    return {
      _type: 'Belief',
      _id: this._id,
      sid: this.subject.sid,
      label: this.get_label(),
      about: about_trait?.toJSON() ?? null,
      archetypes: [...this.get_archetypes()].map(a => a.label),
      bases: [...this.bases].map(b => b instanceof Archetype ? b.label : b._id),
      traits: Object.fromEntries(
        [...this.traits].map(([k, v]) => [k, Cosmos.Traittype.serializeTraitValue(v)])
      )
    }
  }

  /**
   * Create shallow inspection view of this belief
   * @param {import('./state.mjs').State} state - State context for resolving trait sids
   * @returns {object} Shallow representation with references
   */
  inspect(state) {
    const about_belief = this.get_about(state)
    return {
      _type: 'Belief',
      _id: this._id,
      label: this.get_label(),
      about: about_belief ? {_ref: about_belief._id, label: about_belief.get_label()} : null,
      archetypes: [...this.get_archetypes()].map(a => a.label),
      bases: [...this.bases].map(b => b instanceof Archetype ? b.label : b._id),
      traits: Object.fromEntries(
        [...this.traits].map(([k, v]) => [k, Cosmos.Traittype.inspectTraitValue(state, v)])
      )
    }
  }

  /**
   * Finalize traits after loading - resolve State/Mind reference objects
   * Called after all entities are loaded
   */
  _finalize_traits() {
    for (const [trait_name, trait_value] of this._traits) {
      this._traits.set(trait_name, this._resolve_final_trait_value(trait_name, trait_value))
    }
  }

  /**
   * Resolve trait value completely (including nested State/Mind references)
   * @param {string} trait_name - Trait name for type lookup
   * @param {*} value - Trait value (may contain {_type, _id} reference objects or raw sids)
   * @returns {*} Fully resolved value
   */
  _resolve_final_trait_value(trait_name, value) {
    if (Array.isArray(value)) {
      return value.map(item => this._resolve_final_trait_value(trait_name, item))
    } else if (value && typeof value === 'object' && value._type) {
      // State/Mind reference object from JSON - deserialize it
      return deserialize_trait_value(value)
    } else if (typeof value === 'number') {
      // Check if this trait type is a Belief reference or Subject
      const traittype = Cosmos.get_traittype(trait_name)
      if (traittype) {
        if (DB.archetype_by_label[traittype.data_type] || traittype.data_type === 'Subject') {
          // It's a Belief/Subject reference - wrap in Subject
          return new Subject(value)
        }
      }
      // Literal number
      return value
    } else {
      // Other primitives
      return value
    }
  }

  /**
   * Load belief from JSON data
   * @param {import('./mind.mjs').Mind} mind
   * @param {BeliefJSON} data
   * @returns {Belief}
   */
  static from_json(mind, data) {
    // Create belief shell without going through normal constructor
    const belief = Object.create(Belief.prototype)

    belief._id = data._id
    belief.subject = DB.get_or_create_subject(data.sid)
    belief.in_mind = mind
    belief.locked = false

    // Resolve 'bases' (archetype labels or belief IDs)
    belief._bases = new Set()
    for (const base_ref of data.bases) {
      if (typeof base_ref === 'string') {
        const archetype = DB.archetype_by_label[base_ref]
        if (!archetype) {
          throw new Error(`Archetype '${base_ref}' not found for belief ${belief._id}`)
        }
        belief._bases.add(archetype)
      } else if (typeof base_ref === 'number') {
        const base_belief = DB.belief_by_id.get(base_ref)
        if (!base_belief) {
          throw new Error(`Cannot resolve base belief ${base_ref} for belief ${belief._id}`)
        }
        belief._bases.add(base_belief)
      }
    }

    // Copy traits as-is - sids, primitives, and State/Mind reference objects
    // Resolution happens lazily via _finalize_traits() or when accessed
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
    DB.belief_by_id.set(belief._id, belief)
    DB.register_belief_by_sid(belief)

    // Register label-sid mappings (for first belief with this label loaded)
    if (data.label) {
      if (!DB.sid_by_label.has(data.label)) {
        if (DB.archetype_by_label[data.label]) {
          throw new Error(`Label '${data.label}' is already used by an archetype`)
        }
        DB.sid_by_label.set(data.label, belief.subject.sid)
        DB.label_by_sid.set(belief.subject.sid, data.label)
      }
    }

    return belief
  }

  /**
   * Create belief from template with string resolution and trait templates
   * @param {import('./mind.mjs').Mind} mind
   * @param {object} template
   * @param {number|null} [template.sid] - Subject ID (optional, for explicit versioning)
   * @param {string|null} [template.label]
   * @param {Array<string|Belief|import('./archetype.mjs').Archetype>} [template.bases]
   * @param {Object<string, any>} [template.traits]
   * @param {import('./state.mjs').State|null} [creator_state]
   * @returns {Belief}
   */
  static from_template(mind, {sid=null, label=null, bases=[], traits={}}, creator_state = null) {
    const resolved_bases = bases.map(base => {
      if (typeof base === 'string') {
        const resolved = DB.get_belief_by_label(base) ?? DB.archetype_by_label[base]
        assert(resolved != null, `Base '${base}' not found as belief label or archetype`, {base})
        return /** @type {Belief|import('./archetype.mjs').Archetype} */ (resolved)
      }
      return base
    })

    const subject = sid ? DB.get_or_create_subject(sid) : null

    const belief = new Belief(mind, {
      subject,
      bases: resolved_bases
    }, creator_state)

    if (label) {
      belief.set_label(label)
    }

    for (const [trait_label, trait_data] of Object.entries(traits)) {
      belief.resolve_and_add_trait(trait_label, trait_data, creator_state)
    }

    return belief
  }

  // Simple property accessors (no lazy loading needed with SID system)
  get bases() {
    return this._bases
  }

  get traits() {
    return this._traits
  }
}

/**
 * Deserialize trait value (handle nested Mind/State/Belief references)
 * @param {*} value - Serialized value
 * @returns {*} Deserialized value
 */
function deserialize_trait_value(value) {
  if (Array.isArray(value)) {
    return value.map(item => deserialize_trait_value(item))
  }

  if (value && typeof value === 'object' && value._type) {
    // Handle nested references
    if (value._type === 'Belief') {
      // Use ID lookup (exact version), fall back to label lookup if needed
      const belief = DB.belief_by_id.get(value._id)
      if (!belief) {
        throw new Error(`Cannot resolve belief reference ${value._id} in trait`)
      }
      return belief
    }

    if (value._type === 'State') {
      const state = DB.state_by_id.get(value._id)
      if (!state) {
        throw new Error(`Cannot resolve state reference ${value._id} in trait`)
      }
      return state
    }

    if (value._type === 'Mind') {
      const mind = DB.mind_by_id.get(value._id)
      if (!mind) {
        throw new Error(`Cannot resolve mind reference ${value._id} in trait`)
      }
      return mind
    }
  }

  return value
}
