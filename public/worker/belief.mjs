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

import { log, assert } from '../lib/debug.mjs'
import { next_id } from './id_sequence.mjs'
import { Archetype } from './archetype.mjs'
import * as DB from './db.mjs'
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
 * @property {Mind|null} in_mind - Mind this belief belongs to (null for shared beliefs)
 * @property {Set<Belief|Archetype>} _bases - Base archetypes/beliefs for inheritance
 * @property {Map<string, *>} _traits - Trait values (sids, primitives, State/Mind refs)
 * @property {boolean} locked - Whether belief can be modified
 */
export class Belief {

  /**
   * @param {Mind|null} mind - Mind this belief belongs to (null for shared beliefs)
   * @param {object} param1
   * @param {Subject|null} [param1.subject] - Subject (provide to create version of existing subject)
   * @param {Array<Archetype|Belief>} [param1.bases] - Archetype or Belief objects (no strings)
   * @param {State|null} [origin_state] - State that's creating this belief
   */
  constructor(mind, {subject=null, bases=[]}, origin_state = null) {
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
    this.origin_state = origin_state

    DB.register_belief_by_id(this)
    DB.register_belief_by_subject(this)

    // TODO: add default trait values
  }

  /**
   * @param {string} label
   * @param {*} data - Raw data to be resolved by traittype
   * @param {State|null} [creator_state] - State creating this belief (for inferring ground_state)
   */
  resolve_and_add_trait(label, data, creator_state = null) {
    assert(!this.locked, 'Cannot modify locked belief', {belief_id: this._id, label: this.get_label()})

    const traittype = DB.get_traittype_by_label(label)
    assert(traittype instanceof Traittype, `Trait ${label} do not exist`, {label, belief: this.get_label(), data})

    const value = /** @type {Traittype} */ (traittype).resolve(this, data, creator_state)

    assert(this.can_have_trait(label), `Belief can't have trait ${label}`, {label, belief: this.get_label(), value, archetypes: [...this.get_archetypes()].map(a => a.label)})

    this._traits.set(label, value)
  }

  /**
   * @param {string} label
   * @param {Record<string, any>} data
   * @param {State|null} [creator_state] - State creating this belief (for inferring ground_state)
   */
  add_trait(label, data, creator_state = null) {
    assert(!this.locked, 'Cannot modify locked belief', {belief_id: this._id, label: this.get_label()})

    const traittype = DB.get_traittype_by_label(label)
    assert(traittype instanceof Traittype, `Trait ${label} do not exist`, {label, belief: this.get_label(), data})

    assert(this.can_have_trait(label), `Belief can't have trait ${label}`, {label, belief: this.get_label(), data, archetypes: [...this.get_archetypes()].map(a => a.label)})

    this._traits.set(label, data)
  }

  /**
   * @param {string} label
   * @returns {boolean}
   */
  can_have_trait(label) {
    for (const archetype of this.get_archetypes()) {
      // @ts-ignore - generator always yields valid archetypes
      if (label in archetype._traits_template) return true
    }
    return false
  }

  /**
   * Get raw trait value (Subject/primitive/State/Mind/array) including inherited
   * Walks the bases chain to find inherited trait values (prototype pattern)
   * @param {string} trait_name - Name of the trait to get
   * @returns {*} Raw trait value (Subject, not Belief), or null if not found
   */
  get_trait(trait_name) {
    // Check own traits first
    if (this._traits.has(trait_name)) {
      return this._traits.get(trait_name)
    }

    // Walk bases chain breadth-first to find inherited value
    const queue = [...this._bases]
    const seen = new Set()

    while (queue.length > 0) {
      const base = queue.shift()
      if (!base || seen.has(base)) continue
      seen.add(base)

      // Only check Belief bases (Archetypes have definitions, not values)
      if (base instanceof Belief) {
        if (base._traits.has(trait_name)) {
          return base._traits.get(trait_name)
        }
        // Add this belief's bases to search queue
        queue.push(...base._bases)
      }
    }

    // Not found in chain
    return null
  }

