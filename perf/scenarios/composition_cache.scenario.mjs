/**
 * Composition & Cache Scale Scenario
 *
 * Tests extreme scaling of composition and caching:
 * - Wide composition up to 200 bases
 * - Deep inheritance chains up to 200 levels
 * - Millions of beliefs with complex composition
 * - Cache memory scaling
 * - Composable arrays with 10K+ items
 */

import {
  setup_perf_environment,
  benchmark,
  measure_memory,
  memory_delta,
  format_bytes,
  format_time,
  print_benchmark,
  createStateInNewMind,
  eidos,
  Materia,
  logos,
  logos_state,
  Traittype,
  Belief,
  create_wide_belief,
  create_prototype_tree,
  create_composable_inventory_chain,
  create_deep_prototype_chain,
  analyze_belief_cache,
  analyze_cache_memory_scaling,
  count_registries
} from '../helpers.mjs'

export const scenario = {
  name: 'Composition & Cache Scale',
  description: 'Test performance with extreme composition and caching scenarios',

  parameters: [
    { bases: 10, depth: 20, beliefs: 10000 },        // baseline
    { bases: 50, depth: 50, beliefs: 100000 },       // moderate
    { bases: 100, depth: 100, beliefs: 500000 },     // large
    // { bases: 200, depth: 200, beliefs: 1000000 }  // extreme (uncomment to stress test)
  ],

  async run({ bases, depth, beliefs }) {
    console.log(`\n--- bases=${bases}, depth=${depth}, beliefs=${beliefs.toLocaleString()} ---`)

    const results = {}

    // =========================================================================
    // WIDE COMPOSITION
    // =========================================================================
    console.log(`\n  [Wide Composition - ${bases} bases]`)
    setup_perf_environment()
    const mem_before_wide = measure_memory()
    const wide_start = performance.now()

    const world = createStateInNewMind('world')
    const { belief: wide_belief, bases: wide_bases } = create_wide_belief(bases, world)
    world.lock()

    const wide_time = performance.now() - wide_start
    const mem_after_wide = measure_memory()

    console.log(`    Creation time: ${format_time(wide_time)}`)
    console.log(`    Memory: ${format_bytes(memory_delta(mem_before_wide, mem_after_wide).heap_used)}`)
    console.log(`    Bytes per base: ${(memory_delta(mem_before_wide, mem_after_wide).heap_used / bases).toFixed(0)} B`)

    // Benchmark color trait lookup (all bases have color)
    const color_tt = Traittype.get_by_label('color')

    results.wide_trait_color = benchmark('wide_trait_color', () => {
      return wide_belief.get_trait(world, color_tt)
    }, 500)
    print_benchmark(results.wide_trait_color)

    // Cache analysis
    const wide_cache = analyze_belief_cache(wide_belief)
    console.log(`    Cached traits: ${wide_cache.cached_traits}`)
    console.log(`    Cached all: ${wide_cache.cached_all}`)

    // =========================================================================
    // DEEP PROTOTYPE CHAIN
    // =========================================================================
    console.log(`\n  [Deep Prototype Chain - ${depth} levels]`)
    setup_perf_environment()
    const mem_before_deep = measure_memory()
    const deep_start = performance.now()

    const deep_proto = create_deep_prototype_chain(depth, 1)

    const deep_time = performance.now() - deep_start
    const mem_after_deep = measure_memory()

    console.log(`    Creation time: ${format_time(deep_time)}`)
    console.log(`    Memory: ${format_bytes(memory_delta(mem_before_deep, mem_after_deep).heap_used)}`)
    console.log(`    Bytes per level: ${(memory_delta(mem_before_deep, mem_after_deep).heap_used / depth).toFixed(0)} B`)

    // Create instance and benchmark
    const deep_world = createStateInNewMind('deep_world')
    const deep_instance = deep_world.add_belief_from_template({
      bases: [deep_proto.get_label()],
      traits: {}
    })
    deep_world.lock()

    const deep_color_tt = Traittype.get_by_label('color')

    // First access (uncached)
    results.deep_first_access = benchmark('deep_first_access', () => {
      setup_perf_environment()
      const fresh_proto = create_deep_prototype_chain(depth, 1)
      const fresh_world = createStateInNewMind('world')
      const fresh_instance = fresh_world.add_belief_from_template({
        bases: [fresh_proto.get_label()],
        traits: {}
      })
      fresh_world.lock()
      const tt = Traittype.get_by_label('color')
      return fresh_instance.get_trait(fresh_world, tt)
    }, 20, 2)
    print_benchmark(results.deep_first_access)

    // Cached access
    deep_instance.get_trait(deep_world, deep_color_tt) // Prime cache
    results.deep_cached_access = benchmark('deep_cached_access', () => {
      return deep_instance.get_trait(deep_world, deep_color_tt)
    }, 1000)
    print_benchmark(results.deep_cached_access)

    const speedup = results.deep_first_access.median / results.deep_cached_access.median
    console.log(`    Cache speedup: ${speedup.toFixed(1)}x`)

    // NOTE: Composable Array Scaling section removed - requires custom trait registration
    // that the standard archetype system doesn't support

    // =========================================================================
    // MANY BELIEFS WITH COMPOSITION
    // =========================================================================
    if (beliefs <= 500000) { // Skip for extreme scale
      console.log(`\n  [Mass Belief Creation - ${beliefs.toLocaleString()} beliefs]`)
      setup_perf_environment()

      // Create shared prototypes first
      const mass_eidos = eidos()
      const mass_eidos_state = mass_eidos.origin_state

      // Create a prototype tree for variety
      const proto_depth = Math.min(5, Math.ceil(Math.log2(bases)))
      const proto_branch = Math.min(3, bases)
      const { root: tree_root, nodes: proto_nodes } = create_prototype_tree(
        proto_depth,
        proto_branch,
        3,
        mass_eidos_state
      )

      const mem_before_mass = measure_memory()
      const mass_start = performance.now()

      const mass_world = new Materia(logos(), 'mass_world')
      const mass_state = mass_world.create_state(logos_state(), { tt: 1 })

      // Create beliefs distributed across prototypes
      const mass_beliefs = []
      for (let i = 0; i < beliefs; i++) {
        const proto = proto_nodes[i % proto_nodes.length]
        const belief = mass_state.add_belief_from_template({
          bases: [proto.get_label()],
          traits: { color: `belief_${i}` }
        })
        mass_beliefs.push(belief)
      }
      mass_state.lock()

      const mass_time = performance.now() - mass_start
      const mem_after_mass = measure_memory()

      console.log(`    Creation time: ${format_time(mass_time)}`)
      console.log(`    Memory: ${format_bytes(memory_delta(mem_before_mass, mem_after_mass).heap_used)}`)
      console.log(`    Bytes per belief: ${(memory_delta(mem_before_mass, mem_after_mass).heap_used / beliefs).toFixed(0)} B`)
      console.log(`    Beliefs per second: ${(beliefs / (mass_time / 1000)).toFixed(0)}`)

      // Benchmark trait access on random beliefs
      const sample_indices = Array.from({ length: 100 }, () => Math.floor(Math.random() * beliefs))
      const mass_color_tt = Traittype.get_by_label('color')

      results.mass_trait_access = benchmark('mass_trait_access', () => {
        const idx = sample_indices[Math.floor(Math.random() * sample_indices.length)]
        return mass_beliefs[idx].get_trait(mass_state, mass_color_tt)
      }, 1000)
      print_benchmark(results.mass_trait_access)

      // Analyze cache memory
      const sample_for_cache = mass_beliefs.slice(0, Math.min(1000, beliefs))
      const cache_stats = analyze_cache_memory_scaling(sample_for_cache)
      console.log(`    Cache analysis (sample of ${sample_for_cache.length}):`)
      console.log(`      Avg cached traits per belief: ${cache_stats.avg_cached_per_belief.toFixed(2)}`)
      console.log(`      Cached all percentage: ${cache_stats.cached_all_percentage}%`)
    }

    // =========================================================================
    // GET_TRAITS ITERATION SCALING
    // =========================================================================
    console.log(`\n  [get_traits() Iteration Scaling]`)

    const trait_counts = [10, 50, 100, 200]
    for (const trait_count of trait_counts) {
      if (trait_count > bases) continue

      setup_perf_environment()
      const iter_world = createStateInNewMind('iter_world')
      const { belief: iter_belief } = create_wide_belief(trait_count, iter_world)
      iter_world.lock()

      const iter_result = benchmark(`get_traits_${trait_count}`, () => {
        let count = 0
        for (const [tt, value] of iter_belief.get_traits(iter_world)) {
          count++
        }
        return count
      }, 100)

      console.log(`    ${trait_count} traits:`)
      console.log(`      median: ${format_time(iter_result.median)}, p99: ${format_time(iter_result.p99)}`)
    }

    // =========================================================================
    // REGISTRY COUNTS
    // =========================================================================
    const counts = count_registries()
    console.log(`\n  [Registry Counts]`)
    console.log(`    Beliefs: ${counts.beliefs.toLocaleString()}`)
    console.log(`    States: ${counts.states.toLocaleString()}`)
    console.log(`    Subjects: ${counts.subjects.toLocaleString()}`)
    console.log(`    Traittypes: ${counts.traittypes.toLocaleString()}`)

    const final_mem = measure_memory()
    console.log(`\n  Total memory used: ${format_bytes(final_mem.heap_used)}`)

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
if (process.argv[1]?.endsWith('composition_cache.scenario.mjs')) {
  run().catch(console.error)
}
