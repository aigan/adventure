/**
 * Prototype Depth Scenario
 *
 * Tests scaling of inheritance chain depth and width.
 * Simulates cultural knowledge cascade: Country -> Region -> City -> Village -> Person
 * Each level adds traits, person inherits thousands.
 */

import {
  setup_perf_environment,
  benchmark,
  measure_memory,
  memory_delta,
  format_bytes,
  format_time,
  print_benchmark,
  create_deep_prototype_chain,
  createStateInNewMind,
  analyze_belief_cache,
  Traittype
} from '../helpers.mjs'

export const scenario = {
  name: 'Prototype Depth',
  description: 'Test performance with deep prototype inheritance chains',

  parameters: [
    { depth: 10, traits_per_level: 10 },   // 100 inherited traits (baseline)
    { depth: 50, traits_per_level: 10 },   // 500 inherited traits
    { depth: 100, traits_per_level: 10 },  // 1,000 inherited traits
    { depth: 100, traits_per_level: 50 },  // 5,000 inherited traits
    { depth: 200, traits_per_level: 50 },  // 10,000 inherited traits
  ],

  async run({ depth, traits_per_level }) {
    console.log(`\n--- depth=${depth} (belief chain length) ---`)

    // Measure prototype chain creation
    setup_perf_environment()
    const mem_before = measure_memory()
    const setup_start = performance.now()

    const proto = create_deep_prototype_chain(depth, traits_per_level)

    const setup_time = performance.now() - setup_start
    const mem_after_proto = measure_memory()

    console.log(`  Prototype chain creation: ${format_time(setup_time)}`)
    console.log(`  Memory for prototypes: ${format_bytes(memory_delta(mem_before, mem_after_proto).heap_used)}`)

    // Create instance belief
    const state = createStateInNewMind('world')
    const belief = state.add_belief_from_template({
      bases: [proto.get_label()],
      traits: {}
    })
    state.lock()

    const mem_after_instance = measure_memory()
    console.log(`  Memory for instance: ${format_bytes(memory_delta(mem_after_proto, mem_after_instance).heap_used)}`)

    // Benchmark trait resolution at different depths
    const results = {}

    // Trait at deepest level (level 0 - first created)
    const deep_tt = Traittype.get_by_label('color')
    if (deep_tt) {
      results.deep_trait_first_access = benchmark('deep_trait_first', () => {
        // Need to test first access, so recreate
        setup_perf_environment()
        const fresh_proto = create_deep_prototype_chain(depth, traits_per_level)
        const fresh_state = createStateInNewMind('world')
        const fresh_belief = fresh_state.add_belief_from_template({
          bases: [fresh_proto.get_label()],
          traits: {}
        })
        fresh_state.lock()
        const tt = Traittype.get_by_label('color')
        return fresh_belief.get_trait(fresh_state, tt)
      }, 10, 2) // Fewer iterations since setup is expensive

      print_benchmark(results.deep_trait_first_access)
    }

    // Cached access (after first access)
    if (deep_tt) {
      // Prime cache
      belief.get_trait(state, deep_tt)

      results.deep_trait_cached = benchmark('deep_trait_cached', () => {
        return belief.get_trait(state, deep_tt)
      })
      print_benchmark(results.deep_trait_cached)
    }

    // Also test location trait (inherited from archetype, not belief chain)
    const location_tt = Traittype.get_by_label('location')
    if (location_tt) {
      results.archetype_trait = benchmark('archetype_trait', () => {
        return belief.get_trait(state, location_tt)
      })
      print_benchmark(results.archetype_trait)
    }

    // Test get_traits() iteration (all traits)
    results.get_traits_all = benchmark('get_traits_all', () => {
      let count = 0
      for (const [tt, value] of belief.get_traits(state)) {
        count++
      }
      return count
    }, 100)
    print_benchmark(results.get_traits_all)

    // Analyze cache state
    const cache = analyze_belief_cache(belief)
    console.log(`  Cache analysis:`)
    console.log(`    cached_traits: ${cache.cached_traits}`)
    console.log(`    cached_all: ${cache.cached_all}`)
    console.log(`    bases_count: ${cache.bases_count}`)

    // Test unlocked (no cache) performance
    setup_perf_environment()
    const unlocked_proto = create_deep_prototype_chain(depth, traits_per_level)
    const unlocked_state = createStateInNewMind('world')
    const unlocked_belief = unlocked_state.add_belief_from_template({
      bases: [unlocked_proto.get_label()],
      traits: {}
    })
    // Don't lock - no caching
    const unlocked_tt = Traittype.get_by_label('color')

    results.deep_trait_no_cache = benchmark('deep_trait_no_cache', () => {
      return unlocked_belief.get_trait(unlocked_state, unlocked_tt)
    })
    print_benchmark(results.deep_trait_no_cache)

    // Calculate speedup from caching
    if (results.deep_trait_cached && results.deep_trait_no_cache) {
      const speedup = results.deep_trait_no_cache.median / results.deep_trait_cached.median
      console.log(`  Cache speedup: ${speedup.toFixed(1)}x`)
    }

    const final_mem = measure_memory()
    console.log(`  Total memory used: ${format_bytes(final_mem.heap_used)}`)

    return results
  }
}

/**
 * Run the scenario
 */
export async function run() {
  console.log(`\n========================================`)
  console.log(`${scenario.name}`)
  console.log(`${scenario.description}`)
  console.log(`========================================`)

  for (const params of scenario.parameters) {
    await scenario.run(params)
  }
}

// Allow running directly
if (process.argv[1]?.endsWith('prototype_depth.scenario.mjs')) {
  run().catch(console.error)
}
