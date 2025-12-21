/**
 * World Scale Scenario
 *
 * Tests scaling with hundreds of thousands of beliefs.
 * Simulates a large game world with many entities distributed across locations.
 */

import {
  setup_perf_environment,
  benchmark,
  measure_memory,
  memory_delta,
  format_bytes,
  format_time,
  print_benchmark,
  create_large_world_state,
  Traittype,
  count_registries
} from '../helpers.mjs'

export const scenario = {
  name: 'World Scale',
  description: 'Test performance with large numbers of beliefs',

  parameters: [
    { belief_count: 1000, location_count: 100 },      // baseline
    { belief_count: 10000, location_count: 1000 },    // moderate
    { belief_count: 50000, location_count: 5000 },    // medium
    { belief_count: 100000, location_count: 10000 },  // large
    // { belief_count: 500000, location_count: 50000 },  // stress (uncomment to test)
  ],

  async run({ belief_count, location_count }) {
    const entity_count = belief_count - location_count

    console.log(`\n--- ${belief_count.toLocaleString()} beliefs (${location_count.toLocaleString()} locations, ${entity_count.toLocaleString()} entities) ---`)

    // Measure state creation
    setup_perf_environment()
    const mem_before = measure_memory()
    const setup_start = performance.now()

    const state = create_large_world_state(belief_count, location_count)

    const create_time = performance.now() - setup_start
    const mem_after_create = measure_memory()
    const mem_create = memory_delta(mem_before, mem_after_create)

    console.log(`  Creation time: ${format_time(create_time)}`)
    console.log(`  Memory before lock: ${format_bytes(mem_create.heap_used)}`)
    console.log(`  Bytes per belief: ${(mem_create.heap_used / belief_count).toFixed(0)} B`)

    // Measure lock time
    const lock_start = performance.now()
    state.lock()
    const lock_time = performance.now() - lock_start

    const mem_after_lock = measure_memory()
    const mem_lock = memory_delta(mem_after_create, mem_after_lock)

    console.log(`  Lock time: ${format_time(lock_time)}`)
    console.log(`  Memory growth from lock: ${format_bytes(mem_lock.heap_used)}`)

    // Get some reference beliefs for testing
    const first_location = state.get_belief_by_label('location_0')
    const mid_location = state.get_belief_by_label(`location_${Math.floor(location_count / 2)}`)
    const last_entity = state.get_belief_by_label(`entity_${entity_count - 1}`)
    const location_tt = Traittype.get_by_label('location')

    const results = {}

    // Benchmark get_beliefs iteration
    results.get_beliefs = benchmark('get_beliefs', () => {
      let count = 0
      for (const belief of state.get_beliefs()) {
        count++
      }
      return count
    }, 100)
    print_benchmark(results.get_beliefs)
    console.log(`    (returned ${belief_count} beliefs)`)

    // Benchmark get_beliefs spread to array
    results.get_beliefs_spread = benchmark('get_beliefs_spread', () => {
      return [...state.get_beliefs()].length
    }, 50)
    print_benchmark(results.get_beliefs_spread)

    // Benchmark rev_trait for a popular location
    // First location has (entity_count / location_count) referrers
    const expected_referrers = Math.floor(entity_count / location_count)
    results.rev_trait_popular = benchmark('rev_trait_popular_location', () => {
      return [...first_location.rev_trait(state, location_tt)].length
    }, 500)
    print_benchmark(results.rev_trait_popular)
    console.log(`    (expected ~${expected_referrers} referrers)`)

    // Benchmark get_belief_by_subject (cached)
    // Prime the cache
    state.get_belief_by_subject(mid_location.subject)
    results.get_by_subject_cached = benchmark('get_belief_by_subject_cached', () => {
      return state.get_belief_by_subject(mid_location.subject)
    })
    print_benchmark(results.get_by_subject_cached)

    // Benchmark get_belief_by_label
    results.get_by_label = benchmark('get_belief_by_label', () => {
      return state.get_belief_by_label('location_0')
    })
    print_benchmark(results.get_by_label)

    // Benchmark trait lookup on random entity
    const color_tt = Traittype.get_by_label('color')
    results.get_trait = benchmark('get_trait_on_entity', () => {
      return last_entity.get_trait(state, location_tt)
    })
    print_benchmark(results.get_trait)

    // Test branching at scale
    results.branch = benchmark('branch_from_large_state', () => {
      return state.branch(state.ground_state, state.tt + 1)
    }, 500)
    print_benchmark(results.branch)

    // Registry counts
    const counts = count_registries()
    console.log(`  Registry counts:`)
    console.log(`    beliefs: ${counts.beliefs.toLocaleString()}`)
    console.log(`    subjects: ${counts.subjects.toLocaleString()}`)
    console.log(`    states: ${counts.states}`)

    // Final memory
    const final_mem = measure_memory()
    console.log(`  Final heap used: ${format_bytes(final_mem.heap_used)}`)
    console.log(`  Final bytes per belief: ${(final_mem.heap_used / belief_count).toFixed(0)} B`)

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
if (process.argv[1].endsWith('world_scale.scenario.mjs')) {
  run().catch(console.error)
}
