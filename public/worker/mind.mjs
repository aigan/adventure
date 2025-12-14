/**
 * Mind - container for beliefs representing an entity's knowledge/perspective
 *
 * Each entity (world, player, NPC) has a mind containing their beliefs.
 * No objective truth exists - even world_mind holds possibility distributions that
 * collapse on observation, same as NPC minds.
 *
 * Key concepts:
 * - Nested minds: world_mind contains npc_minds, enabling theory of mind
 * - Label-based lookup: Quickly find beliefs by label
 * - State management: Minds track belief states over time
 * - Possibility distributions: Beliefs can exist in superposition until observed
 *
 * Example hierarchy:
 * - world_mind: current state of possibilities (collapses on player observation)
 * - player_mind: what player has observed (subset of collapsed possibilities)
 * - npc_mind: what NPC believes (may differ from world_mind)
 *
 * See docs/SPECIFICATION.md for mind architecture and "No Objective Truth" principle
 * See docs/ALPHA-1.md Stage 1 for basic usage, Stage 5 for NPC minds
 */

import { assert, log, debug, sysdesig } from './debug.mjs'
import { next_id } from './id_sequence.mjs'
import * as DB from './db.mjs'
import { State } from './state.mjs'
import { Belief } from './belief.mjs'
import { Traittype } from './traittype.mjs'
import { learn_about } from './perception.mjs'

/**
 * @typedef {import('./belief.mjs').BeliefJSON} BeliefJSON
 * @typedef {import('./state.mjs').StateJSON} StateJSON
 * @typedef {import('./subject.mjs').Subject} Subject
 * @typedef {import('./archetype.mjs').Archetype} Archetype
 * @typedef {import('./convergence.mjs').Convergence} Convergence
 */

// IMPORT CONSTRAINTS: Cannot import materia, logos, eidos, temporal, timeless, convergence
// (circular dependencies). Use registries instead. See docs/CIRCULAR_DEPENDENCIES.md

/**
 * @typedef {object} MindJSON
 * @property {string} _type - "Mind", "Logos", "Eidos", or "Materia"
 * @property {number} _id - Mind identifier
 * @property {string|null} label - Optional label for lookup
 * @property {BeliefJSON[]} belief - All beliefs in this mind
 * @property {StateJSON[]} state - All states in this mind
 * @property {MindJSON[]} [nested_minds] - Nested minds discovered during serialization
 */

/**
 * @typedef {object} MindReference
 * @property {string} _type - Always "Mind"
 * @property {number} _id - Mind identifier
 * @property {string|null} label - Mind label
 */

/**
 * Container for beliefs with state tracking
 * @property {number} _id - Unique identifier
 * @property {string|null} label - Optional label for lookup
 * @property {Belief|null} self - What this mind considers "self"
 * @property {Set<State>} state - All states belonging to this mind
 */
export class Mind {
  /**
   * Registry for Mind subclasses (avoids circular imports)
   * @type {Object<string, any>}
   */
  static _type_registry = {}

  /**
   * Register Mind subclass. Called by subclass at module load.
   * @param {string} type_name - The _type value (e.g., 'Materia')
   * @param {any} class_constructor - The subclass constructor
   */
  static register_type(type_name, class_constructor) {
    this._type_registry[type_name] = class_constructor
  }

  /**
   * Get Mind subclass by type (for deserialization)
   * @param {string} type_name - The _type value
   * @returns {any} The class constructor
   */
  static get_class(type_name) {
    return this._type_registry[type_name]
  }

  /**
   * Registry for singletons/classes (avoids circular imports)
   * @type {Object<string, any>}
   */
  static _function_registry = {}

  /**
   * Register singleton or class. Called at module load.
   * @param {string} name - Function name (e.g., 'eidos', 'Materia')
   * @param {any} fn - The function or class
   */
  static register_function(name, fn) {
    this._function_registry[name] = fn
  }