  /**
   * Iterate over all traits (own and inherited) with their raw values
   * Own traits shadow inherited traits with the same name
   * @returns {Generator<[string, *]>} Yields [trait_name, raw_value] pairs
   */
  *get_traits() {
    const yielded = new Set()

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

      // Only check Belief bases (Archetypes have definitions, not values)
      if (base instanceof Belief) {
        for (const [name, value] of base._traits) {
          if (!yielded.has(name)) {
            yield [name, value]
            yielded.add(name)
          }
        }
        // Add this belief's bases to search queue
        queue.push(...base._bases)
      }
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
   * Get a trait value with Subjects converted to Beliefs
   * Walks the bases chain to find inherited trait values (prototype pattern)
   * @deprecated Use get_trait() for raw values, then convert Subjects yourself if needed
   * @param {State} state - State context for looking up Beliefs from Subjects
   * @param {string} trait_name - Name of the trait to get
   * @returns {*} Trait value with Subjects converted to Beliefs, or null if not found
   */
  get_trait_as_belief(state, trait_name) {
    //console.log('get_trait_as_belief', trait_name, this._traits);

    // Check own traits first
    if (this._traits.has(trait_name)) {
      const raw_value = this._traits.get(trait_name)
      return this._convert_subjects_to_beliefs(raw_value, state)
    }

    // Walk bases chain breadth-first to find inherited value
    const queue = [...this._bases]
    const seen = new Set()

    while (queue.length > 0) {
      const base = queue.shift()
      if (!base || seen.has(base)) continue
      seen.add(base)

      // Only check Belief bases (Archetypes have definitions, not values)
      if (base instanceof Belief) {
        if (base._traits.has(trait_name)) {
          const raw_value = base._traits.get(trait_name)
          return this._convert_subjects_to_beliefs(raw_value, state)
        }
        // Add this belief's bases to search queue
        queue.push(...base._bases)
      }
    }

    // Not found in chain
    return null
  }

  /**
   * Get the belief this is about (resolves `@about` trait)
   * @param {State} state - State context for resolving Subject
   * @returns {Belief|null} The belief this is about, or null
   */
  get_about(state) {
    const about_trait = this._traits.get('@about')
    if (about_trait instanceof Subject) {
      // Check if @about traittype specifies mind scope
      let resolve_state = state
      if (DB.get_traittype_by_label('@about')?.mind_scope === 'parent' && state?.ground_state) {
        resolve_state = state.ground_state
      }

      // Try to resolve in the determined state
      const belief = resolve_state?.get_belief_by_subject?.(about_trait)
      if (belief) return belief

      // Fallback to global registry (cross-mind reference)
      const beliefs = DB.get_beliefs_by_subject(about_trait)
      if (beliefs?.size) return beliefs.values().next().value ?? null
      return null
    }
    // No @about trait set
    return null
  }

  /**
   * Get timestamp for this belief (supports both shared and regular beliefs)
   * Checks @timestamp meta-trait first (for shared beliefs), falls back to origin_state.timestamp
   * @returns {number} Timestamp when this belief was created
   */
  get_timestamp() {
    // Check meta-trait first (for shared beliefs)
    const timestamp_trait = this._traits.get('@timestamp')
    if (timestamp_trait !== undefined) {
      return timestamp_trait
    }

    // Fall back to origin_state (for regular beliefs)
    return this.origin_state?.timestamp ?? 0
  }

  /**
   * Convert Subject references in trait values to Belief objects
   * @private
   * @param {*} value - Raw trait value (may contain Subjects, States, Minds, primitives, arrays)
   * @param {State} state - State context for looking up Beliefs from Subjects
   * @returns {*} Value with Subjects converted to Beliefs
   */
  _convert_subjects_to_beliefs(value, state) {
    if (Array.isArray(value)) {
      return value.map(item => this._convert_subjects_to_beliefs(item, state))
    } else if (value instanceof Subject) {
      return value.get_belief_by_state(state)
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
        bases.push(... base._bases)
      }
    }
  }

