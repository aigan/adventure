import { log, assert } from "../lib/debug.mjs";
import * as DB from './db.mjs';
import { Mind } from './mind.mjs';
import { Belief } from './belief.mjs';
import { Archetype } from './archetype.mjs';
//log('Loading Channel');

/**
 * @typedef {import('./session.mjs').Session} Session
 */

/** @type {BroadcastChannel|null} */
let channel = null;
let client_id_sequence = 0; // Client id
/** @type {number|null} */
let server_id = null;
/** @type {Session|null} */
let session = null;

/** @type {{[key: string]: Function}} */
export const dispatch = {
	/** @param {any} _dat */
	connect(_dat){
		const client_id = ++ client_id_sequence;
		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "welcome",
			client_id,
			server_id,
		});
	},

	/** @param {any} _dat */
	hello(_dat){
		throw Error("Multiple servers");
	},

	/** @param {{client_id: number}} param0 */
	query_adventure({client_id}){
		assert(session != null, 'session not initialized');
		// Return current session state info
		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "adventure_info",
			server_id,
			client_id,
			world_mind_id: session.world._id,
			world_mind_label: session.world.label,
			state_id: session.state._id,
		});
	},

//	query(dat){
//		const label = dat.label;
//		log(`Asking for ${label}`);
//		const et = world.get_by_template(label);
//		log(et);
//	},

	/** @param {{mind: string|number, state_id: string|number, client_id: number}} param0 */
	query_mind({mind, state_id, client_id}){
		// Accept mind id (numeric string) or label (string)
		const mind_str = String(mind);
		const mind_obj = /^\d+$/.test(mind_str)
			? Mind.get_by_id(Number(mind_str))
			: Mind.get_by_label(mind_str);

		assert(mind_obj != null, `Mind not found: ${mind}`);

		// Get specified state
		const state = DB.get_state(Number(state_id));

		assert(state != null, `State not found: ${state_id}`);
		assert(state.in_mind === mind_obj, `State ${state_id} does not belong to mind ${mind}`);

		const data = [];
		for (const belief of state.get_beliefs()) {
			data.push({
				id: belief._id,
				label: belief.get_label(),
				desig: belief.sysdesig(state),
			});
		}

		const state_info = /** @type {{id: number, timestamp: number, mind_id: number, mind_label: string|null, self_label: string|null|undefined, base_id: number|null, beliefs: {id: number, label: string|null, desig: string}[], locked?: boolean}} */ ({
			id: state._id,
			timestamp: state.timestamp,
			mind_id: state.in_mind._id,
			mind_label: state.in_mind.label,
			self_label: state.in_mind.self?.get_label(),
			base_id: state.base?._id ?? null,
			beliefs: data,
		});
		// Only include locked field if unlocked (to highlight mutable state)
		if (!state.locked) {
			state_info.locked = false;
		}

		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "world_entity_list",
			server_id,
			client_id,
			state: state_info,
		});
	},

	/** @param {{state: string|number, client_id: number}} param0 */
	query_state({state, client_id}){
		const state_id = Number(state);

		// Get state from registry
		const state_obj = DB.get_state(state_id);

		assert(state_obj != null, `State not found: ${state_id}`);

		const data = [];
		for (const belief of state_obj.get_beliefs()) {
			data.push({
				id: belief._id,
				label: belief.get_label(),
				desig: belief.sysdesig(state_obj),
			});
		}

		const state_info = /** @type {{id: number, timestamp: number, mind_id: number, mind_label: string|null, self_label: string|null|undefined, base_id: number|null, beliefs: {id: number, label: string|null, desig: string}[], locked?: boolean}} */ ({
			id: state_obj._id,
			timestamp: state_obj.timestamp,
			mind_id: state_obj.in_mind._id,
			mind_label: state_obj.in_mind.label,
			self_label: state_obj.in_mind.self?.get_label(),
			base_id: state_obj.base?._id ?? null,
			beliefs: data,
		});
		// Only include locked field if unlocked (to highlight mutable state)
		if (!state_obj.locked) {
			state_info.locked = false;
		}

		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "world_entity_list",
			server_id,
			client_id,
			state: state_info,
		});
	},

	/** @param {{belief: string|number, state_id: string|number, client_id: number}} param0 */
	query_belief({belief, state_id, client_id}){
		const belief_id = Number(belief);

		// Find belief by id in global registry
		const belief_obj = DB.get_belief(belief_id);

		assert(belief_obj != null, `Belief not found: ${belief_id}`);

		// Get specified state for resolving sids
		const state_id_num = Number(state_id);
		const state = DB.get_state(state_id_num);

		assert(state != null, `State not found: ${state_id}`);

		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "world_entity",
			server_id,
			client_id,
			state_id: state._id,
			data: {
				data: belief_obj.to_inspect_view(state),
			},
			desig: belief_obj.sysdesig(state),
			mind: belief_obj.in_mind ? {id: belief_obj.in_mind._id, label: belief_obj.in_mind.label} : null,
			bases: [...belief_obj._bases].map(b => ({
				id: b instanceof Belief ? b._id : null,
				label: b instanceof Belief ? b.get_label() : b.label,
				type: b instanceof Archetype ? 'Archetype' : 'Belief'
			})),
		});
	},

	/** @param {{id: string|number, client_id: number}} param0 */
	query_entity({id, client_id}){
		assert(session != null, 'session not initialized');
		id = Number(id);
		//log("query_entity", id);

		// Find belief by id in current state
		let belief = null;
		for (const b of session.state.get_beliefs()) {
			if (b._id === id) {
				belief = b;
				break;
			}
		}

		assert(belief != null, `Belief ${id} not found in Session.state`);

		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "world_entity",
			server_id,
			client_id,
			data: {
				data: belief.toJSON(),
			},
			desig: belief.sysdesig(session.state),
			mind: belief.in_mind ? {id: belief.in_mind._id, label: belief.in_mind.label} : null,
			bases: [...belief._bases].map(b => ({
				id: b instanceof Belief ? b._id : null,
				label: b instanceof Belief ? b.get_label() : b.label,
				type: b instanceof Archetype ? 'Archetype' : 'Belief'
			})),
		});
	},
}