  /**
   * Get registered function/class (e.g., Mind.get_function('eidos'))
   * @param {string} name - Function name
   * @returns {any} The function or class
   */
  static get_function(name) {
    return this._function_registry[name]
  }

  /** @type {string} - Type discriminator for polymorphism */
  _type = 'Mind'
  /** @type {string} - Base class identifier */
  _kind = 'Mind'
  /** @type {number} - Unique identifier */
  _id = 0
  /** @type {Mind|null} - Parent mind */
  _parent = null
  /** @type {string|null} - Mind label */
  label = null
  /** @type {Belief|null} - What this mind considers "self" */
  self = null

  /**
   * Direct child minds (nested minds)
   * Query: O(1) enumeration of children for hierarchy traversal
   * Maintained by: Mind constructor (parent._child_minds.add)
   * Scale: Essential - enables mind hierarchy navigation
   * @type {Set<Mind>}
   */
  _child_minds = new Set()

  /**
   * All states belonging to this mind
   * Query: O(n) enumeration for states_valid_at(), state iteration
   * Maintained by: register_state() - called by State constructor
   * Scale: Essential - without this, would need to scan global state_by_id registry
   * @type {Set<State>}
   */
  _states = new Set()

  /**
   * Index: states by their ground_state reference
   * Query: O(1) to get Set<State> of child mind states linked to parent mind state
   * Maintained by: register_state() - populated when state has ground_state
   * Scale: Essential - critical for cascading lock operations and nested mind queries
   *   Example: When parent mind state changes, find all child mind states that reference it
   *   Without this: O(all states in mind), with this: O(matching states)
   * @type {Map<State, Set<State>>}
   */
  _states_by_ground_state = new Map()

  /**
   * Latest unlocked state, or null if all states are locked
   * Updated by register_state() when unlocked state is registered
   * Cleared by State.lock() when this state is locked
   * @type {State|null}
   */
  state = null

  /**
   * Origin state - primordial state for this mind (used for prototypes)
   * Set on first create_state() call or explicitly during initialization
   * @type {State|null}
   */
  origin_state = null


  /**
   * @param {Mind|null} parent_mind - Parent mind (null only for Logos, non-null for Materia)
   * @param {string|null} label - Mind identifier
   * @param {Belief|null} self - What this mind considers "self" (can be null, can change)
   */
  constructor(parent_mind, label = null, self = null) {
    // Prevent direct instantiation - Mind is abstract
    // Only allow construction through subclasses (Logos, Eidos, Materia)
    if (new.target === Mind) {
      throw new Error(
        'Cannot instantiate Mind directly - use Materia for temporal minds, ' +
        'Logos for root mind, or Eidos for forms/prototypes'
      )
    }

    // Allow null parent for Logos (primordial mind)
    if (parent_mind !== null) {
      // Use _type property instead of instanceof.
      assert(
        parent_mind._type === 'Mind' ||
        parent_mind._type === 'Logos' ||
        parent_mind._type === 'Eidos' ||
        parent_mind._type === 'Materia',
        'parent_mind must be a Mind',
        { label, parent_type: parent_mind?._type }
      )
    }

    // Use shared initialization
    this._init_properties(parent_mind, label, self)
  }

  /**
   * Shared initialization - SINGLE SOURCE OF TRUTH for property assignment
   * Used by both constructor and from_json
   * @protected
   * @param {Mind|null} parent_mind
   * @param {string|null} label
   * @param {Belief|null} self
   * @param {number|null} [id] - ID for deserialization (null = generate new)
   */
  _init_properties(parent_mind, label, self, id = null) {
    this._kind = 'Mind'  // Base class identifier (same for all Mind subclasses)
    this._id = /** @type {number} */ (id ?? next_id())  // Use provided ID or generate new one

    /** @type {Mind|null} - Internal storage, use getter/setter to access */
    this._parent = parent_mind

    // Track if this mind is Eidos or descended from Eidos
    // All minds in Eidos lineage create universal subjects (mater=null)
    /** @type {boolean} */
    this.in_eidos = this._type === 'Eidos' || (parent_mind?.in_eidos ?? false)

    this.label = label

    /** @type {Belief|null} */
    this.self = self

    // Initialize collections (needed when Object.create bypasses field initializers)
    if (!this._child_minds) this._child_minds = new Set()
    if (!this._states) this._states = new Set()
    if (!this._states_by_ground_state) this._states_by_ground_state = new Map()
    if (!this._belief) this._belief = new Set()

    // Register as child in parent (skip for Logos)
    if (parent_mind !== null) {
      parent_mind._child_minds.add(this)
    }

    // Register with DB
    DB.register_mind(this)
  }

