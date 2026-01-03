/**
 * Resolution Tests - Phase 3 of Combinatorial Explosion Components
 *
 * Tests the @resolution pattern for collapsing uncertainty in beliefs.
 * Resolution beliefs have a `resolution` property pointing to the belief they resolve.
 */

import { describe, it } from 'mocha'
import { expect } from 'chai'
import { createEidosState, createStateInNewMind, setupStandardArchetypes, setupAfterEachValidation } from './helpers.mjs'
import { Belief, Traittype, Fuzzy, unknown, DB, Archetype, Materia, eidos, logos, logos_state, Convergence, save_mind, load } from '../public/worker/cosmos.mjs'

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

      // Subject should have resolution indexed (uses State object as key)
      expect(proto.subject.resolutions.size).to.equal(1)
      expect(proto.subject.resolutions.get(state_2)).to.equal(resolved)
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

  describe('Timeline Resolution (Convergence.register_resolution)', () => {
    it('TL-1: resolving Convergence affects all beliefs in selected branch', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const t_color = Traittype.get_by_label('color')
      const t_durability = Traittype.get_by_label('durability')

      // Base state with two tools
      const state_0 = mind.create_state(ground, { tt: 1 })
      const hammer = state_0.add_belief_from_template({
        label: 'hammer',
        bases: ['Tool'],
        traits: { durability: 100 }
      })
      const anvil = state_0.add_belief_from_template({
        label: 'anvil',
        bases: ['Tool'],
        traits: { durability: 200 }
      })
      state_0.lock()

      // Branch A: hammer=red, anvil durability=190
      const state_a = state_0.branch(ground, 2)
      hammer.replace(state_a, { color: 'red' })
      anvil.replace(state_a, { durability: 190 })
      state_a.lock()

      // Branch B: hammer=blue, anvil durability=180
      const state_b = state_0.branch(ground, 2)
      hammer.replace(state_b, { color: 'blue' })
      anvil.replace(state_b, { durability: 180 })
      state_b.lock()

      // Create Convergence
      const conv = new Convergence(mind, ground, [state_a, state_b], { tt: 3 })
      conv.lock()

      // Before resolution: first-wins (state_a values)
      const hammer_in_conv = conv.get_belief_by_label('hammer')
      const anvil_in_conv = conv.get_belief_by_label('anvil')
      expect(hammer_in_conv.get_trait(conv, t_color)).to.equal('red')
      expect(anvil_in_conv.get_trait(conv, t_durability)).to.equal(190)

      // Branch and resolve to state_b
      const observed = conv.branch(ground, 4)
      conv.register_resolution(observed, state_b)
      observed.lock()

      // After resolution: ALL beliefs return state_b values
      expect(hammer.get_trait(observed, t_color)).to.equal('blue')
      expect(anvil.get_trait(observed, t_durability)).to.equal(180)
    })

    it('TL-2: resolution visible from descendants', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const t_color = Traittype.get_by_label('color')

      // Setup
      const state_0 = mind.create_state(ground, { tt: 1 })
      const tool = state_0.add_belief_from_template({
        label: 'tool',
        bases: ['Tool'],
        traits: { durability: 100 }
      })
      state_0.lock()

      // Branch A: red
      const state_a = state_0.branch(ground, 2)
      tool.replace(state_a, { color: 'red' })
      state_a.lock()

      // Branch B: blue
      const state_b = state_0.branch(ground, 2)
      tool.replace(state_b, { color: 'blue' })
      state_b.lock()

      // Convergence
      const conv = new Convergence(mind, ground, [state_a, state_b], { tt: 3 })
      conv.lock()

      // Resolve to state_b
      const observed = conv.branch(ground, 4)
      conv.register_resolution(observed, state_b)
      observed.lock()

      // Branch again from observed
      const child = observed.branch(ground, 5)

      // Query from child should see resolution (walks ancestry)
      expect(tool.get_trait(child, t_color)).to.equal('blue')
    })

    it('TL-3: unresolved Convergence uses first-wins behavior', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const t_color = Traittype.get_by_label('color')

      // Setup
      const state_0 = mind.create_state(ground, { tt: 1 })
      const tool = state_0.add_belief_from_template({
        label: 'tool',
        bases: ['Tool'],
        traits: { durability: 100 }
      })
      state_0.lock()

      const state_a = state_0.branch(ground, 2)
      tool.replace(state_a, { color: 'red' })
      state_a.lock()

      const state_b = state_0.branch(ground, 2)
      tool.replace(state_b, { color: 'blue' })
      state_b.lock()

      const conv = new Convergence(mind, ground, [state_a, state_b], { tt: 3 })
      conv.lock()

      // No resolution - queries use first-wins
      const tool_in_conv = conv.get_belief_by_label('tool')
      expect(tool_in_conv.get_trait(conv, t_color)).to.equal('red')

      // Different timeline without resolution also uses first-wins
      const other = conv.branch(ground, 4)
      // No conv.register_resolution() call
      expect(tool.get_trait(other, t_color)).to.equal('red')
    })

    it('TL-4: serialization round-trip preserves resolution', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()
      const t_color = Traittype.get_by_label('color')

      // Setup
      const state_0 = mind.create_state(ground, { tt: 1 })
      const tool = state_0.add_belief_from_template({
        label: 'tool',
        bases: ['Tool'],
        traits: { durability: 100 }
      })
      state_0.lock()

      const state_a = state_0.branch(ground, 2)
      tool.replace(state_a, { color: 'red' })
      state_a.lock()

      const state_b = state_0.branch(ground, 2)
      tool.replace(state_b, { color: 'blue' })
      state_b.lock()

      const conv = new Convergence(mind, ground, [state_a, state_b], { tt: 3 })
      conv.lock()

      const observed = conv.branch(ground, 4)
      conv.register_resolution(observed, state_b)
      observed.lock()

      // Save
      const json = save_mind(mind)
      const conv_id = conv._id
      const observed_id = observed._id
      const state_b_id = state_b._id

      // Reset and reload
      DB.reset_registries()
      setupStandardArchetypes()
      load(json)

      // Verify resolution persisted
      const loaded_conv = DB.get_state_by_id(conv_id)
      const loaded_observed = DB.get_state_by_id(observed_id)
      const resolution = loaded_conv.get_resolution(loaded_observed)
      expect(resolution._id).to.equal(state_b_id)

      // Verify resolution affects queries
      // Note: Must get fresh Traittype after reload since old instances are invalid
      const loaded_t_color = Traittype.get_by_label('color')
      const loaded_tool = loaded_observed.get_belief_by_label('tool')
      expect(loaded_tool.get_trait(loaded_observed, loaded_t_color)).to.equal('blue')
    })

    it('TL-5: register_resolution requires Convergence to be locked', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()

      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_belief_from_template({
        label: 'tool',
        bases: ['Tool'],
        traits: { durability: 100 }
      })
      state_0.lock()

      const state_a = state_0.branch(ground, 2)
      state_a.lock()

      const state_b = state_0.branch(ground, 2)
      state_b.lock()

      // Create Convergence but don't lock it
      const conv = new Convergence(mind, ground, [state_a, state_b], { tt: 3 })
      // NOT locked

      expect(() => conv.register_resolution(conv, state_b)).to.throw(/locked/)
    })

    it('TL-6: register_resolution validates branch is in component_states', () => {
      const mind = new Materia(logos(), 'player')
      const ground = logos_state()

      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_belief_from_template({
        label: 'tool',
        bases: ['Tool'],
        traits: { durability: 100 }
      })
      state_0.lock()

      const state_a = state_0.branch(ground, 2)
      state_a.lock()

      const state_b = state_0.branch(ground, 2)
      state_b.lock()

      const unrelated = state_0.branch(ground, 3)
      unrelated.lock()

      const conv = new Convergence(mind, ground, [state_a, state_b], { tt: 4 })
      conv.lock()

      const observed = conv.branch(ground, 5)

      // Try to resolve to unrelated state
      expect(() => conv.register_resolution(observed, unrelated)).to.throw(/component_states/)
    })
  })

  describe('Timeline Resolution edge cases', () => {
    it('TL-7: belief created AFTER resolution is found from descendant states', () => {
      // setupStandardArchetypes already called in beforeEach
      const { mind, ground, state_a, state_b, hammer, conv } = createConvergenceFixture()

      // Resolve to state_b
      const resolved = conv.branch(ground, 4)
      conv.register_resolution(resolved, state_b)

      // Create new belief AFTER resolution
      resolved.add_beliefs_from_template({
        new_tool: {
          bases: ['Thing'],
          traits: {}
        }
      })
      resolved.lock()

      // New belief should be findable from resolved state
      const new_tool = resolved.get_belief_by_label('new_tool')
      expect(new_tool).to.exist

      // Branch from resolved state (like tick())
      const child = resolved.branch(ground, 5)

      // New belief should STILL be findable from child state
      const new_tool_from_child = child.get_belief_by_subject(new_tool.subject)
      expect(new_tool_from_child).to.equal(new_tool)
    })

    it('TL-8: belief from resolved branch found after tick()', () => {
      const { mind, ground, state_a, state_b, hammer, t_color, conv } = createConvergenceFixture()

      // Resolve to state_b (blue hammer)
      const resolved = conv.branch(ground, 4)
      conv.register_resolution(resolved, state_b)
      resolved.lock()

      // Branch (like tick())
      const child = resolved.branch(ground, 5)

      // Hammer from resolved branch should be findable
      const hammer_from_child = child.get_belief_by_subject(hammer.subject)
      expect(hammer_from_child).to.exist
      expect(hammer_from_child.get_trait(child, t_color)).to.equal('blue')
    })

    it('TL-9: get_beliefs() returns correct beliefs after resolution', () => {
      // Create custom fixture with anvil in state_b
      const mind = Materia.create_world('test')
      const ground = logos_state()

      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: { color: 'gray' } }
      })
      const hammer = state_0.get_belief_by_label('hammer')
      state_0.lock()

      // State A: just red hammer
      const state_a = state_0.branch(ground, 2)
      hammer.replace(state_a, { color: 'red' })
      state_a.lock()

      // State B: blue hammer PLUS anvil
      const state_b = state_0.branch(ground, 2)
      hammer.replace(state_b, { color: 'blue' })
      state_b.add_beliefs_from_template({
        anvil: { bases: ['ObjectPhysical'], traits: { color: 'black' } }
      })
      state_b.lock()

      // Convergence
      const conv = new Convergence(mind, ground, [state_a, state_b], { tt: 3 })
      conv.lock()

      const resolved = conv.branch(ground, 4)
      conv.register_resolution(resolved, state_b)
      resolved.lock()

      // Get all beliefs - should include both hammer and anvil from state_b
      const beliefs = [...resolved.get_beliefs()]
      const labels = beliefs.map(b => b.get_label()).filter(l => l)

      expect(labels).to.include('hammer')
      expect(labels).to.include('anvil')
    })

    it('TL-10: unresolved Convergence still accessible from descendant', () => {
      const { mind, ground, state_a, conv, hammer, t_color } = createConvergenceFixture()

      // Don't resolve - just branch
      const child = conv.branch(ground, 4)

      // Should use first-wins (state_a = red)
      const hammer_from_child = child.get_belief_by_subject(hammer.subject)
      expect(hammer_from_child).to.exist
      expect(hammer_from_child.get_trait(child, t_color)).to.equal('red')
    })
  })
})

