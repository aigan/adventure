import { expect } from 'chai'
import { Trait, Traittype, Subject, Belief, Materia } from '../public/worker/cosmos.mjs'
import { logos, logos_state } from '../public/worker/logos.mjs'
import * as DB from '../public/worker/db.mjs'
import { stdTypes, Thing, setupAfterEachValidation } from './helpers.mjs'

describe('recall_by_subject', () => {
  beforeEach(() => {
    DB.reset_registries()

    const traittypes = {
      ...stdTypes,
      color: 'string',
      weight: 'number',
      location: 'Subject',
    }

    const archetypes = {
      Thing,
      Tool: {
        bases: ['Thing'],
        traits: { color: null, weight: null, location: null }
      },
      Location: {
        bases: ['Thing']
      }
    }

    DB.register(traittypes, archetypes, {})
  })
  setupAfterEachValidation()

  describe('basic recall', () => {
    it('returns single trait for known subject', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const hammer = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black', weight: 2 }
      })
      state.lock()

      const traits = [...mind.recall_by_subject(ground, hammer.subject, 1, ['color'])]

      expect(traits).to.have.length(1)
      expect(traits[0].type.label).to.equal('color')
      expect(traits[0].value).to.equal('black')
      expect(traits[0].certainty).to.equal(1.0)
      expect(traits[0].source).to.equal(hammer)
    })

    it('returns multiple requested traits', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const hammer = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black', weight: 2 }
      })
      state.lock()

      const traits = [...mind.recall_by_subject(ground, hammer.subject, 1, ['color', 'weight'])]

      expect(traits).to.have.length(2)
      const color = traits.find(t => t.type.label === 'color')
      const weight = traits.find(t => t.type.label === 'weight')
      expect(color.value).to.equal('black')
      expect(weight.value).to.equal(2)
    })

    it('returns all traits when request_traits omitted', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const hammer = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black', weight: 2 }
      })
      state.lock()

      const traits = [...mind.recall_by_subject(ground, hammer.subject, 1)]

      // Should include color and weight (location is null/unset)
      expect(traits.length).to.be.at.least(2)
      expect(traits.some(t => t.type.label === 'color')).to.be.true
      expect(traits.some(t => t.type.label === 'weight')).to.be.true
    })

    it('returns empty array for missing subject', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })
      state.lock()

      const unknown_subject = new Subject()
      const traits = [...mind.recall_by_subject(ground, unknown_subject, 1, ['color'])]

      expect(traits).to.have.length(0)
    })
  })

  describe('superposition', () => {
    it('returns multiple traits for same type from different branches', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()

      // Base state with hammer
      const state_0 = mind.create_state(ground, { tt: 1 })
      const workshop = state_0.add_belief_from_template({
        label: 'workshop',
        bases: ['Location']
      })
      const shed = state_0.add_belief_from_template({
        label: 'shed',
        bases: ['Location']
      })
      const hammer = state_0.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state_0.lock()

      // Branch A: hammer in workshop (70% certain)
      const state_a = state_0.branch(ground, 2, { certainty: 0.7 })
      const hammer_a = state_a.get_belief_by_label('hammer')
      hammer_a.replace(state_a, { location: workshop.subject })
      state_a.lock()

      // Branch B: hammer in shed (30% certain)
      const state_b = state_0.branch(ground, 2, { certainty: 0.3 })
      const hammer_b = state_b.get_belief_by_label('hammer')
      hammer_b.replace(state_b, { location: shed.subject })
      state_b.lock()

      // Recall location trait - should get both possibilities
      const traits = [...mind.recall_by_subject(ground, hammer.subject, 2, ['location'])]

      expect(traits).to.have.length(2)

      const workshop_trait = traits.find(t => t.value?.sid === workshop.subject.sid)
      const shed_trait = traits.find(t => t.value?.sid === shed.subject.sid)

      expect(workshop_trait).to.exist
      expect(shed_trait).to.exist
      expect(workshop_trait.certainty).to.equal(0.7)
      expect(shed_trait.certainty).to.equal(0.3)
    })
  })

  describe('path certainty', () => {
    it('returns certainty 1.0 for certain state', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const hammer = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state.lock()

      const traits = [...mind.recall_by_subject(ground, hammer.subject, 1, ['color'])]

      expect(traits[0].certainty).to.equal(1.0)
    })

    it('returns reduced certainty for branched state', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()

      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state_0.lock()

      // Branch with 70% certainty
      const state_1 = state_0.branch(ground, 2, { certainty: 0.7 })
      const hammer = state_1.get_belief_by_label('hammer')
      hammer.replace(state_1, { weight: 2 })
      state_1.lock()

      const traits = [...mind.recall_by_subject(ground, hammer.subject, 2, ['weight'])]

      expect(traits[0].certainty).to.equal(0.7)
    })

    it('multiplies certainty for nested branches', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()

      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state_0.lock()

      // First branch: 70% certain
      const state_1 = state_0.branch(ground, 2, { certainty: 0.7 })
      state_1.lock()

      // Second branch from first: 50% certain
      const state_2 = state_1.branch(ground, 3, { certainty: 0.5 })
      const hammer = state_2.get_belief_by_label('hammer')
      hammer.replace(state_2, { weight: 2 })
      state_2.lock()

      const traits = [...mind.recall_by_subject(ground, hammer.subject, 3, ['weight'])]

      // 0.7 * 0.5 = 0.35
      expect(traits[0].certainty).to.be.closeTo(0.35, 0.001)
    })
  })
})
