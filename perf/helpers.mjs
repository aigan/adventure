/**
 * Performance testing utilities
 *
 * Provides benchmarking and memory measurement functions for finding
 * the limits of the belief/state architecture.
 */

import { Mind, Materia, State, Belief, Archetype, Traittype, Subject, logos, logos_state, eidos } from '../public/worker/cosmos.mjs'
import * as DB from '../public/worker/db.mjs'
import { setupStandardArchetypes, createStateInNewMind, createMindWithBeliefs } from '../test/helpers.mjs'

// Re-export test helpers for convenience
export { setupStandardArchetypes, createStateInNewMind, createMindWithBeliefs }
export { Mind, Materia, State, Belief, Archetype, Traittype, Subject, logos, logos_state, eidos }
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
