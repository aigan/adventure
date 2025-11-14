import { log, assert } from "../lib/debug.mjs";
import { Session } from "./session.mjs"

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
    const session = new Session();
    const res = await session.start()
    /** @type {AckMessage} */
    const ackMsg = ['ack', ackid, res];
    postMessage(ackMsg);
    return;
  }

  if( !dispatch[cmd] ) throw(Error(`Message ${cmd} not recognized`));

  //if( !data.from ) data.from = world.Adventure.player;
  //if( data.from ) data.world = DB.World.get(data.from._world);
  //if( data.target ) data.target = data.world.get_entity_current( data.target );

  // log('dispatch', cmd, data);
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
