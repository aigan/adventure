import { expect } from 'chai'
import { Notion, Traittype, Subject, Belief, Materia, Fuzzy } from '../public/worker/cosmos.mjs'
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
    it('returns Notion with single trait for known subject', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const hammer = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black', weight: 2 }
      })
      state.lock()

      const notion = mind.recall_by_subject(ground, hammer.subject, 1, ['color'])
      const color_tt = Traittype.get_by_label('color')

      expect(notion).to.be.instanceOf(Notion)
      expect(notion.subject).to.equal(hammer.subject)
      expect(notion.traits.has(color_tt)).to.be.true

      const color_value = notion.get(color_tt)
      expect(color_value).to.be.instanceOf(Fuzzy)
      expect(color_value.alternatives).to.have.length(1)
      expect(color_value.alternatives[0].value).to.equal('black')
      expect(color_value.alternatives[0].certainty).to.equal(1.0)
    })

    it('returns Notion with multiple requested traits', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const hammer = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black', weight: 2 }
      })
      state.lock()

      const notion = mind.recall_by_subject(ground, hammer.subject, 1, ['color', 'weight'])
      const color_tt = Traittype.get_by_label('color')
      const weight_tt = Traittype.get_by_label('weight')

      expect(notion.traits.size).to.equal(2)
      expect(notion.get(color_tt).alternatives[0].value).to.equal('black')
      expect(notion.get(weight_tt).alternatives[0].value).to.equal(2)
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

      const notion = mind.recall_by_subject(ground, hammer.subject, 1)
      const color_tt = Traittype.get_by_label('color')
      const weight_tt = Traittype.get_by_label('weight')

      // Should include color and weight (location is null/unset)
      expect(notion.traits.size).to.be.at.least(2)
      expect(notion.has(color_tt)).to.be.true
      expect(notion.has(weight_tt)).to.be.true
    })

    it('returns empty Notion for missing subject', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })
      state.lock()

      const unknown_subject = new Subject()
      const notion = mind.recall_by_subject(ground, unknown_subject, 1, ['color'])

      expect(notion).to.be.instanceOf(Notion)
      expect(notion.traits.size).to.equal(0)
    })
  })

  describe('superposition', () => {
    it('returns Fuzzy with multiple alternatives from different branches', () => {
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

      // Recall location trait - should get Fuzzy with both possibilities
      const notion = mind.recall_by_subject(ground, hammer.subject, 2, ['location'])
      const location_tt = Traittype.get_by_label('location')
      const location = notion.get(location_tt)

      expect(location).to.be.instanceOf(Fuzzy)
      expect(location.alternatives).to.have.length(2)

      const workshop_alt = location.alternatives.find(a => a.value?.sid === workshop.subject.sid)
      const shed_alt = location.alternatives.find(a => a.value?.sid === shed.subject.sid)

      expect(workshop_alt).to.exist
      expect(shed_alt).to.exist
      expect(workshop_alt.certainty).to.equal(0.7)
      expect(shed_alt.certainty).to.equal(0.3)
    })

    it('combines certainties when multiple branches agree on same value', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()

      // Base state with hammer
      const state_0 = mind.create_state(ground, { tt: 1 })
      const workshop = state_0.add_belief_from_template({
        label: 'workshop',
        bases: ['Location']
      })
      const hammer = state_0.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state_0.lock()

      // Branch A: hammer in workshop (60% certain)
      const state_a = state_0.branch(ground, 2, { certainty: 0.6 })
      state_a.get_belief_by_label('hammer').replace(state_a, { location: workshop.subject })
      state_a.lock()

      // Branch B: hammer ALSO in workshop (30% certain) - same value!
      const state_b = state_0.branch(ground, 2, { certainty: 0.3 })
      state_b.get_belief_by_label('hammer').replace(state_b, { location: workshop.subject })
      state_b.lock()

      // Recall location - should combine certainties for same value
      const notion = mind.recall_by_subject(ground, hammer.subject, 2, ['location'])
      const location_tt = Traittype.get_by_label('location')
      const location = notion.get(location_tt)

      expect(location).to.be.instanceOf(Fuzzy)
      // Should have ONE alternative (same value combined), not two
      expect(location.alternatives).to.have.length(1)
      expect(location.alternatives[0].value.sid).to.equal(workshop.subject.sid)
      // Certainties should be summed: 0.6 + 0.3 = 0.9
      expect(location.alternatives[0].certainty).to.be.closeTo(0.9, 0.001)
    })

    it('caps combined certainty at 1.0', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()

      // Base state with hammer
      const state_0 = mind.create_state(ground, { tt: 1 })
      const workshop = state_0.add_belief_from_template({
        label: 'workshop',
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
      state_a.get_belief_by_label('hammer').replace(state_a, { location: workshop.subject })
      state_a.lock()

      // Branch B: hammer ALSO in workshop (60% certain)
      const state_b = state_0.branch(ground, 2, { certainty: 0.6 })
      state_b.get_belief_by_label('hammer').replace(state_b, { location: workshop.subject })
      state_b.lock()

      // Recall location - combined certainty should cap at 1.0
      const notion = mind.recall_by_subject(ground, hammer.subject, 2, ['location'])
      const location_tt = Traittype.get_by_label('location')
      const location = notion.get(location_tt)

      expect(location.alternatives).to.have.length(1)
      // 0.7 + 0.6 = 1.3 -> capped at 1.0
      expect(location.alternatives[0].certainty).to.equal(1.0)
    })
  })

  describe('path-based recall', () => {
    it('recall_by_subject with dot notation follows references', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const handle = state.add_belief_from_template({
        label: 'handle',
        bases: ['Tool'],
        traits: { color: 'brown' }
      })
      const hammer = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black', weight: 2, location: handle.subject }
      })
      state.lock()

      const notion = mind.recall_by_subject(ground, hammer.subject, 1, ['location.color'])
      const color_tt = Traittype.get_by_label('color')

      expect(notion.has(color_tt)).to.be.true
      expect(notion.get(color_tt).alternatives[0].value).to.equal('brown')
    })

    it('recall_by_subject with mixed paths and direct traits', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const handle = state.add_belief_from_template({
        label: 'handle',
        bases: ['Tool'],
        traits: { color: 'brown' }
      })
      const hammer = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black', weight: 2, location: handle.subject }
      })
      state.lock()

      const notion = mind.recall_by_subject(ground, hammer.subject, 1, ['color', 'location.color'])
      const color_tt = Traittype.get_by_label('color')

      // Should have color trait with both values (direct 'black' and path 'brown')
      expect(notion.has(color_tt)).to.be.true
      const color = notion.get(color_tt)
      expect(color).to.be.instanceOf(Fuzzy)
      expect(color.alternatives).to.have.length(2)
      expect(color.alternatives.map(a => a.value)).to.include('black')
      expect(color.alternatives.map(a => a.value)).to.include('brown')
    })
  })

  describe('recall_by_archetype', () => {
    it('finds tools and returns Notions with requested traits', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const hammer = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black', weight: 2 }
      })
      const wrench = state.add_belief_from_template({
        label: 'wrench',
        bases: ['Tool'],
        traits: { color: 'silver', weight: 1 }
      })
      state.lock()

      const notions = [...mind.recall_by_archetype(ground, 'Tool', 1, ['color', 'weight'])]

      expect(notions).to.have.length(2)

      // Check we got both subjects
      const subjects = notions.map(n => n.subject)
      expect(subjects).to.include(hammer.subject)
      expect(subjects).to.include(wrench.subject)

      // Check traits for hammer
      const hammer_notion = notions.find(n => n.subject === hammer.subject)
      const color_tt = Traittype.get_by_label('color')
      const weight_tt = Traittype.get_by_label('weight')
      expect(hammer_notion.get(color_tt).alternatives[0].value).to.equal('black')
      expect(hammer_notion.get(weight_tt).alternatives[0].value).to.equal(2)
    })

    it('returns empty iterator when no matches', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })
      state.lock()

      const notions = [...mind.recall_by_archetype(ground, 'Tool', 1, ['color'])]

      expect(notions).to.have.length(0)
    })

    it('handles superposition within subject', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()

      // Base state with tool
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

      // Branch A: hammer in workshop
      const state_a = state_0.branch(ground, 2, { certainty: 0.7 })
      state_a.get_belief_by_label('hammer').replace(state_a, { location: workshop.subject })
      state_a.lock()

      // Branch B: hammer in shed
      const state_b = state_0.branch(ground, 2, { certainty: 0.3 })
      state_b.get_belief_by_label('hammer').replace(state_b, { location: shed.subject })
      state_b.lock()

      const notions = [...mind.recall_by_archetype(ground, 'Tool', 2, ['location'])]

      expect(notions).to.have.length(1) // One subject
      const notion = notions[0]
      expect(notion.subject).to.equal(hammer.subject)

      const location_tt = Traittype.get_by_label('location')
      const location = notion.get(location_tt)
      expect(location.alternatives).to.have.length(2) // Two location possibilities

      const workshop_alt = location.alternatives.find(a => a.value?.sid === workshop.subject.sid)
      const shed_alt = location.alternatives.find(a => a.value?.sid === shed.subject.sid)
      expect(workshop_alt.certainty).to.equal(0.7)
      expect(shed_alt.certainty).to.equal(0.3)
    })

    it('multiple subjects of same archetype', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state.add_belief_from_template({
        label: 'wrench',
        bases: ['Tool'],
        traits: { color: 'silver' }
      })
      state.add_belief_from_template({
        label: 'screwdriver',
        bases: ['Tool'],
        traits: { color: 'red' }
      })
      state.lock()

      const notions = [...mind.recall_by_archetype(ground, 'Tool', 1, ['color'])]
      const color_tt = Traittype.get_by_label('color')

      expect(notions).to.have.length(3)
      const colors = notions.map(n => n.get(color_tt).alternatives[0].value)
      expect(colors).to.include('black')
      expect(colors).to.include('silver')
      expect(colors).to.include('red')
    })

    it('recall_by_archetype with dot notation follows references', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const paint = state.add_belief_from_template({
        label: 'red_paint',
        bases: ['Tool'],
        traits: { color: 'red' }
      })
      const blue_paint = state.add_belief_from_template({
        label: 'blue_paint',
        bases: ['Tool'],
        traits: { color: 'blue' }
      })
      const hammer = state.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black', location: paint.subject }
      })
      const wrench = state.add_belief_from_template({
        label: 'wrench',
        bases: ['Tool'],
        traits: { color: 'silver', location: blue_paint.subject }
      })
      state.lock()

      const notions = [...mind.recall_by_archetype(ground, 'Tool', 1, ['location.color'])]
      const color_tt = Traittype.get_by_label('color')

      // Should return hammer and wrench (not the paint objects as they don't have location trait)
      expect(notions.length).to.be.at.least(2)
      const colors = notions.flatMap(n => {
        const c = n.get(color_tt)
        return c ? c.alternatives.map(a => a.value) : []
      })
      expect(colors).to.include('red')   // hammer's location.color
      expect(colors).to.include('blue')  // wrench's location.color
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

      const notion = mind.recall_by_subject(ground, hammer.subject, 1, ['color'])
      const color_tt = Traittype.get_by_label('color')

      expect(notion.get(color_tt).alternatives[0].certainty).to.equal(1.0)
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

      const notion = mind.recall_by_subject(ground, hammer.subject, 2, ['weight'])
      const weight_tt = Traittype.get_by_label('weight')

      expect(notion.get(weight_tt).alternatives[0].certainty).to.equal(0.7)
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

      const notion = mind.recall_by_subject(ground, hammer.subject, 3, ['weight'])
      const weight_tt = Traittype.get_by_label('weight')

      // 0.7 * 0.5 = 0.35
      expect(notion.get(weight_tt).alternatives[0].certainty).to.be.closeTo(0.35, 0.001)
    })
  })

  describe('belief certainty', () => {
    it('returns combined certainty from path and belief', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()

      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state_0.lock()

      // Branch with 70% path certainty
      const state_1 = state_0.branch(ground, 2, { certainty: 0.7 })
      const hammer = state_1.get_belief_by_label('hammer')
      // Create branch with 80% belief certainty via branch_metadata
      hammer.branch(state_1, { weight: 2 }, { certainty: 0.8 })
      state_1.lock()

      const notion = mind.recall_by_subject(ground, hammer.subject, 2, ['weight'])
      const weight_tt = Traittype.get_by_label('weight')

      // 0.7 (path) x 0.8 (belief) = 0.56
      expect(notion.get(weight_tt).alternatives[0].certainty).to.be.closeTo(0.56, 0.001)
    })

    it('defaults belief certainty to 1.0 when not set', () => {
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
      hammer.replace(state_1, { weight: 2 })  // No branch_metadata.certainty
      state_1.lock()

      const notion = mind.recall_by_subject(ground, hammer.subject, 2, ['weight'])
      const weight_tt = Traittype.get_by_label('weight')

      // path_certainty only (belief_certainty defaults to 1.0)
      expect(notion.get(weight_tt).alternatives[0].certainty).to.equal(0.7)
    })

    it('belief certainty multiplies with nested state certainty', () => {
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

      // Second branch: 50% certain
      const state_2 = state_1.branch(ground, 3, { certainty: 0.5 })
      const hammer = state_2.get_belief_by_label('hammer')
      // Create branch with 60% belief certainty via branch_metadata
      hammer.branch(state_2, { weight: 2 }, { certainty: 0.6 })
      state_2.lock()

      const notion = mind.recall_by_subject(ground, hammer.subject, 3, ['weight'])
      const weight_tt = Traittype.get_by_label('weight')

      // path: 0.7 x 0.5 = 0.35, combined: 0.35 x 0.6 = 0.21
      expect(notion.get(weight_tt).alternatives[0].certainty).to.be.closeTo(0.21, 0.001)
    })

    it('recall_by_archetype includes belief certainty', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()

      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state_0.lock()

      // Branch with 70% path certainty
      const state_1 = state_0.branch(ground, 2, { certainty: 0.7 })
      const hammer = state_1.get_belief_by_label('hammer')
      // Create branch with 80% belief certainty via branch_metadata
      hammer.branch(state_1, { weight: 2 }, { certainty: 0.8 })
      state_1.lock()

      const notions = [...mind.recall_by_archetype(ground, 'Tool', 2, ['weight'])]
      const weight_tt = Traittype.get_by_label('weight')

      expect(notions).to.have.length(1)
      expect(notions[0].get(weight_tt).alternatives[0].certainty).to.be.closeTo(0.56, 0.001)
    })

    it('multiplies state × belief × trait certainty in Notion only', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const location_tt = Traittype.get_by_label('location')

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

      // State branch with 0.7 certainty (stored independently)
      const state_1 = state_0.branch(ground, 2, { certainty: 0.7 })

      // Verify state certainty is stored unchanged
      expect(state_1.certainty).to.equal(0.7)

      // Get hammer from new state and create belief branch with Fuzzy trait
      const hammer_v1 = state_1.get_belief_by_label('hammer')

      // Create branch with 0.8 belief certainty and Fuzzy location trait
      const hammer_v2 = hammer_v1.branch(state_1, {
        location: new Fuzzy({ alternatives: [
          { value: workshop.subject, certainty: 0.5 },  // stored independently
          { value: shed.subject, certainty: 0.3 }       // stored independently
        ]})
      }, { certainty: 0.8 })

      state_1.lock()

      // Verify stored values are unchanged
      expect(state_1.certainty).to.equal(0.7)
      expect(hammer_v2.branch_metadata.certainty).to.equal(0.8)
      const stored_fuzzy = hammer_v2.get_trait(state_1, location_tt)
      expect(stored_fuzzy.alternatives[0].certainty).to.equal(0.5)  // unchanged
      expect(stored_fuzzy.alternatives[1].certainty).to.equal(0.3)  // unchanged

      // Notion multiplies all three levels
      const notion = mind.recall_by_subject(ground, hammer.subject, 2, ['location'])
      const fuzzy = notion.get(location_tt)

      // Combined in Notion: 0.7 × 0.8 × 0.5 = 0.28 for workshop
      // Combined in Notion: 0.7 × 0.8 × 0.3 = 0.168 for shed
      expect(fuzzy.alternatives).to.have.length(2)
      const workshop_alt = fuzzy.alternatives.find(a => a.value === workshop.subject)
      const shed_alt = fuzzy.alternatives.find(a => a.value === shed.subject)
      expect(workshop_alt.certainty).to.be.closeTo(0.28, 0.001)
      expect(shed_alt.certainty).to.be.closeTo(0.168, 0.001)
    })
  })
})

