/**
 * Promotion Scale Scenario
 *
 * Tests extreme scaling of promotions:
 * - Temporal chains up to 1000 deep
 * - Probability branches up to 100 alternatives
 * - Cache invalidation cascades across millions of beliefs
 * - Memory scaling with promotions
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
  createEidosState,
  eidos,
  Materia,
  Traittype,
  Belief,
  create_temporal_promotion_chain,
  create_probability_promotions,
  create_mixed_promotions,
  create_promotion_dependent_beliefs,
  analyze_promotion_cache_deps,
  count_registries
} from '../helpers.mjs'

export const scenario = {
  name: 'Promotion Scale',
  description: 'Test performance with extreme promotion scenarios',

  parameters: [
    { temporal_depth: 10, probability_width: 5, dependent_beliefs: 1000 },       // baseline
    { temporal_depth: 100, probability_width: 20, dependent_beliefs: 10000 },    // moderate
    { temporal_depth: 500, probability_width: 50, dependent_beliefs: 100000 },   // large
    // { temporal_depth: 1000, probability_width: 100, dependent_beliefs: 1000000 } // extreme (uncomment to stress test)
  ],

  async run({ temporal_depth, probability_width, dependent_beliefs }) {
    console.log(`\n--- temporal=${temporal_depth}, probability=${probability_width}, dependents=${dependent_beliefs.toLocaleString()} ---`)

    const results = {}

    // =========================================================================
    // TEMPORAL PROMOTION CHAIN
    // =========================================================================
    console.log(`\n  [Temporal Chain Creation]`)
    setup_perf_environment()
    const mem_before_temporal = measure_memory()
    const temporal_start = performance.now()

    const { root: temporal_root, chain, states } = create_temporal_promotion_chain(temporal_depth)

    const temporal_time = performance.now() - temporal_start
    const mem_after_temporal = measure_memory()

    console.log(`    Creation time: ${format_time(temporal_time)}`)
    console.log(`    Memory: ${format_bytes(memory_delta(mem_before_temporal, mem_after_temporal).heap_used)}`)
    console.log(`    Bytes per promotion: ${(memory_delta(mem_before_temporal, mem_after_temporal).heap_used / temporal_depth).toFixed(0)} B`)
    console.log(`    Promotions created: ${chain.length}`)

    // Benchmark trait resolution at different points in chain
    const color_tt = Traittype.get_by_label('color')
    const eidos_mind = eidos()

    // Query at start (should resolve quickly)
    const early_state = states[Math.floor(temporal_depth * 0.1)]
    results.temporal_query_early = benchmark('temporal_query_early', () => {
      const world_state = early_state.branch(early_state.ground_state, early_state.tt + 1)
      const inheritor = world_state.add_belief_from_template({
        bases: [temporal_root],
        traits: {}
      })
      return inheritor.get_trait(world_state, color_tt)
    }, 100, 5)
    print_benchmark(results.temporal_query_early)

    // Query at middle
    const mid_state = states[Math.floor(temporal_depth * 0.5)]
    results.temporal_query_mid = benchmark('temporal_query_mid', () => {
      const world_state = mid_state.branch(mid_state.ground_state, mid_state.tt + 1)
      const inheritor = world_state.add_belief_from_template({
        bases: [temporal_root],
        traits: {}
      })
      return inheritor.get_trait(world_state, color_tt)
    }, 100, 5)
    print_benchmark(results.temporal_query_mid)

    // Query at end (most promotions to filter)
    const late_state = states[states.length - 1]
    results.temporal_query_late = benchmark('temporal_query_late', () => {
      const world_state = late_state.branch(late_state.ground_state, late_state.tt + 1)
      const inheritor = world_state.add_belief_from_template({
        bases: [temporal_root],
        traits: {}
      })
      return inheritor.get_trait(world_state, color_tt)
    }, 100, 5)
    print_benchmark(results.temporal_query_late)

    // =========================================================================
    // PROBABILITY PROMOTIONS
    // =========================================================================
    console.log(`\n  [Probability Promotions]`)
    setup_perf_environment()
    const mem_before_prob = measure_memory()
    const prob_start = performance.now()

    const prob_state = createEidosState(1)
    const prob_root = prob_state.add_belief_from_template({
      bases: ['ObjectPhysical'],
      traits: { color: 'original' },
      label: 'prob_root',
      promotable: true
    })
    const prob_promotions = create_probability_promotions(prob_root, prob_state, probability_width)
    prob_state.lock()

    const prob_time = performance.now() - prob_start
    const mem_after_prob = measure_memory()

    console.log(`    Creation time: ${format_time(prob_time)}`)
    console.log(`    Memory: ${format_bytes(memory_delta(mem_before_prob, mem_after_prob).heap_used)}`)
    console.log(`    Bytes per alternative: ${(memory_delta(mem_before_prob, mem_after_prob).heap_used / probability_width).toFixed(0)} B`)

    // Benchmark Fuzzy resolution
    const prob_color_tt = Traittype.get_by_label('color')
    // Branch from prob_state to create a new state
    const world_state = prob_state.branch(prob_state.ground_state, 2)
    const fuzzy_inheritor = world_state.add_belief_from_template({
      bases: [prob_root],
      traits: {}
    })
    world_state.lock()

    results.fuzzy_resolution = benchmark('fuzzy_resolution', () => {
      return fuzzy_inheritor.get_trait(world_state, prob_color_tt)
    }, 500)
    print_benchmark(results.fuzzy_resolution)

    // =========================================================================
    // CACHE INVALIDATION CASCADE
    // =========================================================================
    if (dependent_beliefs <= 100000) { // Skip for extreme scale
      console.log(`\n  [Cache Invalidation Cascade]`)
      setup_perf_environment()
      const mem_before_deps = measure_memory()
      const deps_start = performance.now()

      const cascade_state = createEidosState(1)
      const cascade_root = cascade_state.add_belief_from_template({
        bases: ['ObjectPhysical'],
        traits: { color: 'root_color' },
        label: 'cascade_root',
        promotable: true
      })
      cascade_state.lock()

      // Branch from cascade_state to create world state
      const cascade_world_state = cascade_state.branch(cascade_state.ground_state, 2)
      const dependents = create_promotion_dependent_beliefs(cascade_root, dependent_beliefs, cascade_world_state)
      cascade_world_state.lock()

      const deps_time = performance.now() - deps_start
      const mem_after_deps = measure_memory()

      console.log(`    Dependent beliefs created: ${dependent_beliefs.toLocaleString()}`)
      console.log(`    Creation time: ${format_time(deps_time)}`)
      console.log(`    Memory: ${format_bytes(memory_delta(mem_before_deps, mem_after_deps).heap_used)}`)
      console.log(`    Bytes per dependent: ${(memory_delta(mem_before_deps, mem_after_deps).heap_used / dependent_beliefs).toFixed(0)} B`)

      // Prime all caches
      const cascade_tt = Traittype.get_by_label('color')
      const prime_start = performance.now()
      for (const dep of dependents) {
        dep.get_trait(cascade_world_state, cascade_tt)
      }
      const prime_time = performance.now() - prime_start
      console.log(`    Cache prime time: ${format_time(prime_time)}`)

      // Add promotion and measure re-access
      const invalidation_state = cascade_state.branch(cascade_state.ground_state, 1000)
      cascade_root.branch(invalidation_state, { color: 'new_color' }, { promote: true, certainty: 0.5 })

      const reaccess_start = performance.now()
      for (const dep of dependents) {
        dep.get_trait(cascade_world_state, cascade_tt)
      }
      const reaccess_time = performance.now() - reaccess_start

      console.log(`    Reaccess time after invalidation: ${format_time(reaccess_time)}`)
      console.log(`    Time per belief: ${format_time(reaccess_time / dependent_beliefs)}`)

      results.cache_invalidation_total = reaccess_time
      results.cache_invalidation_per_belief = reaccess_time / dependent_beliefs
    }

    // =========================================================================
    // MIXED TEMPORAL + PROBABILITY
    // =========================================================================
    console.log(`\n  [Mixed Temporal + Probability]`)
    setup_perf_environment()
    const mem_before_mixed = measure_memory()
    const mixed_start = performance.now()

    const mixed_temporal = Math.min(temporal_depth, 100) // Cap for reasonable test time
    const mixed_prob = Math.min(probability_width, 20)
    const { root: mixed_root, structure, eidos_state: mixed_eidos_state } = create_mixed_promotions(
      mixed_temporal,
      mixed_prob
    )

    const mixed_time = performance.now() - mixed_start
    const mem_after_mixed = measure_memory()

    const total_promotions = mixed_temporal * mixed_prob
    console.log(`    Temporal steps: ${mixed_temporal}`)
    console.log(`    Probability width: ${mixed_prob}`)
    console.log(`    Total promotions: ${total_promotions.toLocaleString()}`)
    console.log(`    Creation time: ${format_time(mixed_time)}`)
    console.log(`    Memory: ${format_bytes(memory_delta(mem_before_mixed, mem_after_mixed).heap_used)}`)

    // Query at different temporal points
    const mixed_tt = Traittype.get_by_label('color')
    const mixed_mid_state = structure[Math.floor(mixed_temporal / 2)].state
    const mixed_eidos = eidos()

    results.mixed_query = benchmark('mixed_query', () => {
      const world_state = mixed_mid_state.branch(mixed_mid_state.ground_state, mixed_mid_state.tt + 1)
      const inheritor = world_state.add_belief_from_template({
        bases: [mixed_root],
        traits: {}
      })
      return inheritor.get_trait(world_state, mixed_tt)
    }, 100, 5)
    print_benchmark(results.mixed_query)

    // =========================================================================
    // REGISTRY COUNTS
    // =========================================================================
    const counts = count_registries()
    console.log(`\n  [Registry Counts]`)
    console.log(`    Beliefs: ${counts.beliefs.toLocaleString()}`)
    console.log(`    States: ${counts.states.toLocaleString()}`)
    console.log(`    Minds: ${counts.minds.toLocaleString()}`)

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
if (process.argv[1]?.endsWith('promotion_scale.scenario.mjs')) {
  run().catch(console.error)
}
