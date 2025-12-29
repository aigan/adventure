/**
 * Tests for state certainty and possibility space queries
 *
 * State certainty enables representing superposed/uncertain states.
 * query_possibilities() searches across multiple states weighted by certainty.
 */

import { expect } from 'chai'
import { State, Materia, logos, logos_state, Traittype, Archetype } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'
import { query_possibilities, query_beliefs } from '../public/worker/perception.mjs'
import { setupStandardArchetypes, createStateInNewMind } from './helpers.mjs'

describe('State Certainty', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()
  })

  it('defaults certainty to 1.0', () => {
    const state = createStateInNewMind('test', 1)
    expect(state.certainty).to.equal(1.0)
  })

  it('accepts certainty in constructor options', () => {
    const mind = new Materia(logos(), 'test')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1, certainty: 0.5 })
    expect(state.certainty).to.equal(0.5)
  })

  it('branch() inherits certainty from base by default', () => {
    const mind = new Materia(logos(), 'test')
    const ground = logos_state()
    const state1 = mind.create_state(ground, { tt: 1, certainty: 0.7 })
    state1.lock()

    const state2 = state1.branch(ground, 2)
    expect(state2.certainty).to.equal(0.7)
  })

  it('branch() accepts explicit certainty override', () => {
    const mind = new Materia(logos(), 'test')
    const ground = logos_state()
    const state1 = mind.create_state(ground, { tt: 1, certainty: 0.9 })
    state1.lock()

    const state2 = state1.branch(ground, 2, { certainty: 0.3 })
    expect(state2.certainty).to.equal(0.3)
  })

  it('serializes and deserializes certainty', () => {
    const mind = new Materia(logos(), 'test')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1, certainty: 0.42 })

    const json = state.toJSON()
    expect(json.certainty).to.equal(0.42)
  })
})

