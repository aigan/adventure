/**
 * Workshop Scenario
 *
 * Initial game scenario with hammer/anvil/tongs in workshop.
 * Demonstrates timeline resolution and player perception.
 */

import { T } from '../traittype.mjs'
import { Traittype } from '../traittype.mjs'
import { log, assert } from '../debug.mjs'
import { register_schema } from '../schema.mjs'
import { Materia } from '../materia.mjs'
import { logos_state } from '../logos.mjs'
import { Convergence } from '../convergence.mjs'
import { Belief } from '../belief.mjs'
import { A } from '../archetype.mjs'

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
 * @typedef {Object} Scenario
 * @property {string} name
 * @property {string} [description]
 * @property {(ctx: ScenarioContext) => Promise<void>} run
 * @property {() => Promise<{world_state: State, avatar: Subject}>} setup_world
 */

/**
 * Create the workshop world with timeline resolution
 * @returns {Promise<{world_state: State, avatar: Subject}>}
 */
async function create_workshop_world() {
  register_schema()

  // ══════════════════════════════════════════════════════════════════════════
  // Timeline Resolution Example: Divergent timelines with hammer scenario
  // ══════════════════════════════════════════════════════════════════════════

  const world_mind = Materia.create_world('workshop_world')
  const ground = logos_state()

  // Base state (tt=1): workshop with hammer, anvil, tongs
  const state_0 = world_mind.create_state(ground, { tt: 1 })

  state_0.add_beliefs_from_template({
    workshop: {
      bases: ['Location'],
    },
    hammer: {
      bases: ['PortableObject'],
      traits: { color: 'gray', material: 'iron', location: 'workshop' }
    },
    anvil: {
      bases: ['PortableObject'],
      traits: { color: 'black', material: 'iron', location: 'workshop' }
    },
    tongs: {
      bases: ['PortableObject'],
      traits: { color: 'dark_gray', material: 'iron', location: 'workshop' }
    },
  })

  const hammer = state_0.get_belief_by_label('hammer')
  const anvil = state_0.get_belief_by_label('anvil')
  assert(hammer && anvil, 'hammer and anvil must exist in initial state')
  state_0.lock()

  // ══════════════════════════════════════════════════════════════════════════
  // Timeline A (tt=2): "The Red Hammer Path"
  // - Hammer painted red
  // - Anvil gets rusty (changed)
  // - Tongs unchanged
  // ══════════════════════════════════════════════════════════════════════════
  const timeline_a = state_0.branch(ground, 2)
  hammer.replace(timeline_a, { color: 'red' })
  anvil.replace(timeline_a, { color: 'rusty_black' })
  timeline_a.lock()

  // ══════════════════════════════════════════════════════════════════════════
  // Timeline B (tt=2): "The Blue Hammer Path"
  // - Hammer painted blue
  // - Anvil broken and removed
  // - New chisel added
  // - Tongs unchanged
  // ══════════════════════════════════════════════════════════════════════════
  const timeline_b = state_0.branch(ground, 2)
  hammer.replace(timeline_b, { color: 'blue' })
  timeline_b.remove_beliefs(anvil)  // Anvil is gone in this timeline
  timeline_b.add_beliefs_from_template({
    chisel: {
      bases: ['PortableObject'],
      traits: { color: 'silver', material: 'steel', location: 'workshop' }
    }
  })
  timeline_b.lock()

  // ══════════════════════════════════════════════════════════════════════════
  // Convergence (tt=3): Both timelines exist as possibilities
  // Before resolution, first-wins applies (timeline_a values)
  // ══════════════════════════════════════════════════════════════════════════
  const convergence = new Convergence(world_mind, ground, [timeline_a, timeline_b], { tt: 3 })
  convergence.lock()

  const t_color = Traittype.get_by_label('color')
  assert(t_color, 'color traittype must exist')

  // Verify first-wins behavior BEFORE resolution
  const hammer_in_conv = convergence.get_belief_by_label('hammer')
  assert(hammer_in_conv, 'hammer must exist in convergence')
  assert(hammer_in_conv.get_trait(convergence, t_color) === 'red',
    'Before resolution: hammer should be red (first-wins from timeline_a)')

  // ══════════════════════════════════════════════════════════════════════════
  // Resolution (tt=4): An observation collapses uncertainty to Timeline B
  // From this point forward, all queries see Timeline B's reality
  // ══════════════════════════════════════════════════════════════════════════
  const resolved_state = convergence.branch(ground, 4)
  convergence.register_resolution(resolved_state, timeline_b)

  // Add player to resolved state - their mind learns about the resolved world
  // Player is created AFTER resolution so their mind state connects to this timeline
  resolved_state.add_beliefs_from_template({
    player: {
      bases: ['Person'],
      traits: {
        location: 'workshop',
        mind: {
          // Player learns about resolved world: blue hammer, no anvil, new chisel
          hammer: ['color', 'location'],
          tongs: ['color', 'location'],
          chisel: ['color', 'location'],
        }
      }
    }
  })

  const player = resolved_state.get_belief_by_label('player')
  assert(player, 'player must exist in resolved state')

  resolved_state.lock()

  // Verify resolution AFTER registering
  const hammer_after = resolved_state.get_belief_by_label('hammer')
  const anvil_after = resolved_state.get_belief_by_label('anvil')
  const chisel_after = resolved_state.get_belief_by_label('chisel')

  assert(hammer_after, 'hammer must exist after resolution')
  assert(hammer_after.get_trait(resolved_state, t_color) === 'blue',
    'After resolution: hammer should be blue (from timeline_b)')
  assert(anvil_after === null,
    'After resolution: anvil should NOT exist (removed in timeline_b)')
  assert(chisel_after !== null,
    'After resolution: chisel should exist (added in timeline_b)')

  log('Timeline resolution world initialized successfully!')
  log(`  - hammer color: ${hammer_after.get_trait(resolved_state, t_color)}`)
  log(`  - anvil exists: ${anvil_after !== null}`)
  log(`  - chisel exists: ${chisel_after !== null}`)

  return { world_state: resolved_state, avatar: player.subject }
}

/** @type {Scenario} */
export const workshop_scenario = {
  name: 'Workshop',
  description: 'Timeline resolution with hammer scenario',

  setup_world: create_workshop_world,

  /**
   * Run the workshop scenario
   * @param {ScenarioContext} ctx
   * @returns {Promise<void>}
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

    return

    // Scratchpad code below (experimental)
    /* eslint-disable no-unreachable */

    const hammer_bel = st.get_belief_by_label('hammer3')
    assert(hammer_bel instanceof Belief)

    st = session.tick()

    const handle = Belief.from(st, [A.HammerHandle], {
      color: 'blue',
    })

    if (!hammer_bel) throw new Error('hammer3 not found')
    // @ts-ignore - scratchpad code, hammer_bel narrowing not tracked
    const hammer_updated = hammer_bel.replace(st, {
      handle: handle.subject,
    })
    log([st], hammer_updated, hammer_updated.subject)

    return

    // Will create another copy of what's perceived
    narrator.do_look_in_location({
      session,
      subject: loc,
    })

    st = session.tick()

    return
    /* eslint-enable no-unreachable */
  }
}
