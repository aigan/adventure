/**
 * Mind Scale Scenario
 *
 * Tests extreme scaling of minds and states:
 * - Thousands of minds in hierarchy
 * - Hundreds of thousands of states
 * - State chain traversal at massive scale
 * - Skip list efficiency with huge state counts
 * - Cross-mind queries
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
  create_mind_hierarchy,
  create_massive_state_chain,
  count_registries
} from '../helpers.mjs'

export const scenario = {
  name: 'Mind Scale',
  description: 'Test performance with extreme mind/state hierarchy scenarios',

  parameters: [
    { minds: 100, states_per_mind: 10, beliefs_per_state: 10 },        // 10K beliefs (baseline)
    { minds: 500, states_per_mind: 20, beliefs_per_state: 10 },        // 100K beliefs (moderate)
    { minds: 1000, states_per_mind: 50, beliefs_per_state: 20 },       // 1M beliefs (large)
    // { minds: 5000, states_per_mind: 100, beliefs_per_state: 20 },   // 10M beliefs (extreme)
  ],

  async run({ minds, states_per_mind, beliefs_per_state }) {
    const total_states = minds * states_per_mind
    const total_beliefs = minds * states_per_mind * beliefs_per_state

    console.log(`\n--- minds=${minds}, states/mind=${states_per_mind}, beliefs/state=${beliefs_per_state} ---`)
    console.log(`    Expected: ${total_states.toLocaleString()} states, ${total_beliefs.toLocaleString()} beliefs`)

    const results = {}

    // =========================================================================
    // MIND HIERARCHY CREATION
    // =========================================================================
    console.log(`\n  [Mind Hierarchy Creation]`)
    setup_perf_environment()
    const mem_before = measure_memory()
    const start = performance.now()

    const { minds: created_minds, states, total_beliefs: actual_beliefs } = create_mind_hierarchy(
      minds,
      states_per_mind,
      beliefs_per_state
    )

    const create_time = performance.now() - start
    const mem_after = measure_memory()
    const mem_used = memory_delta(mem_before, mem_after).heap_used

    console.log(`    Creation time: ${format_time(create_time)}`)
    console.log(`    Memory: ${format_bytes(mem_used)}`)
    console.log(`    Minds created: ${created_minds.length.toLocaleString()}`)
    console.log(`    States created: ${states.length.toLocaleString()}`)
    console.log(`    Beliefs created: ${actual_beliefs.toLocaleString()}`)
    console.log(`    Bytes per mind: ${(mem_used / minds).toFixed(0)} B`)
    console.log(`    Bytes per state: ${(mem_used / states.length).toFixed(0)} B`)
    console.log(`    Bytes per belief: ${(mem_used / actual_beliefs).toFixed(0)} B`)
    console.log(`    States per second: ${(states.length / (create_time / 1000)).toFixed(0)}`)
    console.log(`    Beliefs per second: ${(actual_beliefs / (create_time / 1000)).toFixed(0)}`)

    // =========================================================================
    // BELIEF ACCESS ACROSS MINDS
    // =========================================================================
    console.log(`\n  [Cross-Mind Belief Access]`)

    // Access beliefs from different parts of the hierarchy
    const early_state = states[Math.floor(states.length * 0.1)]
    const mid_state = states[Math.floor(states.length * 0.5)]
    const late_state = states[states.length - 1]

    const color_tt = Traittype.get_by_label('color')

    results.belief_access_early = benchmark('belief_access_early', () => {
      let count = 0
      for (const belief of early_state.get_beliefs()) {
        belief.get_trait(early_state, color_tt)
        count++
        if (count >= 100) break
      }
      return count
    }, 100)
    print_benchmark(results.belief_access_early)

    results.belief_access_mid = benchmark('belief_access_mid', () => {
      let count = 0
      for (const belief of mid_state.get_beliefs()) {
        belief.get_trait(mid_state, color_tt)
        count++
        if (count >= 100) break
      }
      return count
    }, 100)
    print_benchmark(results.belief_access_mid)

    results.belief_access_late = benchmark('belief_access_late', () => {
      let count = 0
      for (const belief of late_state.get_beliefs()) {
        belief.get_trait(late_state, color_tt)
        count++
        if (count >= 100) break
      }
      return count
    }, 100)
    print_benchmark(results.belief_access_late)

    // =========================================================================
    // GET_BELIEFS ITERATION
    // =========================================================================
    console.log(`\n  [get_beliefs() Iteration]`)

    results.get_beliefs_early = benchmark('get_beliefs_early', () => {
      let count = 0
      for (const belief of early_state.get_beliefs()) {
        count++
      }
      return count
    }, 50)
    print_benchmark(results.get_beliefs_early)

    results.get_beliefs_late = benchmark('get_beliefs_late', () => {
      let count = 0
      for (const belief of late_state.get_beliefs()) {
        count++
      }
      return count
    }, 50)
    print_benchmark(results.get_beliefs_late)

    // =========================================================================
    // MASSIVE STATE CHAIN (SKIP LIST TESTING)
    // =========================================================================
    const chain_sizes = [1000, 10000, 50000, 100000]

    for (const chain_size of chain_sizes) {
      if (chain_size > total_states * 2) continue // Skip if too large

      console.log(`\n  [State Chain - ${chain_size.toLocaleString()} states]`)
      setup_perf_environment()
      const chain_mem_before = measure_memory()
      const chain_start = performance.now()

      const { states: chain_states, location, total_entities } = create_massive_state_chain(
        chain_size,
        10 // Add entity every 10 states
      )

      const chain_time = performance.now() - chain_start
      const chain_mem_after = measure_memory()
      const chain_mem = memory_delta(chain_mem_before, chain_mem_after).heap_used

      console.log(`    Creation time: ${format_time(chain_time)}`)
      console.log(`    Memory: ${format_bytes(chain_mem)}`)
      console.log(`    Bytes per state: ${(chain_mem / chain_size).toFixed(0)} B`)
      console.log(`    States per second: ${(chain_size / (chain_time / 1000)).toFixed(0)}`)
      console.log(`    Entities created: ${total_entities}`)

      // Benchmark rev_trait (tests skip list)
      const location_tt = Traittype.get_by_label('location')
      const query_state = chain_states[chain_states.length - 1]

      const rev_result = benchmark(`rev_trait_chain_${chain_size}`, () => {
        return [...location.rev_trait(query_state, location_tt)].length
      }, 100)
      print_benchmark(rev_result)

      // Analyze skip list efficiency
      let hops = 0
      let current = query_state
      while (current.base) {
        hops++
        current = current.base
      }
      const skip_efficiency = ((chain_size - hops) / chain_size * 100).toFixed(1)
      console.log(`    Chain hops: ${hops} (${skip_efficiency}% skipped via skip list)`)

      // Benchmark branching at different points
      const branch_points = [
        { name: 'start', state: chain_states[0] },
        { name: 'mid', state: chain_states[Math.floor(chain_size / 2)] },
        { name: 'end', state: chain_states[chain_size - 1] }
      ]

      for (const { name, state } of branch_points) {
        const branch_result = benchmark(`branch_from_${name}`, () => {
          return state.branch(state.ground_state, state.tt + 1000)
        }, 100)
        console.log(`    Branch from ${name}: median ${format_time(branch_result.median)}`)
      }
    }

    // =========================================================================
    // REGISTRY COUNTS
    // =========================================================================
    const counts = count_registries()
    console.log(`\n  [Final Registry Counts]`)
    console.log(`    Beliefs: ${counts.beliefs.toLocaleString()}`)
    console.log(`    States: ${counts.states.toLocaleString()}`)
    console.log(`    Minds: ${counts.minds.toLocaleString()}`)
    console.log(`    Subjects: ${counts.subjects.toLocaleString()}`)

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
if (process.argv[1]?.endsWith('mind_scale.scenario.mjs')) {
  run().catch(console.error)
}
