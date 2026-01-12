/**
 * Channel - Game Client Communication
 *
 * Handles bidirectional communication between worker and game UI:
 * - Inbound: Message listener, command dispatch, session enrichment
 * - Outbound: Channel.post() for UI messages (header_set, main_add, etc.)
 */

import { log, assert } from "../lib/debug.mjs"
import { Session } from "./session.mjs"
import { Subject } from "./subject.mjs"
import { register_reset_hook } from "./reset.mjs"

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
 * Channel - Game client I/O
 *
 * Static members: dispatch registry, current session
 * Instance members: message posting (with mock support for tests)
 */
export class Channel {
  // Static - shared state
  /** @type {{[key: string]: (...args: any[]) => any}} */
  static _dispatch = {
    ping() { return 'pong' }
  }

  /** @type {Session|null} */
  static session = null

  /**
   * Register a command handler
   * @param {string} cmd - Command name
   * @param {(...args: any[]) => any} handler - Handler function
   */
  static register(cmd, handler) {
    Channel._dispatch[cmd] = handler
  }

  // Instance - I/O pipe
  /** @type {Channel|null} */
  static _instance = null

  constructor() {
    /** @type {Array<[string, ...any[]]>} */
    this.messages = []
    /** @type {boolean} */
    this._use_mock = false
  }

  /**
   * Send message to UI
   * @param {string} type - Message type (header_set, main_add, etc.)
   * @param {...any} args - Message arguments
   */
  post(type, ...args) {
    if (this._use_mock) {
      this.messages.push([type, ...args])
    } else {
      postMessage([type, ...args])
    }
  }

  /** Enable mock mode for testing */
  enable_mock() {
    this._use_mock = true
  }

  /**
   * Get messages of specific type (test helper)
   * @param {string} type - Message type to filter
   * @returns {Array<any[]>} Message arguments for matching messages
   */
  get_messages(type) {
    return this.messages
      .filter(([t]) => t === type)
      .map(([_, ...args]) => args)
  }

  /** Clear captured messages */
  clear() {
    this.messages = []
  }

  /**
   * Get or create the singleton channel
   * @returns {Channel}
   */
  static get() {
    if (!Channel._instance) Channel._instance = new Channel()
    return Channel._instance
  }

  /**
   * Create a mock channel for testing
   * @returns {Channel}
   */
  static create_mock() {
    const ch = new Channel()
    ch.enable_mock()
    return ch
  }

  /**
   * Reset channel state (for tests)
   */
  static reset() {
    Channel._instance = null
    Channel.session = null
  }
}

// Register with DB reset system
register_reset_hook(() => {
  Channel.session = null
})


// ══════════════════════════════════════════════════════════════════════════════
// Message Listener
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Handle incoming message from UI
 * Exported for testing - tests can call this directly
 * @param {MessageEvent} e
 */
export async function _handle_message(e) {
  let msg = e.data
  if (typeof msg === 'string') msg = [msg]
  /** @type {ClientMessage} */
  const typedMsg = msg
  const [cmd, data = {}, ackid] = typedMsg
  //log("Received message", cmd, data)
  assert(ackid > 0, "expected ackid")

  // Bootstrap command - creates session
  if (cmd === "start") {
    log('Starting')
    Channel.session = new Session()
    const scenario_name = data?.scenario ?? 'workshop'
    const res = await Channel.session.start(scenario_name)
    Session.ready()
    /** @type {AckMessage} */
    const ackMsg = ['ack', ackid, res]
    postMessage(ackMsg)
    return
  }

  if (!Channel._dispatch[cmd]) throw(Error(`Message ${cmd} not recognized`))

  // Enrich data with session context if session is initialized
  if (Channel.session?.state) {
    const state = Channel.session.state
    data.session = Channel.session
    data.state = state
    if (data.subject) data.subject = Subject.get_by_sid(data.subject)
    if (data.target) data.target = Subject.get_by_sid(data.target)
  }

  //log('dispatch', cmd, data)
  const res = await Channel._dispatch[cmd](data)
  /** @type {AckMessage} */
  const ackMsg = ['ack', ackid, res]
  postMessage(ackMsg)
}

// Only register in worker context (not Node.js)
if (typeof addEventListener !== 'undefined') {
  addEventListener('message', _handle_message, false)

  //## Not implemented consistently
  self.onerror = _err => {
    console.log("worker on error")
  }

  //log('Ready')
}
