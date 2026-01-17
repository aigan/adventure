import { log } from "./debug.mjs";
// import {worker} from "./boot.mjs";
//## Firefox do not support worker modules yet!
// URL relative to containing HTML page.
export const worker = new Worker('worker/channel.mjs', {type:"module"});

/**
 * Action data sent from GUI to worker
 * @typedef {Object} ActionData
 * @property {string} do - Command name to execute
 * @property {number} target - Subject ID of target
 * @property {number} [actor] - Subject ID of actor (optional, defaults to player)
 * @property {string} label - Display text for GUI
 */

/**
 * Message sent from GUI to Worker
 * @typedef {[string, any, number]} ClientMessage
 * Format: [command, data, ackid]
 */

/**
 * Subject data received from worker
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
 * Worker → Client messages
 * @typedef {['ack', number, any]} AckMessage
 * @typedef {['main_add', ...(string | TemplateTagResult)[]]} MainAddMessage
 * @typedef {['main_clear']} MainClearMessage
 * @typedef {['header_set', string]} HeaderSetMessage
 * @typedef {['topic_update', SubjectData]} TopicUpdateMessage
 * @typedef {MainAddMessage | MainClearMessage | HeaderSetMessage | TopicUpdateMessage | AckMessage} WorkerMessage
 */

/** @type {Record<number, {resolve: (value: any) => void, reject: (reason?: any) => void}>} */
const jobs = {};

/** @type {Record<string, (...args: any[]) => any>} */
const dispatch = {
  /**
   * @param {[number, any]} param0
   */
  ack([ ackid, res ]){
    // log('ack', ackid, res);
    if( !jobs[ackid] ) throw `No job ${ackid} found`;
    if (res?.error) {
      jobs[ackid].reject(new Error(res.error))
    } else {
      jobs[ackid].resolve( res );
    }
    delete jobs[ackid];
    // log('ack', ackid);
  },
};

/**
 * @param {MessageEvent<WorkerMessage>} e
 */
worker.onmessage = e =>{
  let data = e.data;
  if( typeof data === 'string') data = [data];
  const cmd = data.shift();

  if( dispatch[cmd] ) return dispatch[cmd](data);

  throw(Error(`Message ${cmd} not recognized`));
}

let next_ackid = 1;

export const Message = {
  /**
   * @param {Record<string, (...args: any[]) => any>} handlers
   */
  register( handlers ){
    for( const label in handlers ){
      // log('reg', label);
      dispatch[label] = handlers[label];
    }
  },
  /**
   * Send command to worker and wait for ack response
   * @param {string} cmd - Command name ('start', 'ping', or action command)
   * @param {Object|ActionData} data - Command data
   * @returns {Promise<any>} Promise that resolves with the handler's return value
   */
  send( cmd, data ){
    const ackid = next_ackid ++;
    return new Promise( (resolve,reject)=>{
      // log('regs resolve for', ackid);
      jobs[ackid] = {resolve,reject};
      /** @type {ClientMessage} */
      const message = [cmd, data, ackid];
      worker.postMessage(message)
    })
  }
}

//#### Not implemented consistantly!
/**
 * @param {ErrorEvent} e
 */
worker.onerror = e =>{
  console.error("catched worker error", e);
	// No info about what error
  e.preventDefault();
}

/**
 * @param {MessageEvent} err
 */
worker.onmessageerror = err =>{
  console.error("catched worker message error");
  err.preventDefault();
}

//worker.addEventListener("error", e=>{
//  console.log("worker on error", e);
//}, false);
//
//worker.addEventListener("messageerror", e=>{
//  console.log("worker on error");
//}, false);
//


