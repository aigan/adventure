/**
 * State Operations Benchmarks
 *
 * Tests the performance of state manipulation:
 * - state.branch() creation
 * - state.lock() cascade
 * - get_beliefs() iteration
 * - get_belief_by_subject() lookup (cached vs uncached)
 */

import {
  setup_perf_environment,
  benchmark,
  print_benchmark,
  createStateInNewMind,
  create_large_world_state,
  create_state_chain,
  Traittype,
  measure_memory,
  memory_delta,
  format_bytes,
  format_time
} from '../helpers.mjs'

export const suite = {
  name: 'State Operations',

  benchmarks: [
    {
      name: 'state_branch_empty',
      description: 'Branch from empty state',
      setup() {
        setup_perf_environment()
        const state = createStateInNewMind('world')
        state.lock()
        return { state }
      },
      fn({ state }) {
        const branched = state.branch(state.ground_state, state.tt + 1)
        return branched
      }
    },

    {
      name: 'state_branch_100_beliefs',
      description: 'Branch from state with 100 beliefs',
      setup() {
        setup_perf_environment()
        const state = create_large_world_state(100, 10)
        state.lock()
        return { state }
      },
      fn({ state }) {
        const branched = state.branch(state.ground_state, state.tt + 1)
        return branched
      }
    },

    {
      name: 'state_branch_1000_beliefs',
      description: 'Branch from state with 1000 beliefs',
      setup() {
        setup_perf_environment()
        const state = create_large_world_state(1000, 100)
        state.lock()
        return { state }
      },
      fn({ state }) {
        const branched = state.branch(state.ground_state, state.tt + 1)
        return branched
      }
    },

    {
      name: 'state_branch_10000_beliefs',
      description: 'Branch from state with 10000 beliefs',
      setup() {
        setup_perf_environment()
        const state = create_large_world_state(10000, 1000)
        state.lock()
        return { state }
      },
      fn({ state }) {
        const branched = state.branch(state.ground_state, state.tt + 1)
        return branched
      },
      iterations: 500
    },

    {
      name: 'state_lock_100_beliefs',
      description: 'Lock state with 100 beliefs',
      setup() {
        setup_perf_environment()
        return {}
      },
      fn() {
        setup_perf_environment()
        const state = create_large_world_state(100, 10)
        state.lock()
        return state
      },
      iterations: 100
    },

    {
      name: 'state_lock_1000_beliefs',
      description: 'Lock state with 1000 beliefs',
      setup() {
        setup_perf_environment()
        return {}
      },
      fn() {
        setup_perf_environment()
        const state = create_large_world_state(1000, 100)
        state.lock()
        return state
      },
      iterations: 50
    },

    {
      name: 'get_beliefs_100',
      description: 'Iterate get_beliefs() with 100 beliefs',
      setup() {
        setup_perf_environment()
        const state = create_large_world_state(100, 10)
        state.lock()
        return { state }
      },
      fn({ state }) {
        let count = 0
        for (const belief of state.get_beliefs()) {
          count++
        }
        return count
      }
    },

    {
      name: 'get_beliefs_1000',
      description: 'Iterate get_beliefs() with 1000 beliefs',
      setup() {
        setup_perf_environment()
        const state = create_large_world_state(1000, 100)
        state.lock()
        return { state }
      },
      fn({ state }) {
        let count = 0
        for (const belief of state.get_beliefs()) {
          count++
        }
        return count
      }
    },

    {
      name: 'get_beliefs_10000',
      description: 'Iterate get_beliefs() with 10000 beliefs',
      setup() {
        setup_perf_environment()
        const state = create_large_world_state(10000, 1000)
        state.lock()
        return { state }
      },
      fn({ state }) {
        let count = 0
        for (const belief of state.get_beliefs()) {
          count++
        }
        return count
      },
      iterations: 100
    },

    {
      name: 'get_beliefs_spread_10000',
      description: 'Spread get_beliefs() to array with 10000 beliefs',
      setup() {
        setup_perf_environment()
        const state = create_large_world_state(10000, 1000)
        state.lock()
        return { state }
      },
      fn({ state }) {
        return [...state.get_beliefs()].length
      },
      iterations: 100
    },

    {
      name: 'get_belief_by_subject_cached',
      description: 'Lookup belief by subject (cached)',
      setup() {
        setup_perf_environment()
        const state = create_large_world_state(1000, 100)
        state.lock()

        // Get a subject to look up
        const beliefs = [...state.get_beliefs()]
        const target = beliefs[500]

        // Prime the cache
        state.get_belief_by_subject(target.subject)

        return { state, subject: target.subject }
      },
      fn({ state, subject }) {
        return state.get_belief_by_subject(subject)
      }
    },

    {
      name: 'get_belief_by_subject_uncached',
      description: 'Lookup belief by subject (cache miss, progressive)',
      setup() {
        setup_perf_environment()
        const state = create_large_world_state(1000, 100)
        state.lock()

        // Collect subjects to look up - use different ones each time
        const beliefs = [...state.get_beliefs()]
        const subjects = beliefs.map(b => b.subject)

        return { state, subjects, index: 0 }
      },
      run({ state, subjects }) {
        // First lookup for many subjects (progressive cache building)
        const times = []
        for (let i = 0; i < Math.min(100, subjects.length); i++) {
          setup_perf_environment()
          const fresh_state = create_large_world_state(1000, 100)
          fresh_state.lock()
          const fresh_beliefs = [...fresh_state.get_beliefs()]

          const start = performance.now()
          fresh_state.get_belief_by_subject(fresh_beliefs[i].subject)
          times.push(performance.now() - start)
        }

        times.sort((a, b) => a - b)
        return {
          median: times[Math.floor(times.length / 2)],
          p95: times[Math.floor(times.length * 0.95)],
          min: times[0],
          max: times[times.length - 1]
        }
      }
    },

    {
      name: 'get_belief_by_label',
      description: 'Lookup belief by label (O(1) index)',
      setup() {
        setup_perf_environment()
        const state = create_large_world_state(1000, 100)
        state.lock()
        return { state, label: 'entity_500' }
      },
      fn({ state, label }) {
        return state.get_belief_by_label(label)
      }
    },

    {
      name: 'state_chain_walk',
      description: 'Walk through 100-state chain via base references',
      setup() {
        setup_perf_environment()
        const states = create_state_chain(100, 2)
        return { final_state: states[states.length - 1] }
      },
      fn({ final_state }) {
        let count = 0
        let current = final_state
        while (current) {
          count++
          current = current.base
        }
        return count
      }
    },

    {
      name: 'add_belief_from_template',
      description: 'Create belief with add_belief_from_template',
      setup() {
        setup_perf_environment()
        const state = createStateInNewMind('world')
        const location = state.add_belief_from_template({
          bases: ['Location'],
          traits: {},
          label: 'test_location'
        })
        state.lock()
        return { state, location, tt: 2 }
      },
      fn({ state, location, tt }) {
        // Each iteration adds a belief to a fresh branched state
        const new_state = state.branch(state.ground_state, tt++)
        new_state.add_belief_from_template({
          bases: ['PortableObject'],
          traits: { location: location.subject }
        })
        return new_state
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
      const ctx = bench.setup ? bench.setup() : {}
      const result = bench.run(ctx)
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'number') {
          console.log(`  ${key}: ${format_time(value)}`)
        } else {
          console.log(`  ${key}: ${value}`)
        }
      }
    } else {
      const ctx = bench.setup ? bench.setup() : {}
      const iterations = bench.iterations || 1000
      const result = benchmark(bench.name, () => bench.fn(ctx), iterations)
      print_benchmark(result)
    }
  }
}

// Allow running directly
if (process.argv[1].endsWith('state_operations.bench.mjs')) {
  run().catch(console.error)
}
