import { expect } from 'chai'
import { Belief, Traittype } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'
import { setupStandardArchetypes, createStateInNewMind } from '../test/helpers.mjs'

// Tests for belief.branch() and belief.replace() patterns
describe('Belief versioning: branch() and replace()', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()
  })

  describe('replace()', () => {
    it('creates new belief and removes old one from state', () => {
      const state = createStateInNewMind()

      const hammer = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: { color: 'red' },
        label: 'hammer'
      })

      const hammer_v2 = hammer.replace(state, { color: 'blue' })

      const color_tt = Traittype.get_by_label('color')

      // New belief has updated trait
      expect(hammer_v2.get_trait(state, color_tt)).to.equal('blue')

      // They share the same subject
      expect(hammer_v2.subject).to.equal(hammer.subject)

      // Old belief is removed from state
      const beliefs = [...state.get_beliefs()]
      expect(beliefs).to.have.lengthOf(1)
      expect(beliefs[0]).to.equal(hammer_v2)
    })

    it('works with locked belief in unlocked state', () => {
      const state1 = createStateInNewMind()

      const hammer = Belief.from_template(state1, {
        bases: ['PortableObject'],
        traits: { color: 'red' },
        label: 'hammer'
      })

      state1.lock()

      // Create new state
      const state2 = state1.branch(state1.ground_state, 2)

      // Can replace locked belief in new state
      const hammer_v2 = hammer.replace(state2, { color: 'blue' })

      const color_tt = Traittype.get_by_label('color')
      expect(hammer_v2.get_trait(state2, color_tt)).to.equal('blue')
    })

    it('fails when state is locked', () => {
      const state = createStateInNewMind()

      const hammer = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: { color: 'red' }
      })

      state.lock()

      expect(() => hammer.replace(state, { color: 'blue' }))
        .to.throw(/Cannot replace into locked state/)
    })
  })

  describe('branch()', () => {
    it('creates new belief while keeping old one in state', () => {
      const state = createStateInNewMind()

      const hammer = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: { color: 'red' },
        label: 'hammer'
      })

      const hammer_v2 = hammer.branch(state, { color: 'blue' })

      const color_tt = Traittype.get_by_label('color')

      // New belief has updated trait
      expect(hammer_v2.get_trait(state, color_tt)).to.equal('blue')

      // Old belief has original trait
      expect(hammer.get_trait(state, color_tt)).to.equal('red')

      // They share the same subject
      expect(hammer_v2.subject).to.equal(hammer.subject)

      // Both beliefs exist in state (superposition)
      const beliefs = [...state.get_beliefs()]
      expect(beliefs).to.have.lengthOf(2)
      expect(beliefs).to.include(hammer)
      expect(beliefs).to.include(hammer_v2)
    })

    it('allows multiple branches from same belief', () => {
      const state = createStateInNewMind()

      const hammer = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: { color: 'red' }
      })

      const hammer_blue = hammer.branch(state, { color: 'blue' })
      const hammer_green = hammer.branch(state, { color: 'green' })

      const color_tt = Traittype.get_by_label('color')

      // All three versions exist in state
      const beliefs = [...state.get_beliefs()]
      expect(beliefs).to.have.lengthOf(3)

      // Each has correct color
      expect(hammer.get_trait(state, color_tt)).to.equal('red')
      expect(hammer_blue.get_trait(state, color_tt)).to.equal('blue')
      expect(hammer_green.get_trait(state, color_tt)).to.equal('green')

      // All share same subject
      expect(hammer_blue.subject).to.equal(hammer.subject)
      expect(hammer_green.subject).to.equal(hammer.subject)
    })

    it('fails when state is locked', () => {
      const state = createStateInNewMind()

      const hammer = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: { color: 'red' }
      })

      state.lock()

      expect(() => hammer.branch(state, { color: 'blue' }))
        .to.throw(/Cannot branch into locked state/)
    })
  })
})
