import { expect } from 'chai'
import * as DB from '../public/worker/db.mjs'
import { setupStandardArchetypes, createStateInNewMind } from './helpers.mjs'
import { Belief, Traittype, Materia } from '../public/worker/cosmos.mjs'

describe('Trait Value Validation', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()
  })

  describe('Primitive types (literal_handler)', () => {
    it('accepts valid string', () => {
      const state = createStateInNewMind()
      const entity = Belief.from_template(state, {bases: ['PortableObject']})
      const color_tt = Traittype.get_by_label('color')

      // Should not throw
      entity.add_trait(color_tt, 'red')
      expect(entity.get_trait(state, color_tt)).to.equal('red')
    })

    it('rejects number when string expected', () => {
      const state = createStateInNewMind()
      const entity = Belief.from_template(state, {bases: ['PortableObject']})
      const color_tt = Traittype.get_by_label('color')

      expect(() => entity.add_trait(color_tt, 42))
        .to.throw(/Expected string for trait 'color', got number/)
    })

    it('rejects invalid enum value', () => {
      const state = createStateInNewMind()
      const entity = Belief.from_template(state, {bases: ['ObjectPhysical']})
      const form_tt = Traittype.get_by_label('@form')

      expect(() => entity.add_trait(form_tt, 'plasma'))
        .to.throw(/Invalid value 'plasma' for trait '@form'. Must be one of:/)
    })

    it('allows null for any type', () => {
      const state = createStateInNewMind()
      const entity = Belief.from_template(state, {bases: ['PortableObject']})
      const color_tt = Traittype.get_by_label('color')

      // null is always valid (shadowing)
      entity.add_trait(color_tt, null)
      expect(entity.get_trait(state, color_tt)).to.equal(null)
    })

    it('accepts valid number', () => {
      const state = createStateInNewMind()
      const entity = Belief.from_template(state, {bases: ['PortableObject']})
      const weight_tt = Traittype.get_by_label('weight')

      entity.add_trait(weight_tt, 5.5)
      expect(entity.get_trait(state, weight_tt)).to.equal(5.5)
    })

    it('rejects string when number expected', () => {
      const state = createStateInNewMind()
      const entity = Belief.from_template(state, {bases: ['PortableObject']})
      const weight_tt = Traittype.get_by_label('weight')

      expect(() => entity.add_trait(weight_tt, 'heavy'))
        .to.throw(/Expected number for trait 'weight', got string/)
    })
  })

  describe('Subject references', () => {
    it('accepts Subject instance', () => {
      const state = createStateInNewMind()
      const workshop = Belief.from_template(state, {bases: ['Location']})
      const hammer = Belief.from_template(state, {bases: ['PortableObject']})
      const location_tt = Traittype.get_by_label('location')

      // Should not throw
      hammer.add_trait(location_tt, workshop.subject)
      expect(hammer.get_trait(state, location_tt)).to.equal(workshop.subject)
    })

    it('rejects string when Subject expected', () => {
      const state = createStateInNewMind()
      const hammer = Belief.from_template(state, {bases: ['PortableObject']})
      const location_tt = Traittype.get_by_label('location')

      expect(() => hammer.add_trait(location_tt, 'workshop'))
        .to.throw(/Expected Subject instance for trait 'location', got string/)
    })

    it('rejects number when Subject expected', () => {
      const state = createStateInNewMind()
      const hammer = Belief.from_template(state, {bases: ['PortableObject']})
      const location_tt = Traittype.get_by_label('location')

      expect(() => hammer.add_trait(location_tt, 123))
        .to.throw(/Expected Subject instance for trait 'location', got number/)
    })

    it('rejects object when Subject expected', () => {
      const state = createStateInNewMind()
      const hammer = Belief.from_template(state, {bases: ['PortableObject']})
      const location_tt = Traittype.get_by_label('location')

      expect(() => hammer.add_trait(location_tt, { foo: 'bar' }))
        .to.throw(/Expected Subject instance for trait 'location', got Object/)
    })
  })

  describe('Mind type', () => {
    it('accepts Mind instance', () => {
      const state = createStateInNewMind()
      const npc = Belief.from_template(state, {bases: ['Person']})
      const npc_mind = new Materia(state.in_mind, 'npc')
      const mind_tt = Traittype.get_by_label('mind')

      // Should not throw
      npc.add_trait(mind_tt, npc_mind)
      expect(npc.get_trait(state, mind_tt)).to.equal(npc_mind)
    })

    it('rejects string when Mind expected', () => {
      const state = createStateInNewMind()
      const npc = Belief.from_template(state, {bases: ['Person']})
      const mind_tt = Traittype.get_by_label('mind')

      expect(() => npc.add_trait(mind_tt, 'npc_mind'))
        .to.throw(/Expected Mind instance for trait 'mind', got string/)
    })

    it('rejects number when Mind expected', () => {
      const state = createStateInNewMind()
      const npc = Belief.from_template(state, {bases: ['Person']})
      const mind_tt = Traittype.get_by_label('mind')

      expect(() => npc.add_trait(mind_tt, 123))
        .to.throw(/Expected Mind instance for trait 'mind', got number/)
    })
  })

  describe('Array validation', () => {
    it('validates array container', () => {
      // Create traittype with array container
      DB.register({
        colors: { type: 'string', container: Array }
      }, {}, {})

      const state = createStateInNewMind()
      const entity = Belief.from_template(state, {bases: ['PortableObject']})
      const colors_tt = Traittype.get_by_label('colors')

      expect(() => entity.add_trait(colors_tt, 'red'))
        .to.throw(/Expected array for trait 'colors', got string/)
    })

    it('validates array element types', () => {
      DB.register({
        colors: { type: 'string', container: Array }
      }, {}, {})

      const state = createStateInNewMind()
      const entity = Belief.from_template(state, {bases: ['PortableObject']})
      const colors_tt = Traittype.get_by_label('colors')

      expect(() => entity.add_trait(colors_tt, ['red', 42, 'blue']))
        .to.throw(/Array element 1 for trait 'colors': Expected string/)
    })

    it('validates min constraint', () => {
      DB.register({
        colors: { type: 'string', container: Array, min: 2 }
      }, {}, {})

      const state = createStateInNewMind()
      const entity = Belief.from_template(state, {bases: ['PortableObject']})
      const colors_tt = Traittype.get_by_label('colors')

      expect(() => entity.add_trait(colors_tt, ['red']))
        .to.throw(/Array for 'colors' has length 1, min is 2/)
    })

    it('validates max constraint', () => {
      DB.register({
        colors: { type: 'string', container: Array, max: 2 }
      }, {}, {})

      const state = createStateInNewMind()
      const entity = Belief.from_template(state, {bases: ['PortableObject']})
      const colors_tt = Traittype.get_by_label('colors')

      expect(() => entity.add_trait(colors_tt, ['red', 'blue', 'green']))
        .to.throw(/Array for 'colors' has length 3, max is 2/)
    })

    it('accepts valid array', () => {
      DB.register({
        colors: { type: 'string', container: Array }
      }, {}, {})

      const state = createStateInNewMind()
      const entity = Belief.from_template(state, {bases: ['PortableObject']})
      const colors_tt = Traittype.get_by_label('colors')

      entity.add_trait(colors_tt, ['red', 'blue'])
      expect(entity.get_trait(state, colors_tt)).to.deep.equal(['red', 'blue'])
    })

    it('allows null for array traits', () => {
      DB.register({
        colors: { type: 'string', container: Array }
      }, {}, {})

      const state = createStateInNewMind()
      const entity = Belief.from_template(state, {bases: ['PortableObject']})
      const colors_tt = Traittype.get_by_label('colors')

      entity.add_trait(colors_tt, null)
      expect(entity.get_trait(state, colors_tt)).to.equal(null)
    })
  })

  describe('Integration with replace() and branch()', () => {
    it('validates via replace()', () => {
      const state = createStateInNewMind()
      const hammer = Belief.from_template(state, {bases: ['PortableObject']})
      const location_tt = Traittype.get_by_label('location')

      expect(() => hammer.replace(state, { location: 'invalid' }))
        .to.throw(/Expected Subject instance for trait 'location'/)
    })

    it('validates via branch()', () => {
      const state = createStateInNewMind()
      const hammer = Belief.from_template(state, {bases: ['PortableObject']})

      expect(() => hammer.branch(state, { color: 123 }))
        .to.throw(/Expected string for trait 'color', got number/)
    })

    it('allows valid values via replace()', () => {
      const state = createStateInNewMind()
      const workshop = Belief.from_template(state, {bases: ['Location']})
      const hammer = Belief.from_template(state, {bases: ['PortableObject']})
      const location_tt = Traittype.get_by_label('location')

      const hammer_v2 = hammer.replace(state, { location: workshop.subject })
      expect(hammer_v2.get_trait(state, location_tt)).to.equal(workshop.subject)
    })

    it('allows valid values via branch()', () => {
      const state = createStateInNewMind()
      const hammer = Belief.from_template(state, {bases: ['PortableObject']})

      const hammer_v2 = hammer.branch(state, { color: 'blue' })
      const color_tt = Traittype.get_by_label('color')
      expect(hammer_v2.get_trait(state, color_tt)).to.equal('blue')
    })
  })

  describe('Archetype-typed traits', () => {
    it('accepts Subject with correct archetype', () => {
      const state = createStateInNewMind()
      const workshop = Belief.from_template(state, {bases: ['Location']})
      const hammer = Belief.from_template(state, {bases: ['PortableObject']})
      const location_tt = Traittype.get_by_label('location')

      // location trait requires Location archetype
      hammer.add_trait(location_tt, workshop.subject)
      expect(hammer.get_trait(state, location_tt)).to.equal(workshop.subject)
    })

    it('rejects non-Subject for archetype-typed trait', () => {
      const state = createStateInNewMind()
      const hammer = Belief.from_template(state, {bases: ['PortableObject']})
      const location_tt = Traittype.get_by_label('location')

      // Archetype.validate_value should reject non-Subjects
      expect(() => hammer.add_trait(location_tt, 'not-a-subject'))
        .to.throw(/Expected Subject instance for trait 'location', got string/)
    })
  })
})
