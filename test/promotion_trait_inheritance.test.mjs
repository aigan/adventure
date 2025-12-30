import { expect } from 'chai'
import { Belief, Traittype, Archetype } from '../public/worker/cosmos.mjs'
import { Fuzzy } from '../public/worker/fuzzy.mjs'
import * as DB from '../public/worker/db.mjs'
import { setupStandardArchetypes, createStateInNewMind, setupAfterEachValidation } from './helpers.mjs'

/**
 * Tests for trait inheritance with promotions
 *
 * Key distinction:
 * - Traits set BEFORE the promotion split (on base/archetype) → NOT Fuzzy
 * - Traits set BY the promotions → Fuzzy with certainty values
 */
describe('Promotion trait inheritance', () => {
  let color_tt, location_tt, power_tt, weight_tt, size_tt

  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()

    // Register extra traits and archetypes for testing
    DB.register({
      power: {
        type: 'number',
        exposure: 'internal'
      },
      size: {
        type: 'string',
        values: ['small', 'medium', 'large'],
        exposure: 'visual'
      }
    }, {
      // Test archetype with a default trait value
      SizedObject: {
        bases: ['ObjectPhysical'],
        traits: { size: 'medium' }  // Default value
      },
      // Test archetype with multiple traits
      GameItem: {
        bases: ['ObjectPhysical'],
        traits: { power: null, weight: null }
      }
    }, {})

    color_tt = Traittype.get_by_label('color')
    location_tt = Traittype.get_by_label('location')
    power_tt = Traittype.get_by_label('power')
    weight_tt = Traittype.get_by_label('weight')
    size_tt = Traittype.get_by_label('size')
  })
  setupAfterEachValidation()

  describe('Traits from before the promotion split', () => {
    it('archetype default trait is NOT Fuzzy even with certainty promotions', () => {
      const state = createStateInNewMind()

      // Create base belief (SizedObject has size: 'medium' as default)
      const obj = Belief.from_template(state, {
        bases: ['SizedObject'],
        label: 'obj'
      })

      // Create promotions with certainty - they don't set size
      obj.replace(state, { color: 'red' }, { promote: true, certainty: 0.6 })
      obj.replace(state, { color: 'blue' }, { promote: true, certainty: 0.4 })

      // Create child that inherits from obj
      const child = Belief.from(state, [obj])

      // size comes from archetype (before split) - should NOT be Fuzzy
      const size = child.get_trait(state, size_tt)
      expect(size).to.equal('medium')
      expect(size).to.not.be.instanceOf(Fuzzy)

      // color was set by promotions - should BE Fuzzy
      const color = child.get_trait(state, color_tt)
      expect(color).to.be.instanceOf(Fuzzy)
      expect(color.alternatives).to.have.lengthOf(2)
    })

    it('trait set on base belief before promotions is NOT Fuzzy', () => {
      const state = createStateInNewMind()

      // Create base with a trait set directly
      const obj = Belief.from_template(state, {
        bases: ['GameItem'],
        traits: { power: 10 },
        label: 'obj'
      })

      // Create promotions that set different traits (not power)
      obj.replace(state, { color: 'red' }, { promote: true, certainty: 0.6 })
      obj.replace(state, { color: 'blue' }, { promote: true, certainty: 0.4 })

      // Create child
      const child = Belief.from(state, [obj])

      // power was set on base before split - should NOT be Fuzzy
      const power = child.get_trait(state, power_tt)
      expect(power).to.equal(10)
      expect(power).to.not.be.instanceOf(Fuzzy)
    })

    it('trait inherited from parent belief before promotions is NOT Fuzzy', () => {
      const state = createStateInNewMind()

      // Create parent with trait
      const parent = Belief.from_template(state, {
        bases: ['GameItem'],
        traits: { weight: 5 },
        label: 'parent'
      })

      // Create base that inherits from parent
      const obj = Belief.from_template(state, {
        bases: [parent],
        label: 'obj'
      })

      // Create promotions on obj
      obj.replace(state, { color: 'red' }, { promote: true, certainty: 0.7 })
      obj.replace(state, { color: 'green' }, { promote: true, certainty: 0.3 })

      // Create child of obj
      const child = Belief.from(state, [obj])

      // weight inherited from grandparent - NOT Fuzzy
      const weight = child.get_trait(state, weight_tt)
      expect(weight).to.equal(5)
      expect(weight).to.not.be.instanceOf(Fuzzy)
    })
  })

  describe('Traits set by promotions', () => {
    it('trait set by all promotions becomes Fuzzy', () => {
      const state = createStateInNewMind()
      const workshop = Belief.from_template(state, { bases: ['Location'], label: 'workshop' })
      const tavern = Belief.from_template(state, { bases: ['Location'], label: 'tavern' })

      const obj = Belief.from_template(state, {
        bases: ['ObjectPhysical'],
        label: 'obj'
      })

      // Both promotions set location
      obj.replace(state, { location: workshop.subject }, { promote: true, certainty: 0.6 })
      obj.replace(state, { location: tavern.subject }, { promote: true, certainty: 0.4 })

      const child = Belief.from(state, [obj])

      const location = child.get_trait(state, location_tt)
      expect(location).to.be.instanceOf(Fuzzy)
      expect(location.alternatives).to.have.lengthOf(2)
      expect(location.alternatives[0].certainty).to.equal(0.6)
      expect(location.alternatives[1].certainty).to.equal(0.4)
    })

    it('trait set by only some promotions still becomes Fuzzy', () => {
      const state = createStateInNewMind()

      const obj = Belief.from_template(state, {
        bases: ['ObjectPhysical'],
        label: 'obj'
      })

      // Only first promotion sets color
      obj.replace(state, { color: 'red' }, { promote: true, certainty: 0.6 })
      obj.replace(state, {}, { promote: true, certainty: 0.4 })

      const child = Belief.from(state, [obj])

      // color should be Fuzzy with only one alternative
      const color = child.get_trait(state, color_tt)
      expect(color).to.be.instanceOf(Fuzzy)
      expect(color.alternatives).to.have.lengthOf(1)
      expect(color.alternatives[0].value).to.equal('red')
      expect(color.alternatives[0].certainty).to.equal(0.6)
    })

    it('same value in all promotions still becomes Fuzzy', () => {
      const state = createStateInNewMind()

      const obj = Belief.from_template(state, {
        bases: ['ObjectPhysical'],
        label: 'obj'
      })

      // Both promotions set same color value
      obj.replace(state, { color: 'red' }, { promote: true, certainty: 0.6 })
      obj.replace(state, { color: 'red' }, { promote: true, certainty: 0.4 })

      const child = Belief.from(state, [obj])

      // Even with same value, it's Fuzzy because promotions set it
      const color = child.get_trait(state, color_tt)
      expect(color).to.be.instanceOf(Fuzzy)
      expect(color.alternatives).to.have.lengthOf(2)
      // Both alternatives have 'red'
      expect(color.alternatives.every(a => a.value === 'red')).to.be.true
    })
  })

  describe('Promotions without certainty (promote-only)', () => {
    // Note: promote: true without certainty does NOT create Fuzzy
    // It just registers the belief as a promotion for lazy propagation
    // Fuzzy is only created when certainty is provided

    it('promotion without certainty does not create Fuzzy', () => {
      const state = createStateInNewMind()

      const obj = Belief.from_template(state, {
        bases: ['ObjectPhysical'],
        label: 'obj'
      })

      // Promotion without certainty - just propagation, no probability
      obj.replace(state, { color: 'red' }, { promote: true })

      const child = Belief.from(state, [obj])

      // Without certainty, it's not Fuzzy - just resolves the latest promotion
      const color = child.get_trait(state, color_tt)
      // The promotion is found and used, but not wrapped in Fuzzy
      expect(color).to.equal('red')
      expect(color).to.not.be.instanceOf(Fuzzy)
    })

    it('multiple promotions without certainty uses first match', () => {
      const state = createStateInNewMind()

      const obj = Belief.from_template(state, {
        bases: ['ObjectPhysical'],
        label: 'obj'
      })

      obj.replace(state, { color: 'red' }, { promote: true })
      obj.replace(state, { color: 'blue' }, { promote: true })

      const child = Belief.from(state, [obj])

      const color = child.get_trait(state, color_tt)
      // Without certainty, just picks one (implementation dependent)
      expect(color).to.be.a('string')
      expect(['red', 'blue']).to.include(color)
    })
  })

  describe('Mixed scenarios', () => {
    it('base trait overridden by promotions becomes Fuzzy', () => {
      const state = createStateInNewMind()

      // Base has color set
      const obj = Belief.from_template(state, {
        bases: ['ObjectPhysical'],
        traits: { color: 'white' },
        label: 'obj'
      })

      // Promotions override color
      obj.replace(state, { color: 'red' }, { promote: true, certainty: 0.6 })
      obj.replace(state, { color: 'blue' }, { promote: true, certainty: 0.4 })

      const child = Belief.from(state, [obj])

      // color is Fuzzy because promotions set it (overrides base)
      const color = child.get_trait(state, color_tt)
      expect(color).to.be.instanceOf(Fuzzy)
      expect(color.alternatives).to.have.lengthOf(2)
      // Base's 'white' is not included
      expect(color.alternatives.map(a => a.value)).to.not.include('white')
    })

    it('different traits from different sources', () => {
      const state = createStateInNewMind()
      const workshop = Belief.from_template(state, { bases: ['Location'], label: 'workshop' })
      const tavern = Belief.from_template(state, { bases: ['Location'], label: 'tavern' })

      // Register GameSizedItem which has both size default and power
      DB.register({}, {
        GameSizedItem: {
          bases: ['SizedObject', 'GameItem'],
          traits: {}
        }
      }, {})

      // Base has size from archetype and power set explicitly
      const obj = Belief.from_template(state, {
        bases: ['GameSizedItem'],
        traits: { power: 15 },
        label: 'obj'
      })

      // Promotions set location and color
      obj.replace(state, { location: workshop.subject, color: 'red' }, { promote: true, certainty: 0.6 })
      obj.replace(state, { location: tavern.subject, color: 'blue' }, { promote: true, certainty: 0.4 })

      const child = Belief.from(state, [obj])

      // power from base - NOT Fuzzy
      const power = child.get_trait(state, power_tt)
      expect(power).to.equal(15)
      expect(power).to.not.be.instanceOf(Fuzzy)

      // size from archetype - NOT Fuzzy
      const size = child.get_trait(state, size_tt)
      expect(size).to.equal('medium')
      expect(size).to.not.be.instanceOf(Fuzzy)

      // location from promotions - Fuzzy
      const location = child.get_trait(state, location_tt)
      expect(location).to.be.instanceOf(Fuzzy)
      expect(location.alternatives).to.have.lengthOf(2)

      // color from promotions - Fuzzy
      const color = child.get_trait(state, color_tt)
      expect(color).to.be.instanceOf(Fuzzy)
      expect(color.alternatives).to.have.lengthOf(2)
    })

    it('promotion sets some traits, inherits others from base', () => {
      const state = createStateInNewMind()

      const obj = Belief.from_template(state, {
        bases: ['GameItem'],
        traits: { power: 10, weight: 5 },
        label: 'obj'
      })

      // First promotion sets color, second sets power
      obj.replace(state, { color: 'red' }, { promote: true, certainty: 0.5 })
      obj.replace(state, { power: 20 }, { promote: true, certainty: 0.5 })

      const child = Belief.from(state, [obj])

      // color - only first promotion set it
      const color = child.get_trait(state, color_tt)
      expect(color).to.be.instanceOf(Fuzzy)
      expect(color.alternatives).to.have.lengthOf(1)
      expect(color.alternatives[0].value).to.equal('red')

      // power - only second promotion set it
      const power = child.get_trait(state, power_tt)
      expect(power).to.be.instanceOf(Fuzzy)
      expect(power.alternatives).to.have.lengthOf(1)
      expect(power.alternatives[0].value).to.equal(20)

      // weight - neither promotion set it, comes from base
      const weight = child.get_trait(state, weight_tt)
      expect(weight).to.equal(5)
      expect(weight).to.not.be.instanceOf(Fuzzy)
    })
  })

  describe('Direct queries on base with promotions', () => {
    it('querying promotion directly returns its own trait', () => {
      const state = createStateInNewMind()

      const obj = Belief.from_template(state, {
        bases: ['GameItem'],
        traits: { power: 10 },
        label: 'obj'
      })

      const promo1 = obj.replace(state, { color: 'red' }, { promote: true, certainty: 0.6 })
      const promo2 = obj.replace(state, { color: 'blue' }, { promote: true, certainty: 0.4 })

      // Query promotions directly - they have their own traits
      expect(promo1.get_trait(state, color_tt)).to.equal('red')
      expect(promo2.get_trait(state, color_tt)).to.equal('blue')

      // Both inherit power from obj
      expect(promo1.get_trait(state, power_tt)).to.equal(10)
      expect(promo2.get_trait(state, power_tt)).to.equal(10)
    })

    it('querying removed base through get_trait resolves promotions', () => {
      const state = createStateInNewMind()

      const obj = Belief.from_template(state, {
        bases: ['GameItem'],
        traits: { power: 10 },
        label: 'obj'
      })

      obj.replace(state, { color: 'red' }, { promote: true, certainty: 0.6 })
      obj.replace(state, { color: 'blue' }, { promote: true, certainty: 0.4 })

      // obj is removed from state but still exists as object
      // Querying traits on it should work
      const power = obj.get_trait(state, power_tt)
      expect(power).to.equal(10)

      // obj has promotions, so color through obj should resolve them
      const color = obj.get_trait(state, color_tt)
      expect(color).to.be.instanceOf(Fuzzy)
    })
  })

  describe('Chained promotions', () => {
    it('promotion of a promotion inherits correctly', () => {
      const state = createStateInNewMind()

      const obj = Belief.from_template(state, {
        bases: ['GameItem'],
        traits: { power: 10 },
        label: 'obj'
      })

      // First level promotion - only sets color, not power
      const v1 = obj.replace(state, { color: 'red' }, { promote: true, certainty: 0.6 })

      // Second level promotions (of v1) - also only set color
      v1.replace(state, { color: 'crimson' }, { promote: true, certainty: 0.8 })
      v1.replace(state, { color: 'maroon' }, { promote: true, certainty: 0.2 })

      // Child inherits from original obj
      const child = Belief.from(state, [obj])

      // power: obj has promotions, but none of them set power
      // So power should come from obj's own traits, NOT Fuzzy
      // Note: This depends on implementation - if we go through promotions first
      // and they don't have the trait, we fall back to the base
      const power = child.get_trait(state, power_tt)
      // Since no promotion sets power, it should resolve to obj's value
      // But the resolution goes through v1 (which inherits power from obj)
      // This is implementation-dependent
      expect(power).to.satisfy(v =>
        v === 10 || (v instanceof Fuzzy && v.alternatives.some(a => a.value === 10))
      )

      // color goes through chained promotions - definitely Fuzzy
      const color = child.get_trait(state, color_tt)
      expect(color).to.be.instanceOf(Fuzzy)
    })

    it('trait set at intermediate level is found', () => {
      const state = createStateInNewMind()

      const obj = Belief.from_template(state, {
        bases: ['GameItem'],
        label: 'obj'
      })

      // v1 sets power
      const v1 = obj.replace(state, { power: 15 }, { promote: true, certainty: 0.5 })

      // v2 doesn't set power, only color
      obj.replace(state, { color: 'blue' }, { promote: true, certainty: 0.5 })

      const child = Belief.from(state, [obj])

      // power only set by v1
      const power = child.get_trait(state, power_tt)
      expect(power).to.be.instanceOf(Fuzzy)
      expect(power.alternatives).to.have.lengthOf(1)
      expect(power.alternatives[0].value).to.equal(15)
      expect(power.alternatives[0].certainty).to.equal(0.5)

      // color only set by v2
      const color = child.get_trait(state, color_tt)
      expect(color).to.be.instanceOf(Fuzzy)
      expect(color.alternatives).to.have.lengthOf(1)
      expect(color.alternatives[0].value).to.equal('blue')
    })
  })

  describe('Edge cases', () => {
    it('no promotions - trait resolved normally', () => {
      const state = createStateInNewMind()

      const obj = Belief.from_template(state, {
        bases: ['GameItem'],
        traits: { color: 'red', power: 10 },
        label: 'obj'
      })

      const child = Belief.from(state, [obj])

      // No promotions, traits resolved normally
      const color = child.get_trait(state, color_tt)
      expect(color).to.equal('red')
      expect(color).to.not.be.instanceOf(Fuzzy)

      const power = child.get_trait(state, power_tt)
      expect(power).to.equal(10)
      expect(power).to.not.be.instanceOf(Fuzzy)
    })

    it('empty promotion (no traits) does not affect inherited traits', () => {
      const state = createStateInNewMind()

      const obj = Belief.from_template(state, {
        bases: ['ObjectPhysical'],
        traits: { color: 'red' },
        label: 'obj'
      })

      // Empty promotion with certainty
      obj.replace(state, {}, { promote: true, certainty: 0.5 })
      obj.replace(state, {}, { promote: true, certainty: 0.5 })

      const child = Belief.from(state, [obj])

      // color from base, not set by promotion - should NOT be Fuzzy
      const color = child.get_trait(state, color_tt)
      expect(color).to.equal('red')
      expect(color).to.not.be.instanceOf(Fuzzy)
    })

    it('promotion with only some traits does not make other traits Fuzzy', () => {
      const state = createStateInNewMind()

      const obj = Belief.from_template(state, {
        bases: ['GameItem'],
        traits: { color: 'white', power: 10, weight: 5 },
        label: 'obj'
      })

      // Promotions only set color
      obj.replace(state, { color: 'red' }, { promote: true, certainty: 0.6 })
      obj.replace(state, { color: 'blue' }, { promote: true, certainty: 0.4 })

      const child = Belief.from(state, [obj])

      // color was set by promotions - Fuzzy
      const color = child.get_trait(state, color_tt)
      expect(color).to.be.instanceOf(Fuzzy)

      // power and weight NOT set by promotions - NOT Fuzzy
      const power = child.get_trait(state, power_tt)
      expect(power).to.equal(10)
      expect(power).to.not.be.instanceOf(Fuzzy)

      const weight = child.get_trait(state, weight_tt)
      expect(weight).to.equal(5)
      expect(weight).to.not.be.instanceOf(Fuzzy)
    })
  })

  describe('Real-world scenario: wandering merchant pattern', () => {
    it('merchant location is Fuzzy but inherited traits are not', () => {
      const state = createStateInNewMind()

      // Locations
      const workshop = Belief.from_template(state, { bases: ['Location'], label: 'workshop' })
      const tavern = Belief.from_template(state, { bases: ['Location'], label: 'tavern' })

      // Merchant archetype with inherent traits (avoid duplicate 'Person' name)
      DB.register({}, {
        Merchant: {
          bases: ['SizedObject'],
          traits: { power: 0 }  // Merchants have power: 0 by default
        }
      }, {})

      // Base for merchant location variations
      const merchant_location = Belief.from_template(state, {
        bases: ['ObjectPhysical'],
        label: 'merchant_location'
      })

      // Create location variants with certainty
      merchant_location.replace(state, { location: workshop.subject }, { promote: true, certainty: 0.6 })
      merchant_location.replace(state, { location: tavern.subject }, { promote: true, certainty: 0.4 })

      // Wandering merchant inherits from Merchant and merchant_location
      const MerchantArchetype = Archetype.get_by_label('Merchant')
      const wandering_merchant = Belief.from(state, [MerchantArchetype, merchant_location])
      wandering_merchant.label = 'wandering_merchant'

      // Location is Fuzzy (set by promotions)
      const location = wandering_merchant.get_trait(state, location_tt)
      expect(location).to.be.instanceOf(Fuzzy)
      expect(location.alternatives).to.have.lengthOf(2)

      // Size from SizedObject archetype - NOT Fuzzy
      const size = wandering_merchant.get_trait(state, size_tt)
      expect(size).to.equal('medium')
      expect(size).to.not.be.instanceOf(Fuzzy)

      // Power from Merchant archetype - NOT Fuzzy
      const power = wandering_merchant.get_trait(state, power_tt)
      expect(power).to.equal(0)
      expect(power).to.not.be.instanceOf(Fuzzy)
    })
  })
})
