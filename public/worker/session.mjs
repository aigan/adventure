/**
 * @typedef {import('./mind.mjs').Mind} Mind
 * @typedef {import('./state.mjs').State} State
 * @typedef {import('./belief.mjs').Belief} Belief
 */

/**
 * Session class - manages the current game state
 * Replaces the old Adventure object
 */
export class Session {
  /**
   * @param {Mind} world_mind - The world mind
   * @param {State} initial_state - Initial game state
   * @param {Belief|null} player - Player belief
   */
  constructor(world_mind, initial_state, player = null) {
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
}