  /**
   * Get parent mind (null only for Logos)
   * @returns {Mind|null}
   */
  get parent() {
    return this._parent
  }

  /**
   * Set parent mind (used during deserialization)
   * @param {Mind|null} value
   */
  set parent(value) {
    this._parent = value
  }

  /**
   * @param {number} id
   * @returns {Mind|undefined}
   */
  static get_by_id(id) {
    return DB.get_mind_by_id(id)
  }

  /**
   * @param {string} label
   * @returns {Mind|undefined}
   */
  static get_by_label(label) {
    return DB.get_mind_by_label(label)
  }

  /**
   * Get states in this mind that have the specified ground_state
   * @param {State} ground_state
   * @returns {Set<State>}
   */
  get_states_by_ground_state(ground_state) {
    return this._states_by_ground_state.get(ground_state) ?? new Set()
  }

  /**
   * Get all states in this mind that were valid at a specific tt
   * NOTE: This is only implemented in Materia. Logos and Eidos do not support temporal queries.
   * @param {number} _tt - Transaction time to query at
   * @returns {Generator<State, void, unknown>} Outermost states on each branch at tt
   * @abstract
   */
  // eslint-disable-next-line require-yield
  *states_at_tt(_tt) {
    throw new Error(
      `states_at_tt() is only available on Materia. ` +
      `This mind is ${this._type} which does not support temporal queries.`
    )
  }

  /**
   * Register a state in this mind (called by State constructor)
   * Adds to both _states Set and _states_by_ground_state index
   * Tracks unlocked states in this.state property
   * @param {State} state
   */
  register_state(state) {
    this._states.add(state)

    // Track latest unlocked state
    if (!state.locked) {
      this.state = state
    }

    if (state.ground_state) {
      if (!this._states_by_ground_state.has(state.ground_state)) {
        this._states_by_ground_state.set(state.ground_state, new Set())
      }
      // TypeScript: We just ensured the key exists above
      /** @type {Set<State>} */ (this._states_by_ground_state.get(state.ground_state)).add(state)
    }
  }

  /**
   * @param {State} ground_state - Required ground state (parent's state)
   * @param {object} options - Optional parameters
   * @param {number|null} [options.tt] - Transaction time (only when ground_state.vt is null)
   * @param {number|null} [options.vt] - Valid time (defaults to tt)
   * @param {Subject|null} [options.self] - Self identity
   * @returns {State}
   */
  create_state(ground_state, options = {}) {
    // Use registry to construct Temporal without importing it (avoids circular dependency)
    const TemporalClass = State.get_class('Temporal')
    const state = new TemporalClass(this, ground_state, null, options)

    // Track first state as origin
    if (this.origin_state === null) {
      this.origin_state = state
    }

    return state
  }

  /**
   * Shallow inspection view for the inspect UI
   * @param {State} state
   * @returns {object}
   */
  to_inspect_view(state) {
    return {
      _ref: this._id,
      _type: 'Mind',
      label: this.label,
      states: [...this._states].map(s => ({_ref: s._id, _type: 'State'}))
    }
  }

  /**
   * System designation - compact debug string
   * @returns {string}
   */
  sysdesig() {
    const parts = []

    if (this.label) {
      parts.push(this.label)
    }

    parts.push(`Mind#${this._id}`)

    if (this.parent) {
      const parent_label = this.parent.label || `#${this.parent._id}`
      parts.push(`(child of ${parent_label})`)
    }

    return parts.join(' ')
  }