describe('get_trait_path', () => {
  beforeEach(() => {
    DB.reset_registries()

    const traittypes = {
      ...stdTypes,
      color: 'string',
      material: 'string',
      length: 'string',
      head: 'Subject',
      handle: 'Subject',
    }

    const archetypes = {
      Thing,
      HammerHead: {
        bases: ['Thing'],
        traits: { color: null, material: null, head: null }
      },
      HammerHandle: {
        bases: ['Thing'],
        traits: { color: null, material: null, length: null }
      },
      Hammer: {
        bases: ['Thing'],
        traits: { color: null, head: null, handle: null }
      }
    }

    DB.register(traittypes, archetypes, {})
  })
  setupAfterEachValidation()

  it('single segment returns direct trait value', () => {
    const mind = new Materia(logos(), 'player')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1 })

    const hammer = state.add_belief_from_template({
      label: 'hammer',
      bases: ['Hammer'],
      traits: { color: 'black' }
    })
    state.lock()

    const value = hammer.get_trait_path(state, 'color')

    expect(value).to.equal('black')
  })

  it('two segments follows Subject reference', () => {
    const mind = new Materia(logos(), 'player')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1 })

    const handle = state.add_belief_from_template({
      label: 'handle',
      bases: ['HammerHandle'],
      traits: { color: 'brown', material: 'wood' }
    })
    const hammer = state.add_belief_from_template({
      label: 'hammer',
      bases: ['Hammer'],
      traits: { color: 'black', handle: handle.subject }
    })
    state.lock()

    const value = hammer.get_trait_path(state, 'handle.color')

    expect(value).to.equal('brown')
  })

  it('three segments follows nested references', () => {
    const mind = new Materia(logos(), 'player')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1 })

    // head -> tip (another part)
    const tip = state.add_belief_from_template({
      label: 'tip',
      bases: ['HammerHead'],  // reuse archetype
      traits: { material: 'steel' }
    })
    const head = state.add_belief_from_template({
      label: 'head',
      bases: ['HammerHead'],
      traits: { color: 'silver', head: tip.subject }  // head.head = tip (abuse of archetype for test)
    })
    const hammer = state.add_belief_from_template({
      label: 'hammer',
      bases: ['Hammer'],
      traits: { head: head.subject }
    })
    state.lock()

    const value = hammer.get_trait_path(state, 'head.head.material')

    expect(value).to.equal('steel')
  })

  it('returns undefined for broken path', () => {
    const mind = new Materia(logos(), 'player')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1 })

    const hammer = state.add_belief_from_template({
      label: 'hammer',
      bases: ['Hammer'],
      traits: { color: 'black' }
    })
    state.lock()

    const value = hammer.get_trait_path(state, 'handle.color')
    expect(value).to.be.undefined
  })

  it('returns undefined for non-Subject intermediate', () => {
    const mind = new Materia(logos(), 'player')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1 })

    const hammer = state.add_belief_from_template({
      label: 'hammer',
      bases: ['Hammer'],
      traits: { color: 'black' }
    })
    state.lock()

    // color is a string, not Subject - can't traverse further
    const value = hammer.get_trait_path(state, 'color.something')
    expect(value).to.be.undefined
  })

  it('works with array path argument', () => {
    const mind = new Materia(logos(), 'player')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1 })

    const handle = state.add_belief_from_template({
      label: 'handle',
      bases: ['HammerHandle'],
      traits: { color: 'brown' }
    })
    const hammer = state.add_belief_from_template({
      label: 'hammer',
      bases: ['Hammer'],
      traits: { handle: handle.subject }
    })
    state.lock()

    const value = hammer.get_trait_path(state, ['handle', 'color'])

    expect(value).to.equal('brown')
  })
})
