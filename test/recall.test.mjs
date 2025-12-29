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
      '@certainty': {
        type: 'number',
        exposure: 'internal'
      },
      color: 'string',
      weight: 'number',
      location: 'Subject',
    }

    const archetypes = {
      Thing,
      Tool: {
        bases: ['Thing'],
        traits: { '@certainty': null, color: null, weight: null, location: null }
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

      const traits = [...mind.recall_by_subject(ground, hammer.subject, 1, ['location.color'])]

      expect(traits).to.have.length(1)
      expect(traits[0].value).to.equal('brown')
      expect(traits[0].subject).to.equal(handle.subject)
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

      const traits = [...mind.recall_by_subject(ground, hammer.subject, 1, ['color', 'location.color'])]

      expect(traits).to.have.length(2)
      const direct = traits.find(t => t.subject.sid === hammer.subject.sid)
      const path = traits.find(t => t.subject.sid === handle.subject.sid)
      expect(direct.value).to.equal('black')
      expect(path.value).to.equal('brown')
    })
  })

  describe('recall_by_archetype', () => {
    it('finds tools and returns requested traits', () => {
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

      const results = [...mind.recall_by_archetype(ground, 'Tool', 1, ['color', 'weight'])]

      expect(results).to.have.length(2)

      // Check we got both subjects
      const subjects = results.map(([s, _]) => s)
      expect(subjects).to.include(hammer.subject)
      expect(subjects).to.include(wrench.subject)

      // Check traits for hammer
      const [, hammer_traits] = results.find(([s, _]) => s === hammer.subject)
      expect(hammer_traits).to.have.length(2)
      expect(hammer_traits.find(t => t.type.label === 'color').value).to.equal('black')
      expect(hammer_traits.find(t => t.type.label === 'weight').value).to.equal(2)
    })

    it('returns empty iterator when no matches', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })
      state.lock()

      const results = [...mind.recall_by_archetype(ground, 'Tool', 1, ['color'])]

      expect(results).to.have.length(0)
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

      const results = [...mind.recall_by_archetype(ground, 'Tool', 2, ['location'])]

      expect(results).to.have.length(1) // One subject
      const [subject, traits] = results[0]
      expect(subject).to.equal(hammer.subject)
      expect(traits).to.have.length(2) // Two location possibilities

      const workshop_trait = traits.find(t => t.value?.sid === workshop.subject.sid)
      const shed_trait = traits.find(t => t.value?.sid === shed.subject.sid)
      expect(workshop_trait.certainty).to.equal(0.7)
      expect(shed_trait.certainty).to.equal(0.3)
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

      const results = [...mind.recall_by_archetype(ground, 'Tool', 1, ['color'])]

      expect(results).to.have.length(3)
      const colors = results.flatMap(([_, traits]) => traits.map(t => t.value))
      expect(colors).to.include('black')
      expect(colors).to.include('silver')
      expect(colors).to.include('red')
    })

    it('recall_by_archetype with dot notation follows references', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const state = mind.create_state(ground, { tt: 1 })

      const workshop = state.add_belief_from_template({
        label: 'workshop',
        bases: ['Location']
      })
      const shed = state.add_belief_from_template({
        label: 'shed',
        bases: ['Location']
      })
      // Give locations color for testing (abusing Location for simplicity)
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

      const results = [...mind.recall_by_archetype(ground, 'Tool', 1, ['location.color'])]

      // Should return hammer and wrench (not the paint objects as they don't have location trait)
      expect(results.length).to.be.at.least(2)
      const colors = results.flatMap(([_, traits]) => traits.map(t => t.value))
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
      // Update with 80% belief certainty
      hammer.replace(state_1, { '@certainty': 0.8, weight: 2 })
      state_1.lock()

      const traits = [...mind.recall_by_subject(ground, hammer.subject, 2, ['weight'])]

      // 0.7 (path) × 0.8 (belief) = 0.56
      expect(traits[0].certainty).to.be.closeTo(0.56, 0.001)
    })

    it('defaults belief certainty to 1.0 when not set', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()

      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }  // No @certainty set
      })
      state_0.lock()

      // Branch with 70% certainty
      const state_1 = state_0.branch(ground, 2, { certainty: 0.7 })
      const hammer = state_1.get_belief_by_label('hammer')
      hammer.replace(state_1, { weight: 2 })  // No @certainty set
      state_1.lock()

      const traits = [...mind.recall_by_subject(ground, hammer.subject, 2, ['weight'])]

      // path_certainty only (belief_certainty defaults to 1.0)
      expect(traits[0].certainty).to.equal(0.7)
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
      // Update with 60% belief certainty
      hammer.replace(state_2, { '@certainty': 0.6, weight: 2 })
      state_2.lock()

      const traits = [...mind.recall_by_subject(ground, hammer.subject, 3, ['weight'])]

      // path: 0.7 × 0.5 = 0.35, combined: 0.35 × 0.6 = 0.21
      expect(traits[0].certainty).to.be.closeTo(0.21, 0.001)
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
      // Update with 80% belief certainty
      hammer.replace(state_1, { '@certainty': 0.8, weight: 2 })
      state_1.lock()

      const results = [...mind.recall_by_archetype(ground, 'Tool', 2, ['weight'])]

      expect(results).to.have.length(1)
      const [, traits] = results[0]
      expect(traits[0].certainty).to.be.closeTo(0.56, 0.001)
    })
  })
})