describe('query_possibilities', () => {
  beforeEach(() => {
    DB.reset_registries()

    // Register traittypes and archetypes for testing
    const traittypes = {
      '@about': { type: 'Subject', mind: 'parent', exposure: 'internal' },
      location: { type: 'Location', exposure: 'spatial' },
      color: { type: 'string', exposure: 'visual' },
      size: { type: 'string', exposure: 'visual' },
    }

    const archetypes = {
      Thing: { traits: { '@about': null } },
      ObjectPhysical: { bases: ['Thing'], traits: { location: null, color: null } },
      Location: { bases: ['ObjectPhysical'] },
      Tool: { bases: ['ObjectPhysical'], traits: { size: null } },
      Hammer: { bases: ['Tool'] },
    }

    DB.register(traittypes, archetypes, {})
  })

  it('returns empty for unknown archetype', () => {
    const mind = new Materia(logos(), 'test')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1 })

    const results = [...query_possibilities([state], { archetype: 'NonExistent' })]
    expect(results).to.have.length(0)
  })

  it('finds beliefs matching archetype', () => {
    const mind = new Materia(logos(), 'test')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1 })

    state.add_belief_from_template({
      label: 'hammer',
      bases: ['Hammer'],
      traits: { color: 'black', size: 'large' }
    })

    const results = [...query_possibilities([state], { archetype: 'Hammer' })]
    expect(results).to.have.length(1)
    expect(results[0].belief.get_label()).to.equal('hammer')
    expect(results[0].score).to.equal(1.0)  // certainty 1.0 × match 1.0
  })

  it('filters by trait constraints', () => {
    const mind = new Materia(logos(), 'test')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1 })

    state.add_belief_from_template({
      label: 'black_hammer',
      bases: ['Hammer'],
      traits: { color: 'black', size: 'large' }
    })
    state.add_belief_from_template({
      label: 'red_hammer',
      bases: ['Hammer'],
      traits: { color: 'red', size: 'small' }
    })

    const results = [...query_possibilities([state], {
      archetype: 'Hammer',
      traits: { color: 'black' }
    })]

    expect(results).to.have.length(1)
    expect(results[0].belief.get_label()).to.equal('black_hammer')
  })

  it('returns partial matches with reduced score', () => {
    const mind = new Materia(logos(), 'test')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1 })

    state.add_belief_from_template({
      label: 'hammer',
      bases: ['Hammer'],
      traits: { color: 'black', size: 'small' }
    })

    // Query for black AND large - only color matches
    const results = [...query_possibilities([state], {
      archetype: 'Hammer',
      traits: { color: 'black', size: 'large' }
    })]

    expect(results).to.have.length(1)
    expect(results[0].score).to.equal(0.5)  // 1 of 2 traits matched
  })

  it('orders results by certainty', () => {
    const mind = new Materia(logos(), 'test')
    const ground = logos_state()

    // Create two states with different certainties
    const state_high = mind.create_state(ground, { tt: 1, certainty: 0.8 })
    state_high.add_belief_from_template({
      label: 'hammer_workshop',
      bases: ['Hammer'],
      traits: { color: 'black' }
    })
    state_high.lock()

    const state_low = mind.create_state(ground, { tt: 1, certainty: 0.2 })
    state_low.add_belief_from_template({
      label: 'hammer_shed',
      bases: ['Hammer'],
      traits: { color: 'black' }
    })
    state_low.lock()

    // Query both states - should return high certainty first
    const results = [...query_possibilities([state_low, state_high], {
      archetype: 'Hammer'
    })]

    expect(results).to.have.length(2)
    expect(results[0].belief.get_label()).to.equal('hammer_workshop')
    expect(results[0].score).to.equal(0.8)
    expect(results[1].belief.get_label()).to.equal('hammer_shed')
    expect(results[1].score).to.equal(0.2)
  })

  it('combines certainty with match score', () => {
    const mind = new Materia(logos(), 'test')
    const ground = logos_state()

    const state = mind.create_state(ground, { tt: 1, certainty: 0.6 })
    state.add_belief_from_template({
      label: 'hammer',
      bases: ['Hammer'],
      traits: { color: 'black', size: 'small' }
    })

    // Query for 2 traits, only 1 matches
    const results = [...query_possibilities([state], {
      archetype: 'Hammer',
      traits: { color: 'black', size: 'large' }
    })]

    expect(results).to.have.length(1)
    // Score = certainty (0.6) × match_score (0.5) = 0.3
    expect(results[0].score).to.be.closeTo(0.3, 0.001)
  })

  it('allows iterator to stop early', () => {
    const mind = new Materia(logos(), 'test')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1, certainty: 0.9 })

    // Add many hammers
    for (let i = 0; i < 10; i++) {
      state.add_belief_from_template({
        label: `hammer_${i}`,
        bases: ['Hammer'],
        traits: { color: 'black' }
      })
    }

    // Only get first result using iterator
    const iter = query_possibilities([state], { archetype: 'Hammer' })
    const first = iter.next()

    expect(first.done).to.be.false
    expect(first.value.belief.get_label()).to.match(/^hammer_/)
    expect(first.value.score).to.equal(0.9)
  })
})

describe('query_beliefs', () => {
  beforeEach(() => {
    DB.reset_registries()

    const traittypes = {
      '@about': { type: 'Subject', mind: 'parent', exposure: 'internal' },
      color: { type: 'string', exposure: 'visual' },
    }

    const archetypes = {
      Thing: { traits: { '@about': null } },
      ObjectPhysical: { bases: ['Thing'], traits: { color: null } },
      Tool: { bases: ['ObjectPhysical'] },
    }

    DB.register(traittypes, archetypes, {})
  })

  it('queries single state without wrapping in array', () => {
    const mind = new Materia(logos(), 'test')
    const ground = logos_state()
    const state = mind.create_state(ground, { tt: 1 })

    state.add_belief_from_template({
      label: 'tool',
      bases: ['Tool'],
      traits: { color: 'silver' }
    })

    const results = [...query_beliefs(state, { archetype: 'Tool' })]

    expect(results).to.have.length(1)
    expect(results[0].belief.get_label()).to.equal('tool')
  })
})
