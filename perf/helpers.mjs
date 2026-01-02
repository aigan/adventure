/**
 * Performance testing utilities
 *
 * Provides benchmarking and memory measurement functions for finding
 * the limits of the belief/state architecture.
 */

import { Mind, Materia, State, Belief, Archetype, Traittype, Subject, logos, logos_state, eidos, Convergence } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'
import { setupStandardArchetypes, createStateInNewMind, createMindWithBeliefs, createEidosState } from '../test/helpers.mjs'

// Re-export test helpers for convenience
export { setupStandardArchetypes, createStateInNewMind, createMindWithBeliefs, createEidosState }
export { Mind, Materia, State, Belief, Archetype, Traittype, Subject, logos, logos_state, eidos, Convergence }
export { DB }

/**
 * Setup performance test environment
 * Resets all registries and sets up standard archetypes
 */
export function setup_perf_environment() {
  DB.reset_registries()
  setupStandardArchetypes()
}

/**
 * High-resolution benchmark function
 * @param {string} name - Benchmark name
 * @param {Function} fn - Function to benchmark (can return value for verification)
 * @param {number} iterations - Number of iterations (default 1000)
 * @param {number} warmup - Warmup iterations (default 10)
 * @returns {Object} Timing statistics
 */
export function benchmark(name, fn, iterations = 1000, warmup = 10) {
  // Warmup phase - let JIT optimize
  for (let i = 0; i < warmup; i++) {
    fn()
  }

  // Measurement phase
  const times = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    fn()
    times.push(performance.now() - start)
  }

  times.sort((a, b) => a - b)
  const mean = times.reduce((a, b) => a + b, 0) / times.length

  return {
    name,
    iterations,
    min: times[0],
    max: times[times.length - 1],
    median: times[Math.floor(times.length / 2)],
    mean,
    p95: times[Math.floor(times.length * 0.95)],
    p99: times[Math.floor(times.length * 0.99)],
    stddev: Math.sqrt(times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / times.length),
    total: times.reduce((a, b) => a + b, 0)
  }
}

/**
 * Measure current memory usage
 * @param {boolean} force_gc - Whether to force garbage collection first
 * @returns {Object} Memory usage statistics
 */
export function measure_memory(force_gc = true) {
  if (force_gc && global.gc) {
    global.gc()
  }

  const usage = process.memoryUsage()
  return {
    heap_used: usage.heapUsed,
    heap_total: usage.heapTotal,
    external: usage.external,
    rss: usage.rss,
    array_buffers: usage.arrayBuffers || 0,
    timestamp: Date.now()
  }
}

/**
 * Measure memory delta between two snapshots
 * @param {Object} before - Memory snapshot before
 * @param {Object} after - Memory snapshot after
 * @returns {Object} Memory deltas
 */
export function memory_delta(before, after) {
  return {
    heap_used: after.heap_used - before.heap_used,
    heap_total: after.heap_total - before.heap_total,
    external: after.external - before.external,
    rss: after.rss - before.rss
  }
}

/**
 * Format bytes as human-readable string
 * @param {number} bytes - Byte count
 * @returns {string} Formatted string
 */