describe('get_trait_path', () => {
  beforeEach(() => {
    DB.reset_registries()

    const traittypes = {
      ...stdTypes,
      '@certainty': { type: 'number', exposure: 'internal' },
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
        traits: { '@certainty': null, color: null, material: null, head: null }
      },
      HammerHandle: {
        bases: ['Thing'],
        traits: { '@certainty': null, color: null, material: null, length: null }
      },
      Hammer: {
        bases: ['Thing'],
        traits: { '@certainty': null, color: null, head: null, handle: null }
      }
    }

    DB.register(traittypes, archetypes, {})
  })
  setupAfterEachValidation()

  it('single segment returns direct trait', () => {
    const mind = new Materia(logos(), 'player')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1 })

    const hammer = state.add_belief_from_template({
      label: 'hammer',
      bases: ['Hammer'],
      traits: { color: 'black' }
    })
    state.lock()

    const trait = hammer.get_trait_path(state, 'color')

    expect(trait).to.exist
    expect(trait.value).to.equal('black')
    expect(trait.subject).to.equal(hammer.subject)
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

    const trait = hammer.get_trait_path(state, 'handle.color')

    expect(trait).to.exist
    expect(trait.value).to.equal('brown')
    expect(trait.subject).to.equal(handle.subject)
    expect(trait.source).to.equal(handle)
  })

  it('three segments follows nested references', () => {
    const mind = new Materia(logos(), 'player')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1 })

    // head → tip (another part)
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

    const trait = hammer.get_trait_path(state, 'head.head.material')

    expect(trait).to.exist
    expect(trait.value).to.equal('steel')
    expect(trait.subject).to.equal(tip.subject)
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

    const trait = hammer.get_trait_path(state, 'handle.color')
    expect(trait).to.be.undefined
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
    const trait = hammer.get_trait_path(state, 'color.something')
    expect(trait).to.be.undefined
  })

  it('accumulates certainty through path', () => {
    const mind = new Materia(logos(), 'player')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1 })

    const handle = state.add_belief_from_template({
      label: 'handle',
      bases: ['HammerHandle'],
      traits: { '@certainty': 0.7, color: 'brown' }
    })
    const hammer = state.add_belief_from_template({
      label: 'hammer',
      bases: ['Hammer'],
      traits: { handle: handle.subject }
    })
    state.lock()

    const trait = hammer.get_trait_path(state, 'handle.color')

    expect(trait).to.exist
    expect(trait.certainty).to.be.closeTo(0.7, 0.001)
  })

  it('multiplies certainty through multiple hops', () => {
    const mind = new Materia(logos(), 'player')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1 })

    const tip = state.add_belief_from_template({
      label: 'tip',
      bases: ['HammerHead'],
      traits: { '@certainty': 0.8, material: 'steel' }
    })
    const head = state.add_belief_from_template({
      label: 'head',
      bases: ['HammerHead'],
      traits: { '@certainty': 0.9, head: tip.subject }
    })
    const hammer = state.add_belief_from_template({
      label: 'hammer',
      bases: ['Hammer'],
      traits: { head: head.subject }
    })
    state.lock()

    const trait = hammer.get_trait_path(state, 'head.head.material')

    // 0.9 (head) × 0.8 (tip) = 0.72
    expect(trait).to.exist
    expect(trait.certainty).to.be.closeTo(0.72, 0.001)
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

    const trait = hammer.get_trait_path(state, ['handle', 'color'])

    expect(trait).to.exist
    expect(trait.value).to.equal('brown')
  })
})
