import { assert } from '../lib/debug.mjs'
import { next_id } from './id_sequence.mjs'
import { Archetype } from './archetype.mjs'
import * as DB from './db.mjs'
import * as Cosmos from './cosmos.mjs'

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
 * @property {number} sid - Subject identifier (stable across versions)
 * @property {string|null} label - Optional label for lookup
 * @property {import('./mind.mjs').Mind} in_mind - Mind this belief belongs to
 * @property {Belief|null} _about - Parent belief this is about (identity chain)
 * @property {Set<Belief|Archetype>} _bases - Base archetypes/beliefs for inheritance
 * @property {Map<string, *>} _traits - Trait values (sids, primitives, State/Mind refs)
 * @property {boolean} locked - Whether belief can be modified
 */
export class Belief {

  /**
   * @param {import('./mind.mjs').Mind} mind
   * @param {object} param1
   * @param {string|null} [param1.label]
   * @param {Belief|null} [param1.about] - Belief object this is about
   * @param {(string|Archetype|Belief)[]} [param1.bases] - Archetype labels or Belief objects
   * @param {object} [param1.traits]
   * @param {import('./state.mjs').State|null} [creator_state] - State that's creating this belief (for inferring ground_state)
   */
  constructor(mind, {label=null, about=null, bases=[], traits={}}, creator_state = null) {
    // Resolve bases early to determine if this is a new subject or version
    /** @type {Set<Belief|Archetype>} */
    this._bases = new Set([])

    for (let base of bases) {
      if (typeof base === 'string') {
        const base_label = base
        // Resolution order: belief label (via helper) → archetype
        base = DB.get_belief_by_label(base_label) ?? DB.archetype_by_label[base_label]
        assert(base != null, `Base '${base_label}' not found as belief label or archetype`, {base_label})
      }
      this._bases.add(/** @type {Belief|Archetype} */ (base))
    }

    // Determine sid: reuse from belief base, or assign new subject id
    let parent_belief = null
    for (const base of this._bases) {
      if (base.constructor.name === 'Belief') {
        parent_belief = base
        break
      }
    }

    // Normal construction
    /** @type {number} */
    this.sid = 0 // Temporary, will be set immediately
    if (parent_belief) {
      // This is a version of an existing subject
      this.sid = /** @type {Belief} */ (parent_belief).sid
      this._id = next_id()
    } else {
      // This is a new subject
      this.sid = next_id()
      this._id = next_id()
    }

    this.in_mind = mind
    this._about = /** @type {Belief|null} */ (about)
    this._traits = new Map()
    this.locked = false

    for (const [trait_label, trait_data] of Object.entries(traits)) {
      this.resolve_and_add_trait(trait_label, trait_data, creator_state)
    }

    // Register globally
    DB.belief_by_id.set(this._id, this)

    // Register in by_sid (sid → Set<Belief>)
    if (!DB.belief_by_sid.has(this.sid)) {
      DB.belief_by_sid.set(this.sid, new Set())
    }
    /** @type {Set<Belief>} */ (DB.belief_by_sid.get(this.sid)).add(this)

    if (label) {
      // For new subjects, register label-sid mappings
      if (!parent_belief) {
        // Check label uniqueness across beliefs and archetypes
        if (DB.sid_by_label.has(label)) {
          throw new Error(`Label '${label}' is already used by another belief`)
        }
        if (DB.archetype_by_label[label]) {
          throw new Error(`Label '${label}' is already used by an archetype`)
        }

        // Register label-sid bidirectional mapping
        DB.sid_by_label.set(label, this.sid)
        DB.label_by_sid.set(this.sid, label)
      }
    }

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
    //log('looking up traittype', label, traittype)
    assert(traittype != null, `Trait ${label} do not exist`, {label, belief: this.get_label(), data, Traittype_by_label: DB.traittype_by_label})

    // TypeScript: traittype is non-null after assert
    const value = /** @type {import('./traittype.mjs').Traittype} */ (traittype).resolve(this.in_mind, data, this, creator_state)

    assert(this.can_have_trait(label), `Belief can't have trait ${label}`, {label, belief: this.get_label(), value, archetypes: [...this.get_archetypes()].map(a => a.label)})

    this._traits.set(label, value)

    //log('belief', this.get_label(), 'add trait', label, data, datatype, value)
  }

