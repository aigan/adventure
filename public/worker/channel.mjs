import { log } from "../lib/debug.mjs";
import * as Cosmos from './cosmos.mjs';
//log('Loading Channel');

/** @type {BroadcastChannel|null} */
let channel = null;
let client_id_sequence = 0; // Client id
/** @type {number|null} */
let server_id = null;
/** @type {any} */
let Adventure = null;

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
			? Cosmos.Mind.get_by_id(Number(mind_str))
			: Cosmos.Mind.get_by_label(mind_str);

		if (!mind_obj) {
			log("Mind not found", mind);
			log(Cosmos.DB.mind_by_id);
			return;
		}

		// Get specified state
		const state = Cosmos.DB.get_state(Number(state_id));

		if (!state) {
			log("State not found", state_id);
			return;
		}

		if (state.in_mind !== mind_obj) {
			log("State does not belong to specified mind", {state_id, mind});
			return;
		}

		const data = [];
		for (const belief of state.get_beliefs()) {
			data.push({
				id: belief._id,
				label: belief.get_display_label(),
				desig: belief.sysdesig(),
			});
		}

		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "world_entity_list",
			server_id,
			client_id,
			state: {
				id: state._id,
				timestamp: state.timestamp,
				mind_id: state.in_mind._id,
				mind_label: state.in_mind.label,
				self_label: state.in_mind.self?.get_display_label(),
				base_id: state.base?._id ?? null,
				beliefs: data,
			},
		});
	},

	/** @param {{state: string|number, client_id: number}} param0 */
	query_state({state, client_id}){
		const state_id = Number(state);

		// Get state from registry
		const state_obj = Cosmos.DB.get_state(state_id);

		if (!state_obj) {
			log("State not found", state_id);
			return;
		}

		const data = [];
		for (const belief of state_obj.get_beliefs()) {
			data.push({
				id: belief._id,
				label: belief.get_display_label(),
				desig: belief.sysdesig(),
			});
		}

		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "world_entity_list",
			server_id,
			client_id,
			state: {
				id: state_obj._id,
				timestamp: state_obj.timestamp,
				mind_id: state_obj.in_mind._id,
				mind_label: state_obj.in_mind.label,
				self_label: state_obj.in_mind.self?.get_display_label(),
				base_id: state_obj.base?._id ?? null,
				beliefs: data,
			},
		});
	},

	/** @param {{belief: string|number, state_id: string|number, client_id: number}} param0 */
	query_belief({belief, state_id, client_id}){
		const belief_id = Number(belief);

		// Find belief by id in global registry
		const belief_obj = Cosmos.DB.belief_by_id.get(belief_id);

		if (!belief_obj) {
			log("Belief not found", belief_id);
			return;
		}

		// Get specified state for resolving sids
		const state_id_num = Number(state_id);
		const state = Cosmos.DB.get_state(state_id_num);

		if (!state) {
			log("State not found", state_id);
			return;
		}

		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "world_entity",
			server_id,
			client_id,
			state_id: state._id,
			data: {
				data: belief_obj.inspect(state),
			},
			desig: belief_obj.sysdesig(),
			mind: {id: belief_obj.in_mind._id, label: belief_obj.in_mind.label},
			about: belief_obj.about ? {
				id: belief_obj.about._id,
				label: belief_obj.about.get_display_label(),
				mind: {id: belief_obj.about.in_mind._id, label: belief_obj.about.in_mind.label}
			} : null,
			bases: [...belief_obj.bases].map(b => ({
				id: b instanceof Cosmos.Belief ? b._id : null,
				label: b instanceof Cosmos.Belief ? b.get_display_label() : b.label,
				type: b instanceof Cosmos.Archetype ? 'Archetype' : 'Belief'
			})),
		});
	},

	/** @param {{id: string|number, client_id: number}} param0 */
	query_entity({id, client_id}){
		id = Number(id);
		//log("query_entity", id);

		// Find belief by id in current state
		let belief = null;
		for (const b of Adventure.state.get_beliefs()) {
			if (b._id === id) {
				belief = b;
				break;
			}
		}

		if (!belief) {
			log("Belief not found", id);
			return;
		}

		(/** @type {BroadcastChannel} */ (channel)).postMessage({
			msg: "world_entity",
			server_id,
			client_id,
			data: {
				data: belief.toJSON(),
			},
			desig: belief.sysdesig(),
			mind: {id: belief.in_mind._id, label: belief.in_mind.label},
			about: belief.about ? {
				id: belief.about._id,
				label: belief.about.get_display_label(),
				mind: {id: belief.about.in_mind._id, label: belief.about.in_mind.label}
			} : null,
			bases: [...belief.bases].map(b => ({
				id: b instanceof Cosmos.Belief ? b._id : null,
				label: b instanceof Cosmos.Belief ? b.get_display_label() : b.label,
				type: b instanceof Cosmos.Archetype ? 'Archetype' : 'Belief'
			})),
		});
	},
}

/**
 * @param {object} adventure - Adventure singleton from world.mjs
 */
export async function init_channel(adventure) {
	Adventure = adventure;

	channel = new BroadcastChannel('inspect');
	server_id = await increment_sequence("server_id");

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
