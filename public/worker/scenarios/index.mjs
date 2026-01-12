/**
 * Scenario Registry
 *
 * Central registry for game scenarios.
 * Scenarios are separate modules that define world setup and gameplay sequences.
 */

import { workshop_scenario } from './workshop.mjs'

/**
 * @typedef {import('./workshop.mjs').Scenario} Scenario
 */

/** @type {Record<string, Scenario>} */
export const scenarios = {
  workshop: workshop_scenario,
}

/**
 * Get scenario by name
 * @param {string} name
 * @returns {Scenario|undefined}
 */
export function get_scenario(name) {
  return scenarios[name]
}

/**
 * List available scenario names
 * @returns {string[]}
 */
export function list_scenarios() {
  return Object.keys(scenarios)
}