export function format_bytes(bytes) {
  const sign = bytes < 0 ? '-' : ''
  bytes = Math.abs(bytes)
  if (bytes < 1024) return `${sign}${bytes} B`
  if (bytes < 1024 * 1024) return `${sign}${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${sign}${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${sign}${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * Format time as human-readable string
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted string
 */
export function format_time(ms) {
  if (ms < 0.001) return `${(ms * 1000000).toFixed(2)} ns`
  if (ms < 1) return `${(ms * 1000).toFixed(2)} us`
  if (ms < 1000) return `${ms.toFixed(3)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

/**
 * Print benchmark results to console
 * @param {Object} result - Benchmark result from benchmark()
 */
export function print_benchmark(result) {
  console.log(`  ${result.name}:`)
  console.log(`    median: ${format_time(result.median)}, p95: ${format_time(result.p95)}, p99: ${format_time(result.p99)}`)
  console.log(`    min: ${format_time(result.min)}, max: ${format_time(result.max)}, mean: ${format_time(result.mean)}`)
}

/**
 * Create a deep belief chain with inheritance
 * Creates a chain of beliefs in a regular state (not eidos) where each
 * inherits from the previous. Uses 'color' trait to test resolution.
 * @param {number} depth - Number of levels in the chain
 * @param {State} state - State to create beliefs in
 * @returns {Belief} The deepest belief
 */
export function create_deep_belief_chain(depth, state) {
  let current_base = null

  for (let level = 0; level < depth; level++) {
    const proto_label = `chain_level_${level}`

    const bases = current_base ? [current_base] : ['PortableObject']
    const traits = level === 0 ? { color: `color_at_level_0` } : {}

    const proto = state.add_belief_from_template({
      bases,
      traits,
      label: proto_label
    })

    current_base = proto
  }

  return current_base
}

/**
 * Create a deep prototype chain in eidos using PortableObject
 * Creates shared beliefs that inherit from each other.
 * @param {number} depth - Number of levels in the chain
 * @param {number} traits_per_level - Ignored (kept for API compat) - uses 'color' trait
 * @returns {Belief} The deepest prototype belief
 */
export function create_deep_prototype_chain(depth, traits_per_level = 1) {
  // Get eidos for shared beliefs
  const eidos_mind = eidos()
  const eidos_state = eidos_mind.origin_state

  let current_base = null
  let current_base_label = 'PortableObject'

  for (let level = 0; level < depth; level++) {
    // Only set color at deepest level (level 0) so we have to walk the chain
    const traits = level === 0 ? { color: `deep_color_level_0` } : {}

    const proto_label = `proto_level_${level}`
    const proto = eidos_state.add_belief_from_template({
      bases: [current_base_label],
      traits,
      label: proto_label
    })

    // Lock before using as base for next level
    proto.lock(eidos_state)

    current_base = proto
    current_base_label = proto_label
  }

  return current_base
}

/**
 * Create a large world state with many beliefs
 * @param {number} belief_count - Total number of beliefs to create
 * @param {number} location_count - Number of location beliefs
 * @returns {State} The world state containing all beliefs
 */
export function create_large_world_state(belief_count, location_count) {
  const world = new Materia(logos(), 'perf_world')
  const state = world.create_state(logos_state(), { tt: 1 })

  // Create locations first
  const locations = []
  for (let i = 0; i < location_count; i++) {
    const loc = state.add_belief_from_template({
      bases: ['Location'],
      traits: { color: `loc_color_${i}` },
      label: `location_${i}`
    })
    locations.push(loc)
  }

  // Create entities distributed across locations
  const entity_count = belief_count - location_count
  for (let i = 0; i < entity_count; i++) {
    const location = locations[i % locations.length]
    state.add_belief_from_template({
      bases: ['PortableObject'],
      traits: { location: location.subject },
      label: `entity_${i}`
    })
  }

  return state
}

/**
 * Create a long chain of states with changes
 * @param {number} state_count - Number of states to create
 * @param {number} changes_per_state - Number of belief changes per state
 * @returns {Array<State>} Array of all states in chain
 */
export function create_state_chain(state_count, changes_per_state) {
  const world = new Materia(logos(), 'perf_session')
  let state = world.create_state(logos_state(), { tt: 1 })

  // Create a location that entities will reference
  const location = state.add_belief_from_template({
    bases: ['Location'],
    traits: { color: 'green' },
    label: 'tracked_location'
  })

  // Create initial entity pointing to the location
  state.add_belief_from_template({
    bases: ['PortableObject'],
    traits: { location: location.subject },
    label: 'initial_entity'
  })
  state.lock()

  const states = [state]

  for (let i = 1; i < state_count; i++) {
    state = state.branch(state.ground_state, i + 1)

    // Only add entities every 10th state to test skip list efficiency
    // Skip list should skip the 9 states without changes
    if (i % 10 === 0) {
      for (let c = 0; c < changes_per_state; c++) {
        state.add_belief_from_template({
          bases: ['PortableObject'],
          traits: { location: location.subject },
          label: `entity_${i}_${c}`
        })
      }
    }

    state.lock()
    states.push(state)
  }

  return { states, location }
}

/**
 * Run a scenario with progressive parameters
 * @param {string} name - Scenario name
 * @param {Array<Object>} parameters - Array of parameter objects
 * @param {Function} run_fn - Function to run for each parameter set
 */
export async function run_scenario(name, parameters, run_fn) {
  console.log(`\n=== ${name} ===`)

  for (const params of parameters) {
    console.log(`\nParameters: ${JSON.stringify(params)}`)

    // Reset environment for each run
    setup_perf_environment()

    const mem_before = measure_memory()
    const start = performance.now()

    const result = await run_fn(params)

    const elapsed = performance.now() - start
    const mem_after = measure_memory()
    const mem_diff = memory_delta(mem_before, mem_after)

    console.log(`  Setup time: ${format_time(elapsed)}`)
    console.log(`  Memory growth: ${format_bytes(mem_diff.heap_used)}`)

    if (result) {
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'object' && value.median !== undefined) {
          print_benchmark(value)
        } else if (typeof value === 'number') {
          console.log(`  ${key}: ${value}`)
        } else {
          console.log(`  ${key}: ${value}`)
        }
      }
    }
  }
}

