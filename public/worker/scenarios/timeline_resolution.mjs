/**
 * Timeline Resolution Scenario
 *
 * Demonstrates divergent timelines with convergence and resolution.
 * Two paths diverge, then collapse when observation occurs.
 */

import { T, Traittype } from '../traittype.mjs'
import { log, assert } from '../debug.mjs'
import { register_schema } from '../schema.mjs'
import { Materia } from '../materia.mjs'
import { logos_state } from '../logos.mjs'
import { Convergence } from '../convergence.mjs'

/**
 * @typedef {import('../session.mjs').Session} Session
 * @typedef {import('../state.mjs').State} State
 * @typedef {import('../subject.mjs').Subject} Subject
 * @typedef {import('./workshop.mjs').Scenario} Scenario
 * @typedef {import('./workshop.mjs').ScenarioContext} ScenarioContext
 */

/**
 * Create timeline resolution world
 *
 * Two divergent timelines:
 * - Timeline A: hammer painted red, anvil rusts
 * - Timeline B: hammer painted blue, anvil removed, chisel added
 *
 * Converged then resolved to Timeline B.
 *
 * @returns {Promise<{world_state: State, avatar: Subject}>}
 */
async function create_timeline_resolution_world() {
  register_schema()

  const world_mind = Materia.create_world('timeline_world')
  const ground = logos_state()

  // Base state (tt=1): hammer, anvil, tongs
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
    }
  })

  const hammer = state_0.get_belief_by_label('hammer')
  const anvil = state_0.get_belief_by_label('anvil')
  assert(hammer && anvil, 'hammer and anvil must exist in initial state')
  state_0.lock()

  // Timeline A (tt=2): "The Red Hammer Path"
  const timeline_a = state_0.branch(ground, 2)
  hammer.replace(timeline_a, { color: 'red' })
  anvil.replace(timeline_a, { color: 'rusty_black' })
  timeline_a.lock()

  // Timeline B (tt=2): "The Blue Hammer Path"
  const timeline_b = state_0.branch(ground, 2)
  hammer.replace(timeline_b, { color: 'blue' })
  timeline_b.remove_beliefs(anvil)
  timeline_b.add_beliefs_from_template({
    chisel: {
      bases: ['PortableObject'],
      traits: { color: 'silver', material: 'steel', location: 'workshop' }
    }
  })
  timeline_b.lock()

  // Convergence (tt=3): both timelines as possibilities
  const convergence = new Convergence(world_mind, ground, [timeline_a, timeline_b], { tt: 3 })
  convergence.lock()

  const t_color = Traittype.get_by_label('color')
  assert(t_color, 'color traittype must exist')

  // Verify first-wins before resolution
  const hammer_in_conv = convergence.get_belief_by_label('hammer')
  assert(hammer_in_conv, 'hammer must exist in convergence')
  assert(hammer_in_conv.get_trait(convergence, t_color) === 'red',
    'Before resolution: hammer should be red (first-wins)')

  // Resolution (tt=4): collapse to Timeline B
  const resolved_state = convergence.branch(ground, 4)
  convergence.register_resolution(resolved_state, timeline_b)

  // Add observer
  resolved_state.add_beliefs_from_template({
    observer: {
      bases: ['Person'],
      traits: {
        location: 'workshop',
        mind: {
          hammer: ['color', 'location'],
          tongs: ['color', 'location'],
          chisel: ['color', 'location'],
        }
      }
    }
  })

  const observer = resolved_state.get_belief_by_label('observer')
  assert(observer, 'observer must exist')
  resolved_state.lock()

  // Verify resolution
  const hammer_after = resolved_state.get_belief_by_label('hammer')
  const anvil_after = resolved_state.get_belief_by_label('anvil')
  const chisel_after = resolved_state.get_belief_by_label('chisel')

  assert(hammer_after, 'hammer must exist after resolution')
  assert(hammer_after.get_trait(resolved_state, t_color) === 'blue',
    'After resolution: hammer should be blue')
  assert(anvil_after === null,
    'After resolution: anvil should NOT exist')
  assert(chisel_after !== null,
    'After resolution: chisel should exist')

  log('Timeline resolution world initialized!')

  return { world_state: resolved_state, avatar: observer.subject }
}

/** @type {Scenario} */
export const timeline_resolution_scenario = {
  name: 'Timeline Resolution',
  description: 'Divergent timelines converge and resolve',

  setup_world: create_timeline_resolution_world,

  async run({ session, narrator }) {
    assert(session.avatar, 'avatar not loaded')
    assert(session.state, 'state not loaded')

    session.channel.post('header_set', 'Observing')

    const st = session.state
    const avatar_belief = session.avatar.get_belief_by_state(st)
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

    session.channel.post('main_add', narrator.say`You find yourself in ${obs}.`)
    session.channel.post('main_add', narrator.say`The timeline has collapsed. You see what remains.`)

    narrator.do_look_in_location({
      session,
      subject: loc,
    })
  }
}
