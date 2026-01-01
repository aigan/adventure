import { expect } from 'chai'
import { Fuzzy, Traittype, Materia, Belief, eidos, unknown, _reset_unknown, deserialize_reference, save_mind, load, DB } from '../public/worker/cosmos.mjs'
import { createStateInNewMind, setupStandardArchetypes, saveAndReload, setupAfterEachValidation } from './helpers.mjs'

describe('Fuzzy', () => {
  beforeEach(() => {
    _reset_unknown()
  })

  describe('construction', () => {
    it('creates Fuzzy with empty alternatives', () => {
      const f = new Fuzzy()
      expect(f.alternatives).to.deep.equal([])
      expect(f.is_unknown).to.be.true
    })

    it('creates Fuzzy with alternatives', () => {
      const f = new Fuzzy({
        alternatives: [
          { value: 'north', certainty: 0.6 },
          { value: 'east', certainty: 0.4 }
        ]
      })
      expect(f.alternatives).to.have.length(2)
      expect(f.is_unknown).to.be.false
    })

    it('freezes alternatives array', () => {
      const f = new Fuzzy({
        alternatives: [{ value: 'north', certainty: 1 }]
      })
      expect(Object.isFrozen(f.alternatives)).to.be.true
    })

    it('freezes instance', () => {
      const f = new Fuzzy()
      expect(Object.isFrozen(f)).to.be.true
    })
  })

  describe('unknown() singleton', () => {
    it('returns same instance on multiple calls', () => {
      const a = unknown()
      const b = unknown()
      expect(a).to.equal(b)
    })

    it('is a Fuzzy instance', () => {
      expect(unknown()).to.be.instanceOf(Fuzzy)
    })

    it('has empty alternatives', () => {
      expect(unknown().alternatives).to.deep.equal([])
    })

    it('is_unknown is true', () => {
      expect(unknown().is_unknown).to.be.true
    })

    it('resets with _reset_unknown', () => {
      const a = unknown()
      _reset_unknown()
      const b = unknown()
      expect(a).to.not.equal(b)
    })
  })

  describe('toJSON', () => {
    it('serializes unknown()', () => {
      const json = unknown().toJSON()
      expect(json).to.deep.equal({
        _type: 'Fuzzy',
        alternatives: []
      })
    })

    it('serializes Fuzzy with alternatives', () => {
      const f = new Fuzzy({
        alternatives: [
          { value: 'north', certainty: 0.6 },
          { value: 'east', certainty: 0.4 }
        ]
      })
      const json = f.toJSON()
      expect(json._type).to.equal('Fuzzy')
      expect(json.alternatives).to.have.length(2)
      expect(json.alternatives[0]).to.deep.equal({ value: 'north', certainty: 0.6 })
    })
  })

  describe('to_inspect_view', () => {
    it('returns unknown marker for unknown()', () => {
      const view = unknown().to_inspect_view(null)
      expect(view).to.deep.equal({
        _type: 'Fuzzy',
        unknown: true
      })
    })

    it('converts alternatives with primitive values', () => {
      const f = new Fuzzy({
        alternatives: [
          { value: 'north', certainty: 0.6 },
          { value: 'east', certainty: 0.4 }
        ]
      })
      const view = f.to_inspect_view(null)
      expect(view._type).to.equal('Fuzzy')
      expect(view.alternatives).to.deep.equal([
        { value: 'north', certainty: 0.6 },
        { value: 'east', certainty: 0.4 }
      ])
    })

    it('calls to_inspect_view on nested values', () => {
      const nested = {
        to_inspect_view: () => ({ _type: 'Subject', sid: 42 })
      }
      const f = new Fuzzy({
        alternatives: [{ value: nested, certainty: 1.0 }]
      })
      const view = f.to_inspect_view(null)
      expect(view.alternatives[0].value).to.deep.equal({ _type: 'Subject', sid: 42 })
    })
  })

  describe('sysdesig', () => {
    it('returns unknown() for singleton', () => {
      expect(unknown().sysdesig()).to.equal('unknown()')
    })

    it('returns Fuzzy[n] for alternatives', () => {
      const f = new Fuzzy({
        alternatives: [
          { value: 'a', certainty: 0.5 },
          { value: 'b', certainty: 0.5 }
        ]
      })
      expect(f.sysdesig()).to.equal('Fuzzy[2]')
    })
  })

  describe('is_certain static method', () => {
    it('returns false for Fuzzy instance', () => {
      expect(Fuzzy.is_certain(null, unknown())).to.be.false
      expect(Fuzzy.is_certain(null, new Fuzzy({ alternatives: [] }))).to.be.false
    })

    it('returns true for non-Fuzzy values', () => {
      expect(Fuzzy.is_certain(null, 'hello')).to.be.true
      expect(Fuzzy.is_certain(null, 42)).to.be.true
      expect(Fuzzy.is_certain(null, null)).to.be.true
      expect(Fuzzy.is_certain(null, {})).to.be.true
    })
  })

  describe('serialization round-trip', () => {
    it('deserializes unknown() to singleton', () => {
      const json = { _type: 'Fuzzy', alternatives: [] }
      const result = deserialize_reference(json)
      expect(result).to.equal(unknown())
    })

    it('deserializes unknown marker to singleton', () => {
      const json = { _type: 'Fuzzy', unknown: true }
      const result = deserialize_reference(json)
      expect(result).to.equal(unknown())
    })

    it('deserializes Fuzzy with alternatives', () => {
      const json = {
        _type: 'Fuzzy',
        alternatives: [
          { value: 'north', certainty: 0.6 },
          { value: 'east', certainty: 0.4 }
        ]
      }
      const result = deserialize_reference(json)
      expect(result).to.be.instanceOf(Fuzzy)
      expect(result).to.not.equal(unknown())
      expect(result.alternatives).to.have.length(2)
      expect(result.alternatives[0]).to.deep.equal({ value: 'north', certainty: 0.6 })
    })

    it('round-trips unknown()', () => {
      const original = unknown()
      const json = original.toJSON()
      const restored = deserialize_reference(json)
      expect(restored).to.equal(unknown())
      expect(restored.is_unknown).to.be.true
    })

    it('round-trips Fuzzy with alternatives', () => {
      const original = new Fuzzy({
        alternatives: [
          { value: 42, certainty: 0.7 },
          { value: 13, certainty: 0.3 }
        ]
      })
      const json = original.toJSON()
      const restored = deserialize_reference(json)
      expect(restored).to.be.instanceOf(Fuzzy)
      expect(restored.is_unknown).to.be.false
      expect(restored.alternatives).to.deep.equal(original.alternatives)
    })
  })

  describe('save/load with cosmos', () => {
    beforeEach(() => {
      DB.reset_registries()
      setupStandardArchetypes()
    })
    setupAfterEachValidation()

    it('Fuzzy from promotions persists after save/load', () => {
      // Promotions are for inheritance - a belief that inherits from a belief
      // with promotions gets Fuzzy when resolving traits through the promotions
      // Promotions can only be in Eidos hierarchy
      const shared_mind = new Materia(eidos(), 'shared')
      const shared_state = shared_mind.create_state(eidos().origin_state, {tt: 1})

      // Create shared belief (like cultural knowledge in eidos)
      const ball_type = Belief.from_template(shared_state, {
        bases: ['PortableObject'],
        traits: {},
        label: 'ball_type',
        promotable: true
      })

      // Add promotions (ball_type gets removed, promotions become visible)
      ball_type.replace(shared_state, { color: 'red' }, { promote: true, certainty: 0.6 })
      ball_type.replace(shared_state, { color: 'blue' }, { promote: true, certainty: 0.4 })

      // Create particular that inherits from the shared belief
      const my_ball = Belief.from_template(shared_state, {
        bases: [ball_type],  // Inherits from the belief with promotions
        traits: {},
        label: 'my_ball'
      })

      shared_state.lock()

      // Before save: inheriting belief gets Fuzzy through base's promotions
      const color_tt = Traittype.get_by_label('color')
      const color_before = my_ball.get_trait(shared_state, color_tt)
      expect(color_before).to.be.instanceOf(Fuzzy)
      expect(color_before.alternatives).to.have.lengthOf(2)

      // Save and reload
      const loaded_mind = saveAndReload(shared_mind, setupStandardArchetypes)
      const loaded_state = [...loaded_mind._states][0]
      const loaded_my_ball = loaded_state.get_belief_by_label('my_ball')

      // After load: should still get Fuzzy through inheritance
      const loaded_color_tt = Traittype.get_by_label('color')
      const color_after = loaded_my_ball.get_trait(loaded_state, loaded_color_tt)
      expect(color_after).to.be.instanceOf(Fuzzy)
      expect(color_after.alternatives).to.have.lengthOf(2)
    })

    it('archetype traits not affected by promotions after save/load', () => {
      // Register additional archetypes for this test
      DB.register({
        size: { type: 'string', values: ['small', 'medium', 'large'], exposure: 'visual' }
      }, {
        SizedObject: { bases: ['ObjectPhysical'], traits: { size: 'medium' } }
      }, {})

      // Promotions can only be in Eidos hierarchy
      const shared_mind = new Materia(eidos(), 'shared')
      const shared_state = shared_mind.create_state(eidos().origin_state, {tt: 1})

      // Create shared belief with promotions on one trait
      const sized_thing = Belief.from_template(shared_state, {
        bases: ['SizedObject'],
        traits: {},
        label: 'sized_thing',
        promotable: true
      })

      // Add TWO promotions for color (size comes from archetype)
      sized_thing.replace(shared_state, { color: 'red' }, { promote: true, certainty: 0.6 })
      sized_thing.replace(shared_state, { color: 'blue' }, { promote: true, certainty: 0.4 })

      // Create particular inheriting from sized_thing
      const my_thing = Belief.from_template(shared_state, {
        bases: [sized_thing],
        traits: {},
        label: 'my_thing'
      })

      shared_state.lock()

      // Save and reload
      function setupWithSizedObject() {
        setupStandardArchetypes()
        DB.register({
          size: { type: 'string', values: ['small', 'medium', 'large'], exposure: 'visual' }
        }, {
          SizedObject: { bases: ['ObjectPhysical'], traits: { size: 'medium' } }
        }, {})
      }

      const loaded_mind = saveAndReload(shared_mind, setupWithSizedObject)
      const loaded_state = [...loaded_mind._states][0]
      const loaded_my_thing = loaded_state.get_belief_by_label('my_thing')

      // Size from archetype should NOT be Fuzzy
      const loaded_size_tt = Traittype.get_by_label('size')
      const size = loaded_my_thing.get_trait(loaded_state, loaded_size_tt)
      expect(size).to.equal('medium')
      expect(size).to.not.be.instanceOf(Fuzzy)
    })

    it('explicit Fuzzy trait value persists after save/load', () => {
      const state = createStateInNewMind('world')

      // Create belief with explicit Fuzzy trait
      state.add_belief_from_template({
        bases: ['PortableObject'],
        traits: {
          color: new Fuzzy({
            alternatives: [
              { value: 'red', certainty: 0.6 },
              { value: 'blue', certainty: 0.4 }
            ]
          })
        },
        label: 'fuzzy_ball'
      })

      state.lock()

      // Save and reload
      const loaded_mind = saveAndReload(state.in_mind, setupStandardArchetypes)
      const loaded_state = [...loaded_mind._states][0]
      const loaded_ball = loaded_state.get_belief_by_label('fuzzy_ball')

      // Verify Fuzzy trait preserved
      const color_tt = Traittype.get_by_label('color')
      const color = loaded_ball.get_trait(loaded_state, color_tt)
      expect(color).to.be.instanceOf(Fuzzy)
      expect(color.alternatives).to.have.length(2)
      expect(color.alternatives[0]).to.deep.equal({ value: 'red', certainty: 0.6 })
    })

    it('unknown() trait value persists after save/load', () => {
      const state = createStateInNewMind('world')

      // Create belief with unknown() trait
      state.add_belief_from_template({
        bases: ['PortableObject'],
        traits: { color: unknown() },
        label: 'mystery_ball'
      })

      state.lock()

      // Save and reload
      const loaded_mind = saveAndReload(state.in_mind, setupStandardArchetypes)
      const loaded_state = [...loaded_mind._states][0]
      const loaded_ball = loaded_state.get_belief_by_label('mystery_ball')

      // Verify unknown() preserved as singleton
      const color_tt = Traittype.get_by_label('color')
      const color = loaded_ball.get_trait(loaded_state, color_tt)
      expect(color).to.be.instanceOf(Fuzzy)
      expect(color.is_unknown).to.be.true
      expect(color).to.equal(unknown())
    })
  })
})