  /**
   * @returns {Omit<MindJSON, 'nested_minds'>}
   */
  toJSON() {
    const mind_beliefs = [...DB.get_beliefs_by_mind(this)].map(b => b.toJSON())

    return {
      _type: this._type,  // Use instance _type property for polymorphism
      _id: this._id,
      label: this.label,
      belief: mind_beliefs,
      state: [...this._states].map(s => s.toJSON())
    }
  }

  /**
   * Create Mind from JSON data with lazy loading
   * @param {MindJSON} data - JSON data with _type: 'Mind', 'Logos', 'Eidos', or 'Materia'
   * @param {Mind} [parent_mind] - Parent mind (required for non-logos minds, null only for logos)
   * @returns {Mind}
   */
  static from_json(data, parent_mind) {
    // Use registry for polymorphic deserialization
    const MindClass = this._type_registry[data._type]
    if (MindClass) {
      return MindClass.from_json(data, parent_mind)
    }

    // Fallback to base Mind for unknown/unregistered types (legacy)
    const mind = Object.create(Mind.prototype)

    // Set _type (class field initializers don't run with Object.create)
    mind._type = 'Mind'

    // Use shared initialization with deserialized ID
    mind._init_properties(parent_mind, data.label, null, data._id)

    for (const belief_data of data.belief) {
      Belief.from_json(mind, belief_data)
    }

    for (const state_data of data.state) {
      const state = State.from_json(mind, state_data)
      // Add to the state's in_mind (which might be different from mind if nested)
      state.in_mind.register_state(state)
    }

    // Load nested minds AFTER parent states (so ground_state references can be resolved)
    if (data.nested_minds) {
      for (const nested_mind_data of data.nested_minds) {
        Mind.from_json(nested_mind_data, mind)  // Pass current mind as parent
      }
    }

    // Patch origin_state on beliefs AFTER states are loaded
    // This enables reverse index building during trait finalization
    for (const belief_data of data.belief) {
      const belief = DB.get_belief_by_id(belief_data._id)
      if (belief && belief_data.origin_state != null) {
        const origin_state = DB.get_state_by_id(belief_data.origin_state)
        if (origin_state) {
          belief.origin_state = origin_state
          DB.register_belief_by_mind(belief)  // Register now that origin_state is set
        }
      }
    }

    // Finalize beliefs for THIS mind (resolve State/Mind references in traits)
    // Do this AFTER loading nested minds so all State/Mind references can be resolved
    // This also builds reverse indexes now that origin_state is set
    for (const belief_data of data.belief) {
      const belief = DB.get_belief_by_id(belief_data._id)
      if (belief) {
        belief._finalize_traits_from_json()
      }
    }

    return mind
  }

  /**
   * Compose multiple Mind instances into a single Materia with Convergence
   * Delegates to Materia.compose() for actual implementation
   * @param {Traittype} traittype - The mind traittype
   * @param {Belief} belief - The belief being composed for
   * @param {Mind[]} minds - Array of Mind instances to compose
   * @param {object} options - Optional parameters
   * @returns {Mind} New Materia instance with Convergence merging all component states
   */
  static compose(traittype, belief, minds, options = {}) {
    const Materia = this.get_function('Materia')
    return Materia.compose(traittype, belief, minds, options)
  }

  /**
   * Create Materia with initial state from declarative template
   * Delegates to Materia.create_from_template() for actual implementation
   * @param {State} ground_state - State context for belief resolution and ground_state
   * @param {Belief} ground_belief - The belief that owns this mind trait
   * @param {Object<string, string[]>} traits - {belief_label: [trait_names]} to learn
   * @param {object} options - Optional meta-parameters
   * @param {State|null} [options.about_state] - State context for belief resolution (where beliefs exist)
   * @param {State|null} [options.base_mind_state] - State from base mind to use as base for knowledge inheritance
   * @param {State[]|null} [options.component_states] - States for multi-parent composition (creates Convergence)
   * @returns {Mind} The created Materia (access unlocked state via mind.state)
   */
  static create_from_template(ground_state, ground_belief, traits, options = {}) {
    const Materia = this.get_function('Materia')
    return Materia.create_from_template(ground_state, ground_belief, traits, options)
  }