/**
 * Count objects in DB registries
 * @returns {Object} Counts of registered objects
 */
export function count_registries() {
  const reflection = DB._reflect()
  return {
    beliefs: reflection.belief_by_id?.size || 0,
    states: reflection.state_by_id?.size || 0,
    minds: reflection.mind_by_id?.size || 0,
    subjects: Subject._registry?.size || 0,
    archetypes: reflection.archetype_by_label?.size || 0,
    traittypes: reflection.traittype_by_label?.size || 0
  }
}

/**
 * Analyze cache effectiveness for a locked belief
 * @param {Belief} belief - Locked belief to analyze
 * @returns {Object} Cache statistics
 */
export function analyze_belief_cache(belief) {
  return {
    cached_traits: belief._cache?.size || 0,
    cached_all: belief._cached_all || false,
    own_traits: belief._traits?.size || 0,
    bases_count: belief._bases?.size || 0
  }
}

// ============================================================================
// EXTREME SCALE HELPERS - Promotions, Compositions, Mind Hierarchies
// ============================================================================

/**
 * Create a temporal promotion chain in eidos
 * Each promotion is at a different timestamp, creating v1→v2→v3→...→vN
 * @param {number} depth - Number of promotions in the chain
 * @param {number} start_tt - Starting timestamp (default 1)
 * @returns {{ root: Belief, chain: Belief[], states: State[] }} Root belief and all versions
 */
export function create_temporal_promotion_chain(depth, start_tt = 1) {
  // Create initial temporal state in eidos
  const eidos_state = createEidosState(start_tt)
  const root = eidos_state.add_belief_from_template({
    bases: ['ObjectPhysical'],
    traits: { color: 'color_v0' },
    label: 'temporal_root',
    promotable: true
  })
  eidos_state.lock()

  const chain = [root]
  const states = [eidos_state]
  let current = root
  let current_state = eidos_state

  for (let i = 1; i <= depth; i++) {
    // Branch to new timestamp
    const next_state = current_state.branch(current_state.ground_state, start_tt + i * 10)
    current = current.replace(next_state, { color: `color_v${i}` }, { promote: true })
    next_state.lock()

    chain.push(current)
    states.push(next_state)
    current_state = next_state
  }

  return { root, chain, states }
}

/**
 * Create multiple probability promotions on a single belief
 * @param {Belief} belief - The promotable belief
 * @param {State} state - State to create promotions in
 * @param {number} count - Number of probability alternatives
 * @returns {Belief[]} Array of promotion beliefs
 */
export function create_probability_promotions(belief, state, count) {
  const promotions = []
  const certainty_each = 1.0 / count

  for (let i = 0; i < count; i++) {
    const promotion = belief.branch(state, { color: `prob_color_${i}` }, {
      promote: true,
      certainty: certainty_each
    })
    promotions.push(promotion)
  }

  return promotions
}

