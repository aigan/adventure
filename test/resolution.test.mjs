/**
 * Resolution Tests - Phase 3 of Combinatorial Explosion Components
 *
 * Tests the @resolution pattern for collapsing uncertainty in beliefs.
 * Resolution beliefs have a `resolution` property pointing to the belief they resolve.
 */

import { describe, it } from 'mocha'
import { expect } from 'chai'
import { createEidosState, createStateInNewMind, setupStandardArchetypes, setupAfterEachValidation } from './helpers.mjs'
import { Belief, Traittype, Fuzzy, unknown, DB, Archetype, Materia, eidos, logos, logos_state, Convergence } from '../public/worker/cosmos.mjs'

describe('Resolution', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()
  })
  setupAfterEachValidation()

  describe('Belief.resolution property', () => {
    it('defaults to null for regular beliefs', () => {
      const world_state = createStateInNewMind('world')
      const Tool = Archetype.get_by_label('Tool')

      const hammer = Belief.from(world_state, [Tool])

      expect(hammer.resolution).to.equal(null)
    })

    it('can be set via replace() options', () => {
      // Use Materia child of Eidos for promotion capability + temporal states
      const shared_mind = new Materia(eidos(), 'shared')
      const state_1 = shared_mind.create_state(eidos().origin_state, { tt: 1 })

      const t_color = Traittype.get_by_label('color')

      // Create a promotable shared belief
      const proto = Belief.from_template(state_1, {
        bases: ['Tool'],
        promotable: true,
        traits: { durability: 100 }
      })

      // Create probability promotions (uncertain color)
      proto.replace(state_1, { color: 'red' }, { promote: true, certainty: 0.6 })
      proto.replace(state_1, { color: 'blue' }, { promote: true, certainty: 0.4 })
      state_1.lock()

      // Query at this point returns Fuzzy
      const uncertain = proto.get_trait(state_1, t_color)
      expect(uncertain).to.be.instanceOf(Fuzzy)

      // Create a resolution belief that collapses the uncertainty
      // Use state.branch() to create a state chain with base
      const state_2 = state_1.branch(eidos().origin_state, 2)
      const resolved = proto.replace(state_2, { color: 'red' }, { resolution: proto })

      expect(resolved.resolution).to.equal(proto)
    })
  })

  describe('Subject.resolutions index', () => {
    it('is empty by default', () => {
      const world_state = createStateInNewMind('world')
      const Tool = Archetype.get_by_label('Tool')

      const hammer = Belief.from(world_state, [Tool])

      expect(hammer.subject.resolutions.size).to.equal(0)
    })

    it('indexes resolution beliefs when inserted', () => {
      const shared_mind = new Materia(eidos(), 'shared')
      const state_1 = shared_mind.create_state(eidos().origin_state, { tt: 1 })

      const proto = Belief.from_template(state_1, {
        bases: ['Tool'],
        promotable: true,
        traits: { durability: 50 }
      })

      proto.replace(state_1, { color: 'green' }, { promote: true, certainty: 0.5 })
      proto.replace(state_1, { color: 'yellow' }, { promote: true, certainty: 0.5 })
      state_1.lock()

      // Create resolution in new state using branch for base chain
      const state_2 = state_1.branch(eidos().origin_state, 2)
      const resolved = proto.replace(state_2, { color: 'green' }, { resolution: proto })

      // Subject should have resolution indexed
      expect(proto.subject.resolutions.size).to.equal(1)
      expect(proto.subject.resolutions.get(state_2._id)).to.equal(resolved)
    })
  })

  describe('Subject.get_resolution()', () => {
    it('returns null when no resolution exists', () => {
      const world_state = createStateInNewMind('world')
      const Tool = Archetype.get_by_label('Tool')

      const hammer = Belief.from(world_state, [Tool])

      expect(hammer.subject.get_resolution(world_state)).to.equal(null)
    })

    it('returns resolution belief when querying from same state', () => {
      const shared_mind = new Materia(eidos(), 'shared')
      const state_1 = shared_mind.create_state(eidos().origin_state, { tt: 1 })

      const proto = Belief.from_template(state_1, {
        bases: ['Tool'],
        promotable: true,
        traits: { durability: 75 }
      })

      proto.replace(state_1, { color: 'A' }, { promote: true, certainty: 0.5 })
      proto.replace(state_1, { color: 'B' }, { promote: true, certainty: 0.5 })
      state_1.lock()

      const state_2 = state_1.branch(eidos().origin_state, 2)
      const resolved = proto.replace(state_2, { color: 'A' }, { resolution: proto })

      expect(proto.subject.get_resolution(state_2)).to.equal(resolved)
    })

    it('returns resolution belief when querying from descendant state', () => {
      const shared_mind = new Materia(eidos(), 'shared')
      const state_1 = shared_mind.create_state(eidos().origin_state, { tt: 1 })

      const proto = Belief.from_template(state_1, {
        bases: ['Tool'],
        promotable: true,
        traits: { durability: 80 }
      })

      proto.replace(state_1, { color: 'X' }, { promote: true, certainty: 0.5 })
      proto.replace(state_1, { color: 'Y' }, { promote: true, certainty: 0.5 })
      state_1.lock()

      // Create resolution in state_2
      const state_2 = state_1.branch(eidos().origin_state, 2)
      const resolved = proto.replace(state_2, { color: 'X' }, { resolution: proto })
      state_2.lock()

      // Create state_3 descended from state_2
      const state_3 = state_2.branch(eidos().origin_state, 3)

      // Query from descendant should find the resolution via ancestry walk
      expect(proto.subject.get_resolution(state_3)).to.equal(resolved)
    })

    it('returns null when querying from ancestor state (before resolution)', () => {
      const shared_mind = new Materia(eidos(), 'shared')
      const state_1 = shared_mind.create_state(eidos().origin_state, { tt: 1 })

      const proto = Belief.from_template(state_1, {
        bases: ['Tool'],
        promotable: true,
        traits: { durability: 60 }
      })

      proto.replace(state_1, { color: 'P' }, { promote: true, certainty: 0.5 })
      proto.replace(state_1, { color: 'Q' }, { promote: true, certainty: 0.5 })
      state_1.lock()

      const state_2 = state_1.branch(eidos().origin_state, 2)
      proto.replace(state_2, { color: 'P' }, { resolution: proto })

      // Query from ancestor (before resolution) should return null
      expect(proto.subject.get_resolution(state_1)).to.equal(null)
    })
  })

  describe('RES-4: Query after resolution returns resolved value', () => {
    it('get_trait returns concrete value after resolution', () => {
      const shared_mind = new Materia(eidos(), 'shared')
      const state_1 = shared_mind.create_state(eidos().origin_state, { tt: 1 })
      const t_color = Traittype.get_by_label('color')

      // Create promotable prototype
      const proto = Belief.from_template(state_1, {
        bases: ['Tool'],
        promotable: true,
        traits: { durability: 90 }
      })

      // Create probability promotions (Fuzzy color)
      proto.replace(state_1, { color: 'black' }, { promote: true, certainty: 0.6 })
      proto.replace(state_1, { color: 'white' }, { promote: true, certainty: 0.4 })
      state_1.lock()

      // Verify uncertainty before resolution
      const before = proto.get_trait(state_1, t_color)
      expect(before).to.be.instanceOf(Fuzzy)
      expect(before.alternatives.length).to.equal(2)

      // Create resolution
      const state_2 = state_1.branch(eidos().origin_state, 2)
      proto.replace(state_2, { color: 'black' }, { resolution: proto })
      state_2.lock()

      // Query AFTER resolution should return concrete value
      const after = proto.get_trait(state_2, t_color)
      expect(after).to.equal('black')
      expect(after).to.not.be.instanceOf(Fuzzy)
    })

    it('resolution short-circuits before cache lookup', () => {
      const shared_mind = new Materia(eidos(), 'shared')
      const state_1 = shared_mind.create_state(eidos().origin_state, { tt: 1 })
      const t_color = Traittype.get_by_label('color')

      const proto = Belief.from_template(state_1, {
        bases: ['Tool'],
        promotable: true,
        traits: { durability: 85 }
      })

      // Create promotions
      proto.replace(state_1, { color: 'orange' }, { promote: true, certainty: 0.5 })
      proto.replace(state_1, { color: 'purple' }, { promote: true, certainty: 0.5 })
      state_1.lock()

      // Query to potentially cache the Fuzzy value
      const fuzzy = proto.get_trait(state_1, t_color)
      expect(fuzzy).to.be.instanceOf(Fuzzy)

      // Create resolution
      const state_2 = state_1.branch(eidos().origin_state, 2)
      proto.replace(state_2, { color: 'orange' }, { resolution: proto })

      // Query after resolution should return concrete (not cached Fuzzy)
      const resolved = proto.get_trait(state_2, t_color)
      expect(resolved).to.equal('orange')
    })
  })

  describe('Serialization', () => {
    it('toJSON includes resolution when set', () => {
      const shared_mind = new Materia(eidos(), 'shared')
      const state_1 = shared_mind.create_state(eidos().origin_state, { tt: 1 })

      const proto = Belief.from_template(state_1, {
        bases: ['Tool'],
        promotable: true,
        traits: { durability: 70 }
      })

      proto.replace(state_1, { color: 'silver' }, { promote: true, certainty: 0.5 })
      proto.replace(state_1, { color: 'gold' }, { promote: true, certainty: 0.5 })
      state_1.lock()

      const state_2 = state_1.branch(eidos().origin_state, 2)
      const resolved = proto.replace(state_2, { color: 'silver' }, { resolution: proto })

      const json = resolved.toJSON()
      expect(json.resolution).to.equal(proto._id)
    })

    it('toJSON omits resolution when null', () => {
      const world_state = createStateInNewMind('world')
      const Tool = Archetype.get_by_label('Tool')

      const hammer = Belief.from(world_state, [Tool])

      const json = hammer.toJSON()
      expect(json.resolution).to.be.undefined
    })
  })

  describe('RES-1: State/Convergence resolution', () => {
    it('resolves Convergence by selecting one branch', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const t_color = Traittype.get_by_label('color')

      // Base state with hammer
      const state_0 = mind.create_state(ground, { tt: 1 })
      const hammer = state_0.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { durability: 100 }
      })
      state_0.lock()

      // Branch A: red hammer (certainty 0.7)
      const state_a = state_0.branch(ground, 2, { certainty: 0.7 })
      hammer.replace(state_a, { color: 'red' })
      state_a.lock()

      // Branch B: blue hammer (certainty 0.3)
      const state_b = state_0.branch(ground, 2, { certainty: 0.3 })
      hammer.replace(state_b, { color: 'blue' })
      state_b.lock()

      // Create Convergence representing uncertainty
      const conv = new Convergence(mind, ground, [state_a, state_b], { tt: 3 })
      conv.lock()

      // Get the hammer belief visible in convergence (current first-wins behavior)
      const hammer_in_conv = conv.get_belief_by_label('hammer')
      const before = hammer_in_conv.get_trait(conv, t_color)
      expect(before).to.equal('red') // First-wins: state_a's version

      // Create resolution that explicitly selects blue (from state_b)
      // The resolution belief overrides the convergence's first-wins behavior
      const state_resolved = conv.branch(ground, 4)
      hammer_in_conv.replace(state_resolved, { color: 'blue' }, { resolution: hammer_in_conv })
      state_resolved.lock()

      // After resolution: query the original hammer, resolution should apply
      const after = hammer.get_trait(state_resolved, t_color)
      expect(after).to.equal('blue')
    })

    it('resolution applies to queries from descendant states', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const t_color = Traittype.get_by_label('color')

      // Setup branching scenario
      const state_0 = mind.create_state(ground, { tt: 1 })
      const tool = state_0.add_belief_from_template({
        label: 'tool',
        bases: ['Tool'],
        traits: { durability: 100 }
      })
      state_0.lock()

      // Branch A: red tool
      const state_a = state_0.branch(ground, 2, { certainty: 0.5 })
      tool.replace(state_a, { color: 'red' })
      state_a.lock()

      // Branch B: blue tool
      const state_b = state_0.branch(ground, 2, { certainty: 0.5 })
      tool.replace(state_b, { color: 'blue' })
      state_b.lock()

      // Convergence
      const conv = new Convergence(mind, ground, [state_a, state_b], { tt: 3 })
      conv.lock()

      // Resolution selects red
      const state_resolved = conv.branch(ground, 4)
      tool.replace(state_resolved, { color: 'red' }, { resolution: tool })
      state_resolved.lock()

      // Create descendant state
      const state_5 = state_resolved.branch(ground, 5)

      // Query from descendant should find resolution
      const color = tool.get_trait(state_5, t_color)
      expect(color).to.equal('red')
    })
  })

  describe('RES-3: Unknown trait resolution', () => {
    it('resolves unknown trait to discovered value', () => {
      const world_state = createStateInNewMind('world')
      const t_color = Traittype.get_by_label('color')

      // Create a belief with unknown color
      const mystery_box = world_state.add_belief_from_template({
        label: 'mystery_box',
        bases: ['Tool'],
        traits: {
          durability: 50,
          color: unknown()  // Color is unknown
        }
      })
      world_state.lock()

      // Verify the trait is unknown
      const before = mystery_box.get_trait(world_state, t_color)
      expect(before).to.equal(unknown())
      expect(unknown().is_unknown).to.be.true

      // Discover the actual color - create resolution
      const state_2 = world_state.branch(logos_state(), 2)
      mystery_box.replace(state_2, { color: 'purple' }, { resolution: mystery_box })
      state_2.lock()

      // After resolution: should return discovered value
      const after = mystery_box.get_trait(state_2, t_color)
      expect(after).to.equal('purple')
      expect(after).to.not.equal(unknown())
    })

    it('unknown resolution does not affect other traits', () => {
      const world_state = createStateInNewMind('world')
      const t_color = Traittype.get_by_label('color')
      const t_durability = Traittype.get_by_label('durability')

      // Create belief with known durability, unknown color
      const item = world_state.add_belief_from_template({
        label: 'item',
        bases: ['Tool'],
        traits: {
          durability: 75,
          color: unknown()
        }
      })
      world_state.lock()

      // Resolve the unknown color
      const state_2 = world_state.branch(logos_state(), 2)
      item.replace(state_2, { color: 'green' }, { resolution: item })
      state_2.lock()

      // Color is resolved
      expect(item.get_trait(state_2, t_color)).to.equal('green')

      // Durability is unchanged
      expect(item.get_trait(state_2, t_durability)).to.equal(75)
    })

    it('resolution of unknown is visible from descendant states', () => {
      const world_state = createStateInNewMind('world')
      const t_color = Traittype.get_by_label('color')

      const secret = world_state.add_belief_from_template({
        label: 'secret',
        bases: ['Tool'],
        traits: { color: unknown() }
      })
      world_state.lock()

      // Resolve unknown
      const state_2 = world_state.branch(logos_state(), 2)
      secret.replace(state_2, { color: 'gold' }, { resolution: secret })
      state_2.lock()

      // Create chain of descendants
      const state_3 = state_2.branch(logos_state(), 3)
      state_3.lock()
      const state_4 = state_3.branch(logos_state(), 4)

      // Query from deep descendant should find resolution
      expect(secret.get_trait(state_4, t_color)).to.equal('gold')
    })
  })
})
