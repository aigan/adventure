/**
 * Session - Player-facing game interface layer
 *
 * Manages the current game session including world state, player perspective,
 * and game-facing operations. This is the boundary between the internal data
 * model and the game interface (text, 3D, UI, etc).
 *
 * @typedef {import('./mind.mjs').Mind} Mind
 * @typedef {import('./state.mjs').State} State
 * @typedef {import('./belief.mjs').Belief} Belief
 */

import { log, assert } from "./debug.mjs"

/**
 * Session class - manages the current game state
 * Replaces the old Adventure object
 */
export class Session {
  /**
   * @param {Mind} [world_mind] - Optional world mind (for tests)
   * @param {State} [initial_state] - Optional initial state (for tests)
   * @param {Belief} [player] - Optional player belief (for tests)
   */
  constructor(world_mind, initial_state, player) {
    // Support both constructor injection (tests) and async loading (production)
    /** @type {Mind|undefined} */
    this.world = undefined
    /** @type {State|undefined} */
    this._state = undefined
    /** @type {Belief|null|undefined} */
    this.player = undefined
    /** @type {BroadcastChannel|null} */
    this._channel = null

    if (world_mind) {
      this.world = world_mind
      this._state = initial_state
      this.player = player
    }
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
    // Auto-broadcast state change to inspector
    if (this._channel) {
      this._channel.postMessage({
        msg: 'state_changed',
        state_id: new_state._id,
        tt: new_state.tt
      })
    }
  }

  /**
   * Set the broadcast channel for notifications
   * @param {BroadcastChannel} channel
   */
  set_channel(channel) {
    this._channel = channel
  }

  async load_world() {
    const {world_state, player_body} = await import("./world.mjs")
    this.world = world_state.in_mind
    this._state = world_state
    this.player = player_body
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

    assert(this.player, 'player not loaded')
    assert(this.state, 'state not loaded')

    postMessage(['header_set', `Waking up`])

    const pl = this.player.subject
    const st = this.state
    const loc = this.player.get_trait(st, 'location')
    const obs = {
      subject: loc,
      known_as: narrator.desig(st, loc),
      actions: [
        {
          do: 'look',
          target_blipp: loc.sid,
          subject_blopp: pl.sid,
          label: `Look around`,
        },
      ],
    }

    const lines = []
    lines.push(narrator.tt`You are in ${obs}.`)
    postMessage(['main_add', ...lines])
    return true
  }
}