/**
 * Create a mixed temporal + probability promotion structure
 * Each temporal step has multiple probability branches
 * @param {number} temporal_depth - Number of temporal steps
 * @param {number} prob_width - Number of probability alternatives per step
 * @param {number} start_tt - Starting timestamp (default 1)
 * @returns {{ root: Belief, structure: Array<{ state: State, promotions: Belief[] }>, eidos_state: State }}
 */
export function create_mixed_promotions(temporal_depth, prob_width, start_tt = 1) {
  const eidos_state = createEidosState(start_tt)
  const root = eidos_state.add_belief_from_template({
    bases: ['ObjectPhysical'],
    traits: { color: 'mixed_v0' },
    label: 'mixed_root',
    promotable: true
  })
  eidos_state.lock()

  const structure = []
  let current_state = eidos_state

  for (let t = 1; t <= temporal_depth; t++) {
    const next_state = current_state.branch(current_state.ground_state, start_tt + t * 100)
    const promotions = []
    const certainty_each = 1.0 / prob_width

    for (let p = 0; p < prob_width; p++) {
      const promotion = root.branch(next_state, { color: `mixed_t${t}_p${p}` }, {
        promote: true,
        certainty: certainty_each
      })
      promotions.push(promotion)
    }

    next_state.lock()
    structure.push({ state: next_state, promotions })
    current_state = next_state
  }

  return { root, structure, eidos_state }
}

/**
 * Create beliefs that depend on a promotable belief (for cache invalidation testing)
 * @param {Belief} promotable - The promotable belief to depend on
 * @param {number} count - Number of dependent beliefs to create
 * @param {State} state - State to create beliefs in
 * @returns {Belief[]} Array of dependent beliefs
 */
export function create_promotion_dependent_beliefs(promotable, count, state) {
  const dependents = []

  for (let i = 0; i < count; i++) {
    const dependent = state.add_belief_from_template({
      bases: [promotable],
      traits: {},
      label: `dependent_${i}`
    })
    dependents.push(dependent)
  }

  return dependents
}

/**
 * Create a belief with many bases (wide composition)
 * @param {number} base_count - Number of bases
 * @param {State} state - State to create in
 * @param {Object} options - Options
 * @param {boolean} options.with_traits - Add unique traits to each base (uses color)
 * @returns {{ belief: Belief, bases: Belief[] }}
 */
export function create_wide_belief(base_count, state, options = {}) {
  const eidos_state = eidos().origin_state
  const bases = []

  // Create base beliefs in eidos, each with a unique color value
  for (let i = 0; i < base_count; i++) {
    const base = eidos_state.add_belief_from_template({
      bases: ['ObjectPhysical'],
      traits: { color: `color_${i}` },
      label: `wide_base_${i}`
    })
    base.lock(eidos_state)
    bases.push(base)
  }

  // Create the wide belief with all bases
  const belief = state.add_belief_from_template({
    bases: bases.map(b => b.get_label()),
    traits: {},
    label: 'wide_composed'
  })

  return { belief, bases }
}

/**
 * Create a tree-structured prototype hierarchy
 * Each node has a unique color value to test inheritance resolution
 * @param {number} depth - Depth of the tree
 * @param {number} branch_factor - Children per node
 * @param {number} traits_per_node - Ignored (kept for API compatibility)
 * @param {State} eidos_state - Eidos state
 * @returns {{ root: Belief, nodes: Belief[], leaf_count: number }}
 */
export function create_prototype_tree(depth, branch_factor, traits_per_node, eidos_state) {
  const nodes = []
  let node_counter = 0

  function create_node(parent_label, current_depth) {
    const label = `tree_node_${node_counter++}`
    // Use color trait (exists on ObjectPhysical) with unique value per node
    const traits = { color: `color_node_${node_counter}` }

    const node = eidos_state.add_belief_from_template({
      bases: [parent_label],
      traits,
      label
    })
    node.lock(eidos_state)
    nodes.push(node)

    if (current_depth < depth) {
      for (let b = 0; b < branch_factor; b++) {
        create_node(label, current_depth + 1)
      }
    }

    return node
  }

  const root = create_node('ObjectPhysical', 1)
  const leaf_count = Math.pow(branch_factor, depth - 1)

  return { root, nodes, leaf_count }
}

