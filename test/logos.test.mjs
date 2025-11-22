import { expect } from 'chai'
import * as DB from '../public/worker/db.mjs'
import { Mind, Materia } from '../public/worker/cosmos.mjs'
import { State } from '../public/worker/state.mjs'
import { Belief } from '../public/worker/belief.mjs'
import { logos } from '../public/worker/cosmos.mjs'
import { setupStandardArchetypes } from './helpers.mjs'

describe('Logos Singleton', () => {
  beforeEach(() => {
    DB.reset_registries()
  })

  describe('get_logos_mind()', () => {
    it('creates logos mind with parent=null', () => {
      const logos = DB.get_logos_mind()

      expect(logos).to.be.instanceof(Mind)
      expect(logos.label).to.equal('logos')
      expect(logos.parent).to.be.null
    })

    it('returns same instance on multiple calls (singleton)', () => {
      const logos1 = DB.get_logos_mind()
      const logos2 = DB.get_logos_mind()

      expect(logos1).to.equal(logos2)
    })

    it('resets on registry reset', () => {
      const logos1 = DB.get_logos_mind()
      DB.reset_registries()
      const logos2 = DB.get_logos_mind()

      expect(logos1).to.not.equal(logos2)
    })
  })

  describe('get_logos_state()', () => {
    it('creates logos state with ground_state=null', () => {
      const logos_state = DB.get_logos_state()

      expect(logos_state).to.be.instanceof(State)
      expect(logos_state.ground_state).to.be.null
      //expect(logos_state.tt).to.equal(0)
    })

    it('logos state belongs to logos mind', () => {
      const logos_state = DB.get_logos_state()
      const logos_mind = DB.get_logos_mind()

      expect(logos_state.in_mind).to.equal(logos_mind)
    })

    it('returns same instance on multiple calls (singleton)', () => {
      const state1 = DB.get_logos_state()
      const state2 = DB.get_logos_state()

      expect(state1).to.equal(state2)
    })

    it('resets on registry reset', () => {
      const state1 = DB.get_logos_state()
      DB.reset_registries()
      const state2 = DB.get_logos_state()

      expect(state1).to.not.equal(state2)
    })
  })

  describe('Integration', () => {
    it('logos mind and state are registered in DB', () => {
      const logos_mind = DB.get_logos_mind()
      const logos_state = DB.get_logos_state()

      expect(DB.get_mind_by_id(logos_mind._id)).to.equal(logos_mind)
      expect(DB.get_mind_by_label('logos')).to.equal(logos_mind)
      expect(DB.get_state_by_id(logos_state._id)).to.equal(logos_state)
    })

    it('can create world mind with logos as parent', () => {
      const logos = DB.get_logos_mind()
      const world = new Materia(logos, 'world')

      expect(world.parent).to.equal(logos)
      expect(world.label).to.equal('world')
    })

    it('can create world state with logos_state as ground', () => {
      const logos = DB.get_logos_mind()
      const logos_state = DB.get_logos_state()
      const world_mind = new Materia(logos, 'world')
      const world_state = new State(world_mind, logos_state, null, {tt: 100})

      expect(world_state.ground_state).to.equal(logos_state)
      expect(world_state.in_mind).to.equal(world_mind)
    })
  })

  describe('Materia.create_world() helper', () => {
    it('creates world mind with logos as parent', () => {
      const world = Materia.create_world()

      expect(world).to.be.instanceof(Mind)
      expect(world.label).to.equal('world')
      expect(world.parent).to.equal(DB.get_logos_mind())
    })

    it('accepts custom label', () => {
      const dream = Materia.create_world('dream')

      expect(dream.label).to.equal('dream')
      expect(dream.parent).to.equal(DB.get_logos_mind())
    })
  })

  describe('Mind.create_from_template() with shared beliefs', () => {
    beforeEach(() => {
      DB.reset_registries()
      setupStandardArchetypes()
    })

    it('works with shared belief as ground_belief', () => {
      // Create world context
      const world_mind = Materia.create_world()
      const world_state = world_mind.create_state(logos().origin_state, {tt: 100})

      // Create a shared belief (template) scoped to world with timed state
      const eidos = DB.get_eidos()
      const state_100 = eidos.create_timed_state(100)
      const shared_template = state_100.add_belief_from_template({
        bases: ['Thing'],
        traits: {
        },
        label: 'SharedTemplate'
      })

      // Create a mind using the shared belief as ground_belief
      const mind = Mind.create_from_template(
        world_state,
        shared_template,
        {}  // Empty learning spec
      )

      // Verify mind was created correctly
      expect(mind).to.be.instanceof(Mind)
      expect(mind.parent).to.equal(world_mind)  // Parent should be ground_mind from shared belief
      expect(mind.state).to.not.be.null
      expect(mind.state.ground_state).to.equal(world_state)
    })
  })
})
