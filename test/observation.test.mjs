import { expect } from 'chai'
import * as DB from '../public/worker/db.mjs'
import * as Cosmos from '../public/worker/cosmos.mjs'
import { Belief } from '../public/worker/belief.mjs'
import { Traittype } from '../public/worker/traittype.mjs'
import { setupStandardArchetypes, get_first_belief_by_label } from './helpers.mjs'

describe('observation', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()
  })

  describe('duplicate belief prevention', () => {
    it('should not create duplicate when looking at already-known entity', () => {
      // Setup world similar to world.mjs
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: {
          bases: ['Location'],
        },
        hammer: {
          bases: ['PortableObject'],
          traits: {
            location: 'workshop',
            color: 'blue',
          },
        }
      })

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: {
            mind: {
              hammer: ['color'],  // Player knows hammer's color from template
            },
            location: 'workshop',
          },
        }
      })

      state.lock()
      state = state.branch_state(Cosmos.logos_state(), 2)

      const player = get_first_belief_by_label('player')
      const hammer = get_first_belief_by_label('hammer')
      const workshop = get_first_belief_by_label('workshop')

      // Get player's mind state
      const player_state = state.get_active_state_by_host(player)

      // Explicit learn_about (like world.mjs line 200)
      player_state.learn_about(hammer)

      // Count beliefs about hammer before do_look
      const about_traittype = Traittype.get_by_label('@about')
      const beliefs_before = [...hammer.rev_trait(player_state, about_traittype)]
      const count_before = beliefs_before.length

      // Simulate do_look: get content and learn about each
      const location_traittype = Traittype.get_by_label('location')
      const content = [...workshop.rev_trait(state, location_traittype)]

      expect(content).to.include(hammer)
      expect(content).to.include(player)

      // This is what do_look does - learn about each item
      for (const item of content) {
        // Check recognize before
        const existing = player_state.recognize(item)

        player_state.learn_about(item)

        // Count after this learn_about
        const beliefs_after = [...item.rev_trait(player_state, about_traittype)]

        // For hammer, should NOT create duplicate
        if (item === hammer) {
          expect(existing.length, 'should recognize existing hammer knowledge').to.be.at.least(1)
          expect(beliefs_after.length, 'should not duplicate hammer belief').to.equal(count_before)
        }
      }
    })

    it('should match world.mjs flow exactly', () => {
      // Simplified reproduction of world.mjs init_world()
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        village: { bases: ['Location'] },
        workshop: {
          bases: ['Location'],
          traits: { location: 'village' },
        },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' },
        }
      })

      state.add_beliefs_from_template({
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['color'] },
            location: 'workshop',
          },
        }
      })

      state.lock()
      state = state.branch_state(Cosmos.logos_state(), 2)

      const player = state.get_belief_by_label('player')
      expect(player, 'player belief not found').to.exist
      const player_state = state.get_active_state_by_host(player)
      const hammer = state.get_belief_by_label('hammer')
      expect(hammer, 'hammer belief not found').to.exist

      // Count beliefs BEFORE learn_about
      const about_traittype = Traittype.get_by_label('@about')
      const before = [...hammer.rev_trait(player_state, about_traittype)]
      console.log('Before learn_about:', before.length, 'beliefs about hammer')

      player_state.learn_about(hammer)

      // Count beliefs AFTER learn_about
      const after = [...hammer.rev_trait(player_state, about_traittype)]
      console.log('After learn_about:', after.length, 'beliefs about hammer')

      state.lock()

      // Should NOT have duplicated
      expect(after.length, 'learn_about should not create duplicate').to.equal(before.length)
    })

    it('should recognize knowledge from base state after branch', () => {
      // Setup world
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' },
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['color'] },
            location: 'workshop',
          },
        }
      })

      state.lock()
      state = state.branch_state(Cosmos.logos_state(), 2)

      const player = get_first_belief_by_label('player')
      const hammer = get_first_belief_by_label('hammer')

      // Get player's mind state - should branch from locked template state
      const player_state = state.get_active_state_by_host(player)

      // Recognize should find hammer knowledge from template (in base state)
      const existing = player_state.recognize(hammer)
      expect(existing.length, 'should find hammer knowledge from template').to.be.at.least(1)

      // Verify the found belief has correct @about
      const about_traittype = Traittype.get_by_label('@about')
      const about_value = existing[0].get_trait(player_state, about_traittype)
      expect(about_value).to.equal(hammer.subject)
    })

    it('should trace player_state base chain correctly', () => {
      const world_mind = new Cosmos.Materia(Cosmos.logos(), 'world')
      let state = world_mind.create_state(Cosmos.logos_state(), {tt: 1})

      state.add_beliefs_from_template({
        workshop: { bases: ['Location'] },
        hammer: {
          bases: ['PortableObject'],
          traits: { location: 'workshop', color: 'blue' },
        },
        player: {
          bases: ['Person'],
          traits: {
            mind: { hammer: ['color'] },
            location: 'workshop',
          },
        }
      })

      state.lock()
      state = state.branch_state(Cosmos.logos_state(), 2)

      const player = get_first_belief_by_label('player')
      const player_state = state.get_active_state_by_host(player)

      // Trace base chain
      const bases = []
      let s = player_state
      while (s) {
        bases.push({ id: s._id, locked: s.locked, mind: s.in_mind?.label })
        s = s.base
      }

      console.log('Player state base chain:', bases)

      // Player state should have a base (the template state)
      expect(player_state.base, 'player_state should have base').to.exist
      expect(player_state.base.locked, 'base state should be locked').to.be.true
    })
  })
})
