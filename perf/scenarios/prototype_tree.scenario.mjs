/**
 * Prototype Tree Scenario
 *
 * Tests extreme scaling of tree-structured prototype hierarchies:
 * - Deep trees with many branches
 * - Trait resolution through complex trees
 * - Composable trait merging from tree branches
 * - Cache effectiveness with tree structures
 * - Memory per prototype node
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
  Archetype,
  create_prototype_tree,
  analyze_belief_cache,
  count_registries
} from '../helpers.mjs'

/**
 * Calculate total nodes in a tree
 */
function calc_tree_nodes(depth, branch_factor) {
  let total = 0
  for (let d = 0; d < depth; d++) {
    total += Math.pow(branch_factor, d)
  }
  return total
}

export const scenario = {
  name: 'Prototype Tree',
  description: 'Test performance with deep tree-structured prototype hierarchies',

  parameters: [
    { tree_depth: 5, branch_factor: 3, traits_per_node: 5 },    // 121 nodes (baseline)
    { tree_depth: 6, branch_factor: 4, traits_per_node: 10 },   // 1365 nodes (moderate)
    { tree_depth: 7, branch_factor: 4, traits_per_node: 15 },   // 5461 nodes (large)
    { tree_depth: 8, branch_factor: 4, traits_per_node: 10 },   // 21845 nodes (very large)
    // { tree_depth: 10, branch_factor: 3, traits_per_node: 5 },  // 29524 nodes (extreme)
  ],

  async run({ tree_depth, branch_factor, traits_per_node }) {
    const expected_nodes = calc_tree_nodes(tree_depth, branch_factor)
    const expected_traits = expected_nodes * traits_per_node
    const leaf_count = Math.pow(branch_factor, tree_depth - 1)

    console.log(`\n--- depth=${tree_depth}, branch=${branch_factor}, traits/node=${traits_per_node} ---`)
    console.log(`    Expected: ${expected_nodes.toLocaleString()} nodes, ${expected_traits.toLocaleString()} total traits`)
    console.log(`    Leaf nodes: ${leaf_count.toLocaleString()}`)

    const results = {}

    // =========================================================================
    // TREE CREATION
    // =========================================================================
    console.log(`\n  [Prototype Tree Creation]`)
    setup_perf_environment()
    const mem_before = measure_memory()
    const start = performance.now()

    const eidos_mind = eidos()
    const { root, nodes, leaf_count: actual_leaves } = create_prototype_tree(
      tree_depth,
      branch_factor,
      traits_per_node,
      eidos_mind.origin_state
    )

    const create_time = performance.now() - start
    const mem_after = measure_memory()
    const mem_used = memory_delta(mem_before, mem_after).heap_used

    console.log(`    Creation time: ${format_time(create_time)}`)
    console.log(`    Memory: ${format_bytes(mem_used)}`)
    console.log(`    Nodes created: ${nodes.length.toLocaleString()}`)
    console.log(`    Bytes per node: ${(mem_used / nodes.length).toFixed(0)} B`)
    console.log(`    Bytes per trait: ${(mem_used / (nodes.length * traits_per_node)).toFixed(0)} B`)
    console.log(`    Nodes per second: ${(nodes.length / (create_time / 1000)).toFixed(0)}`)

    // =========================================================================
    // TRAIT RESOLUTION FROM DIFFERENT TREE DEPTHS
    // =========================================================================
    console.log(`\n  [Trait Resolution at Different Depths]`)

    // Create an instance belief at a leaf
    const leaf_node = nodes[nodes.length - 1]
    const world = createStateInNewMind('world')
    const instance = world.add_belief_from_template({
      bases: [leaf_node.get_label()],
      traits: {}
    })
    world.lock()

    // Get color trait (each node has a unique color value)
    const color_tt = Traittype.get_by_label('color')
    results.trait_from_tree = benchmark('trait_from_tree', () => {
      return instance.get_trait(world, color_tt)
    }, 500)
    print_benchmark(results.trait_from_tree)

    // =========================================================================
    // CACHE EFFECTIVENESS
    // =========================================================================
    console.log(`\n  [Cache Effectiveness]`)

    // First access (uncached)
    setup_perf_environment()
    const fresh_eidos = eidos()
    const { root: fresh_root, nodes: fresh_nodes } = create_prototype_tree(
      tree_depth,
      branch_factor,
      traits_per_node,
      fresh_eidos.origin_state
    )

    const fresh_leaf = fresh_nodes[fresh_nodes.length - 1]
    const fresh_world = createStateInNewMind('fresh_world')
    const fresh_instance = fresh_world.add_belief_from_template({
      bases: [fresh_leaf.get_label()],
      traits: {}
    })
    fresh_world.lock()

    const fresh_color_tt = Traittype.get_by_label('color')

    // Measure first access
    const first_start = performance.now()
    fresh_instance.get_trait(fresh_world, fresh_color_tt)
    const first_time = performance.now() - first_start

    // Measure cached access
    const cached_times = []
    for (let i = 0; i < 1000; i++) {
      const s = performance.now()
      fresh_instance.get_trait(fresh_world, fresh_color_tt)
      cached_times.push(performance.now() - s)
    }
    cached_times.sort((a, b) => a - b)
    const cached_median = cached_times[Math.floor(cached_times.length / 2)]

    console.log(`    First access: ${format_time(first_time)}`)
    console.log(`    Cached access median: ${format_time(cached_median)}`)
    console.log(`    Cache speedup: ${(first_time / cached_median).toFixed(1)}x`)

    const cache_stats = analyze_belief_cache(fresh_instance)
    console.log(`    Cached traits: ${cache_stats.cached_traits}`)
    console.log(`    Cached all: ${cache_stats.cached_all}`)

    // =========================================================================
    // GET_TRAITS ITERATION
    // =========================================================================
    console.log(`\n  [get_traits() Iteration]`)

    results.get_traits_first = benchmark('get_traits_first', () => {
      setup_perf_environment()
      const iter_eidos = eidos()
      const { nodes: iter_nodes } = create_prototype_tree(
        tree_depth,
        branch_factor,
        traits_per_node,
        iter_eidos.origin_state
      )
      const iter_leaf = iter_nodes[iter_nodes.length - 1]
      const iter_world = createStateInNewMind('iter_world')
      const iter_instance = iter_world.add_belief_from_template({
        bases: [iter_leaf.get_label()],
        traits: {}
      })
      iter_world.lock()

      let count = 0
      for (const [tt, value] of iter_instance.get_traits(iter_world)) {
        count++
      }
      return count
    }, 20, 2)
    print_benchmark(results.get_traits_first)

    // Cached iteration
    results.get_traits_cached = benchmark('get_traits_cached', () => {
      let count = 0
      for (const [tt, value] of fresh_instance.get_traits(fresh_world)) {
        count++
      }
      return count
    }, 100)
    print_benchmark(results.get_traits_cached)

    // =========================================================================
    // MULTIPLE INSTANCES FROM SAME TREE
    // =========================================================================
    console.log(`\n  [Multiple Instances from Tree]`)

    const instance_counts = [10, 100, 1000]
    for (const count of instance_counts) {
      if (count > nodes.length * 10) continue

      setup_perf_environment()
      const multi_eidos = eidos()
      const { nodes: multi_nodes } = create_prototype_tree(
        tree_depth,
        branch_factor,
        traits_per_node,
        multi_eidos.origin_state
      )

      const multi_world = createStateInNewMind('multi_world')
      const instances = []

      const instance_start = performance.now()
      for (let i = 0; i < count; i++) {
        // Distribute across different leaves
        const node = multi_nodes[multi_nodes.length - 1 - (i % leaf_count)]
        const inst = multi_world.add_belief_from_template({
          bases: [node.get_label()],
          traits: {} // No extra traits needed, inherits color from base
        })
        instances.push(inst)
      }
      multi_world.lock()
      const instance_time = performance.now() - instance_start

      console.log(`    ${count} instances:`)
      console.log(`      Creation time: ${format_time(instance_time)}`)
      console.log(`      Per instance: ${format_time(instance_time / count)}`)

      // Benchmark trait access across instances
      const multi_tt = Traittype.get_by_label('color')
      const access_result = benchmark(`access_${count}_instances`, () => {
        const inst = instances[Math.floor(Math.random() * count)]
        return inst.get_trait(multi_world, multi_tt)
      }, 500)
      console.log(`      Trait access median: ${format_time(access_result.median)}`)
    }

    // =========================================================================
    // TREE COMPARISON (WIDE VS DEEP)
    // =========================================================================
    console.log(`\n  [Wide vs Deep Tree Comparison]`)

    // Wide tree: few levels, many branches
    const wide_depth = 3
    const wide_branch = Math.ceil(Math.pow(expected_nodes, 1 / wide_depth))
    setup_perf_environment()
    const wide_eidos = eidos()
    const wide_start = performance.now()
    const { nodes: wide_nodes } = create_prototype_tree(wide_depth, wide_branch, traits_per_node, wide_eidos.origin_state)
    const wide_time = performance.now() - wide_start

    console.log(`    Wide tree (depth=${wide_depth}, branch=${wide_branch}): ${wide_nodes.length} nodes in ${format_time(wide_time)}`)

    // Deep tree: many levels, few branches
    const deep_branch = 2
    const deep_depth = Math.ceil(Math.log2(expected_nodes))
    setup_perf_environment()
    const deep_eidos = eidos()
    const deep_start = performance.now()
    const { nodes: deep_nodes } = create_prototype_tree(deep_depth, deep_branch, traits_per_node, deep_eidos.origin_state)
    const deep_time = performance.now() - deep_start

    console.log(`    Deep tree (depth=${deep_depth}, branch=${deep_branch}): ${deep_nodes.length} nodes in ${format_time(deep_time)}`)

    // =========================================================================
    // REGISTRY COUNTS
    // =========================================================================
    const counts = count_registries()
    console.log(`\n  [Registry Counts]`)
    console.log(`    Beliefs: ${counts.beliefs.toLocaleString()}`)
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
if (process.argv[1]?.endsWith('prototype_tree.scenario.mjs')) {
  run().catch(console.error)
}
