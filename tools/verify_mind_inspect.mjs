import { setupStandardArchetypes } from '../test/helpers.mjs'
import { Mind } from '../public/worker/mind.mjs'

setupStandardArchetypes()

const world_mind = new Mind('world')
const world_state = world_mind.create_state(1)

const workshop = world_state.add_belief_from_template({
  label: 'workshop',
  bases: ['Location']
})

const player = world_state.add_belief_from_template({
  label: 'player',
  bases: ['Person'],
  traits: {
    mind: {
      workshop: ['location']
    }
  }
})

world_state.lock()

const inspected = player.inspect(world_state)
console.log('Mind trait inspection:')
console.log(JSON.stringify(inspected.traits.mind, null, 2))
