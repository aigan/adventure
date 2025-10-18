/**
 * Session class - manages the current game state
 * Replaces the old Adventure object
 */
export class Session {
  /**
   * @param {import('./mind.mjs').Mind} world_mind - The world mind
   * @param {import('./state.mjs').State} initial_state - Initial game state
   * @param {import('./belief.mjs').Belief|null} player - Player belief
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
   * @returns {import('./state.mjs').State}
   */
  get state() {
    return this._state
  }

  /**
   * Set current state and notify observers
   * @param {import('./state.mjs').State} new_state
   */
  set state(new_state) {
    this._state = new_state
    // Auto-broadcast state change to inspector
    if (this._channel) {
      this._channel.postMessage({
        msg: 'state_changed',
        state_id: new_state._id,
        timestamp: new_state.timestamp
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