  /**
   * Get prototype chain (both Archetypes and shared Beliefs with labels)
   * Walks the bases chain breadth-first, yielding labeled prototypes
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
        if (base.in_mind === null && label !== null) {
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
    this.locked = true

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
    return DB.get_label_by_sid(this.subject.sid) ?? null
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

    if (DB.has_label(label)) {
      throw new Error(`Label '${label}' is already used by another belief`)
    }
    if (DB.get_archetype_by_label(label)) {
      throw new Error(`Label '${label}' is already used by an archetype`)
    }

    DB.register_label(label, this.subject.sid)
  }

  /**
   * Generate a designation string for this belief
   * @param {State|null} [state] - State context for resolving `@about`
   * @returns {string} Designation string (e.g., "hammer [PortableObject] #42")
   */
  sysdesig(state = null) {
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
    if (state) {
      const about_belief = this.get_about(state)
      if (about_belief) {
        const about_label = about_belief.get_label()
        if (about_label) {
          parts.push(`about ${about_label}`)
        }
      }
    }

    parts.push(`#${this._id}`)

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
   * @returns {{_type: string, _id: number, label: string|null, archetypes: string[], prototypes: Array<{label: string, type: string}>, bases: (string|number)[], traits: any, locked?: boolean}} Shallow representation with references
   */
  to_inspect_view(state) {
    assert(state instanceof State, "should be State", state);
    const result = /** @type {{_type: string, _id: number, label: string|null, archetypes: string[], prototypes: Array<{label: string, type: string}>, bases: (string|number)[], traits: any, locked?: boolean}} */ ({
      _type: 'Belief',
      _id: this._id,
      label: this.get_label(),
      archetypes: [...this.get_archetypes()].map(a => a.label),
      prototypes: [...this.get_prototypes()],
      bases: [...this._bases].map(b => b instanceof Archetype ? b.label : b._id),
      traits: Object.fromEntries(
        [...this._traits].map(([k, v]) => {
          const traittype = DB.get_traittype_by_label(k)
          assert(traittype instanceof Traittype, `Traittype '${k}' not found`)
          return [k, traittype.inspect(state, v)]
        })
      )
    })
    // Only include locked field if unlocked (to highlight mutable state)
    if (!this.locked) {
      result.locked = false
    }
    return result
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
      const traittype = DB.get_traittype_by_label(trait_name)
      if (traittype) {
        if (DB.get_archetype_by_label(traittype.data_type) || traittype.data_type === 'Subject') {
          // It's a Belief/Subject reference - get canonical Subject
          return DB.get_or_create_subject(value)
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
   * @param {Mind} mind
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
        const archetype = DB.get_archetype_by_label(base_ref)
        if (!archetype) {
          throw new Error(`Archetype '${base_ref}' not found for belief ${belief._id}`)
        }
        belief._bases.add(archetype)
      } else if (typeof base_ref === 'number') {
        const base_belief = DB.get_belief(base_ref)
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
    DB.register_belief_by_id(belief)
    DB.register_belief_by_subject(belief)

    // Register label-sid mappings (for first belief with this label loaded)
    if (data.label) {
      if (!DB.has_label(data.label)) {
        if (DB.get_archetype_by_label(data.label)) {
          throw new Error(`Label '${data.label}' is already used by an archetype`)
        }
        DB.register_label(data.label, belief.subject.sid)
      }
    }

    return belief
  }

  /**
   * Create belief from template with string resolution and trait templates
   * @param {Mind} mind
   * @param {object} template
   * @param {number|null} [template.sid] - Subject ID (optional, for explicit versioning)
   * @param {string|null} [template.label]
   * @param {Array<string|Belief|Archetype>} [template.bases]
   * @param {Object<string, any>} [template.traits]
   * @param {State|null} [creator_state]
   * @returns {Belief}
   */
  static from_template(mind, {sid=null, label=null, bases=[], traits={}}, creator_state = null) {
    const resolved_bases = bases.map(base => {
      if (typeof base === 'string') {
        const resolved = DB.get_first_belief_by_label(base) ?? DB.get_archetype_by_label(base)
        assert(resolved != null, `Base '${base}' not found as belief label or archetype`, {base})
        return /** @type {Belief|Archetype} */ (resolved)
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

  /**
   * Create belief without template
   * @param {Mind} mind
   * @param {{bases?: Array<Belief|Archetype>, traits?: Record<string, any>}} options
   * @param {State|null} [creator_state]
   * @returns {Belief}
   */
  static from(mind, {bases=[], traits={}}, creator_state = null) {
    const belief = new Belief(mind, {
      bases,
    }, creator_state)

    for (const [trait_label, trait_data] of Object.entries(traits)) {
      belief.add_trait(trait_label, trait_data, creator_state)
    }

    return belief
  }

  /**
   * Create shared belief from template (limbo - no mind/state ownership)
   * @param {Array<string|Belief|Archetype>} bases - Base archetypes/beliefs (can be strings)
   * @param {Object<string, any>} traits - Traits (including optional @timestamp and @label)
   * @param {((subject: Subject) => Belief|Archetype|null)|null} [decider] - Function to decide which belief to use for a subject
   * @returns {Belief}
   */
  static create_shared_from_template(bases, traits, decider = null) {
    // Resolve bases from strings
    const resolved_bases = bases.map(base => {
      if (typeof base === 'string') {
        // Try archetype first
        const archetype = DB.get_archetype_by_label(base)
        if (archetype) return archetype

        // Get subject by label
        const subject = DB.get_subject_by_label(base)
        assert(subject instanceof Subject, `Base '${base}' not found as archetype or subject label`, {base})

        // Use decider to get appropriate belief
        assert(typeof decider === 'function', `Decider required for string base '${base}'`, {base})
        const resolved = decider(subject)
        assert(resolved instanceof Belief || resolved instanceof Archetype, `Decider returned invalid type for base '${base}'`, {base, subject, resolved})

        // If decider returned a Belief, verify it's a shared belief
        if (resolved instanceof Belief) {
          assert(resolved.in_mind === null && resolved.origin_state === null, `Decider must return a shared belief (in_mind and origin_state must be null) for base '${base}'`, {base, subject, resolved, in_mind: resolved.in_mind, origin_state: resolved.origin_state})
        }

        return resolved
      }
      return base
    })

    // Create belief with null ownership (limbo)
    const belief = new Belief(null, {
      bases: resolved_bases
    }, null)

    // Register label if present
    const label = traits['@label']
    if (label != null) {
      assert(typeof label === 'string', '@label must be a string', {label})
      belief.set_label(label)
    }

    // Add all traits
    for (const [trait_label, trait_data] of Object.entries(traits)) {
      if (trait_label === '@label') continue  // Already handled
      belief.add_trait(trait_label, trait_data)
    }

    return belief
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
      const belief = DB.get_belief(value._id)
      if (!belief) {
        throw new Error(`Cannot resolve belief reference ${value._id} in trait`)
      }
      return belief
    }

    if (value._type === 'State') {
      const state = DB.get_state_by_id(value._id)
      if (!state) {
        throw new Error(`Cannot resolve state reference ${value._id} in trait`)
      }
      return state
    }

    if (value._type === 'Mind') {
      const mind = DB.get_mind_by_id(value._id)
      if (!mind) {
        throw new Error(`Cannot resolve mind reference ${value._id} in trait`)
      }
      return mind
    }
  }

  return value
}
