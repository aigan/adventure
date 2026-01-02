/**
 * Promotion Benchmarks
 *
 * Tests the performance of promotions under various conditions:
 * - Temporal promotion chains (v1→v2→...→vN)
 * - Probability branches (multiple alternatives)
 * - Mixed temporal + probability
 * - Cache invalidation via epoch bumping
 * - Fuzzy trait resolution
 */

import {
  setup_perf_environment,
  benchmark,
  print_benchmark,
  createStateInNewMind,
  createEidosState,
  Traittype,
  Belief,
  eidos,
  Materia,
  measure_memory,
  memory_delta,
  format_bytes,
  create_temporal_promotion_chain,
  create_probability_promotions,
  create_mixed_promotions,
  create_promotion_dependent_beliefs,
  analyze_promotion_cache_deps,
  measure_epoch_invalidation_cascade
} from '../helpers.mjs'

export const suite = {
  name: 'Promotions',

  benchmarks: [
    // =========================================================================
    // PROMOTION CREATION
    // =========================================================================
    {
      name: 'promotion_create_single',
      description: 'Create a single temporal promotion',
      setup() {
        setup_perf_environment()
        return {}
      },
      fn() {
        setup_perf_environment()
        const eidos_state = createEidosState(1)
        const belief = eidos_state.add_belief_from_template({
          bases: ['ObjectPhysical'],
          traits: { color: 'original' },
          promotable: true
        })
        eidos_state.lock()
        const state2 = eidos_state.branch(eidos_state.ground_state, 100)
        belief.replace(state2, { color: 'promoted' }, { promote: true })
        return belief
      },
      iterations: 500
    },

    {
      name: 'promotion_create_chain_10',
      description: 'Create temporal promotion chain of depth 10',
      setup() {
        setup_perf_environment()
        return {}
      },
      fn() {
        setup_perf_environment()
        return create_temporal_promotion_chain(10)
      },
      iterations: 100
    },

    {
      name: 'promotion_create_chain_50',
      description: 'Create temporal promotion chain of depth 50',
      setup() {
        setup_perf_environment()
        return {}
      },
      fn() {
        setup_perf_environment()
        return create_temporal_promotion_chain(50)
      },
      iterations: 20
    },

    {
      name: 'promotion_create_chain_100',
      description: 'Create temporal promotion chain of depth 100',
      setup() {
        setup_perf_environment()
        return {}
      },
      fn() {
        setup_perf_environment()
        return create_temporal_promotion_chain(100)
      },
      iterations: 10
    },

    // =========================================================================
    // PROBABILITY PROMOTIONS
    // =========================================================================
    {
      name: 'promotion_probability_5',
      description: 'Create 5 probability promotions on one belief',
      setup() {
        setup_perf_environment()
        return {}
      },
      fn() {
        setup_perf_environment()
        const fresh_state = createEidosState(1)
        const root = fresh_state.add_belief_from_template({
          bases: ['ObjectPhysical'],
          traits: { color: 'original' },
          promotable: true
        })
        return create_probability_promotions(root, fresh_state, 5)
      },
      iterations: 200
    },

    {
      name: 'promotion_probability_20',
      description: 'Create 20 probability promotions on one belief',
      setup() {
        setup_perf_environment()
        return {}
      },
      fn() {
        setup_perf_environment()
        const fresh_state = createEidosState(1)
        const root = fresh_state.add_belief_from_template({
          bases: ['ObjectPhysical'],
          traits: { color: 'original' },
          promotable: true
        })
        return create_probability_promotions(root, fresh_state, 20)
      },
      iterations: 100
    },

    {
      name: 'promotion_probability_50',
      description: 'Create 50 probability promotions on one belief',
      setup() {
        setup_perf_environment()
        return {}
      },
      fn() {
        setup_perf_environment()
        const fresh_state = createEidosState(1)
        const root = fresh_state.add_belief_from_template({
          bases: ['ObjectPhysical'],
          traits: { color: 'original' },
          promotable: true
        })
        return create_probability_promotions(root, fresh_state, 50)
      },
      iterations: 50
    },

    // =========================================================================
    // PICK PROMOTION (RESOLUTION)
    // =========================================================================
    {
      name: 'promotion_pick_from_chain_50',
      description: 'pick_promotion() with 50-deep temporal chain',
      setup() {
        setup_perf_environment()
        const { root, chain, states } = create_temporal_promotion_chain(50)
        const mid_state = states[25]
        return { root, mid_state }
      },
      fn({ root, mid_state }) {
        return mid_state.pick_promotion([...root.promotions])
      }
    },

    {
      name: 'promotion_pick_from_chain_100',
      description: 'pick_promotion() with 100-deep temporal chain',
      setup() {
        setup_perf_environment()
        const { root, chain, states } = create_temporal_promotion_chain(100)
        const mid_state = states[50]
        return { root, mid_state }
      },
      fn({ root, mid_state }) {
        return mid_state.pick_promotion([...root.promotions])
      },
      iterations: 500
    },

    {
      name: 'promotion_pick_from_chain_500',
      description: 'pick_promotion() with 500-deep temporal chain',
      setup() {
        setup_perf_environment()
        const { root, chain, states } = create_temporal_promotion_chain(500)
        const mid_state = states[250]
        return { root, mid_state }
      },
      fn({ root, mid_state }) {
        return mid_state.pick_promotion([...root.promotions])
      },
      iterations: 200
    },

    // =========================================================================
    // FUZZY TRAIT RESOLUTION
    // =========================================================================
    {
      name: 'promotion_trait_with_fuzzy_10',
      description: 'Get trait that resolves to Fuzzy with 10 alternatives',
      setup() {
        setup_perf_environment()
        const eidos_state = createEidosState(1)
        const root = eidos_state.add_belief_from_template({
          bases: ['ObjectPhysical'],
          traits: { color: 'original' },
          label: 'fuzzy_root',
          promotable: true
        })
        create_probability_promotions(root, eidos_state, 10)
        eidos_state.lock()

        // Create inheriting belief in a child mind - branch from the state
        const eidos_mind = eidos()
        const world = new Materia(eidos_mind, 'fuzzy_world')
        const world_state = eidos_state.branch(eidos_state.ground_state, 2)
        const inheritor = world_state.add_belief_from_template({
          bases: [root],
          traits: {}
        })
        world_state.lock()
        const color_tt = Traittype.get_by_label('color')
        return { inheritor, world_state, color_tt }
      },
      fn({ inheritor, world_state, color_tt }) {
        return inheritor.get_trait(world_state, color_tt)
      }
    },

    {
      name: 'promotion_trait_with_fuzzy_50',
      description: 'Get trait that resolves to Fuzzy with 50 alternatives',
      setup() {
        setup_perf_environment()
        const eidos_state = createEidosState(1)
        const root = eidos_state.add_belief_from_template({
          bases: ['ObjectPhysical'],
          traits: { color: 'original' },
          label: 'fuzzy_root_50',
          promotable: true
        })
        create_probability_promotions(root, eidos_state, 50)
        eidos_state.lock()

        // Branch from the state to get a new tt
        const world_state = eidos_state.branch(eidos_state.ground_state, 2)
        const inheritor = world_state.add_belief_from_template({
          bases: [root],
          traits: {}
        })
        world_state.lock()
        const color_tt = Traittype.get_by_label('color')
        return { inheritor, world_state, color_tt }
      },
      fn({ inheritor, world_state, color_tt }) {
        return inheritor.get_trait(world_state, color_tt)
      },
      iterations: 500
    },

    // =========================================================================
    // CACHE INVALIDATION
    // =========================================================================
    {
      name: 'promotion_epoch_invalidation_cascade',
      description: 'Cache invalidation across dependent beliefs when promotion added',
      setup() {
        setup_perf_environment()
        return {}
      },
      run() {
        // Measure time to invalidate and re-resolve
        const times = []
        for (let i = 0; i < 50; i++) {
          // Reset
          setup_perf_environment()
          const fresh_eidos_state = createEidosState(1)
          const fresh_promotable = fresh_eidos_state.add_belief_from_template({
            bases: ['ObjectPhysical'],
            traits: { color: 'root_color' },
            label: 'epoch_root',
            promotable: true
          })
          fresh_eidos_state.lock()

          // Branch to get a world state
          const fresh_world_state = fresh_eidos_state.branch(fresh_eidos_state.ground_state, 2)
          const fresh_dependents = create_promotion_dependent_beliefs(fresh_promotable, 100, fresh_world_state)
          fresh_world_state.lock()

          const fresh_color_tt = Traittype.get_by_label('color')
          for (const dep of fresh_dependents) {
            dep.get_trait(fresh_world_state, fresh_color_tt)
          }

          // Add promotion and measure re-access
          const state2 = fresh_eidos_state.branch(fresh_eidos_state.ground_state, 1000)
          fresh_promotable.branch(state2, { color: 'new_color' }, { promote: true, certainty: 0.5 })

          const start = performance.now()
          for (const dep of fresh_dependents) {
            dep.get_trait(fresh_world_state, fresh_color_tt)
          }
          times.push(performance.now() - start)
        }

        times.sort((a, b) => a - b)
        return {
          median_reaccess_100_deps: times[Math.floor(times.length / 2)],
          p99_reaccess_100_deps: times[Math.floor(times.length * 0.99)]
        }
      }
    },

    // =========================================================================
    // MIXED TEMPORAL + PROBABILITY
    // =========================================================================
    {
      name: 'promotion_mixed_temporal_probability',
      description: 'Trait resolution with mixed temporal (10) + probability (5) promotions',
      setup() {
        setup_perf_environment()
        const { root, structure, eidos_state } = create_mixed_promotions(10, 5)

        // Query from mid-point - branch to get a new state
        const mid_state = structure[5].state
        const world_state = mid_state.branch(mid_state.ground_state, mid_state.tt + 1)
        const inheritor = world_state.add_belief_from_template({
          bases: [root],
          traits: {}
        })
        world_state.lock()
        const color_tt = Traittype.get_by_label('color')

        return { inheritor, world_state, color_tt }
      },
      fn({ inheritor, world_state, color_tt }) {
        return inheritor.get_trait(world_state, color_tt)
      },
      iterations: 500
    }
  ]
}

/**
 * Run all benchmarks in this suite
 */
export async function run() {
  console.log(`\n=== ${suite.name} ===`)

  for (const bench of suite.benchmarks) {
    console.log(`\n${bench.name}`)
    console.log(`  ${bench.description}`)

    if (bench.run) {
      // Custom run function
      const ctx = bench.setup ? bench.setup() : {}
      const result = bench.run(ctx)
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'number') {
          console.log(`  ${key}: ${value.toFixed(4)} ms`)
        } else {
          console.log(`  ${key}: ${value}`)
        }
      }
    } else {
      // Standard benchmark
      const ctx = bench.setup ? bench.setup() : {}
      const iterations = bench.iterations || 1000
      const result = benchmark(bench.name, () => bench.fn(ctx), iterations)
      print_benchmark(result)
    }
  }
}

// Allow running directly
if (process.argv[1]?.endsWith('promotion.bench.mjs')) {
  run().catch(console.error)
}
