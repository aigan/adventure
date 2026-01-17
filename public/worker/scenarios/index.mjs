/**
 * Scenario Registry
 *
 * Central registry for game scenarios with lazy loading.
 * Scenarios are separate modules that define world setup and gameplay sequences.
 */

/**
 * @typedef {import('./workshop.mjs').Scenario} Scenario
 */

/** @type {Record<string, () => Promise<Scenario>>} */
const scenario_loaders = {
  workshop: () => import('./workshop.mjs').then(m => m.workshop_scenario),
  timeline_resolution: () => import('./timeline_resolution.mjs').then(m => m.timeline_resolution_scenario),
}

/**
 * Get scenario by name (async, lazy loads)
 * @param {string} name
 * @returns {Promise<Scenario|undefined>}
 */
export async function get_scenario(name) {
  const loader = scenario_loaders[name]
  if (!loader) return undefined
  return loader()
}

/**
 * List available scenario names
 * @returns {string[]}
 */
export function list_scenarios() {
  return Object.keys(scenario_loaders)
}
