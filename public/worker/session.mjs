/**
 * Session - Player-facing game interface layer
 *
 * Manages the current game session including world state, player perspective,
 * and game-facing operations. This is the boundary between the internal data
 * model and the game interface (text, 3D, UI, etc).
 * @typedef {import('./mind.mjs').Mind} Mind
 * @typedef {import('./state.mjs').State} State
 * @typedef {import('./belief.mjs').Belief} Belief
 */

import { log, assert, is_test } from "./debug.mjs"
import { Traittype, T } from "./traittype.mjs"

/**
 * Session class - manages the current game state
 * Replaces the old Adventure object
 */
/** @type {number} Debounce delay for state change notifications (ms) */
const STATE_CHANGE_DEBOUNCE_MS = 500

export class Session {
  /**
   * @param {Mind} [world_mind] - Optional world mind (for tests)
   * @param {State} [initial_state] - Optional initial state (for tests)
   * @param {Belief} [avatar] - Optional avatar belief (for tests)
   */
  constructor(world_mind, initial_state, avatar) {
    // Support both constructor injection (tests) and async loading (production)
    /** @type {Mind|undefined} */
    this.world = undefined
    /** @type {State|undefined} */
    this._state = undefined
    /** @type {Belief|null|undefined} */
    this.avatar = undefined
    /** @type {BroadcastChannel|null} */
    this._channel = null
    /** @type {Set<number>} Dirty state IDs pending notification */
    this._dirty_states = new Set()
    /** @type {number|null} Debounce timer ID */
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
    if (this._channel && this._dirty_states.size > 0) {
      this._channel.postMessage({
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
   * Set the broadcast channel for notifications
   * @param {BroadcastChannel} channel
   */
  set_channel(channel) {
    this._channel = channel
  }

  async load_world() {
    const { init_world } = await import("./world.mjs")
    const { world_state, avatar } = init_world()
    this.world = world_state.in_mind
    this._state = world_state
    this.avatar = avatar
  }

  async establish_channel() {
    const Channel = await import("./channel.mjs")
    await Channel.init_channel(this);
  }
  
  async start() {
    postMessage(['header_set', `Loading world`])
    await this.load_world()
    await this.establish_channel()

    const narrator = await import("./narrator.mjs")
    await narrator.ensure_init()

    assert(this.avatar, 'avatar not loaded')
    assert(this.state, 'state not loaded')

    postMessage(['header_set', `Waking up`])

    const pl = this.avatar.subject
    const st = this.state
    const loc = this.avatar.get_trait(st, T.location)

    const obs = {
      subject: loc,
      known_as: narrator.desig(st, loc),
      actions: [
        {
          do: 'look_in_location',
          subject: loc.sid,
          label: `Look around`,
        },
      ],
      }
    const lines = []
    lines.push(narrator.say`You are in ${obs}.`)
    postMessage(['main_add', ...lines])

    //return true


    narrator.do_look_in_location({
      session: this,
      subject: loc,
    })

    return true

    // Will create another copy of whats percieved
    // eslint-disable-next-line no-unreachable
    narrator.do_look_in_location({
      session: this,
      subject: loc,
    })

    return true
  }
}

