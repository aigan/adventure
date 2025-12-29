/**
 * Tests for superposition and uncertainty handling
 *
 * Explores scenarios where multiple possibilities exist simultaneously:
 * - Same subject with different trait values in different branches
 * - Convergence merging multiple branch heads
 * - Querying across superposed states
 * - Certainty weighting
 */

import { expect } from 'chai'
import { Materia, logos, logos_state, Traittype } from '../public/worker/cosmos.mjs'
import { Convergence } from '../public/worker/convergence.mjs'
import * as DB from '../public/worker/db.mjs'

describe('Superposition Scenarios', () => {
  beforeEach(() => {
    DB.reset_registries()

    const traittypes = {
      '@about': { type: 'Subject', mind: 'parent', exposure: 'internal' },
      location: { type: 'Subject', exposure: 'spatial' },
      color: { type: 'string', exposure: 'visual' },
    }

    const archetypes = {
      Thing: { traits: { '@about': null } },
      Location: { bases: ['Thing'] },
      Tool: { bases: ['Thing'], traits: { location: null, color: null } },
    }

    DB.register(traittypes, archetypes, {})
  })

  describe('branching uncertainty', () => {
    it('two branches with same subject, different trait values', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()

      // Common ancestor state
      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_belief_from_template({
        label: 'workshop',
        bases: ['Location'],
      })
      state_0.add_belief_from_template({
        label: 'shed',
        bases: ['Location'],
      })
      state_0.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state_0.lock()

      // Branch A: hammer in workshop (70% certain)
      const state_a = state_0.branch(ground, 2, { certainty: 0.7 })
      const hammer_a = state_a.get_belief_by_label('hammer')
      const workshop = state_a.get_belief_by_label('workshop')
      hammer_a.replace(state_a, { location: workshop.subject })
      state_a.lock()

      // Branch B: hammer in shed (30% certain)
      const state_b = state_0.branch(ground, 2, { certainty: 0.3 })
      const hammer_b = state_b.get_belief_by_label('hammer')
      const shed = state_b.get_belief_by_label('shed')
      hammer_b.replace(state_b, { location: shed.subject })
      state_b.lock()

      // Both branches have hammer with different locations
      const loc_tt = Traittype.get_by_label('location')

      const loc_a = state_a.get_belief_by_label('hammer').get_trait(state_a, loc_tt)
      const loc_b = state_b.get_belief_by_label('hammer').get_trait(state_b, loc_tt)

      expect(loc_a.get_label()).to.equal('workshop')
      expect(loc_b.get_label()).to.equal('shed')

      // Certainties preserved
      expect(state_a.certainty).to.equal(0.7)
      expect(state_b.certainty).to.equal(0.3)
    })

    it('recall_by_archetype finds both alternatives', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()

      // Setup: hammer exists
      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_belief_from_template({ label: 'workshop', bases: ['Location'] })
      state_0.add_belief_from_template({ label: 'shed', bases: ['Location'] })
      state_0.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state_0.lock()

      // Two branches with different locations
      const state_a = state_0.branch(ground, 2, { certainty: 0.7 })
      const hammer_a = state_a.get_belief_by_label('hammer')
      hammer_a.replace(state_a, { location: state_a.get_belief_by_label('workshop').subject })
      state_a.lock()

      const state_b = state_0.branch(ground, 2, { certainty: 0.3 })
      const hammer_b = state_b.get_belief_by_label('hammer')
      hammer_b.replace(state_b, { location: state_b.get_belief_by_label('shed').subject })
      state_b.lock()

      // Query across both branches using recall_by_archetype
      const results = [...mind.recall_by_archetype(ground, 'Tool', 2, ['location'])]

      // Should find one subject (hammer) with two location traits
      expect(results).to.have.length(1)
      const [, traits] = results[0]
      expect(traits).to.have.length(2)

      // Certainties should match branch certainties
      const certainties = traits.map(t => t.certainty).sort((a, b) => b - a)
      expect(certainties[0]).to.equal(0.7)
      expect(certainties[1]).to.equal(0.3)
    })
  })

  describe('Convergence with superposition', () => {
    it('current behavior: first component wins (picks one)', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()

      // Base state with hammer (no location yet)
      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_belief_from_template({ label: 'workshop', bases: ['Location'] })
      state_0.add_belief_from_template({ label: 'shed', bases: ['Location'] })
      state_0.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { color: 'black' }
      })
      state_0.lock()

      // Branch A: hammer in workshop
      const state_a = state_0.branch(ground, 2, { certainty: 0.7 })
      const hammer_a = state_a.get_belief_by_label('hammer')
      hammer_a.replace(state_a, { location: state_a.get_belief_by_label('workshop').subject })
      state_a.lock()

      // Branch B: hammer in shed
      const state_b = state_0.branch(ground, 2, { certainty: 0.3 })
      const hammer_b = state_b.get_belief_by_label('hammer')
      hammer_b.replace(state_b, { location: state_b.get_belief_by_label('shed').subject })
      state_b.lock()

      // Convergence of both branches
      const conv = new Convergence(mind, ground, [state_a, state_b], { tt: 3 })

      // Current behavior: only yields hammer once (from first component)
      const beliefs = [...conv.get_beliefs()]
      const hammers = beliefs.filter(b => b.get_label() === 'hammer')

      // Documents current "pick one" behavior - first component wins
      expect(hammers).to.have.length(1)

      // The hammer we get is from state_a (first component)
      const loc_tt = Traittype.get_by_label('location')
      const hammer_loc = hammers[0].get_trait(conv, loc_tt)
      expect(hammer_loc.get_label()).to.equal('workshop')
    })

    it.skip('desired behavior: yields both alternatives with certainty', () => {
      // TODO: Convergence should yield all alternatives for same subject
      // Each with the certainty from its source state
    })
  })

  describe('branch heads', () => {
    it('finding all current states (branch heads)', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()

      // Linear: state_0 -> state_1 -> state_2
      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.lock()

      const state_1 = state_0.branch(ground, 2)
      state_1.lock()

      const state_2 = state_1.branch(ground, 3)
      state_2.lock()

      // state_2 is the only head (no children)
      expect(state_0._branches).to.include(state_1)
      expect(state_1._branches).to.include(state_2)
      expect(state_2._branches).to.have.length(0)
    })

    it('multiple branch heads from divergence', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()

      // Diverge: state_0 -> state_a, state_b
      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.lock()

      const state_a = state_0.branch(ground, 2, { certainty: 0.7 })
      state_a.lock()

      const state_b = state_0.branch(ground, 2, { certainty: 0.3 })
      state_b.lock()

      // Both are heads
      expect(state_0._branches).to.have.length(2)
      expect(state_a._branches).to.have.length(0)
      expect(state_b._branches).to.have.length(0)
    })

    it.skip('get_branch_heads() returns all leaf states', () => {
      // TODO: Need API to get all branch heads from any state
      // state_0.get_branch_heads() -> [state_a, state_b]
    })
  })

  describe('observation collapse', () => {
    it.skip('observation removes incompatible branches', () => {
      // TODO: When player observes hammer in workshop,
      // the "hammer in shed" branch should be pruned
    })
  })

  describe('rebasing branches', () => {
    it.skip('merging confirmed branch back to main timeline', () => {
      // TODO: When uncertainty resolves, the confirmed branch
      // becomes the "main" timeline, others discarded
    })
  })
})
