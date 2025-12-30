import { expect } from 'chai'
import { Notion, Traittype, Subject, Belief, Materia, Fuzzy } from '../public/worker/cosmos.mjs'
import { logos, logos_state } from '../public/worker/logos.mjs'
import * as DB from '../public/worker/db.mjs'
import { stdTypes, Thing, setupAfterEachValidation } from './helpers.mjs'

describe('Notion', () => {
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
    it('creates Notion with subject and empty traits', () => {
      const subject = new Subject()
      const notion = new Notion({ subject })

      expect(notion.subject).to.equal(subject)
      expect(notion.traits).to.be.instanceOf(Map)
      expect(notion.traits.size).to.equal(0)
    })

    it('creates Notion with traits Map', () => {
      const subject = new Subject()
      const color_tt = Traittype.get_by_label('color')
      const traits = new Map([
        [color_tt, 'black']
      ])
      const notion = new Notion({ subject, traits })

      expect(notion.traits.size).to.equal(1)
      expect(notion.traits.get(color_tt)).to.equal('black')
    })

    it('is frozen (immutable)', () => {
      const subject = new Subject()
      const notion = new Notion({ subject })

      expect(Object.isFrozen(notion)).to.be.true
    })
  })

  describe('get', () => {
    it('returns trait value', () => {
      const subject = new Subject()
      const color_tt = Traittype.get_by_label('color')
      const traits = new Map([
        [color_tt, 'black']
      ])
      const notion = new Notion({ subject, traits })

      expect(notion.get(color_tt)).to.equal('black')
    })

    it('returns null for missing trait', () => {
      const subject = new Subject()
      const notion = new Notion({ subject })
      const color_tt = Traittype.get_by_label('color')

      expect(notion.get(color_tt)).to.be.null
    })

    it('returns Fuzzy value', () => {
      const subject = new Subject()
      const color_tt = Traittype.get_by_label('color')
      const fuzzy = new Fuzzy({
        alternatives: [
          { value: 'red', certainty: 0.7 },
          { value: 'blue', certainty: 0.3 }
        ]
      })
      const traits = new Map([
        [color_tt, fuzzy]
      ])
      const notion = new Notion({ subject, traits })

      const value = notion.get(color_tt)
      expect(value).to.be.instanceOf(Fuzzy)
      expect(value.alternatives).to.have.length(2)
    })
  })

  describe('has', () => {
    it('returns true for existing trait', () => {
      const subject = new Subject()
      const color_tt = Traittype.get_by_label('color')
      const traits = new Map([
        [color_tt, 'black']
      ])
      const notion = new Notion({ subject, traits })

      expect(notion.has(color_tt)).to.be.true
    })

    it('returns false for missing trait', () => {
      const subject = new Subject()
      const notion = new Notion({ subject })
      const color_tt = Traittype.get_by_label('color')

      expect(notion.has(color_tt)).to.be.false
    })
  })

  describe('sysdesig', () => {
    it('shows subject label and trait count', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const hammer = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black', weight: 2 }
      })
      state.lock()

      const color_tt = Traittype.get_by_label('color')
      const weight_tt = Traittype.get_by_label('weight')
      const traits = new Map([
        [color_tt, 'black'],
        [weight_tt, 2]
      ])
      const notion = new Notion({ subject: hammer.subject, traits })

      expect(notion.sysdesig()).to.equal('Notion(hammer)[2]')
    })

    it('shows subject sid when no label', () => {
      const subject = new Subject()
      const notion = new Notion({ subject })

      expect(notion.sysdesig()).to.match(/^Notion\(#\d+\)\[0\]$/)
    })
  })

  describe('toJSON', () => {
    it('serializes to JSON', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const hammer = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state.lock()

      const color_tt = Traittype.get_by_label('color')
      const traits = new Map([
        [color_tt, 'black']
      ])
      const notion = new Notion({ subject: hammer.subject, traits })

      const json = notion.toJSON()

      expect(json._type).to.equal('Notion')
      expect(json.subject).to.equal(hammer.subject.sid)
      expect(json.traits.color).to.equal('black')
    })

    it('serializes Fuzzy values', () => {
      const subject = new Subject()
      const color_tt = Traittype.get_by_label('color')
      const fuzzy = new Fuzzy({
        alternatives: [
          { value: 'red', certainty: 0.7 },
          { value: 'blue', certainty: 0.3 }
        ]
      })
      const traits = new Map([
        [color_tt, fuzzy]
      ])
      const notion = new Notion({ subject, traits })

      const json = notion.toJSON()

      expect(json.traits.color._type).to.equal('Fuzzy')
      expect(json.traits.color.alternatives).to.have.length(2)
    })
  })

  describe('to_inspect_view', () => {
    it('converts to inspection view', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const hammer = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state.lock()

      const color_tt = Traittype.get_by_label('color')
      const traits = new Map([
        [color_tt, 'black']
      ])
      const notion = new Notion({ subject: hammer.subject, traits })

      const view = notion.to_inspect_view(state)

      expect(view._type).to.equal('Notion')
      expect(view.subject).to.equal(hammer.subject.sid)
      expect(view.traits.color).to.equal('black')
    })
  })
})
