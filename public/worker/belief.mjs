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

import { assert, log } from '../lib/debug.mjs'
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
 * Parse trait key into base trait and sub-property
 * @param {string} key - Trait key (e.g., 'mind' or 'mind.append')
 * @returns {{trait: string, subprop: string|null}} Parsed components
 */
function parse_trait_key(key) {
  const parts = key.split('.')
  return {
    trait: parts[0],
    subprop: parts.slice(1).join('.') || null
  }
}

/**
 * Get class constructor by data type name
 * @param {string} data_type - Type name (e.g., 'Mind', 'State')
 * @returns {Function|null} Class constructor or null
 */
function get_class_by_name(data_type) {
  // FIXME: move to Traittype
  return Traittype.type_class_by_name[data_type] ?? null
}

/**
 * Collect trait operations from iterator of [key, value] pairs
 * Shared helper for both Belief and Archetype operation collection
 * @param {string} trait_name - Base trait name (e.g., 'mind')
 * @param {Iterable<[string, any]>} entries - Iterable of [key, value] pairs
 * @param {Belief|Archetype} source - Source object for operation tracking
 * @returns {Array<{key: string, value: any, source: Belief|Archetype}>} Operations
 */
function _collect_operations_from_entries(trait_name, entries, source) {
  const operations = []
  for (const [key, value] of entries) {
    const {trait, subprop} = parse_trait_key(key)
    if (trait === trait_name && subprop) {
      operations.push({key: subprop, value, source})
    }
  }
  return operations
}

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
   * @param {State|null} state - State creating this belief (null for shared beliefs)
   * @param {Subject|null} [subject] - Subject (provide to create version of existing subject)
   * @param {Array<Archetype|Belief>} [bases] - Archetype or Belief objects (no strings)
   */
  constructor(state, subject = null, bases = []) {
    for (const base of bases) {
      assert(typeof base !== 'string',
        'Constructor received string base - use Belief.from_template() instead',
        {base})
    }

    /** @type {Mind|null} */
    const mind = state?.in_mind ?? null
    const ground_mind = mind?.parent ?? null

    /** @type {Set<Belief|Archetype>} */ this._bases = new Set(bases)
    this.subject = subject ?? DB.get_or_create_subject(ground_mind)
    this._id = next_id()
    /** @type {Mind|null} */
    this.in_mind = mind
    this._traits = new Map()
    this.locked = false
    this.origin_state = state

    DB.register_belief_by_id(this)
    DB.register_belief_by_subject(this)

    // collect dynamic props
    //log("Resolve dynamic props from prototypes");

    //const beliefs = []
    const queue = []
    for (const base of this._bases) {
      if (base instanceof Belief) {
        if (base.in_mind === mind) continue
      }

      queue.push(base);
    }

    const ops = []
    const targets = new Set()
    const seen = new Set()
    while (queue.length > 0) {
      const base = queue.shift()
      if (!base || seen.has(base)) continue
      seen.add(base)

      //log("Consider", base);

      for (const [key, value_in] of base.get_trait_entries()) {
        const [trait, subprop] = key.split(/\.(.+)/)
        if (typeof subprop === 'string') {
          log("Add op", trait, subprop );
          ops.push({
            key: subprop,
            value: value_in,
            source: base,
          })
          targets.add(trait)
          continue
        }

        if (value_in === null) continue

        let value_out = value_in
        if (value_in._call) {
          //log ("resolve _call", value_in);
          const {_call, ...props} = value_in
          const traittype = Traittype.get_by_label(trait)
          assert(traittype, `Traittype '${trait}' not found for _call constructor pattern`, {trait, _call})
          const ValueClass = Traittype.type_class_by_name[traittype.data_type]
          assert(ValueClass, `No class registered for data type '${traittype.data_type}' (trait: ${trait})`, {trait, data_type: traittype.data_type, _call})
          // @ts-ignore - Dynamic method lookup validated by assert
          const method = ValueClass[_call]
          assert(typeof method === 'function', `Method '${_call}' not found on class for trait '${trait}'`, {trait, _call, ValueClass: ValueClass.name})
          value_out = method(state, this, props)
        }

        if(targets.has(trait) && (typeof value_out.state_data === 'function')) {
          value_out = value_out.state_data(state, this, ops)
        }

        if (value_out !== value_in) {
          this.add_trait(trait, value_out)
          //log("added", trait, value_out)
        }
      }

      queue.push(... base._bases);
    }

    /*
      TODO:

      1. get all shared base beleifs recursively + this belief
      2. Get all archetypes from collected beliefs

      * Collect operations.
      * Run calls.
      * Add default values
    */

  }

  /**
   * Add trait from template data (resolves via traittype)
   * @param {State} state - State context for resolution
   * @param {string} label - Trait label
   * @param {*} data - Raw data to be resolved by traittype
   */
  add_trait_from_template(state, label, data) {
    assert(!this.locked, 'Cannot modify locked belief', {belief_id: this._id, label: this.get_label()})

    // Parse trait key to check for operation syntax (e.g., 'mind.append')
    const {trait, subprop} = parse_trait_key(label)

/*
    // FIXME: handle operations in the right place
    // If this is an operation (has subprop), store it directly without traittype resolution
    if (subprop) {
      // Operations are stored as-is and collected by get_trait_data()
      // Validate that the base trait can be had
      assert(this.can_have_trait(trait), `Belief can't have trait ${trait}`, {label, trait, belief: this.get_label(), data, archetypes: [...this.get_archetypes()].map(a => a.label)})
      this._traits.set(label, data)
      return
      }
*/

    // Regular trait - resolve via traittype
    const traittype = Traittype.get_by_label(label)
    assert(traittype instanceof Traittype, `Trait ${label} do not exist`, {label, belief: this.get_label(), data})

    const value = /** @type {Traittype} */ (traittype).resolve_trait_value_from_template(this, data)

    assert(this.can_have_trait(label), `Belief can't have trait ${label}`, {label, belief: this.get_label(), value, archetypes: [...this.get_archetypes()].map(a => a.label)})

    this._traits.set(label, value)
  }

  /**
   * @param {string} label
   * @param {Record<string, any>} data
   */
  add_trait(label, data) {
    assert(!this.locked, 'Cannot modify locked belief', {belief_id: this._id, label: this.get_label()})

    const traittype = Traittype.get_by_label(label)
    assert(traittype instanceof Traittype, `Trait ${label} do not exist`, {label, belief: this.get_label(), data})

    assert(this.can_have_trait(label), `Belief can't have trait ${label}`, {label, belief: this.get_label(), data, archetypes: [...this.get_archetypes()].map(a => a.label)})

    this._traits.set(label, data)
  }

  /**
   * Get trait value from this belief (does not check bases)
   * Polymorphic interface - matches Archetype.get_trait_value()
   * @param {string} name - Trait name
   * @returns {any} Trait value or undefined if not found
   */
  get_trait_value(name) {
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
   * Collect trait value and operations from belief chain
   * Walks bases breadth-first, stops at first value found, collects all operations
   * @param {string} trait_name - Name of the trait to get
   * @returns {{value: any, operations: Array<{key: string, value: any, source: Belief|Archetype}>}} Trait data
   */
  get_trait_data(trait_name) {
    const operations = []

    // Collect own operations
    operations.push(..._collect_operations_from_entries(
      trait_name,
      this.get_trait_entries(),
      this
    ))

    // Check own value - early return if found
    if (this._traits.has(trait_name)) {
      return {value: this._traits.get(trait_name), operations}
    }

    // Walk bases queue (polymorphic - same for Belief and Archetype)
    const queue = [...this._bases]
    const seen = new Set()

    while (queue.length > 0) {
      const base = queue.shift()
      if (!base || seen.has(base)) continue
      seen.add(base)

      // Collect operations from this base
      operations.push(..._collect_operations_from_entries(
        trait_name,
        base.get_trait_entries(),
        base
      ))

      // Check for value - early return when found
      const value = base.get_trait_value(trait_name)
      if (value !== undefined) {
        return {value, operations}
      }

      // Continue to next level
      queue.push(...base._bases)
    }

    // Not found
    return {value: undefined, operations}
  }

  /**
   * Get trait value (Subject/primitive/State/Mind/array) including inherited
   * Walks the bases chain to find inherited trait values (prototype pattern)
   * Supports trait operations pattern for composable value construction
   * @param {State} state - State context for trait resolution
   * @param {string} trait_name - Name of the trait to get
   * @returns {*} trait value (Subject, not Belief), or null if not found
   */
  get_trait(state, trait_name) {
    // Collect value and operations using polymorphic delegation
    const {value, operations} = this.get_trait_data(trait_name)

    // Return null if no value found
    if (value === undefined) return null

    return value; // DEBUG: see whats need op. FIXME
    /* eslint-disable no-unreachable */

    let result = value

    // FIXME: move to some place that dont expect side effects
    // Process constructor marker {_call: 'method_name'}
    if (result && typeof result === 'object' && '_call' in result && !Array.isArray(result)) {
      const {_call, ...props} = result
      const traittype = Traittype.get_by_label(trait_name)
      // @ts-ignore - TypeScript doesn't narrow type correctly in .mjs files
      if (traittype?.data_type) {
        // @ts-ignore - TypeScript doesn't narrow type correctly in .mjs files
        const ValueClass = get_class_by_name(traittype.data_type)
        // @ts-ignore - Dynamic method call on class
        if (ValueClass && typeof ValueClass[_call] === 'function') {
          // @ts-ignore - Dynamic method call on class
          // Pass ground_state, ground_belief, props
          result = ValueClass[_call](state, this, props)

          // If constructor returns a State (e.g., from Mind.create_from_template),
          // extract the value (Mind) and let operations work with it
          if (result instanceof State) {
            result = result.in_mind // FIXME: should return consistent type
          }
        }
      }
    }

    // Apply operations if value has state_data() method
    if (operations.length > 0 && result && typeof result.state_data === 'function') {
      // Pass ground_state, ground_belief, operations
      result = result.state_data(state, this, operations)
    }

    return result
  }

  /**
   * Iterate over all traits (own and inherited) with their values
   * Own traits shadow inherited traits with the same name
   * @returns {Generator<[string, *]>} Yields [trait_name, value] pairs
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
  *get_slots() { // FIXME: supposed to get all slots. Not just from archetypes
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
    const about_trait = this._traits.get('@about')
    if (!(about_trait instanceof Subject)) return null

    assert(belief_state instanceof State, 'get_about requires State where belief exists', {belief_state})
    assert(belief_state.ground_state instanceof State, 'belief_state must have ground_state', {belief_state})

    const belief = belief_state.ground_state.get_belief_by_subject(about_trait)
    assert(belief instanceof Belief, 'Belief referenced by @about must exist in ground_state', {about_trait, ground_state: belief_state.ground_state})
    return belief
  }

  /**
   * Get tt for this belief (supports both shared and regular beliefs)
   * Checks @tt meta-trait first (for shared beliefs), falls back to origin_state.tt
   * @returns {number} Transaction time when this belief was created, or -Infinity for timeless shared beliefs
   */
  get_tt() {
    // Check meta-trait first (for shared beliefs)
    const tt_trait = this._traits.get('@tt')
    if (tt_trait !== undefined) {
      return tt_trait
    }

    // Fall back to origin_state (for regular beliefs)
    // Return -Infinity for shared beliefs without @tt (timeless prototypes)
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
    if (Archetype.get_by_label(label)) {
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
          const traittype = Traittype.get_by_label(k)
          assert(traittype instanceof Traittype, `Traittype '${k}' not found`)
          return [k, traittype.to_inspect_view(state, v)]
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
      const traittype = Traittype.get_by_label(trait_name)
      if (traittype) {
        if (Archetype.get_by_label(traittype.data_type) || traittype.data_type === 'Subject') {
          // It's a Belief/Subject reference - get canonical Subject
          const ground_mind = this.in_mind?.parent ?? null
          return DB.get_or_create_subject(ground_mind, value)
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
    const ground_mind = mind?.parent ?? null
    belief.subject = DB.get_or_create_subject(ground_mind, data.sid)
    belief.in_mind = mind
    belief.locked = false

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
   * @param {object} template
   * @param {number|null} [template.sid] - Subject ID (optional, for explicit versioning)
   * @param {Array<string|Belief|Archetype>} [template.bases]
   * @param {Object<string, any>} [template.traits] - Traits (including optional @label)
   * @returns {Belief}
   */
  static from_template(state, {sid=null, bases=[], traits={}}) {
    assert(state instanceof State, 'from_template requires State as first argument', {state})

    const resolved_bases = bases.map(base => {
      if (typeof base === 'string') {
        // Try archetype first (lighter)
        const archetype = Archetype.get_by_label(base)
        if (archetype) return archetype

        // Try belief (state or shared)
        const subject = DB.get_subject_by_label(base)
        const belief = subject?.get_belief_by_state_or_shared(state)
        if (belief) return belief

        // Not found
        assert(false, `Base '${base}' not found as belief label or archetype`, {base})
      }
      return base
    })

    const ground_mind = state.in_mind.parent
    const subject = sid ? DB.get_or_create_subject(ground_mind, sid) : null

    const belief = new Belief(state, subject, resolved_bases)

    // Extract @label from traits (same pattern as create_shared_from_template)
    const label = traits['@label']
    if (label != null) {
      assert(typeof label === 'string', '@label must be a string', {label})
      belief.set_label(label)
    }

    // Add traits, skipping @label (already handled)
    for (const [trait_label, trait_data] of Object.entries(traits)) {
      if (trait_label === '@label') continue
      belief.add_trait_from_template(state, trait_label, trait_data)
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
   * @param {import('./mind.mjs').Mind|null} parent_mind - Parent mind context for scoping
   * @param {Array<string|Belief|Archetype>} bases - Base archetypes/beliefs (can be strings)
   * @param {Object<string, any>} traits - Traits (including optional @tt and @label)
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

        assert(belief.in_mind === null && belief.origin_state === null, `Decider must return a shared belief (in_mind and origin_state must be null) for base '${base}'`, {base, subject, belief, in_mind: belief.in_mind, origin_state: belief.origin_state})

        return belief
      }
      return base
    })

    // Create belief with null ownership (limbo)
    const belief = new Belief(null, null, resolved_bases)

    // Set ground_mind on auto-created subject for scoping
    belief.subject.ground_mind = parent_mind

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
