import { expect } from 'chai'
import { Trait, Traittype, Subject, Belief, Materia } from '../public/worker/cosmos.mjs'
import { logos, logos_state } from '../public/worker/logos.mjs'
import * as DB from '../public/worker/db.mjs'
import { stdTypes, Thing, setupAfterEachValidation } from './helpers.mjs'

describe('Trait', () => {
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
        traits: { color: null, weight: null }
      },
      Location: {
        bases: ['Thing']
      }
    }

    DB.register(traittypes, archetypes, {})
  })
  setupAfterEachValidation()

  describe('construction', () => {
    it('creates Trait with all fields', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const belief = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black', weight: 2 }
      })
      state.lock()

      const color_tt = Traittype.get_by_label('color')

      const trait = new Trait({
        subject: belief.subject,
        type: color_tt,
        value: 'black',
        source: belief,
        certainty: 0.7
      })

      expect(trait.subject).to.equal(belief.subject)
      expect(trait.type).to.equal(color_tt)
      expect(trait.value).to.equal('black')
      expect(trait.source).to.equal(belief)
      expect(trait.certainty).to.equal(0.7)
    })

    it('defaults certainty to 1.0', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const belief = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state.lock()

      const color_tt = Traittype.get_by_label('color')

      const trait = new Trait({
        subject: belief.subject,
        type: color_tt,
        value: 'black',
        source: belief
      })

      expect(trait.certainty).to.equal(1.0)
    })
  })

  describe('sysdesig', () => {
    it('shows type and value for string trait', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const belief = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state.lock()

      const color_tt = Traittype.get_by_label('color')

      const trait = new Trait({
        subject: belief.subject,
        type: color_tt,
        value: 'black',
        source: belief
      })

      expect(trait.sysdesig()).to.equal('color "black"')
    })

    it('shows certainty percentage when not certain', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const belief = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state.lock()

      const color_tt = Traittype.get_by_label('color')

      const trait = new Trait({
        subject: belief.subject,
        type: color_tt,
        value: 'black',
        source: belief,
        certainty: 0.7
      })

      expect(trait.sysdesig()).to.equal('color "black" (70%)')
    })

    it('shows number value without quotes', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const belief = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { weight: 2 }
      })
      state.lock()

      const weight_tt = Traittype.get_by_label('weight')

      const trait = new Trait({
        subject: belief.subject,
        type: weight_tt,
        value: 2,
        source: belief
      })

      expect(trait.sysdesig()).to.equal('weight 2')
    })

    it('shows null value', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const belief = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool']
      })
      state.lock()

      const color_tt = Traittype.get_by_label('color')

      const trait = new Trait({
        subject: belief.subject,
        type: color_tt,
        value: null,
        source: belief
      })

      expect(trait.sysdesig()).to.equal('color null')
    })

    it('shows subject context when different from source', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const workshop = state.add_belief_from_template({
        label: 'workshop',
        bases: ['Location']
      })

      const hammer = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state.lock()

      const color_tt = Traittype.get_by_label('color')

      // Trait about workshop but sourced from hammer belief
      const trait = new Trait({
        subject: workshop.subject,
        type: color_tt,
        value: 'grey',
        source: hammer
      })

      expect(trait.sysdesig()).to.equal('color "grey" @workshop')
    })
  })

  describe('toJSON', () => {
    it('serializes trait to JSON', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const belief = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state.lock()

      const color_tt = Traittype.get_by_label('color')

      const trait = new Trait({
        subject: belief.subject,
        type: color_tt,
        value: 'black',
        source: belief,
        certainty: 0.7
      })

      const json = trait.toJSON()

      expect(json.type).to.equal('color')
      expect(json.subject).to.equal(belief.subject.sid)
      expect(json.value).to.equal('black')
      expect(json.source).to.equal(belief._id)
      expect(json.certainty).to.equal(0.7)
    })
  })
})
