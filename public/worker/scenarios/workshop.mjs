/**
 * Workshop Scenario
 *
 * Initial game scenario with hammer/anvil/tongs in workshop.
 * Demonstrates timeline resolution and player perception.
 */

import { T } from '../traittype.mjs'
import { assert } from '../debug.mjs'
import { init_world } from '../world.mjs'

/**
 * @typedef {import('../session.mjs').Session} Session
 * @typedef {import('../state.mjs').State} State
 * @typedef {import('../subject.mjs').Subject} Subject
 */

/**
 * @typedef {Object} ScenarioContext
 * @property {Session} session - Session with session.channel for messaging
 * @property {typeof import('../narrator.mjs')} narrator
 */

/**
 * @typedef {Object} ScenarioResult
 * @property {boolean} success
 * @property {any} [data]
 */

/**
 * @typedef {Object} Scenario
 * @property {string} name
 * @property {string} [description]
 * @property {(ctx: ScenarioContext) => Promise<ScenarioResult>} run
 * @property {() => {world_state: State, avatar: Subject}} [setup_world]
 */

/** @type {Scenario} */
export const workshop_scenario = {
  name: 'Workshop',
  description: 'Timeline resolution with hammer scenario',

  setup_world: init_world,

  /**
   * Run the workshop scenario
   * @param {ScenarioContext} ctx
   * @returns {Promise<ScenarioResult>}
   */
  async run({ session, narrator }) {
    assert(session.avatar, 'avatar not loaded')
    assert(session.state, 'state not loaded')

    session.channel.post('header_set', 'Waking up')

    const pl = session.avatar
    let st = session.state
    const avatar_belief = pl.get_belief_by_state(st)
    const loc = avatar_belief.get_trait(st, T.location)

    const obs = {
      subject: loc,
      known_as: narrator.desig(st, loc),
      actions: [
        {
          do: 'look_in_location',
          subject: loc.sid,
          label: 'Look around',
        },
      ],
    }

    const lines = []
    lines.push(narrator.say`You are in ${obs}.`)
    session.channel.post('main_add', ...lines)

    // Use hammer from current world setup
    let target = st.get_belief_by_label('hammer')
    assert(target, 'Expected hammer in world')

    st = session.tick()
    target = target.replace(st, { color: 'red' })

    narrator.do_look_in_location({
      session,
      subject: loc,
    })

    return { success: true }
  }
}
