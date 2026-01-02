/**
 * Composition Benchmarks
 *
 * Tests the performance of belief composition under various conditions:
 * - Wide composition (many bases)
 * - Deep inheritance with multiple bases
 * - Composable array trait merging
 * - Prototype trees
 * - Convergence states
 * - Null blocking patterns
 */

import {
  setup_perf_environment,
  benchmark,
  print_benchmark,
  createStateInNewMind,
  Traittype,
  Belief,
  eidos,
  Materia,
  logos,
  logos_state,
  measure_memory,
  memory_delta,
  format_bytes,
  format_time,
  create_wide_belief,
  create_prototype_tree,
  create_composable_inventory_chain,
  create_convergence_state,
  analyze_belief_cache,
  analyze_cache_memory_scaling
} from '../helpers.mjs'

export const suite = {
  name: 'Composition',

  benchmarks: [
    // =========================================================================
    // WIDE COMPOSITION (MANY BASES)
    // =========================================================================
    {
      name: 'compose_5_bases',
      description: 'Trait lookup on belief with 5 bases',
      setup() {
        setup_perf_environment()
        const world = createStateInNewMind('world')
        const { belief, bases } = create_wide_belief(5, world)
        world.lock()
        const color_tt = Traittype.get_by_label('color')
        return { belief, world, color_tt }
      },
      fn({ belief, world, color_tt }) {
        return belief.get_trait(world, color_tt)
      }
    },

    {
      name: 'compose_15_bases',
      description: 'Trait lookup on belief with 15 bases',
      setup() {
        setup_perf_environment()
        const world = createStateInNewMind('world')
        const { belief, bases } = create_wide_belief(15, world)
        world.lock()
        const color_tt = Traittype.get_by_label('color')
        return { belief, world, color_tt }
      },
      fn({ belief, world, color_tt }) {
        return belief.get_trait(world, color_tt)
      }
    },

    {
      name: 'compose_50_bases',
      description: 'Trait lookup on belief with 50 bases',
      setup() {
        setup_perf_environment()
        const world = createStateInNewMind('world')
        const { belief, bases } = create_wide_belief(50, world)
        world.lock()
        const color_tt = Traittype.get_by_label('color')
        return { belief, world, color_tt }
      },
      fn({ belief, world, color_tt }) {
        return belief.get_trait(world, color_tt)
      },
      iterations: 500
    },

    {
      name: 'compose_100_bases',
      description: 'Trait lookup on belief with 100 bases',
      setup() {
        setup_perf_environment()
        const world = createStateInNewMind('world')
        const { belief, bases } = create_wide_belief(100, world)
        world.lock()
        const color_tt = Traittype.get_by_label('color')
        return { belief, world, color_tt }
      },
      fn({ belief, world, color_tt }) {
        return belief.get_trait(world, color_tt)
      },
      iterations: 200
    },

    // NOTE: Composable array benchmarks removed - requires custom trait registration
    // that the standard archetype system doesn't support without modifications

    // =========================================================================
    // PROTOTYPE TREES (uses 'color' trait on each node)
    // =========================================================================
    {
      name: 'compose_tree_100_prototypes',
      description: 'Trait lookup in tree with ~100 prototype nodes',
      setup() {
        setup_perf_environment()
        const eidos_mind = eidos()
        // depth=4, branch=3 = 1+3+9+27+81 = 121 nodes
        const { root, nodes, leaf_count } = create_prototype_tree(4, 3, 5, eidos_mind.origin_state)

        // Create leaf belief in world
        const world = createStateInNewMind('world')
        const leaf_node = nodes[nodes.length - 1]
        const leaf = world.add_belief_from_template({
          bases: [leaf_node.get_label()],
          traits: {}
        })
        world.lock()

        // Get color trait (each node has a unique color)
        const color_tt = Traittype.get_by_label('color')
        return { leaf, world, color_tt, node_count: nodes.length }
      },
      fn({ leaf, world, color_tt }) {
        return leaf.get_trait(world, color_tt)
      },
      iterations: 500
    },

    {
      name: 'compose_tree_500_prototypes',
      description: 'Trait lookup in tree with ~500 prototype nodes',
      setup() {
        setup_perf_environment()
        const eidos_mind = eidos()
        // depth=5, branch=3 = 1+3+9+27+81+243 = 364 nodes
        // depth=4, branch=4 = 1+4+16+64+256 = 341 nodes
        const { root, nodes, leaf_count } = create_prototype_tree(5, 3, 3, eidos_mind.origin_state)

        const world = createStateInNewMind('world')
        const leaf_node = nodes[nodes.length - 1]
        const leaf = world.add_belief_from_template({
          bases: [leaf_node.get_label()],
          traits: {}
        })
        world.lock()

        const color_tt = Traittype.get_by_label('color')
        return { leaf, world, color_tt, node_count: nodes.length }
      },
      fn({ leaf, world, color_tt }) {
        return leaf.get_trait(world, color_tt)
      },
      iterations: 200
    },

    // =========================================================================
    // DEEP CHAIN WITH WIDE COMPOSITION
    // =========================================================================
    {
      name: 'compose_deep_chain_10_bases',
      description: 'Deep chain (20 levels) where each level has 10 sibling bases',
      setup() {
        setup_perf_environment()
        const eidos_mind = eidos()
        const eidos_state = eidos_mind.origin_state

        // Create 10 base prototypes with unique color values
        const base_labels = []
        for (let i = 0; i < 10; i++) {
          const base = eidos_state.add_belief_from_template({
            bases: ['ObjectPhysical'],
            traits: { color: `base_color_${i}` },
            label: `chain_base_${i}`
          })
          base.lock(eidos_state)
          base_labels.push(`chain_base_${i}`)
        }

        // Create chain where each level composes all 10 bases
        let current_labels = base_labels
        for (let depth = 0; depth < 20; depth++) {
          const level_labels = []
          for (let i = 0; i < 10; i++) {
            const node = eidos_state.add_belief_from_template({
              bases: current_labels,
              traits: {}, // No traits, just composing bases
              label: `chain_d${depth}_n${i}`
            })
            node.lock(eidos_state)
            level_labels.push(`chain_d${depth}_n${i}`)
          }
          current_labels = level_labels
        }

        // Create leaf in world
        const world = createStateInNewMind('world')
        const leaf = world.add_belief_from_template({
          bases: current_labels,
          traits: {}
        })
        world.lock()

        // Get color trait (inherited from bases)
        const color_tt = Traittype.get_by_label('color')
        return { leaf, world, color_tt }
      },
      fn({ leaf, world, color_tt }) {
        return leaf.get_trait(world, color_tt)
      },
      iterations: 100
    },

    // =========================================================================
    // NULL BLOCKING (uses color trait with null)
    // =========================================================================
    {
      name: 'compose_null_blocking_deep',
      description: 'Composition with null trait blocking at various depths',
      setup() {
        setup_perf_environment()
        const eidos_mind = eidos()
        const eidos_state = eidos_mind.origin_state

        // Create chain with null blocking at middle
        const root = eidos_state.add_belief_from_template({
          bases: ['ObjectPhysical'],
          traits: { color: 'root_color' },
          label: 'null_block_root'
        })
        root.lock(eidos_state)

        const middle = eidos_state.add_belief_from_template({
          bases: ['null_block_root'],
          traits: { color: null }, // Blocks composition
          label: 'null_block_middle'
        })
        middle.lock(eidos_state)

        const top = eidos_state.add_belief_from_template({
          bases: ['null_block_middle'],
          traits: { color: 'top_color' },
          label: 'null_block_top'
        })
        top.lock(eidos_state)

        const world = createStateInNewMind('world')
        const leaf = world.add_belief_from_template({
          bases: ['null_block_top'],
          traits: {}
        })
        world.lock()

        const color_tt = Traittype.get_by_label('color')
        return { leaf, world, color_tt }
      },
      fn({ leaf, world, color_tt }) {
        return leaf.get_trait(world, color_tt)
      }
    },

    // NOTE: Convergence benchmarks removed - requires proper state hierarchy setup
    // that the simplified benchmark helpers don't provide

    // =========================================================================
    // GET_TRAITS ITERATION WITH COMPLEX COMPOSITION
    // =========================================================================
    {
      name: 'compose_get_traits_all_complex',
      description: 'Iterate all traits on belief with 50 bases',
      setup() {
        setup_perf_environment()
        const world = createStateInNewMind('world')
        const { belief, bases } = create_wide_belief(50, world)
        world.lock()
        return { belief, world }
      },
      fn({ belief, world }) {
        let count = 0
        for (const [tt, value] of belief.get_traits(world)) {
          count++
        }
        return count
      },
      iterations: 200
    },

    // =========================================================================
    // CACHE ANALYSIS WITH COMPOSITION
    // =========================================================================
    {
      name: 'compose_cache_analysis',
      description: 'Analyze cache behavior with complex composition',
      setup() {
        setup_perf_environment()
        const world = createStateInNewMind('world')
        const { belief, bases } = create_wide_belief(20, world)
        world.lock()
        return { belief, world, bases }
      },
      run({ belief, world, bases }) {
        // First access (cache miss) - use color trait
        const first_times = []
        for (let i = 0; i < 50; i++) {
          setup_perf_environment()
          const fresh_world = createStateInNewMind('world')
          const { belief: fresh_belief } = create_wide_belief(20, fresh_world)
          fresh_world.lock()
          const fresh_tt = Traittype.get_by_label('color')

          const start = performance.now()
          fresh_belief.get_trait(fresh_world, fresh_tt)
          first_times.push(performance.now() - start)
        }

        // Cached access
        setup_perf_environment()
        const cached_world = createStateInNewMind('world')
        const { belief: cached_belief } = create_wide_belief(20, cached_world)
        cached_world.lock()
        const cached_tt = Traittype.get_by_label('color')

        // Prime cache
        cached_belief.get_trait(cached_world, cached_tt)

        const cached_times = []
        for (let i = 0; i < 500; i++) {
          const start = performance.now()
          cached_belief.get_trait(cached_world, cached_tt)
          cached_times.push(performance.now() - start)
        }

        first_times.sort((a, b) => a - b)
        cached_times.sort((a, b) => a - b)

        const cache_stats = analyze_belief_cache(cached_belief)

        return {
          first_access_median: first_times[Math.floor(first_times.length / 2)],
          cached_access_median: cached_times[Math.floor(cached_times.length / 2)],
          speedup: first_times[Math.floor(first_times.length / 2)] / cached_times[Math.floor(cached_times.length / 2)],
          cached_traits: cache_stats.cached_traits,
          cached_all: cache_stats.cached_all
        }
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
          if (key.includes('time') || key.includes('median')) {
            console.log(`  ${key}: ${format_time(value)}`)
          } else {
            console.log(`  ${key}: ${value.toFixed(4)}`)
          }
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
if (process.argv[1]?.endsWith('composition.bench.mjs')) {
  run().catch(console.error)
}
