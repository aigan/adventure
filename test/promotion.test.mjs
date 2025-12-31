import { expect } from 'chai'
import { Materia, Belief, Traittype, Archetype, Fuzzy, eidos, logos, DB } from '../public/worker/cosmos.mjs'
import { createStateInNewMind, createEidosState, setupStandardArchetypes, setupAfterEachValidation, saveAndReload } from './helpers.mjs'

/**
 * Promotions represent uncertain or evolving futures for shared beliefs in Eidos.
 *
 * Real scenarios:
 * - Wandering merchant: could be at shop (60%) or inn (40%)
 * - Temporal evolution: village at T=10 → town at T=50 → city at T=100
 * - Prototype inheritance: NPC inherits from city which inherits from region
 *
 * Key behaviors to verify:
 * 1. Uncertainty is preserved (not lost during materialization)
 * 2. Temporal constraints filter correctly (tt-based selection)
 * 3. Trait inheritance works through promotion chains
 * 4. Only Eidos hierarchy can create promotions
 * 5. Traits set BEFORE split → not Fuzzy; traits set BY promotions → Fuzzy
 */
describe('Promotions', () => {
  beforeEach(() => {
    DB.reset_registries()
    setupStandardArchetypes()
  })
  setupAfterEachValidation()

  describe('Eidos hierarchy constraint', () => {
    // Promotions represent shared world state evolution.
    // They only make sense in Eidos (shared knowledge), not private minds.

    it('shared beliefs in Eidos can have promotions', () => {
      const state = createEidosState()
      const merchant = Belief.from_template(state, {
        bases: ['Person'],
        label: 'merchant'
      })

      const merchant_v2 = merchant.branch(state, { color: 'red' }, { promote: true })
      expect(merchant.promotions.has(merchant_v2)).to.be.true
    })

    it('private beliefs in world minds cannot have promotions', () => {
      const world_state = createStateInNewMind('world')
      const npc = Belief.from_template(world_state, {
        bases: ['Person'],
        label: 'npc'
      })

      expect(() => {
        npc.branch(world_state, { color: 'red' }, { promote: true })
      }).to.throw(/Promotions can only be created in Eidos hierarchy/)
    })

    it('child minds of Eidos inherit promotion capability', () => {
      const cultural_mind = new Materia(eidos(), 'cultural')
      const cultural_state = cultural_mind.create_state(eidos().origin_state, { tt: 1 })

      const tradition = Belief.from_template(cultural_state, {
        bases: ['ObjectPhysical'],
        label: 'tradition'
      })

      expect(cultural_mind.in_eidos).to.be.true
      const tradition_v2 = tradition.branch(cultural_state, { color: 'gold' }, { promote: true })
      expect(tradition.promotions.has(tradition_v2)).to.be.true
    })
  })

  describe('Wandering merchant - probability promotions', () => {
    // A merchant type that could be at different locations.
    // When an NPC inherits from this type, uncertainty should be preserved.

    it('merchant with uncertain location creates Fuzzy trait', () => {
      const state = createEidosState()
      const location_tt = Traittype.get_by_label('location')

      const shop = Belief.from_template(state, { bases: ['Location'], label: 'shop' })
      const inn = Belief.from_template(state, { bases: ['Location'], label: 'inn' })

      const merchant_type = Belief.from_template(state, {
        bases: ['Person'],
        label: 'merchant_type'
      })

      // 60% chance at shop, 40% at inn
      merchant_type.branch(state, { location: shop.subject }, { promote: true, certainty: 0.6 })
      merchant_type.branch(state, { location: inn.subject }, { promote: true, certainty: 0.4 })

      const traveling_merchant = Belief.from(state, [merchant_type])
      state.lock()

      const location = traveling_merchant.get_trait(state, location_tt)
      expect(location).to.be.instanceOf(Fuzzy)
      expect(location.alternatives).to.have.lengthOf(2)

      const alts = [...location.alternatives].sort((a, b) => b.certainty - a.certainty)
      expect(alts[0].value).to.equal(shop.subject)
      expect(alts[0].certainty).to.equal(0.6)
    })

    it('uncertain trait does not affect other inherited traits', () => {
      const state = createEidosState()
      const location_tt = Traittype.get_by_label('location')
      const form_tt = Traittype.get_by_label('@form')

      const shop = Belief.from_template(state, { bases: ['Location'], label: 'shop' })
      const inn = Belief.from_template(state, { bases: ['Location'], label: 'inn' })

      const merchant_type = Belief.from_template(state, {
        bases: ['Person'],
        traits: { '@form': 'solid' },  // Set BEFORE promotions
        label: 'merchant_type'
      })

      merchant_type.branch(state, { location: shop.subject }, { promote: true, certainty: 0.6 })
      merchant_type.branch(state, { location: inn.subject }, { promote: true, certainty: 0.4 })

      const traveling_merchant = Belief.from(state, [merchant_type])
      state.lock()

      // Location is uncertain (set BY promotions)
      expect(traveling_merchant.get_trait(state, location_tt)).to.be.instanceOf(Fuzzy)
      // @form is certain (set BEFORE promotions)
      expect(traveling_merchant.get_trait(state, form_tt)).to.equal('solid')
    })

    it('uncertainty propagates through deep inheritance chain', () => {
      // region → country → city, where region has uncertain color
      const state = createEidosState()
      const color_tt = Traittype.get_by_label('color')

      const region = Belief.from_template(state, {
        bases: ['ObjectPhysical'],
        label: 'region'
      })
      region.branch(state, { color: 'green' }, { promote: true, certainty: 0.5 })
      region.branch(state, { color: 'brown' }, { promote: true, certainty: 0.5 })

      const country = Belief.from_template(state, { bases: [region], label: 'country' })
      const city = Belief.from_template(state, { bases: [country], label: 'city' })

      // When city creates a promotion, region's uncertainty should be materialized
      const city_v2 = city.replace(state, {}, { promote: true })
      state.lock()

      const color = city_v2.get_trait(state, color_tt)
      expect(color).to.be.instanceOf(Fuzzy)
      expect(color.alternatives).to.have.lengthOf(2)
    })
  })

  describe('Temporal evolution - settlement grows over time', () => {
    // A location that evolves over time: village → town → city
    // NPCs at different timestamps should see appropriate versions.

    it('NPC at earlier time sees earlier version', () => {
      // Use eidos sub-mind for temporal states
      const shared_mind = new Materia(eidos(), 'shared')
      const color_tt = Traittype.get_by_label('color')

      // Settlement evolves over time
      const eidos_state_1 = shared_mind.create_state(eidos().origin_state, { tt: 1 })
      const settlement = Belief.from_template(eidos_state_1, {
        bases: ['ObjectPhysical'],
        traits: { color: 'gray' },  // village
        label: 'settlement'
      })
      eidos_state_1.lock()

      // At T=50, becomes town (brown)
      const eidos_state_50 = eidos_state_1.branch(eidos_state_1.ground_state, 50)
      settlement.replace(eidos_state_50, { color: 'brown' }, { promote: true })
      eidos_state_50.lock()

      // At T=100, becomes city (white)
      const eidos_state_100 = eidos_state_50.branch(eidos_state_50.ground_state, 100)
      const town_version = [...settlement.promotions][0]
      town_version.replace(eidos_state_100, { color: 'white' }, { promote: true })
      eidos_state_100.lock()

      // Create world mind as child of shared_mind - use branch for tt states
      const world_mind = new Materia(shared_mind, 'world')
      const Person = Archetype.get_by_label('Person')

      // NPC at T=30 (before any evolution) sees gray
      const world_t30 = eidos_state_1.branch(eidos_state_1.ground_state, 30)
      const npc_early = Belief.from(world_t30, [Person, settlement])
      world_t30.lock()
      expect(npc_early.get_trait(world_t30, color_tt)).to.equal('gray')

      // NPC at T=70 (after first evolution) sees brown
      const world_t70 = eidos_state_50.branch(eidos_state_50.ground_state, 70)
      const npc_mid = Belief.from(world_t70, [Person, settlement])
      world_t70.lock()
      expect(npc_mid.get_trait(world_t70, color_tt)).to.equal('brown')

      // NPC at T=150 (after all evolutions) sees white
      const world_t150 = eidos_state_100.branch(eidos_state_100.ground_state, 150)
      const npc_late = Belief.from(world_t150, [Person, settlement])
      world_t150.lock()
      expect(npc_late.get_trait(world_t150, color_tt)).to.equal('white')
    })

    it('promotion chain stops at future timestamp', () => {
      // v1@T1 → v2@T50 → v3@T80
      // Query at T60 should see v2 (T50 <= 60), NOT v3 (T80 > 60)
      const eidos_mind = new Materia(eidos(), 'shared')
      const color_tt = Traittype.get_by_label('color')

      const state_1 = eidos_mind.create_state(eidos().origin_state, { tt: 1 })
      const ball_v1 = Belief.from_template(state_1, {
        bases: ['PortableObject'],
        traits: { color: 'red' },
        label: 'ball'
      })
      state_1.lock()

      const state_50 = state_1.branch(state_1.ground_state, 50)
      const ball_v2 = ball_v1.replace(state_50, { color: 'blue' }, { promote: true })
      state_50.lock()

      const state_80 = state_50.branch(state_50.ground_state, 80)
      ball_v2.replace(state_80, { color: 'green' }, { promote: true })
      state_80.lock()

      // Query at T60
      const state_60 = state_50.branch(state_50.ground_state, 60)
      const child = Belief.from(state_60, [ball_v1])
      state_60.lock()

      expect(child.get_trait(state_60, color_tt)).to.equal('blue')
    })

    it('query before any promotion sees original', () => {
      const eidos_mind = new Materia(eidos(), 'shared')
      const color_tt = Traittype.get_by_label('color')

      const state_1 = eidos_mind.create_state(eidos().origin_state, { tt: 1 })
      const ball = Belief.from_template(state_1, {
        bases: ['PortableObject'],
        traits: { color: 'red' },
        label: 'ball'
      })
      state_1.lock()

      const state_50 = state_1.branch(state_1.ground_state, 50)
      ball.replace(state_50, { color: 'blue' }, { promote: true })
      state_50.lock()

      // Query at T40 (before promotion)
      const state_40 = state_1.branch(state_1.ground_state, 40)
      const child = Belief.from(state_40, [ball])
      state_40.lock()

      expect(child.get_trait(state_40, color_tt)).to.equal('red')
    })

    it('deep chain with multiple queries at different times', () => {
      // v1@T1 → v2@T20 → v3@T40 → v4@T60 → v5@T80
      const eidos_mind = new Materia(eidos(), 'shared')
      const color_tt = Traittype.get_by_label('color')

      const state_1 = eidos_mind.create_state(eidos().origin_state, { tt: 1 })
      const ball_v1 = Belief.from_template(state_1, {
        bases: ['PortableObject'],
        traits: { color: 'v1' },
        label: 'ball'
      })
      state_1.lock()

      const state_20 = state_1.branch(state_1.ground_state, 20)
      const ball_v2 = ball_v1.replace(state_20, { color: 'v2' }, { promote: true })
      state_20.lock()

      const state_40 = state_20.branch(state_20.ground_state, 40)
      const ball_v3 = ball_v2.replace(state_40, { color: 'v3' }, { promote: true })
      state_40.lock()

      const state_60 = state_40.branch(state_40.ground_state, 60)
      const ball_v4 = ball_v3.replace(state_60, { color: 'v4' }, { promote: true })
      state_60.lock()

      const state_80 = state_60.branch(state_60.ground_state, 80)
      ball_v4.replace(state_80, { color: 'v5' }, { promote: true })
      state_80.lock()

      // Query at various times
      const test_cases = [
        { tt: 10, ground: state_1, expected: 'v1' },
        { tt: 30, ground: state_20, expected: 'v2' },
        { tt: 50, ground: state_40, expected: 'v3' },
        { tt: 70, ground: state_60, expected: 'v4' },
        { tt: 90, ground: state_80, expected: 'v5' }
      ]

      for (const { tt, ground, expected } of test_cases) {
        const query_state = ground.branch(ground.ground_state, tt)
        const child = Belief.from(query_state, [ball_v1])
        query_state.lock()
        expect(child.get_trait(query_state, color_tt)).to.equal(expected, `T${tt} should get ${expected}`)
      }
    })
  })

  describe('Prototype inheritance chain', () => {
    // Common pattern: NPC → city → country → region
    // Traits should resolve correctly through the chain.

    it('traits inherit through promotion chain', () => {
      const state = createEidosState()
      const color_tt = Traittype.get_by_label('color')
      const form_tt = Traittype.get_by_label('@form')

      const region = Belief.from_template(state, {
        bases: ['ObjectPhysical'],
        traits: { color: 'green' },
        label: 'region'
      })
      region.replace(state, { color: 'brown' }, { promote: true })

      const country = Belief.from_template(state, {
        bases: [region],
        traits: { '@form': 'solid' },
        label: 'country'
      })

      const city = Belief.from_template(state, { bases: [country], label: 'city' })

      // Create npc with city FIRST in bases (before Person) so region's promotion
      // is reached before Person's archetype chain (which has color: null)
      const npc = Belief.from(state, [city, Archetype.get_by_label('Person')])
      state.lock()

      // color comes from region's promotion (brown)
      expect(npc.get_trait(state, color_tt)).to.equal('brown')
      // @form comes from country
      expect(npc.get_trait(state, form_tt)).to.equal('solid')
    })

    it('deep base promotion is materialized (gap scenario)', () => {
      // A → B → C, only C has promotion
      // When A creates promotion, should materialize B_v2 pointing to C_v2
      const state = createEidosState()
      const color_tt = Traittype.get_by_label('color')

      const C = Belief.from_template(state, {
        bases: ['ObjectPhysical'],
        traits: { color: 'red' },
        label: 'C'
      })
      C.replace(state, { color: 'blue' }, { promote: true })

      const B = Belief.from_template(state, { bases: [C], label: 'B' })
      const A = Belief.from_template(state, { bases: ['Person', B], label: 'A' })

      const A2 = A.replace(state, { '@form': 'vapor' }, { promote: true })
      state.lock()

      expect(A2.get_trait(state, color_tt)).to.equal('blue')
    })

    it('chained promotions resolve to innermost', () => {
      const state = createEidosState()
      const color_tt = Traittype.get_by_label('color')

      const ball_v1 = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: { color: 'red' },
        label: 'ball'
      })
      const ball_v2 = ball_v1.branch(state, { color: 'blue' }, { promote: true })
      ball_v2.branch(state, { color: 'green' }, { promote: true })

      const my_ball = Belief.from(state, [ball_v1])
      state.lock()

      expect(my_ball.get_trait(state, color_tt)).to.equal('green')
    })
  })

  describe('Trait inheritance - before vs after split', () => {
    // Critical distinction:
    // - Traits set BEFORE promotion split → NOT Fuzzy
    // - Traits set BY promotions → Fuzzy

    it('archetype trait not set by promotions stays concrete', () => {
      const state = createEidosState()
      const form_tt = Traittype.get_by_label('@form')
      const color_tt = Traittype.get_by_label('color')

      const obj = Belief.from_template(state, {
        bases: ['PortableObject'],  // Has @form default
        label: 'obj'
      })

      // Promotions only set color, not @form
      obj.replace(state, { color: 'red' }, { promote: true, certainty: 0.6 })
      obj.replace(state, { color: 'blue' }, { promote: true, certainty: 0.4 })

      const child = Belief.from(state, [obj])
      state.lock()

      // @form from archetype - NOT Fuzzy
      const form = child.get_trait(state, form_tt)
      expect(form).to.not.be.instanceOf(Fuzzy)

      // color set BY promotions - IS Fuzzy
      const color = child.get_trait(state, color_tt)
      expect(color).to.be.instanceOf(Fuzzy)
    })

    it('trait on base before promotions stays concrete', () => {
      const state = createEidosState()
      const form_tt = Traittype.get_by_label('@form')
      const color_tt = Traittype.get_by_label('color')

      const obj = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: { '@form': 'solid' },  // Set BEFORE promotions
        label: 'obj'
      })

      obj.replace(state, { color: 'red' }, { promote: true, certainty: 0.6 })
      obj.replace(state, { color: 'blue' }, { promote: true, certainty: 0.4 })

      const child = Belief.from(state, [obj])
      state.lock()

      expect(child.get_trait(state, form_tt)).to.equal('solid')
      expect(child.get_trait(state, color_tt)).to.be.instanceOf(Fuzzy)
    })

    it('base trait overridden by promotions becomes Fuzzy', () => {
      const state = createEidosState()
      const color_tt = Traittype.get_by_label('color')

      const obj = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: { color: 'white' },  // Will be overridden
        label: 'obj'
      })

      obj.replace(state, { color: 'red' }, { promote: true, certainty: 0.6 })
      obj.replace(state, { color: 'blue' }, { promote: true, certainty: 0.4 })

      const child = Belief.from(state, [obj])
      state.lock()

      const color = child.get_trait(state, color_tt)
      expect(color).to.be.instanceOf(Fuzzy)
      // Base's 'white' is NOT included - promotions override
      expect(color.alternatives.map(a => a.value)).to.not.include('white')
    })

    it('empty promotions do not make inherited traits Fuzzy', () => {
      const state = createEidosState()
      const color_tt = Traittype.get_by_label('color')

      const obj = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: { color: 'red' },
        label: 'obj'
      })

      // Empty promotions
      obj.replace(state, {}, { promote: true, certainty: 0.5 })
      obj.replace(state, {}, { promote: true, certainty: 0.5 })

      const child = Belief.from(state, [obj])
      state.lock()

      // color from base, not touched by promotions
      expect(child.get_trait(state, color_tt)).to.equal('red')
    })
  })

  describe('Promotions without certainty', () => {
    // promote: true without certainty is for temporal evolution, not probability

    it('single promotion without certainty resolves directly', () => {
      const state = createEidosState()
      const color_tt = Traittype.get_by_label('color')

      const obj = Belief.from_template(state, {
        bases: ['PortableObject'],
        label: 'obj'
      })

      obj.replace(state, { color: 'red' }, { promote: true })  // No certainty

      const child = Belief.from(state, [obj])
      state.lock()

      expect(child.get_trait(state, color_tt)).to.equal('red')
    })
  })

  describe('Private beliefs using shared prototypes', () => {
    it('world NPC sees promoted version of shared prototype', () => {
      const shared_mind = new Materia(eidos(), 'shared')
      const shared_state = shared_mind.create_state(eidos().origin_state, { tt: 1 })

      const workshop = Belief.from_template(shared_state, { bases: ['Location'], label: 'workshop' })
      const tavern = Belief.from_template(shared_state, { bases: ['Location'], label: 'tavern' })

      const artisan_type = Belief.from_template(shared_state, {
        bases: ['Person'],
        traits: { location: workshop.subject },
        label: 'artisan_type'
      })
      artisan_type.branch(shared_state, { location: tavern.subject }, { promote: true })
      shared_state.lock()

      // World mind as child of shared_mind
      const world_mind = new Materia(shared_mind, 'world')
      const world_state = world_mind.create_state(shared_state)

      const smith = Belief.from(world_state, [artisan_type])
      world_state.lock()

      const location_tt = Traittype.get_by_label('location')
      expect(smith.get_trait(world_state, location_tt)).to.equal(tavern.subject)
    })

    it('non-Eidos replace does not create promotions', () => {
      // First create shared prototype in Eidos
      const shared_mind = new Materia(eidos(), 'shared')
      const shared_state = shared_mind.create_state(eidos().origin_state, { tt: 1 })
      const prototype = Belief.from_template(shared_state, {
        bases: ['PortableObject'],
        traits: { color: 'red' },
        label: 'prototype'
      })
      shared_state.lock()

      // World mind under logos (NOT Eidos)
      const world_mind = new Materia(logos(), 'world')
      const world_state = world_mind.create_state(logos().origin_state, { tt: 1 })

      const my_thing = Belief.from(world_state, [prototype])
      const my_thing_v2 = my_thing.replace(world_state, { color: 'blue' })

      expect(my_thing.promotions.size).to.equal(0)
      expect(my_thing_v2._bases.has(my_thing)).to.be.true
    })
  })

  describe('Edge cases', () => {
    it('promotion changing one trait preserves others', () => {
      const state = createEidosState()
      const color_tt = Traittype.get_by_label('color')
      const form_tt = Traittype.get_by_label('@form')

      const thing = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: { color: 'red', '@form': 'solid' },
        label: 'thing'
      })

      thing.branch(state, { color: 'blue' }, { promote: true })

      const my_thing = Belief.from(state, [thing])
      state.lock()

      expect(my_thing.get_trait(state, color_tt)).to.equal('blue')
      expect(my_thing.get_trait(state, form_tt)).to.equal('solid')
    })

    it('null trait in promotion shadows inherited value', () => {
      const state = createEidosState()
      const color_tt = Traittype.get_by_label('color')

      const thing = Belief.from_template(state, {
        bases: ['PortableObject'],
        traits: { color: 'red' },
        label: 'thing'
      })

      thing.branch(state, { color: null }, { promote: true })

      const my_thing = Belief.from(state, [thing])
      state.lock()

      expect(my_thing.get_trait(state, color_tt)).to.equal(null)
    })

    it('pick_promotion returns null when all promotions are in future', () => {
      const eidos_mind = new Materia(eidos(), 'shared')

      const state_1 = eidos_mind.create_state(eidos().origin_state, { tt: 1 })
      const ball = Belief.from_template(state_1, {
        bases: ['PortableObject'],
        label: 'ball'
      })
      state_1.lock()

      const state_50 = state_1.branch(state_1.ground_state, 50)
      ball.replace(state_50, { color: 'blue' }, { promote: true })
      state_50.lock()

      // Query at T40 - no valid promotions
      const state_40 = state_1.branch(state_1.ground_state, 40)
      const resolved = state_40.pick_promotion(ball.promotions, {})
      expect(resolved).to.be.null
    })
  })

  describe('save/load round-trip', () => {
    it('promotions survive serialization', () => {
      // Use sub-mind of Eidos for saveAndReload compatibility
      const shared_mind = new Materia(eidos(), 'shared')
      const shared_state = shared_mind.create_state(eidos().origin_state, { tt: 1 })

      const ball_type = Belief.from_template(shared_state, {
        bases: ['PortableObject'],
        traits: { color: 'red' },
        label: 'ball_type'
      })
      ball_type.branch(shared_state, { color: 'blue' }, { promote: true })

      // Create child that inherits - this stays in state
      const my_ball = Belief.from_template(shared_state, {
        bases: [ball_type],
        label: 'my_ball'
      })
      shared_state.lock()

      const loaded_mind = saveAndReload(shared_mind)
      const loaded_state = [...loaded_mind._states][0]
      const loaded_my_ball = loaded_state.get_belief_by_label('my_ball')

      // Verify trait resolution works through promotion
      const color_tt = Traittype.get_by_label('color')
      expect(loaded_my_ball.get_trait(loaded_state, color_tt)).to.equal('blue')
    })

    it('probability promotions survive serialization', () => {
      const shared_mind = new Materia(eidos(), 'shared')
      const shared_state = shared_mind.create_state(eidos().origin_state, { tt: 1 })

      const shop = Belief.from_template(shared_state, { bases: ['Location'], label: 'shop' })
      const inn = Belief.from_template(shared_state, { bases: ['Location'], label: 'inn' })

      const merchant_type = Belief.from_template(shared_state, {
        bases: ['Person'],
        label: 'merchant_type'
      })
      merchant_type.branch(shared_state, { location: shop.subject }, { promote: true, certainty: 0.6 })
      merchant_type.branch(shared_state, { location: inn.subject }, { promote: true, certainty: 0.4 })

      // Create child that inherits
      const my_merchant = Belief.from_template(shared_state, {
        bases: [merchant_type],
        label: 'my_merchant'
      })
      shared_state.lock()

      const loaded_mind = saveAndReload(shared_mind)
      const loaded_state = [...loaded_mind._states][0]
      const loaded_my_merchant = loaded_state.get_belief_by_label('my_merchant')

      // Verify Fuzzy trait resolution works
      const location_tt = Traittype.get_by_label('location')
      const location = loaded_my_merchant.get_trait(loaded_state, location_tt)
      expect(location).to.be.instanceOf(Fuzzy)
      expect(location.alternatives).to.have.lengthOf(2)
    })

    it('Fuzzy from inheritance survives save/load', () => {
      const shared_mind = new Materia(eidos(), 'shared')
      const shared_state = shared_mind.create_state(eidos().origin_state, { tt: 1 })

      const ball_type = Belief.from_template(shared_state, {
        bases: ['PortableObject'],
        label: 'ball_type'
      })
      ball_type.replace(shared_state, { color: 'red' }, { promote: true, certainty: 0.6 })
      ball_type.replace(shared_state, { color: 'blue' }, { promote: true, certainty: 0.4 })

      const my_ball = Belief.from_template(shared_state, {
        bases: [ball_type],
        label: 'my_ball'
      })
      shared_state.lock()

      const color_tt = Traittype.get_by_label('color')
      expect(my_ball.get_trait(shared_state, color_tt)).to.be.instanceOf(Fuzzy)

      const loaded_mind = saveAndReload(shared_mind)
      const loaded_state = [...loaded_mind._states][0]
      const loaded_my_ball = loaded_state.get_belief_by_label('my_ball')

      const loaded_color_tt = Traittype.get_by_label('color')
      expect(loaded_my_ball.get_trait(loaded_state, loaded_color_tt)).to.be.instanceOf(Fuzzy)
    })
  })
})
