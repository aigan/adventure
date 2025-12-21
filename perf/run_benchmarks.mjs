#!/usr/bin/env node
/**
 * Performance Benchmark Runner
 *
 * Runs all benchmark suites and scenarios to find performance limits.
 *
 * Usage:
 *   node --expose-gc perf/run_benchmarks.mjs              # Run all
 *   node --expose-gc perf/run_benchmarks.mjs benchmarks   # Benchmarks only
 *   node --expose-gc perf/run_benchmarks.mjs scenarios    # Scenarios only
 *   node --expose-gc perf/run_benchmarks.mjs trait        # Match by name
 */

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readdir } from 'fs/promises'
import { measure_memory, format_bytes, format_time } from './helpers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const BENCHMARKS_DIR = join(__dirname, 'benchmarks')
const SCENARIOS_DIR = join(__dirname, 'scenarios')

/**
 * Run all benchmark suites
 */
async function run_benchmarks(filter = null) {
  console.log('\n╔════════════════════════════════════════╗')
  console.log('║         BENCHMARK SUITES               ║')
  console.log('╚════════════════════════════════════════╝')

  let files
  try {
    files = await readdir(BENCHMARKS_DIR)
  } catch (e) {
    console.log('No benchmarks directory found')
    return
  }

  const bench_files = files.filter(f => f.endsWith('.bench.mjs'))

  for (const file of bench_files) {
    if (filter && !file.includes(filter)) continue

    const path = join(BENCHMARKS_DIR, file)
    const module = await import(path)

    if (module.run) {
      await module.run()
    } else if (module.suite) {
      console.log(`\n=== ${module.suite.name} ===`)
      console.log('(Use direct run for full output)')
    }
  }
}

/**
 * Run all scenario tests
 */
async function run_scenarios(filter = null) {
  console.log('\n╔════════════════════════════════════════╗')
  console.log('║         SCALE SCENARIOS                ║')
  console.log('╚════════════════════════════════════════╝')

  let files
  try {
    files = await readdir(SCENARIOS_DIR)
  } catch (e) {
    console.log('No scenarios directory found')
    return
  }

  const scenario_files = files.filter(f => f.endsWith('.scenario.mjs'))

  for (const file of scenario_files) {
    if (filter && !file.includes(filter)) continue

    const path = join(SCENARIOS_DIR, file)
    const module = await import(path)

    if (module.run) {
      await module.run()
    }
  }
}

/**
 * Print system info
 */
function print_system_info() {
  console.log('╔════════════════════════════════════════╗')
  console.log('║     PERFORMANCE BENCHMARK SUITE        ║')
  console.log('╚════════════════════════════════════════╝')
  console.log('')
  console.log('System Info:')
  console.log(`  Node.js: ${process.version}`)
  console.log(`  Platform: ${process.platform} ${process.arch}`)
  console.log(`  GC exposed: ${global.gc ? 'yes' : 'no (use --expose-gc for accurate memory)'}`)

  const mem = measure_memory(false)
  console.log(`  Initial heap: ${format_bytes(mem.heap_used)}`)
  console.log(`  Heap total: ${format_bytes(mem.heap_total)}`)
  console.log('')
  console.log('Run: node --expose-gc perf/run_benchmarks.mjs')
  console.log('')
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2)
  const mode = args[0]
  const filter = args[1] || null

  print_system_info()

  const start = performance.now()

  try {
    if (!mode || mode === 'all') {
      await run_benchmarks(filter)
      await run_scenarios(filter)
    } else if (mode === 'benchmarks' || mode === 'bench') {
      await run_benchmarks(filter)
    } else if (mode === 'scenarios' || mode === 'scenario') {
      await run_scenarios(filter)
    } else {
      // Treat as filter
      await run_benchmarks(mode)
      await run_scenarios(mode)
    }
  } catch (error) {
    console.error('\nBenchmark failed:', error)
    process.exit(1)
  }

  const elapsed = performance.now() - start

  console.log('\n╔════════════════════════════════════════╗')
  console.log('║            COMPLETE                    ║')
  console.log('╚════════════════════════════════════════╝')
  console.log(`Total time: ${format_time(elapsed)}`)

  const final_mem = measure_memory()
  console.log(`Final heap: ${format_bytes(final_mem.heap_used)}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
