import { log, assert } from "../lib/debug.mjs";
import { Session } from "./session.mjs"
import { Subject } from "./subject.mjs"
import { register_reset_hook } from "./reset.mjs"

/*
	All imports async here in top worker for catching errors
*/

/**
 * Action data received from client
 * @typedef {Object} ActionData
 * @property {string} do - Command name to execute
 * @property {number} target - Subject ID of target
 * @property {number} [actor] - Subject ID of actor (optional)
 * @property {string} label - Display text
 */

/**
 * Message received from client
 * @typedef {[string, any, number]} ClientMessage
 * Format: [command, data, ackid]
 */

/**
 * Ack message sent to client
 * @typedef {['ack', number, any]} AckMessage
 * Format: ['ack', ackid, result]
 */

/**
 * Subject data sent to GUI
 * @typedef {Object} SubjectData
 * @property {number} id - Subject ID (sid)
 * @property {string|null} description_short - Display name
 * @property {Object[]} actions - Available actions for this subject
 * @property {'subject'} is - Type discriminator
 */

/**
 * Template tag result with embedded subjects
 * @typedef {Object} TemplateTagResult
 * @property {TemplateStringsArray} strings - String parts
 * @property {SubjectData[]} values - Embedded subject data
 */

/**
 * Part of main_add message - either plain string or template result
 * @typedef {string | TemplateTagResult} MainAddPart
 */

/**
 * Worker → Client messages
 * @typedef {['main_add', ...MainAddPart[]]} MainAddMessage
 * @typedef {['main_clear']} MainClearMessage
 * @typedef {['header_set', string]} HeaderSetMessage
 * @typedef {['topic_update', SubjectData]} TopicUpdateMessage
 * @typedef {MainAddMessage | MainClearMessage | HeaderSetMessage | TopicUpdateMessage | AckMessage} WorkerMessage
 */

/**
 * Current active session for this worker's client connection
 * Single-client for now; future multi-client would use session_id lookup
 * @type {Session|null}
 */
let current_session = null

/**
 * Reset current session (for testing)
 */
export function reset_session() {
  current_session = null
}

// Register with DB reset system
register_reset_hook(reset_session)

/** @type {{[key: string]: (...args: any[]) => any}} */
const dispatch = {
  ping(){
    return 'pong';
  },
}

/**
 * @param {string} label
 * @param {(...args: any[]) => any} handler
 */
export function handler_register( label, handler ){
  // log('register handler', label);
  dispatch[label] = handler;
}

/**
 * @param {MessageEvent} e
 */
addEventListener('message', async e =>{
  let msg = e.data;
  if( typeof msg === 'string') msg = [msg];
  /** @type {ClientMessage} */
  const typedMsg = msg;
  const [cmd, data={}, ackid] = typedMsg;
  //log("Recieved message", cmd, data );
  assert(ackid > 0, "expected ackid")

  if( cmd === "start" ){
    log('Starting');
    current_session = new Session();
    const res = await current_session.start()
    Session.ready()
    /** @type {AckMessage} */
    const ackMsg = ['ack', ackid, res];
    postMessage(ackMsg);
    return;
  }

  if( !dispatch[cmd] ) throw(Error(`Message ${cmd} not recognized`));

  // Enrich data with session context if session is initialized
  if (current_session?.state) {
    const state = current_session.state
    data.session = current_session
    data.state = state
    if (data.subject) data.subject = Subject.get_by_sid(data.subject)
    if (data.target) data.target = Subject.get_by_sid(data.target)
  }

  //log('dispatch', cmd, data);
  const res = await dispatch[cmd](data);
  /** @type {AckMessage} */
  const ackMsg = ['ack', ackid, res];
  postMessage(ackMsg);

}, false);

//## Not implemented consistently
self.onerror = _err =>{
  console.log("worker on error");
}

//log('Ready');
