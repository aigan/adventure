import { setupStandardArchetypes } from '../test/helpers.mjs'
import { Mind } from '../public/worker/mind.mjs'
import * as DB from '../public/worker/db.mjs'

setupStandardArchetypes()

const world_mind = new Mind('world')
const world_state = world_mind.create_state(1)

const player = world_state.add_belief_from_template({
  label: 'player',
  bases: ['Person'],
  traits: {
    mind: {
      // empty learn spec
    }
  }
})

world_state.lock()

const inspected = player.inspect(world_state)
console.log('Player inspected:')
console.log(JSON.stringify(inspected, null, 2))
console.log('\nmind trait type:', typeof inspected.traits.mind)
console.log('mind trait value:', inspected.traits.mind)