/**
 * Create a chain of Location beliefs with composable tools array
 * Uses 'tools' trait which is a composable array on Location archetype
 * @param {number} item_count - Total items across chain
 * @param {number} depth - Depth of inheritance chain
 * @param {State} state - State to create in
 * @returns {{ leaf: Belief, chain: Belief[], trait_label: string }}
 */
export function create_composable_inventory_chain(item_count, depth, state) {
  const eidos_state = eidos().origin_state
  const items_per_level = Math.ceil(item_count / depth)
  const chain = []
  let current_label = 'Location'

  for (let level = 0; level < depth; level++) {
    // Create tool item beliefs
    const tools = []
    for (let i = 0; i < items_per_level; i++) {
      const tool_label = `tool_${level}_${i}`
      // Create a simple tool belief - just use label as placeholder
      // The tools trait expects Subject references, so we create placeholder beliefs
      const tool = eidos_state.add_belief_from_template({
        bases: ['PortableObject'],
        traits: { color: `tool_color_${level}_${i}` },
        label: tool_label
      })
      tool.lock(eidos_state)
      tools.push(tool.subject)
    }

    const label = `location_level_${level}`
    const node = eidos_state.add_belief_from_template({
      bases: [current_label],
      traits: { tools },
      label
    })
    node.lock(eidos_state)
    chain.push(node)
    current_label = label
  }

  // Create leaf in the provided state
  const leaf = state.add_belief_from_template({
    bases: [current_label],
    traits: {},
    label: 'location_leaf'
  })

  return { leaf, chain, trait_label: 'tools' }
}

/**
 * Create a Convergence state with multiple component states
 * @param {number} component_count - Number of component minds/states
 * @param {number} beliefs_per_component - Beliefs in each component
 * @returns {{ convergence_state: State, component_states: State[] }}
 */
export function create_convergence_state(component_count, beliefs_per_component) {
  const component_states = []
  const logos_ref = logos()
  const logos_state_ref = logos_state()

  for (let c = 0; c < component_count; c++) {
    const mind = new Materia(logos_ref, `component_mind_${c}`)
    // Branch from logos_state to create a temporal state
    const state = logos_state_ref.branch(logos_state_ref.ground_state, c + 1)

    for (let b = 0; b < beliefs_per_component; b++) {
      state.add_belief_from_template({
        bases: ['ObjectPhysical'],
        traits: { color: `comp_${c}_belief_${b}` },
        label: `comp_${c}_belief_${b}`
      })
    }
    state.lock()
    component_states.push(state)
  }

  // Create convergence mind and state
  const convergence_mind = new Materia(logos_ref, 'convergence_mind')
  const convergence_state = new Convergence(
    convergence_mind,
    logos_state_ref,
    component_states,
    { derivation: true }
  )

  return { convergence_state, component_states }
}

/**
 * Create a hierarchy of minds with states and beliefs
 * @param {number} mind_count - Total number of minds
 * @param {number} states_per_mind - States per mind
 * @param {number} beliefs_per_state - Beliefs per state
 * @returns {{ minds: Mind[], states: State[], total_beliefs: number }}
 */
export function create_mind_hierarchy(mind_count, states_per_mind, beliefs_per_state) {
  const minds = []
  const states = []
  let total_beliefs = 0
  const root = logos()
  const root_state = logos_state()

  for (let m = 0; m < mind_count; m++) {
    // All minds are direct children of logos (simplified - avoids nested state issues)
    const mind = new Materia(root, `mind_${m}`)
    minds.push(mind)

    for (let s = 0; s < states_per_mind; s++) {
      const tt = m * states_per_mind * 1000 + s + 1
      // Create state from logos_state (timeless, so tt can be provided)
      const state = mind.create_state(root_state, { tt })

      for (let b = 0; b < beliefs_per_state; b++) {
        state.add_belief_from_template({
          bases: ['ObjectPhysical'],
          traits: { color: `m${m}_s${s}_b${b}` },
          label: `m${m}_s${s}_b${b}`
        })
        total_beliefs++
      }

      state.lock()
      states.push(state)
    }
  }

  return { minds, states, total_beliefs }
}

