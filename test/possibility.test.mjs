/**
 * Tests for state certainty
 *
 * State certainty enables representing superposed/uncertain states.
 */

import { expect } from 'chai'
import { Materia, logos, logos_state } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'
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
