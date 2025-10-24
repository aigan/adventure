import { setupStandardArchetypes } from '../test/helpers.mjs'
import { Mind } from '../public/worker/mind.mjs'
import * as DB from '../public/worker/db.mjs'

setupStandardArchetypes()

const world_mind = new Mind('world')
const world_state = world_mind.create_state(1)

const workshop = world_state.add_belief({
  label: 'workshop',
  bases: ['Location']
})

const player = world_state.add_belief({
  label: 'player',
  bases: ['Person'],
  traits: {
    mind: {
      workshop: ['location']
    }
  }
})

world_state.lock()

const player_mind = player.traits.get('mind')
console.log('Player mind:', player_mind)
console.log('Player mind states:', [...player_mind.state])
console.log('\nInspected player:')
console.log(JSON.stringify(player.inspect(world_state), null, 2))
