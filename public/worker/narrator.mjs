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
import {Traittype, T} from "./traittype.mjs"

/**
 * @typedef {import('./belief.mjs').Belief} Belief
 * @typedef {import('./state.mjs').State} State
 */

/**
 * Subject data sent to GUI
 * @typedef {Object} SubjectData
 * @property {number} id - Subject ID (sid)
 * @property {string|null} description_short - Display name
 * @property {Object[]} actions - Available actions for this subject
 * @property {'subject'} is - Type discriminator
 */

let _initialized = false

/**
 * One-time initialization of narrator handlers
 */
export async function ensure_init() {
  if (_initialized) return
  _initialized = true

  const {handler_register} = await import("./worker.mjs")
  handler_register('look', do_look_in_location)
}

/**
 * Handle look action
 * @param {any} context
 */
export function do_look_in_location(context) {
  const session = context.session;
  const state = session.state;
  const player = session.player;

  const target = context.subject.get_belief_by_state(state)
  const content = target.rev_trait(state, T.location)

  // Get player's mind state
  const player_state = state.get_active_state_by_host(player)

  log([state], 'looking at', target)
  for (const item of content) {
    log([state], '  seeing', item)
    player_state.learn_about(item)
  }
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
 * @returns {{strings: TemplateStringsArray, values: SubjectData[]}} Formatted message
 */
export function tt( strings, ...val_in){
  const values = []
  for( const obs of val_in ){
    if( !obs ) continue
    values.push( bake_narration( obs ) )
  }
  return {strings,values}
}

/**
 * Convert observation data to narration format for client
 * @param {any} obs - Observation object
 * @returns {SubjectData} Subject data for client
 */
export function bake_narration( obs ){
  return {
    id: obs.subject.sid,
    description_short: obs.known_as,
    actions: obs.actions,
    is: 'subject'
  }
}
