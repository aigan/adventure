/**
 * Session Length Scenario
 *
 * Tests scaling with long state chains (many transactions over time).
 * Simulates a long-running game session with thousands of state changes.
 */

import {
  setup_perf_environment,
  benchmark,
  measure_memory,
  memory_delta,
  format_bytes,
  format_time,
  print_benchmark,
  create_state_chain,
  createStateInNewMind,
  Traittype,
  count_registries
} from '../helpers.mjs'

export const scenario = {
  name: 'Session Length',
  description: 'Test performance with long state chains (many transactions)',

  parameters: [
    { state_count: 100, changes_per_state: 5 },    // short session
    { state_count: 500, changes_per_state: 3 },    // medium session
    { state_count: 1000, changes_per_state: 2 },   // long session
    { state_count: 5000, changes_per_state: 1 },   // very long session
    // { state_count: 10000, changes_per_state: 1 },  // stress (uncomment to test)
  ],

  async run({ state_count, changes_per_state }) {
    // Entities added every 10th state + location + initial entity
    const states_with_changes = Math.floor((state_count - 1) / 10)
    const total_beliefs = states_with_changes * changes_per_state + 2

    console.log(`\n--- ${state_count.toLocaleString()} states, ${changes_per_state} changes each (${total_beliefs.toLocaleString()} total beliefs) ---`)

    // Measure chain creation
    setup_perf_environment()
    const mem_before = measure_memory()
    const setup_start = performance.now()

    const { states, location } = create_state_chain(state_count, changes_per_state)

    const create_time = performance.now() - setup_start
    const mem_after = measure_memory()
    const mem_delta_val = memory_delta(mem_before, mem_after)

    console.log(`  Chain creation time: ${format_time(create_time)}`)
    console.log(`  Memory for chain: ${format_bytes(mem_delta_val.heap_used)}`)
    console.log(`  Bytes per state: ${(mem_delta_val.heap_used / state_count).toFixed(0)} B`)
    console.log(`  Average time per state: ${format_time(create_time / state_count)}`)

    const final_state = states[states.length - 1]
    const first_state = states[0]
    const mid_state = states[Math.floor(states.length / 2)]

    const results = {}

    // Benchmark branching from end of chain
    results.branch_end = benchmark('branch_from_end', () => {
      return final_state.branch(final_state.ground_state, final_state.tt + 1)
    }, 500)
    print_benchmark(results.branch_end)

    // Benchmark branching from middle of chain
    results.branch_mid = benchmark('branch_from_middle', () => {
      return mid_state.branch(mid_state.ground_state, mid_state.tt + 1)
    }, 500)
    print_benchmark(results.branch_mid)

    // Benchmark get_beliefs at end of chain (accumulates from all states)
    results.get_beliefs_end = benchmark('get_beliefs_at_end', () => {
      let count = 0
      for (const belief of final_state.get_beliefs()) {
        count++
      }
      return count
    }, 100)
    print_benchmark(results.get_beliefs_end)
    console.log(`    (returned ${total_beliefs} beliefs)`)

    // Benchmark get_beliefs at start of chain
    results.get_beliefs_start = benchmark('get_beliefs_at_start', () => {
      let count = 0
      for (const belief of first_state.get_beliefs()) {
        count++
      }
      return count
    }, 500)
    print_benchmark(results.get_beliefs_start)

    // Walk the state chain via base references
    results.walk_chain = benchmark('walk_chain_via_base', () => {
      let count = 0
      let current = final_state
      while (current) {
        count++
        current = current.base
      }
      return count
    })
    print_benchmark(results.walk_chain)

    // Test rev_trait across the chain
    // The location is referenced by entities in each state
    const location_tt = Traittype.get_by_label('location')

    // Find all beliefs pointing to the location via rev_trait
    // This is where skip list efficiency matters - sparse changes in long chain
    const expected_referrers = states_with_changes * changes_per_state + 1 // +1 for initial_entity
    results.rev_trait_chain = benchmark('rev_trait_across_chain', () => {
      return [...location.rev_trait(final_state, location_tt)].length
    }, 100)
    print_benchmark(results.rev_trait_chain)
    console.log(`    (expected ${expected_referrers} referrers)`)

    // Test get_belief_by_subject at different points in chain
    const tracked_subject = location.subject

    // From first state (should be fast)
    results.get_by_subject_first = benchmark('get_belief_by_subject_first_state', () => {
      return first_state.get_belief_by_subject(tracked_subject)
    })
    print_benchmark(results.get_by_subject_first)

    // From final state (may need to walk chain)
    results.get_by_subject_final = benchmark('get_belief_by_subject_final_state', () => {
      return final_state.get_belief_by_subject(tracked_subject)
    })
    print_benchmark(results.get_by_subject_final)

    // Analyze skip list efficiency for rev_trait
    const skip_analysis = analyze_skip_list(final_state, tracked_subject, location_tt)
    console.log(`  Skip list analysis:`)
    console.log(`    total states in chain: ${skip_analysis.total_states}`)
    console.log(`    states with changes: ${skip_analysis.states_with_changes}`)
    console.log(`    hops with skip list: ${skip_analysis.hops_with_skip}`)
    console.log(`    states skipped: ${skip_analysis.states_skipped}`)
    console.log(`    skip efficiency: ${(skip_analysis.skip_efficiency * 100).toFixed(1)}%`)

    // Registry counts
    const counts = count_registries()
    console.log(`  Registry counts:`)
    console.log(`    beliefs: ${counts.beliefs.toLocaleString()}`)
    console.log(`    states: ${counts.states.toLocaleString()}`)
    console.log(`    subjects: ${counts.subjects.toLocaleString()}`)

    // Memory per state
    const final_mem = measure_memory()
    console.log(`  Final heap: ${format_bytes(final_mem.heap_used)}`)

    return results
  }
}

/**
 * Analyze skip list efficiency for a rev_trait lookup
 */
function analyze_skip_list(state, subject, traittype) {
  // Count total states in chain (without skip list optimization)
  let total_states = 0
  let s = state
  while (s) {
    total_states++
    s = s.base
  }

  // Count hops using skip list
  let hops_with_skip = 0
  let states_with_changes = 0
  let current = state

  while (current) {
    hops_with_skip++

    // Check if this state has changes for (subject, traittype)
    if (current._rev_add?.get(subject)?.has(traittype)) {
      states_with_changes++
    }

    // Follow skip list pointer if available
    const skip = current._rev_base?.get(subject)?.get(traittype)
    if (skip) {
      current = skip
    } else if (skip === null) {
      // Explicit null means no more changes in chain
      break
    } else {
      current = current.base
    }
  }

  const states_skipped = total_states - hops_with_skip

  return {
    total_states,
    hops_with_skip,
    states_with_changes,
    states_skipped,
    // Efficiency = how many states we avoided visiting
    skip_efficiency: total_states > 0 ? states_skipped / total_states : 0
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
if (process.argv[1].endsWith('session_length.scenario.mjs')) {
  run().catch(console.error)
}