  /**
   * @param {string} label
   * @returns {boolean}
   */
  can_have_trait(label) {
    for (const archetype of this.get_archetypes()) {
      //log ("check traits of archetype", archetype.label, archetype)
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
   * @private
   * @param {*} value - Raw trait value (may contain sids or State/Mind refs)
   * @param {import('./state.mjs').State} state - State context for resolving sids
   * @returns {*} Resolved value
   */
  _resolve_trait_value(value, state) {
    if (Array.isArray(value)) {
      return value.map(item => this._resolve_trait_value(item, state))
    } else if (typeof value === 'number') {
      // Might be a sid - try to resolve to Belief
      const resolved = state.resolve_subject(value)
      return resolved !== null ? resolved : value
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
  *get_archetypes(seen = new Set([])) {
    // bredth first
    /** @type {(Belief|Archetype)[]} */
    const bases = [this]
    while (bases.length > 0) {
      const base = bases.shift()
      if (!base || seen.has(base)) continue

      // If base is an Archetype, yield it and its bases
      if (base instanceof Archetype) {
        yield* base.get_archetypes(seen)
      } else {
        // If base is a Belief, continue walking its bases
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
    return DB.label_by_sid.get(this.sid) ?? null
  }

  /**
   * Get label for display by walking the belief chain
   * @returns {string|null}
   */
  get_display_label() {
    // First check sid-based label
    const label = this.get_label()
    if (label) return label

    // Walk bases to find label (only Belief bases, not Archetypes)
    for (const base of this.bases) {
      if (base.constructor.name === 'Belief') {
        const label = /** @type {Belief} */ (base).get_display_label()
        if (label) return label
      }
    }

    return null
  }

  sysdesig() {
    const parts = []

    const label = this.get_display_label()
    if (label) {
      parts.push(label)
    }

    // Get edge archetypes (directly in bases, not full inheritance)
    const edge_archetypes = []
    const seen = new Set()
    /** @type {Belief[]} */
    const bases_to_check = [this]

    while (bases_to_check.length > 0) {
      const base = bases_to_check.shift()
      if (!base || seen.has(base)) continue
      seen.add(base)

      for (const b of base.bases) {
        if (b instanceof Archetype) {
          edge_archetypes.push(b)
        } else if (b.constructor.name === 'Belief') {
          // Walk up belief chain to find archetypes
          bases_to_check.push(b)
        }
      }

      // Stop after finding archetypes
      if (edge_archetypes.length > 0) break
    }

    if (edge_archetypes.length > 0) {
      parts.push(`[${edge_archetypes.map(a => a.label).join(', ')}]`)
    }

    parts.push(`#${this._id}`)

    return parts.join(' ')
  }

  toJSON() {
    return {
      _type: 'Belief',
      _id: this._id,
      sid: this.sid,
      label: this.get_label(),
      about: this.about?._id ?? null,
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
    return {
      _type: 'Belief',
      _id: this._id,
      label: this.get_label(),
      about: this.about ? {_ref: this.about._id, label: this.about.get_display_label()} : null,
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
      this._traits.set(trait_name, this._resolve_final_trait_value(trait_value))
    }
  }

  /**
   * Resolve trait value completely (including nested State/Mind references)
   * @param {*} value - Trait value (may contain {_type, _id} reference objects)
   * @returns {*} Fully resolved value
   */
  _resolve_final_trait_value(value) {
    if (Array.isArray(value)) {
      return value.map(item => this._resolve_final_trait_value(item))
    } else if (value && typeof value === 'object' && value._type) {
      // State/Mind reference object from JSON - deserialize it
      return deserialize_trait_value(value)
    } else {
      // Primitives and sids stay as-is
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
    belief.sid = data.sid
    belief.in_mind = mind
    belief.locked = false

    // Resolve 'about' reference (ID to Belief object)
    belief._about = null
    if (data.about != null) {
      const resolved_about = DB.belief_by_id.get(data.about)
      if (!resolved_about) {
        throw new Error(`Cannot resolve about reference ${data.about} for belief ${belief._id}`)
      }
      belief._about = resolved_about
    }

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

    // Register globally
    DB.belief_by_id.set(belief._id, belief)

    // Register in by_sid (sid → Set<Belief>)
    if (!DB.belief_by_sid.has(belief.sid)) {
      DB.belief_by_sid.set(belief.sid, new Set())
    }
    /** @type {Set<Belief>} */ (DB.belief_by_sid.get(belief.sid)).add(belief)

    // Register label-sid mappings (for first belief with this label loaded)
    if (data.label) {
      if (!DB.sid_by_label.has(data.label)) {
        if (DB.archetype_by_label[data.label]) {
          throw new Error(`Label '${data.label}' is already used by an archetype`)
        }
        DB.sid_by_label.set(data.label, belief.sid)
        DB.label_by_sid.set(belief.sid, data.label)
      }
    }

    return belief
  }

  // Simple property accessors (no lazy loading needed with SID system)
  get about() {
    return this._about
  }

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
      // States are nested in minds, need to search
      for (const mind of DB.mind_by_id.values()) {
        for (const state of mind.state) {
          if (state._id === value._id) {
            return state
          }
        }
      }
      throw new Error(`Cannot resolve state reference ${value._id} in trait`)
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
