/**
 * Reverse Lookup Benchmarks
 *
 * Tests the performance of rev_trait() - finding all beliefs that
 * reference a given subject via a traittype. This uses skip list
 * optimization for efficient traversal.
 */

import {
  setup_perf_environment,
  benchmark,
  print_benchmark,
  createStateInNewMind,
  Traittype,
  measure_memory,
  memory_delta,
  format_bytes,
  format_time
} from '../helpers.mjs'

export const suite = {
  name: 'Reverse Lookup',

  benchmarks: [
    {
      name: 'rev_trait_10_referrers',
      description: 'Find 10 beliefs referencing a location',
      setup() {
        setup_perf_environment()
        const state = createStateInNewMind('world')

        // Create target location
        const location = state.add_belief_from_template({
          bases: ['Location'],
          traits: { color: 'green' },
          label: 'target_location'
        })

        // Create referrers
        for (let i = 0; i < 10; i++) {
          state.add_belief_from_template({
            bases: ['PortableObject'],
            traits: { location: location.subject },
            label: `entity_${i}`
          })
        }

        state.lock()
        const location_tt = Traittype.get_by_label('location')
        return { location, state, tt: location_tt }
      },
      fn({ location, state, tt }) {
        return [...location.rev_trait(state, tt)].length
      }
    },

    {
      name: 'rev_trait_100_referrers',
      description: 'Find 100 beliefs referencing a location',
      setup() {
        setup_perf_environment()
        const state = createStateInNewMind('world')

        const location = state.add_belief_from_template({
          bases: ['Location'],
          traits: { color: 'green' },
          label: 'target_location'
        })

        for (let i = 0; i < 100; i++) {
          state.add_belief_from_template({
            bases: ['PortableObject'],
            traits: { location: location.subject },
            label: `entity_${i}`
          })
        }

        state.lock()
        const location_tt = Traittype.get_by_label('location')
        return { location, state, tt: location_tt }
      },
      fn({ location, state, tt }) {
        return [...location.rev_trait(state, tt)].length
      }
    },

    {
      name: 'rev_trait_1000_referrers',
      description: 'Find 1000 beliefs referencing a location',
      setup() {
        setup_perf_environment()
        const state = createStateInNewMind('world')

        const location = state.add_belief_from_template({
          bases: ['Location'],
          traits: { color: 'green' },
          label: 'target_location'
        })

        for (let i = 0; i < 1000; i++) {
          state.add_belief_from_template({
            bases: ['PortableObject'],
            traits: { location: location.subject },
            label: `entity_${i}`
          })
        }

        state.lock()
        const location_tt = Traittype.get_by_label('location')
        return { location, state, tt: location_tt }
      },
      fn({ location, state, tt }) {
        return [...location.rev_trait(state, tt)].length
      }
    },

    {
      name: 'rev_trait_10000_referrers',
      description: 'Find 10000 beliefs referencing a location',
      setup() {
        setup_perf_environment()
        const state = createStateInNewMind('world')

        const location = state.add_belief_from_template({
          bases: ['Location'],
          traits: { color: 'green' },
          label: 'target_location'
        })

        for (let i = 0; i < 10000; i++) {
          state.add_belief_from_template({
            bases: ['PortableObject'],
            traits: { location: location.subject },
            label: `entity_${i}`
          })
        }

        state.lock()
        const location_tt = Traittype.get_by_label('location')
        return { location, state, tt: location_tt }
      },
      fn({ location, state, tt }) {
        return [...location.rev_trait(state, tt)].length
      },
      iterations: 100 // Fewer iterations for heavy test
    },

    {
      name: 'rev_trait_across_state_chain',
      description: 'rev_trait with 100 states, some with changes',
      setup() {
        setup_perf_environment()
        const state = createStateInNewMind('world')

        const location = state.add_belief_from_template({
          bases: ['Location'],
          traits: { color: 'green' },
          label: 'target_location'
        })

        // Initial entities
        for (let i = 0; i < 50; i++) {
          state.add_belief_from_template({
            bases: ['PortableObject'],
            traits: { location: location.subject },
            label: `entity_${i}`
          })
        }
        state.lock()

        // Create chain of states with sporadic changes
        let current = state
        for (let s = 0; s < 100; s++) {
          current = current.branch(current.ground_state, s + 2)

          // Add new entity every 10 states
          if (s % 10 === 0) {
            current.add_belief_from_template({
              bases: ['PortableObject'],
              traits: { location: location.subject },
              label: `new_entity_${s}`
            })
          }

          current.lock()
        }

        const location_tt = Traittype.get_by_label('location')
        return { location, state: current, tt: location_tt }
      },
      fn({ location, state, tt }) {
        return [...location.rev_trait(state, tt)].length
      },
      iterations: 500
    },

    {
      name: 'rev_trait_no_results',
      description: 'rev_trait when no beliefs reference the subject',
      setup() {
        setup_perf_environment()
        const state = createStateInNewMind('world')

        const location = state.add_belief_from_template({
          bases: ['Location'],
          traits: { color: 'green' },
          label: 'empty_location'
        })

        // Create other entities that don't reference this location
        const other_location = state.add_belief_from_template({
          bases: ['Location'],
          traits: { color: 'blue' },
          label: 'other_location'
        })

        for (let i = 0; i < 100; i++) {
          state.add_belief_from_template({
            bases: ['PortableObject'],
            traits: { location: other_location.subject },
            label: `entity_${i}`
          })
        }

        state.lock()
        const location_tt = Traittype.get_by_label('location')
        return { location, state, tt: location_tt }
      },
      fn({ location, state, tt }) {
        return [...location.rev_trait(state, tt)].length
      }
    },

    {
      name: 'rev_trait_multiple_traittypes',
      description: 'rev_trait for different traittypes on same subject',
      setup() {
        setup_perf_environment()

        // Register additional trait types
        Traittype.register('held_by', new Traittype('held_by', {
          type: 'Actor',
          exposure: 'spatial'
        }))
        Traittype.register('owned_by', new Traittype('owned_by', {
          type: 'Person',
          exposure: 'social'
        }))

        const state = createStateInNewMind('world')

        const person = state.add_belief_from_template({
          bases: ['Person'],
          traits: { color: 'beige' },
          label: 'target_person'
        })

        // Create items with different reference types
        for (let i = 0; i < 50; i++) {
          state.add_belief_from_template({
            bases: ['PortableObject'],
            traits: { location: person.subject },
            label: `near_${i}`
          })
        }

        state.lock()
        const location_tt = Traittype.get_by_label('location')
        const held_by_tt = Traittype.get_by_label('held_by')
        const owned_by_tt = Traittype.get_by_label('owned_by')

        return { person, state, tts: [location_tt, held_by_tt, owned_by_tt] }
      },
      run({ person, state, tts }) {
        const results = {}
        for (const tt of tts) {
          const result = benchmark(`rev_trait_${tt.label}`, () => {
            return [...person.rev_trait(state, tt)].length
          }, 1000)
          results[tt.label] = result.median
        }
        return results
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
if (process.argv[1].endsWith('reverse_lookup.bench.mjs')) {
  run().catch(console.error)
}