/**
 * Create a standard Convergence fixture for testing
 * Uses ObjectPhysical which has the 'color' trait slot
 */
function createConvergenceFixture() {
  const mind = Materia.create_world('test')
  const ground = logos_state()

  const state_0 = mind.create_state(ground, { tt: 1 })
  state_0.add_beliefs_from_template({
    hammer: { bases: ['ObjectPhysical'], traits: { color: 'gray' } }
  })
  const hammer = state_0.get_belief_by_label('hammer')
  state_0.lock()

  // State A: red hammer
  const state_a = state_0.branch(ground, 2)
  hammer.replace(state_a, { color: 'red' })
  state_a.lock()

  // State B: blue hammer
  const state_b = state_0.branch(ground, 2)
  hammer.replace(state_b, { color: 'blue' })
  state_b.lock()

  // Convergence
  const conv = new Convergence(mind, ground, [state_a, state_b], { tt: 3 })
  conv.lock()

  const t_color = Traittype.get_by_label('color')

  return { mind, ground, state_0, state_a, state_b, hammer, t_color, conv }
}

describe('Timeline Resolution - Extended Permutations', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()
  })
  setupAfterEachValidation()

  describe('Query Methods with Resolution', () => {
    it('TL-11: rev_trait respects timeline resolution', () => {
      // Setup: location trait references workshop
      // Hammer in state_a is at workshop, hammer in state_b is at tavern
      // rev_trait should only find hammer from resolved branch
      const mind = Materia.create_world('test')
      const ground = logos_state()
      const t_location = Traittype.get_by_label('location')

      // Create locations
      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_beliefs_from_template({
        workshop: { bases: ['Location'], traits: {} },
        tavern: { bases: ['Location'], traits: {} },
        hammer: { bases: ['ObjectPhysical'], traits: {} }
      })
      const workshop = state_0.get_belief_by_label('workshop')
      const tavern = state_0.get_belief_by_label('tavern')
      const hammer = state_0.get_belief_by_label('hammer')
      state_0.lock()

      // State A: hammer at workshop
      const state_a = state_0.branch(ground, 2)
      hammer.replace(state_a, { location: workshop.subject })
      state_a.lock()

      // State B: hammer at tavern
      const state_b = state_0.branch(ground, 2)
      hammer.replace(state_b, { location: tavern.subject })
      state_b.lock()

      // Convergence
      const conv = new Convergence(mind, ground, [state_a, state_b], { tt: 3 })
      conv.lock()

      // Before resolution: first-wins (workshop from state_a)
      const items_at_workshop_before = [...workshop.rev_trait(conv, t_location)]
      expect(items_at_workshop_before.map(b => b.get_label())).to.include('hammer')

      // Resolve to state_b (hammer at tavern)
      const resolved = conv.branch(ground, 4)
      conv.register_resolution(resolved, state_b)
      resolved.lock()

      // After resolution: hammer should NOT be at workshop
      const items_at_workshop_after = [...workshop.rev_trait(resolved, t_location)]
      expect(items_at_workshop_after.map(b => b.get_label())).to.not.include('hammer')

      // Hammer should be at tavern
      const items_at_tavern = [...tavern.rev_trait(resolved, t_location)]
      expect(items_at_tavern.map(b => b.get_label())).to.include('hammer')
    })

    it('TL-12: resolve to first branch (state_a) works correctly', () => {
      // Most tests resolve to state_b - verify state_a works too
      const { mind, ground, state_a, state_b, hammer, t_color, conv } = createConvergenceFixture()

      // Resolve to state_a (red hammer) instead of state_b
      const resolved = conv.branch(ground, 4)
      conv.register_resolution(resolved, state_a)
      resolved.lock()

      // Should get red (from state_a)
      expect(hammer.get_trait(resolved, t_color)).to.equal('red')

      // Verify first-wins before resolution was also red
      const hammer_in_conv = conv.get_belief_by_label('hammer')
      expect(hammer_in_conv.get_trait(conv, t_color)).to.equal('red')
    })

    it('TL-13: multiple timelines with different resolutions', () => {
      const { mind, ground, state_a, state_b, hammer, t_color, conv } = createConvergenceFixture()

      // First timeline resolves to state_a (red)
      const timeline_1 = conv.branch(ground, 4)
      conv.register_resolution(timeline_1, state_a)
      timeline_1.lock()

      // Second timeline resolves to state_b (blue)
      const timeline_2 = conv.branch(ground, 4)
      conv.register_resolution(timeline_2, state_b)
      timeline_2.lock()

      // Each timeline should see its own resolution
      expect(hammer.get_trait(timeline_1, t_color)).to.equal('red')
      expect(hammer.get_trait(timeline_2, t_color)).to.equal('blue')

      // Descendants of each timeline should see correct resolution
      const child_1 = timeline_1.branch(ground, 5)
      const child_2 = timeline_2.branch(ground, 5)

      expect(hammer.get_trait(child_1, t_color)).to.equal('red')
      expect(hammer.get_trait(child_2, t_color)).to.equal('blue')
    })
  })

  describe('Nested Structures with Resolution', () => {
    it('TL-14: nested Convergence with resolution on outer', () => {
      // Inner Convergence: state_a1, state_a2 (variations of "A")
      // Outer Convergence: [inner_conv], state_b
      // Resolution on outer should select between inner_conv vs state_b

      const mind = Materia.create_world('test')
      const ground = logos_state()
      const t_color = Traittype.get_by_label('color')

      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: { color: 'gray' } }
      })
      const hammer = state_0.get_belief_by_label('hammer')
      state_0.lock()

      // Inner branches (variations of red)
      const state_a1 = state_0.branch(ground, 2)
      hammer.replace(state_a1, { color: 'dark_red' })
      state_a1.lock()

      const state_a2 = state_0.branch(ground, 2)
      hammer.replace(state_a2, { color: 'light_red' })
      state_a2.lock()

      // Inner Convergence
      const inner_conv = new Convergence(mind, ground, [state_a1, state_a2], { tt: 3 })
      inner_conv.lock()

      // Outer branch: blue (diverges from state_0, not from inner_conv)
      const state_b = state_0.branch(ground, 3)
      hammer.replace(state_b, { color: 'blue' })
      state_b.lock()

      // Outer Convergence
      const outer_conv = new Convergence(mind, ground, [inner_conv, state_b], { tt: 4 })
      outer_conv.lock()

      // Before resolution: first-wins walks into inner_conv (which has no resolution)
      // inner_conv first-wins gets state_a1's dark_red
      const hammer_in_outer = outer_conv.get_belief_by_label('hammer')
      expect(hammer_in_outer.get_trait(outer_conv, t_color)).to.equal('dark_red')

      // Resolve outer to state_b
      const resolved = outer_conv.branch(ground, 5)
      outer_conv.register_resolution(resolved, state_b)
      resolved.lock()

      // After resolution: should get blue from state_b
      expect(hammer.get_trait(resolved, t_color)).to.equal('blue')
    })

    it('TL-15: Subject-typed traits found from resolved branch', () => {
      // ObjectPhysical has location (Subject-typed trait)
      // state_a: hammer at workshop
      // state_b: hammer at tavern
      // Resolution should return correct location

      const mind = Materia.create_world('test')
      const ground = logos_state()
      const t_location = Traittype.get_by_label('location')
      const t_color = Traittype.get_by_label('color')

      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_beliefs_from_template({
        hammer: { bases: ['ObjectPhysical'], traits: { color: 'gray' } },
        workshop: { bases: ['Location'], traits: {} },
        tavern: { bases: ['Location'], traits: {} }
      })
      const hammer = state_0.get_belief_by_label('hammer')
      const workshop = state_0.get_belief_by_label('workshop')
      const tavern = state_0.get_belief_by_label('tavern')
      state_0.lock()

      // State A: hammer at workshop
      const state_a = state_0.branch(ground, 2)
      hammer.replace(state_a, { location: workshop.subject })
      state_a.lock()

      // State B: hammer at tavern
      const state_b = state_0.branch(ground, 2)
      hammer.replace(state_b, { location: tavern.subject })
      state_b.lock()

      // Convergence
      const conv = new Convergence(mind, ground, [state_a, state_b], { tt: 3 })
      conv.lock()

      // Resolve to state_b
      const resolved = conv.branch(ground, 4)
      conv.register_resolution(resolved, state_b)
      resolved.lock()

      // Get hammer's location - should be tavern from state_b
      const location_subject = hammer.get_trait(resolved, t_location)
      expect(location_subject).to.equal(tavern.subject)

      // Resolve location and verify it's accessible
      const location_belief = location_subject.get_belief_by_state(resolved)
      expect(location_belief.get_label()).to.equal('tavern')
    })
  })

  describe('Resolution with Promotions', () => {
    it('TL-16: resolution + probability promotions in branch', () => {
      // One branch has a promotable belief with probability alternatives
      // Resolution should select that branch, and promotions should work

      const shared_mind = new Materia(eidos(), 'shared')
      const shared_state = shared_mind.create_state(eidos().origin_state, { tt: 1 })
      const t_color = Traittype.get_by_label('color')

      // Create promotable belief with probability
      const proto = Belief.from_template(shared_state, {
        bases: ['Tool'],
        label: 'fuzzy_tool',
        promotable: true
      })
      proto.replace(shared_state, { color: 'red' }, { promote: true, certainty: 0.6 })
      proto.replace(shared_state, { color: 'blue' }, { promote: true, certainty: 0.4 })
      shared_state.lock()

      // World mind
      const world_mind = Materia.create_world('world')
      const ground = logos_state()

      const state_0 = world_mind.create_state(ground, { tt: 1 })
      // Create belief that inherits from fuzzy prototype
      const tool = Belief.from(state_0, [proto])
      tool.label = 'tool'
      DB.register_label('tool', tool.subject.sid)
      state_0.lock()

      // State A: no changes (inherits fuzzy color)
      const state_a = state_0.branch(ground, 2)
      state_a.lock()

      // State B: override with concrete color
      const state_b = state_0.branch(ground, 2)
      tool.replace(state_b, { color: 'green' })
      state_b.lock()

      // Convergence
      const conv = new Convergence(world_mind, ground, [state_a, state_b], { tt: 3 })
      conv.lock()

      // Before resolution: first-wins (state_a) returns Fuzzy
      const tool_in_conv = conv.get_belief_by_label('tool')
      const before = tool_in_conv.get_trait(conv, t_color)
      expect(before).to.be.instanceOf(Fuzzy)

      // Resolve to state_b (concrete green)
      const resolved = conv.branch(ground, 4)
      conv.register_resolution(resolved, state_b)
      resolved.lock()

      // After resolution: should get concrete green
      const after = tool.get_trait(resolved, t_color)
      expect(after).to.equal('green')
    })
  })

  describe('Resolution with Composables', () => {
    beforeEach(() => {
      // Register composable inventory trait and Container archetype
      DB.register(
        {
          inventory: {
            type: 'Thing',
            container: Array,
            composable: true
          }
        },
        {
          Container: {
            bases: ['Thing'],
            traits: { inventory: null }
          }
        },
        {}
      )
    })

    it('TL-17: composable arrays from resolved branch only', () => {
      // Composable arrays merge within a belief's base chain, not across Convergence branches
      // First-wins selects which branch's box belief to use, then composable merges within that belief
      const inventory_tt = Traittype.get_by_label('inventory')

      const mind = Materia.create_world('test')
      const ground = logos_state()

      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_beliefs_from_template({
        box: { bases: ['Container'], traits: {} },
        sword: { bases: ['ObjectPhysical'], traits: {} },
        shield: { bases: ['ObjectPhysical'], traits: {} }
      })
      const box = state_0.get_belief_by_label('box')
      const sword = state_0.get_belief_by_label('sword')
      const shield = state_0.get_belief_by_label('shield')
      state_0.lock()

      // State A: box contains sword
      const state_a = state_0.branch(ground, 2)
      box.replace(state_a, { inventory: [sword.subject] })
      state_a.lock()

      // State B: box contains shield
      const state_b = state_0.branch(ground, 2)
      box.replace(state_b, { inventory: [shield.subject] })
      state_b.lock()

      // Convergence
      const conv = new Convergence(mind, ground, [state_a, state_b], { tt: 3 })
      conv.lock()

      // Before resolution: first-wins gets state_a's box (with sword)
      const box_in_conv = conv.get_belief_by_label('box')
      const before = box_in_conv.get_trait(conv, inventory_tt)
      expect(before).to.have.lengthOf(1)
      expect(before[0]).to.equal(sword.subject)

      // Resolve to state_b (shield)
      const resolved = conv.branch(ground, 4)
      conv.register_resolution(resolved, state_b)
      resolved.lock()

      // After resolution: should get state_b's box (with shield)
      const after = box.get_trait(resolved, inventory_tt)
      expect(after).to.have.lengthOf(1)
      expect(after[0]).to.equal(shield.subject)
    })

    it('TL-18: rev_trait on composable with resolution', () => {
      // Test rev_trait lookup on composable array trait respects resolution

      const inventory_tt = Traittype.get_by_label('inventory')

      const mind = Materia.create_world('test')
      const ground = logos_state()

      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_beliefs_from_template({
        box: { bases: ['Container'], traits: {} },
        sword: { bases: ['ObjectPhysical'], traits: {} },
        shield: { bases: ['ObjectPhysical'], traits: {} }
      })
      const box = state_0.get_belief_by_label('box')
      const sword = state_0.get_belief_by_label('sword')
      const shield = state_0.get_belief_by_label('shield')
      state_0.lock()

      // State A: box contains sword
      const state_a = state_0.branch(ground, 2)
      box.replace(state_a, { inventory: [sword.subject] })
      state_a.lock()

      // State B: box contains shield
      const state_b = state_0.branch(ground, 2)
      box.replace(state_b, { inventory: [shield.subject] })
      state_b.lock()

      // Convergence
      const conv = new Convergence(mind, ground, [state_a, state_b], { tt: 3 })
      conv.lock()

      // Before resolution: sword and shield are both in some box
      const sword_containers_before = [...sword.rev_trait(conv, inventory_tt)]
      expect(sword_containers_before.map(b => b.get_label())).to.include('box')

      // Resolve to state_b
      const resolved = conv.branch(ground, 4)
      conv.register_resolution(resolved, state_b)
      resolved.lock()

      // After resolution: sword should NOT be in box anymore
      const sword_containers_after = [...sword.rev_trait(resolved, inventory_tt)]
      expect(sword_containers_after.map(b => b.get_label())).to.not.include('box')

      // Shield should be in box
      const shield_containers = [...shield.rev_trait(resolved, inventory_tt)]
      expect(shield_containers.map(b => b.get_label())).to.include('box')
    })
  })

  describe('Edge Cases', () => {
    it('TL-19: resolution visible from deeply nested descendant', () => {
      const { mind, ground, state_b, hammer, t_color, conv } = createConvergenceFixture()

      // Resolve to state_b
      const resolved = conv.branch(ground, 4)
      conv.register_resolution(resolved, state_b)
      resolved.lock()

      // Create deep chain of descendants
      let current = resolved
      for (let i = 5; i <= 10; i++) {
        current = current.branch(ground, i)
        current.lock()
      }

      // Query from deep descendant should still find resolution
      expect(hammer.get_trait(current, t_color)).to.equal('blue')
    })

    it('TL-20: get_beliefs iteration from resolved Convergence descendant', () => {
      // Verify all beliefs from get_beliefs() come from resolved branch
      const mind = Materia.create_world('test')
      const ground = logos_state()

      const state_0 = mind.create_state(ground, { tt: 1 })
      state_0.add_beliefs_from_template({
        common: { bases: ['ObjectPhysical'], traits: { color: 'gray' } }
      })
      state_0.lock()

      // State A: has item_a, no item_b
      const state_a = state_0.branch(ground, 2)
      state_a.add_beliefs_from_template({
        item_a: { bases: ['ObjectPhysical'], traits: { color: 'red' } }
      })
      state_a.lock()

      // State B: has item_b, no item_a
      const state_b = state_0.branch(ground, 2)
      state_b.add_beliefs_from_template({
        item_b: { bases: ['ObjectPhysical'], traits: { color: 'blue' } }
      })
      state_b.lock()

      // Convergence
      const conv = new Convergence(mind, ground, [state_a, state_b], { tt: 3 })
      conv.lock()

      // Resolve to state_b
      const resolved = conv.branch(ground, 4)
      conv.register_resolution(resolved, state_b)
      resolved.lock()

      // get_beliefs should return: common, item_b (NOT item_a)
      const beliefs = [...resolved.get_beliefs()]
      const labels = beliefs.map(b => b.get_label()).filter(l => l)

      expect(labels).to.include('common')
      expect(labels).to.include('item_b')
      expect(labels).to.not.include('item_a')
    })
  })
})