/**
 * Create a massive chain of states (for skip list testing)
 * @param {number} state_count - Number of states in chain
 * @param {number} change_interval - Add beliefs every N states
 * @returns {{ states: State[], location: Belief, total_entities: number }}
 */
export function create_massive_state_chain(state_count, change_interval = 10) {
  const world = new Materia(logos(), 'massive_chain')
  let state = world.create_state(logos_state(), { tt: 1 })

  const location = state.add_belief_from_template({
    bases: ['Location'],
    traits: { color: 'green' },
    label: 'chain_location'
  })
  state.lock()

  const states = [state]
  let total_entities = 0

  for (let i = 1; i < state_count; i++) {
    state = state.branch(state.ground_state, i + 1)

    if (i % change_interval === 0) {
      state.add_belief_from_template({
        bases: ['PortableObject'],
        traits: { location: location.subject },
        label: `chain_entity_${i}`
      })
      total_entities++
    }

    state.lock()
    states.push(state)
  }

  return { states, location, total_entities }
}

/**
 * Analyze promotion cache dependencies for a belief
 * @param {Belief} belief - Belief to analyze
 * @returns {Object} Cache dependency stats
 */
export function analyze_promotion_cache_deps(belief) {
  const deps = belief._cache_deps
  return {
    has_deps: deps !== null && deps !== undefined,
    dep_count: deps?.size || 0,
    deps_list: deps ? [...deps.keys()].map(b => b.get_label?.() || 'unlabeled') : []
  }
}

/**
 * Measure cache invalidation cascade effect
 * @param {Belief} promotable - The promotable belief
 * @param {State} state - State for new promotion
 * @param {Belief[]} dependents - Dependent beliefs to check
 * @returns {Object} Invalidation statistics
 */
export function measure_epoch_invalidation_cascade(promotable, state, dependents) {
  // Prime all dependent caches
  const color_tt = Traittype.get_by_label('color')
  for (const dep of dependents) {
    dep.get_trait(state, color_tt)
  }

  // Count cached before
  const cached_before = dependents.filter(d => d._cache?.size > 0).length

  // Add a promotion (bumps epoch)
  const epoch_before = promotable._promotable_epoch
  promotable.branch(state, { color: 'invalidation_test' }, { promote: true, certainty: 0.5 })
  const epoch_after = promotable._promotable_epoch

  // Count cached after (should be invalidated on next access)
  let invalidated = 0
  for (const dep of dependents) {
    // Access trait - this triggers cache validation
    dep.get_trait(state, color_tt)
    // Check if cache was rebuilt (size should be small if invalidated and rebuilt)
  }

  return {
    cached_before,
    epoch_before,
    epoch_after,
    epoch_bumped: epoch_after > epoch_before,
    dependents_count: dependents.length
  }
}

/**
 * Analyze memory scaling across many beliefs
 * @param {Belief[]} beliefs - Beliefs to analyze
 * @returns {Object} Memory statistics
 */
export function analyze_cache_memory_scaling(beliefs) {
  let total_cached = 0
  let total_own = 0
  let cached_all_count = 0
  let has_cache_deps = 0

  for (const belief of beliefs) {
    total_cached += belief._cache?.size || 0
    total_own += belief._traits?.size || 0
    if (belief._cached_all) cached_all_count++
    if (belief._cache_deps?.size > 0) has_cache_deps++
  }

  return {
    belief_count: beliefs.length,
    total_cached_traits: total_cached,
    total_own_traits: total_own,
    avg_cached_per_belief: total_cached / beliefs.length,
    cached_all_percentage: (cached_all_count / beliefs.length * 100).toFixed(1),
    with_cache_deps_percentage: (has_cache_deps / beliefs.length * 100).toFixed(1)
  }
}