  /**
   * Resolve trait value from template data (delegation pattern)
   * Called by Traittype to handle Mind-specific template resolution
   * @param {Traittype} traittype - Traittype definition with metadata
   * @param {Belief} belief - Belief being constructed
   * @param {*} data - Raw template data or Mind instance
   * @param {object} options - Optional parameters
   * @param {State|null} [options.about_state] - State context for belief resolution (for prototype minds)
   * @returns {Mind|*} Resolved Mind instance or data as-is
   */
  static resolve_trait_value_from_template(traittype, belief, data, {about_state} = {}) {
    if (data === null) return null  // Allow explicit null to block composition
    assert(belief.is_shared || belief.origin_state instanceof State, "belief must have origin_state", {belief})
    const creator_state = /** @type {State} */ (belief.origin_state)

    // Check for Mind traits from ALL bases (for multi-parent composition)
    // belief._bases is set before traits are resolved, so get_trait works here
    // Filter to only Belief bases (skip Archetypes which don't have get_trait)
    const t_mind = Traittype.get_by_label('mind')
    assert(t_mind, "Traittype 'mind' not found in registry")
    const base_minds = []
    for (const base of belief._bases) {
      // Skip archetypes - they don't have mind traits
      if (!(base instanceof Belief)) continue

      const mind = base.get_trait(creator_state, t_mind)
      if (mind) {
        base_minds.push(mind)
      }
    }

    // Extract states from base minds
    const base_mind_states = base_minds.map(m => m.state ?? m.origin_state).filter(s => s !== null)

    // For backward compatibility: single base_mind_state
    const base_mind_state = base_mind_states.length === 1 ? base_mind_states[0] : null

    if (base_mind_states.length > 0) {
      debug(`Mind extension: ${belief.get_label()} extending ${base_mind_states.length} Mind(s): ${base_minds.map(m => `Mind#${m._id}`).join(', ')}`)
    }

    // Detect plain object Mind template (learn spec)
    // Plain object: has properties but no _type field and no _states Set
    if (data &&
        typeof data === 'object' &&
        !data._type &&
        !(data._states instanceof Set)) {

      debug("create mind from template with", sysdesig(creator_state, data))

      // It's a learn spec - call create_from_template on Materia
      // Pass component_states for multi-parent composition
      const Materia = Mind.get_function('Materia')
      const mind = Materia.create_from_template(creator_state, belief, data, {
        about_state,
        base_mind_state,
        component_states: base_mind_states.length > 1 ? base_mind_states : undefined
      })
      assert(mind.state instanceof State, 'create_from_template must create unlocked state', {mind})
      return mind.state.lock().in_mind
    }

    // Detect explicit Mind template with _type field (but not an actual Mind instance)
    if (data?._type === 'Mind' && !(data._states instanceof Set)) {
      // Strip _type from template before passing to create_from_template
      const {_type, ...traits} = data
      const Materia = Mind.get_function('Materia')
      const mind = Materia.create_from_template(creator_state, belief, traits, {
        about_state,
        base_mind_state,
        component_states: base_mind_states.length > 1 ? base_mind_states : undefined
      })
      assert(mind.state instanceof State, 'create_from_template must create unlocked state', {mind})
      return mind.state.lock().in_mind
    }

    // Not a template - return as-is (Mind instance, null, undefined, etc.)
    return data
  }

  /**
   * Validate that value is a Mind instance
   * @param {Traittype} traittype
   * @param {*} value
   * @throws {Error} If value is not a Mind instance
   */
  static validate_value(traittype, value) {
    if (value === null) return

    if (!(value instanceof Mind)) { // FIXME: use assert
      throw new Error(`Expected Mind instance for trait '${traittype.label}', got ${value?.constructor?.name || typeof value}`)
    }
  }

  /**
   * Get or create an open (unlocked) state for the given ground context
   * Determines whether to reuse existing state or create new based on ground_belief.locked
   * @param {State} ground_state - External world state
   * @param {Belief} ground_belief - The belief that owns this mind trait
   * @returns {State} An unlocked state ready for modifications
   */
  get_or_create_open_state_for_ground(ground_state, ground_belief) {
    assert(ground_state instanceof State, 'ground_state must be State', {ground_state})
    assert(ground_belief instanceof Belief, 'ground_belief must be Belief', {ground_belief})

    // CONSTRUCTION PATH: If ground_belief unlocked, check for existing unlocked state to reuse
    if (!ground_belief.locked) {
      const existing_states = this._states_by_ground_state.get(ground_state)
      if (existing_states) {
        for (const state of existing_states) {
          if (!state.locked) return state
        }
      }
    }

    // For timeless ground states (vt=null), get all states; otherwise filter by vt
    const latest_states = ground_state.vt != null
      ? [...this.states_at_tt(ground_state.vt)]
      : [...this._states]
    const latest = latest_states[0]

    // VERSIONING PATH: ground_belief locked requires existing state
    if (ground_belief.locked && !latest) {
      throw new Error('No existing state found for versioning')
    }

    // Fork invariant: child.tt = parent_state.vt (handled by Temporal constructor)
    // Use registry to construct Temporal without importing it (avoids circular dependency)
    const TemporalClass = State.get_class('Temporal')
    return new TemporalClass(
      this,
      ground_state,
      latest ?? null,               // Inherit from latest or null for initial
      {
        self: latest?.self ?? ground_belief.subject  // self from latest or ground_belief
        // vt defaults to tt (from ground_state.vt)
      }
    )
  }

  /**
   * Apply trait operations to this mind
   * Used by trait operations pattern to compose knowledge from multiple archetypes
   * @param {State} ground_state - External world state to learn from
   * @param {Belief} ground_belief - The belief that owns this mind trait
   * @param {Array<{key: string, value: any, source: Belief|Archetype}>} operations - Operations to apply
   * @returns {Mind} This mind (state created/modified as side effect)
   */
  state_data(ground_state, ground_belief, operations) {
    assert(ground_state instanceof State, 'state_data requires State for ground_state', {ground_state})
    assert(ground_belief instanceof Belief, 'state_data requires Belief for ground_belief', {ground_belief})

    // Get or create appropriate state (handles both construction and versioning)
    const state = this.get_or_create_open_state_for_ground(ground_state, ground_belief)

    // Process operations
    for (const {key, value, source} of operations) {
      if (key === 'append') {
        // Append operations add knowledge
        for (const [label, trait_names] of Object.entries(value)) {
          const belief = ground_state.get_belief_by_label(label)
          assert(belief, `Cannot find belief with label '${label}' in ground_state for mind.append operation`, {label, ground_state_id: ground_state._id, available_labels: [...ground_state.get_beliefs()].map(b => b.get_label()).filter(Boolean)})
          assert(trait_names.length > 0, `Empty trait_names array for mind.append operation on belief '${label}'`, {label, trait_names})
          learn_about(state, belief, {traits: trait_names})
        }
        continue
      }

      throw new Error(`Unsupported operation '${key}' in mind trait composition (only 'append' is currently supported)`);
      // Future: Support 'remove', 'replace', etc.
    }

    return this  // Return Mind instance (state created/modified as side effect)
  }
}

/**
 * Check if a state has another state in its base chain
 * @param {State} descendant - State to check
 * @param {State} ancestor - Potential ancestor to find
 * @returns {boolean} True if ancestor is in descendant's base chain
 */
function _has_base_in_chain(descendant, ancestor) {
  const visited = new Set()
  let current = descendant.base

  while (current !== null) {
    if (visited.has(current)) break
    visited.add(current)

    if (current === ancestor) return true
    current = current.base
  }

  return false
}
