/**
 * Trait Resolution Benchmarks
 *
 * Tests the performance of get_trait() under various conditions:
 * - Own traits (direct lookup)
 * - Inherited traits (BFS through bases)
 * - Cached vs uncached access
 * - Composable traits (multi-base composition)
 */

import {
  setup_perf_environment,
  benchmark,
  print_benchmark,
  create_deep_prototype_chain,
  createStateInNewMind,
  Traittype,
  Belief,
  measure_memory,
  memory_delta,
  format_bytes,
  analyze_belief_cache
} from '../helpers.mjs'

export const suite = {
  name: 'Trait Resolution',

  benchmarks: [
    {
      name: 'get_trait_own',
      description: 'Direct trait lookup (no inheritance)',
      setup() {
        setup_perf_environment()
        const state = createStateInNewMind('world')
        const belief = state.add_belief_from_template({
          bases: ['PortableObject'],
          traits: { color: 'red' }
        })
        state.lock()
        const color_tt = Traittype.get_by_label('color')
        return { belief, state, tt: color_tt }
      },
      fn({ belief, state, tt }) {
        return belief.get_trait(state, tt)
      }
    },

    {
      name: 'get_trait_inherited_depth_5',
      description: 'Trait lookup through 5 levels of inheritance',
      setup() {
        setup_perf_environment()
        const proto = create_deep_prototype_chain(5, 5)
        const state = createStateInNewMind('world')
        const belief = state.add_belief_from_template({
          bases: [proto.get_label()],
          traits: {}
        })
        state.lock()
        // Get trait from deepest level
        const tt = Traittype.get_by_label('color')
        return { belief, state, tt }
      },
      fn({ belief, state, tt }) {
        return belief.get_trait(state, tt)
      }
    },

    {
      name: 'get_trait_inherited_depth_10',
      description: 'Trait lookup through 10 levels of inheritance',
      setup() {
        setup_perf_environment()
        const proto = create_deep_prototype_chain(10, 5)
        const state = createStateInNewMind('world')
        const belief = state.add_belief_from_template({
          bases: [proto.get_label()],
          traits: {}
        })
        state.lock()
        const tt = Traittype.get_by_label('color')
        return { belief, state, tt }
      },
      fn({ belief, state, tt }) {
        return belief.get_trait(state, tt)
      }
    },

    {
      name: 'get_trait_inherited_depth_50',
      description: 'Trait lookup through 50 levels of inheritance',
      setup() {
        setup_perf_environment()
        const proto = create_deep_prototype_chain(50, 2)
        const state = createStateInNewMind('world')
        const belief = state.add_belief_from_template({
          bases: [proto.get_label()],
          traits: {}
        })
        state.lock()
        const tt = Traittype.get_by_label('color')
        return { belief, state, tt }
      },
      fn({ belief, state, tt }) {
        return belief.get_trait(state, tt)
      }
    },

    {
      name: 'get_trait_inherited_depth_100',
      description: 'Trait lookup through 100 levels of inheritance',
      setup() {
        setup_perf_environment()
        const proto = create_deep_prototype_chain(100, 2)
        const state = createStateInNewMind('world')
        const belief = state.add_belief_from_template({
          bases: [proto.get_label()],
          traits: {}
        })
        state.lock()
        const tt = Traittype.get_by_label('color')
        return { belief, state, tt }
      },
      fn({ belief, state, tt }) {
        return belief.get_trait(state, tt)
      }
    },

    {
      name: 'get_trait_cached_vs_first_access',
      description: 'Compare first access (cache miss) vs subsequent (cache hit)',
      setup() {
        setup_perf_environment()
        const proto = create_deep_prototype_chain(20, 5)
        const state = createStateInNewMind('world')
        const belief = state.add_belief_from_template({
          bases: [proto.get_label()],
          traits: {}
        })
        state.lock()
        const tt = Traittype.get_by_label('color')
        return { belief, state, tt }
      },
      run({ belief, state, tt }) {
        // First access - cache miss
        const first_times = []
        for (let i = 0; i < 100; i++) {
          // Reset cache by creating new belief each time
          setup_perf_environment()
          const proto = create_deep_prototype_chain(20, 5)
          const fresh_state = createStateInNewMind('world')
          const fresh_belief = fresh_state.add_belief_from_template({
            bases: [proto.get_label()],
            traits: {}
          })
          fresh_state.lock()
          const fresh_tt = Traittype.get_by_label('color')

          const start = performance.now()
          fresh_belief.get_trait(fresh_state, fresh_tt)
          first_times.push(performance.now() - start)
        }

        // Cached access
        setup_perf_environment()
        const proto = create_deep_prototype_chain(20, 5)
        const cached_state = createStateInNewMind('world')
        const cached_belief = cached_state.add_belief_from_template({
          bases: [proto.get_label()],
          traits: {}
        })
        cached_state.lock()
        const cached_tt = Traittype.get_by_label('color')

        // Prime cache
        cached_belief.get_trait(cached_state, cached_tt)

        const cached_times = []
        for (let i = 0; i < 1000; i++) {
          const start = performance.now()
          cached_belief.get_trait(cached_state, cached_tt)
          cached_times.push(performance.now() - start)
        }

        first_times.sort((a, b) => a - b)
        cached_times.sort((a, b) => a - b)

        return {
          first_access_median: first_times[Math.floor(first_times.length / 2)],
          cached_access_median: cached_times[Math.floor(cached_times.length / 2)],
          speedup: first_times[Math.floor(first_times.length / 2)] / cached_times[Math.floor(cached_times.length / 2)]
        }
      }
    },

    {
      name: 'get_trait_unlocked_no_cache',
      description: 'Trait lookup on unlocked belief (no caching)',
      setup() {
        setup_perf_environment()
        const proto = create_deep_prototype_chain(20, 5)
        const state = createStateInNewMind('world')
        const belief = state.add_belief_from_template({
          bases: [proto.get_label()],
          traits: {}
        })
        // Don't lock - caching disabled
        const tt = Traittype.get_by_label('color')
        return { belief, state, tt }
      },
      fn({ belief, state, tt }) {
        return belief.get_trait(state, tt)
      }
    },

    {
      name: 'get_traits_iterator',
      description: 'Iterate all traits with get_traits()',
      setup() {
        setup_perf_environment()
        const proto = create_deep_prototype_chain(10, 10)
        const state = createStateInNewMind('world')
        const belief = state.add_belief_from_template({
          bases: [proto.get_label()],
          traits: { color: 'red' }
        })
        state.lock()
        return { belief, state }
      },
      fn({ belief, state }) {
        let count = 0
        for (const [tt, value] of belief.get_traits(state)) {
          count++
        }
        return count
      }
    },

    {
      name: 'get_defined_traits_iterator',
      description: 'Iterate all defined traits (including null)',
      setup() {
        setup_perf_environment()
        const proto = create_deep_prototype_chain(10, 10)
        const state = createStateInNewMind('world')
        const belief = state.add_belief_from_template({
          bases: [proto.get_label()],
          traits: { color: 'red' }
        })
        state.lock()
        return { belief, state }
      },
      fn({ belief, state }) {
        let count = 0
        for (const [tt, value] of belief.get_defined_traits(state)) {
          count++
        }
        return count
      }
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
          console.log(`  ${key}: ${value.toFixed(4)}`)
        } else {
          console.log(`  ${key}: ${value}`)
        }
      }
    } else {
      // Standard benchmark
      const ctx = bench.setup ? bench.setup() : {}
      const result = benchmark(bench.name, () => bench.fn(ctx))
      print_benchmark(result)

      // Also show cache state for locked beliefs
      if (ctx.belief && ctx.belief.locked) {
        const cache = analyze_belief_cache(ctx.belief)
        console.log(`    cache: ${cache.cached_traits} traits cached, cached_all: ${cache.cached_all}`)
      }
    }
  }
}

// Allow running directly
if (process.argv[1].endsWith('trait_resolution.bench.mjs')) {
  run().catch(console.error)
}
