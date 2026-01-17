/**
 * Session - Player-facing game interface layer
 *
 * Manages the current game session including world state, player perspective,
 * and game-facing operations. This is the boundary between the internal data
 * model and the game interface (text, 3D, UI, etc).
 * @typedef {import('./mind.mjs').Mind} Mind
 * @typedef {import('./state.mjs').State} State
 */

import { log, assert, is_test } from "./debug.mjs"
import { Traittype, T } from "./traittype.mjs"
import { logos_state } from './logos.mjs'
import { Belief } from './belief.mjs'
import { Subject } from './subject.mjs'
import { A } from './archetype.mjs'
import { Channel } from './channel.mjs'
import { get_scenario } from './scenarios/index.mjs'

/**
 * Session class - manages the current game state
 * Replaces the old Adventure object
 */
/** @type {number} Debounce delay for state change notifications (ms) */
const STATE_CHANGE_DEBOUNCE_MS = 500

export class Session {
  /** @type {(() => void)|null} */
  static _ready_resolve = null;

  /** @type {Promise<void>} */
  static readyP = new Promise(resolve => { Session._ready_resolve = resolve })

  /**
   * @param {Mind} [world_mind] - Optional world mind (for tests)
   * @param {State} [initial_state] - Optional initial state (for tests)
   * @param {Subject} [avatar] - Optional avatar subject (for tests)
   * @param {Channel} [channel] - Optional UI channel (for tests, defaults to singleton)
   */
  constructor(world_mind, initial_state, avatar, channel) {
    // Support both constructor injection (tests) and async loading (production)
    /** @type {Mind|undefined} */
    this.world = undefined
    /** @type {State|undefined} */
    this._state = undefined
    /** @type {Subject|null|undefined} */
    this.avatar = undefined
    /** @type {BroadcastChannel|null} */
    this._broadcast_channel = null
    /** @type {Channel} UI channel for postMessage */
    this.channel = channel ?? Channel.get()
    /** @type {Set<number>} Dirty state IDs pending notification */
    this._dirty_states = new Set()
    /** @type {ReturnType<typeof setTimeout>|null} Debounce timer ID */
    this._debounce_timer = null

    if (world_mind) {
      this.world = world_mind
      this._state = initial_state
      this.avatar = avatar
    }

    // Listen for state mutation events (only in worker context)
    if (typeof self !== 'undefined' && self.addEventListener) {
      self.addEventListener('state_mutated', /** @type {EventListener} */ (e) => {
        this._on_state_mutated(/** @type {CustomEvent} */ (e).detail.state_id)
      })
    }
  }

  /**
   * Handle state mutation event with debouncing
   * @param {number} state_id - ID of the mutated state
   */
  _on_state_mutated(state_id) {
    this._dirty_states.add(state_id)

    // Reset debounce timer
    if (this._debounce_timer !== null) {
      clearTimeout(this._debounce_timer)
    }

    this._debounce_timer = setTimeout(() => {
      this._broadcast_dirty_states()
    }, STATE_CHANGE_DEBOUNCE_MS)
  }

  /**
   * Broadcast dirty states to inspect UI and clear the set
   */
  _broadcast_dirty_states() {
    if (this._broadcast_channel && this._dirty_states.size > 0) {
      this._broadcast_channel.postMessage({
        msg: 'states_changed',
        state_ids: [...this._dirty_states]
      })
    }
    this._dirty_states.clear()
    this._debounce_timer = null
  }

  /**
   * Get current state
   * @returns {State|undefined}
   */
  get state() {
    return this._state
  }

  /**
   * Set current state and notify observers
   * @param {State} new_state
   */
  set state(new_state) {
    this._state = new_state
    // Notify via debounced mechanism
    this._on_state_mutated(new_state._id)
  }

  /**
   * Set the broadcast channel for inspection UI notifications
   * @param {BroadcastChannel} broadcast_channel
   */
  set_broadcast_channel(broadcast_channel) {
    this._broadcast_channel = broadcast_channel
  }

  /**
   * Signal that session is fully initialized and ready for queries
   */
  static ready() {
    assert(typeof Session._ready_resolve === 'function', 'Session.ready() called before promise initialized')
    Session._ready_resolve()
  }

  /**
   * Advance world state to next vt
   * Locks current state and branches to new vt
   * @param {number} [vt] - Valid time (defaults to current vt + 1)
   * @returns {State} New unlocked state
   */
  tick(vt) {
    assert(this.state, 'session.state must be set before calling tick()')
    const current_state = this.state
    assert(current_state.vt != null, 'Cannot tick timeless state')

    // Lock current state if unlocked
    if (!current_state.locked) {
      current_state.lock()
    }

    // Branch to new vt
    const new_vt = vt ?? (current_state.vt + 1)
    this.state = current_state.branch(logos_state(), new_vt)

    return this.state
  }

  async establish_channel() {
    const { init_channel } = await import("./inspection.mjs")
    await init_channel(this)
  }

  /**
   * Start game session with specified scenario
   * @param {string} [scenario_name='workshop'] - Scenario to run
   * @returns {Promise<{success: boolean}>}
   */
  async start(scenario_name = 'workshop') {
    const scenario = await get_scenario(scenario_name)
    if (!scenario) {
      throw new Error(`Unknown scenario: ${scenario_name}`)
    }

    this.channel.post('header_set', `Loading ${scenario.name}`)

    // Always use async setup_world (unified path)
    const { world_state, avatar } = await scenario.setup_world()
    this.world = world_state.in_mind
    this._state = world_state
    this.avatar = avatar

    await this.establish_channel()

    const narrator = await import('./narrator.mjs')
    await narrator.ensure_init()

    await scenario.run({ session: this, narrator })
    return { success: true }
  }
}
