/**
 * Narrator - Formats game state for player presentation
 *
 * The narrator is the bridge between the session (game state) and the player's
 * screen. It handles designation (how things are named/described), message
 * formatting with embedded interactive elements, and action handling.
 *
 * This is distinct from in-world observation (beliefs observing other beliefs),
 * which happens within minds. The narrator presents the session to the player.
 */

import { log } from "./debug.mjs"
import { Subject } from "./subject.mjs"

/**
 * @typedef {import('./belief.mjs').Belief} Belief
 * @typedef {import('./state.mjs').State} State
 */

/**
 * One-time initialization of narrator handlers
 */
export async function ensure_init() {
  const {handler_register} = await import("./worker.mjs")
  handler_register('look', do_look)
}

/**
 * Handle look action
 * @param {any} context
 */
export function do_look(context) {
  log('looking', context)
}

/**
 * Get designation for a belief or subject from the player's perspective
 * Simple placeholder until cultural knowledge system is implemented
 * @param {State} state - Current state to resolve beliefs in
 * @param {Belief|Subject} entity - Belief or Subject to get designation for
 * @returns {string|null} Simple label designation
 */
export function desig(state, entity) {
  // If it's a Subject, resolve it to a Belief first
  /** @type {Belief|null} */ let belief
  if (entity instanceof Subject) {
    belief = entity.get_belief_by_state(state)
  } else {
    belief = entity
  }

  if (!belief) return null
  const label = belief.get_label()
  return label ?? null
}

/**
 * Template tag for formatting messages with observations
 * @param {TemplateStringsArray} strings - Template literal strings
 * @param {...Object} val_in - Observation objects to format
 * @returns {{strings: TemplateStringsArray, values: Object[]}} Formatted message
 */
export function tt( strings, ...val_in){
  const values = []
  for( const obs of val_in ){
    if( !obs ) continue
    values.push( bake_obs( obs ) )
  }
  return {strings,values}
}

/**
 * Convert observation data to baked format for client
 * @param {any} obs - Observation object
 * @returns {{id: number, description_short: string|null, actions: Object[], is: string}} Baked observation for client
 */
export function bake_obs( obs ){
  return {
    id: obs.subject.sid,
    description_short: obs.known_as,
    actions: obs.actions,
    is: 'entity'
  }
}