/**
 * @param {Session} session_param - session instance from world.mjs
 */
export async function init_channel(session_param) {
	session = session_param;

	channel = new BroadcastChannel('inspect');
	server_id = await increment_sequence("server_id");

	// Wire up session to channel for state change notifications
	session.set_channel(channel);

	//log("Server id", server_id);
	channel.postMessage({
		msg: "hello",
		server_id,
	});

	channel.onmessage = ev => {
		const dat = ev.data;
		const msg = dat.msg;
		if( !msg ) return console.error("Got confused message", dat);
		if( !dispatch[msg] ) return console.error('Message confused:', dat );
		log("message", dat);
		if( dat.server_id !== server_id && dat.msg !== "connect" )
			return console.error('Server mismatch', dat);
		dispatch[msg](dat);
	};

	return { channel, dispatch, server_id };
}


/**
 * @param {string} label
 * @returns {Promise<number>}
 */
function increment_sequence( label ){
	// Using IndexedID to absolutely elliminate race conditions

	return new Promise( (resolve,_reject)=>{
		const db_req = indexedDB.open("adventure");
		db_req.onupgradeneeded = /** @param {IDBVersionChangeEvent} ev */ (ev) => {
			const db = /** @type {IDBOpenDBRequest} */ (ev.target).result;
			db.createObjectStore("counters");
		}

		db_req.onsuccess = /** @param {Event} ev */ (ev) => {
			const db = /** @type {IDBOpenDBRequest} */ (ev.target).result;
			const tr = db.transaction('counters', 'readwrite');
			const st = tr.objectStore('counters');

			const req_get = st.get(label);
			req_get.onsuccess = ()=>{
				//let res = req_get.result;
				const value = 1 + (req_get.result ?? 0);
				st.put(value, label);
				resolve( value );
			}
		}
	});
}
