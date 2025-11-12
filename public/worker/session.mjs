/**
 * Session - Player-facing game interface layer
 *
 * Manages the current game session including world state, player perspective,
 * and game-facing operations like entity designation. This is the boundary
 * between the internal data model and the game interface (text, 3D, UI, etc).
 *
 * @typedef {import('./mind.mjs').Mind} Mind
 * @typedef {import('./state.mjs').State} State
 * @typedef {import('./belief.mjs').Belief} Belief
 */


import { log, assert, sysdesig } from "./debug.mjs"
import { Subject } from "./subject.mjs"

/**
 * Session class - manages the current game state
 * Replaces the old Adventure object
 */
export class Session {
  /**
   * @param {Mind} world_mind - The world mind
   * @param {State} initial_state - Initial game state
   * @param {Belief} player - Player belief
   */
  constructor(world_mind, initial_state, player) {
    this.world = world_mind
    this._state = initial_state
    this.player = player
    /** @type {BroadcastChannel|null} */
    this._channel = null
  }

  /**
   * Get current state
   * @returns {State}
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

  /**
   * Get designation for a belief or subject from the player's perspective
   * Simple placeholder until cultural knowledge system is implemented
   * @param {Belief|Subject} entity - Belief or Subject to get designation for
   * @returns {string} Simple label designation
   */
  desig(entity) {
    // If it's a Subject, resolve it to a Belief first
    /** @type {Belief|null} */
    let belief
    if (entity instanceof Subject) {
      belief = entity.get_belief_by_state(this.state)
      if (!belief) return 'something'
    } else {
      belief = entity
    }

    const label = belief.get_label()
    return label || 'something'
  }

  start() {
    const st = this.state
    const loc = this.player.get_trait(st, 'location')
    log(loc);

    if (loc) {
      const loc_name = this.desig(loc)
      postMessage(['main_add', `You are in ${loc_name}.`])
    } else {
      postMessage(['main_add', 'You are nowhere.'])
    }

  }
}
