import { expect } from 'chai'
import * as DB from '../public/worker/db.mjs'
import { setupStandardArchetypes, createStateInNewMind } from './helpers.mjs'
import { Belief, Traittype, Materia } from '../public/worker/cosmos.mjs'

/**
 * Helper to test type validation rejection
 */
function expectTypeRejection(archetype, trait_label, invalid_value, expected_error) {
  const state = createStateInNewMind()
  const entity = Belief.from_template(state, {bases: [archetype]})
  const traittype = Traittype.get_by_label(trait_label)

  expect(() => entity.add_trait(traittype, invalid_value))
    .to.throw(expected_error)
}

/**
 * Helper to test type validation acceptance
 */
function expectTypeAcceptance(archetype, trait_label, valid_value) {
  const state = createStateInNewMind()
  const entity = Belief.from_template(state, {bases: [archetype]})
  const traittype = Traittype.get_by_label(trait_label)

  entity.add_trait(traittype, valid_value)
  expect(entity.get_trait(state, traittype)).to.deep.equal(valid_value)
}

describe('Trait Value Validation', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()
  })

  describe('Primitive types (literal_handler)', () => {
    it('accepts valid string', () => {
      expectTypeAcceptance('PortableObject', 'color', 'red')
    })

    it('rejects number when string expected', () => {
      expectTypeRejection('PortableObject', 'color', 42,
        /Expected string for trait 'color', got number/)
    })

    it('rejects invalid enum value', () => {
      expectTypeRejection('ObjectPhysical', '@form', 'plasma',
        /Invalid value 'plasma' for trait '@form'. Must be one of:/)
    })

    it('allows null for any type', () => {
      expectTypeAcceptance('PortableObject', 'color', null)
    })

    it('accepts valid number', () => {
      expectTypeAcceptance('TestEntity', 'weight', 5.5)
    })

    it('rejects string when number expected', () => {
      expectTypeRejection('TestEntity', 'weight', 'heavy',
        /Expected number for trait 'weight', got string/)
    })
  })

  describe('Subject references', () => {
    it('accepts Subject instance', () => {
      const state = createStateInNewMind()
      const workshop = Belief.from_template(state, {bases: ['Location']})
      const hammer = Belief.from_template(state, {bases: ['PortableObject']})
      const location_tt = Traittype.get_by_label('location')

      hammer.add_trait(location_tt, workshop.subject)
      expect(hammer.get_trait(state, location_tt)).to.equal(workshop.subject)
    })

    it('rejects string when Subject expected', () => {
      expectTypeRejection('PortableObject', 'location', 'workshop',
        /Expected Subject instance for trait/)
    })

    it('rejects number when Subject expected', () => {
      expectTypeRejection('PortableObject', 'location', 123,
        /Expected Subject instance for trait/)
    })

    it('rejects object when Subject expected', () => {
      expectTypeRejection('PortableObject', 'location', { foo: 'bar' },
        /Expected Subject instance for trait 'location', got Object/)
    })
  })

  describe('Mind type', () => {
    it('accepts Mind instance', () => {
      const state = createStateInNewMind()
      const npc = Belief.from_template(state, {bases: ['Person']})
      const npc_mind = new Materia(state.in_mind, 'npc')
      const mind_tt = Traittype.get_by_label('mind')

      npc.add_trait(mind_tt, npc_mind)
      expect(npc.get_trait(state, mind_tt)).to.equal(npc_mind)
    })

    it('rejects string when Mind expected', () => {
      expectTypeRejection('Person', 'mind', 'npc_mind',
        /Expected Mind instance for trait/)
    })

    it('rejects number when Mind expected', () => {
      expectTypeRejection('Person', 'mind', 123,
        /Expected Mind instance for trait/)
    })
  })

  describe('Array validation', () => {
    it('validates array container', () => {
      expectTypeRejection('TestEntity', 'colors', 'red',
        /Expected array for trait 'colors', got string/)
    })

    it('validates array element types', () => {
      expectTypeRejection('TestEntity', 'colors', ['red', 42, 'blue'],
        /Array element 1 for trait 'colors': Expected string/)
    })

    it('validates min constraint', () => {
      expectTypeRejection('TestEntity', 'tags', ['one'],
        /Array for 'tags' has length 1, min is 2/)
    })

    it('validates max constraint', () => {
      expectTypeRejection('TestEntity', 'tags', ['a', 'b', 'c', 'd', 'e', 'f'],
        /Array for 'tags' has length 6, max is 5/)
    })

    it('accepts valid array', () => {
      expectTypeAcceptance('TestEntity', 'colors', ['red', 'blue'])
    })

    it('allows null for array traits', () => {
      expectTypeAcceptance('TestEntity', 'colors', null)
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
        .to.throw(/Expected Subject instance for trait/)
    })
  })
})
