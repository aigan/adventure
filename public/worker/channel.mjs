const log = console.log.bind(console);
//log('Loading Channel');

import {Adventure} from "./world.mjs";
import * as DB from "./db.mjs";

const channel = new BroadcastChannel('inspect');
let client_id_sequence = 0; // Client id

const server_id = await increment_sequence("server_id");

log("Server id", server_id);
channel.postMessage({
	msg: "hello",
	server_id,
});


const dispatch = {
	connect(_dat){
		const client_id = ++ client_id_sequence;
		channel.postMessage({
			msg: "welcome",
			client_id,
			server_id,
		});
	},

	hello(_dat){
		throw Error("Multiple servers");
	},

//	query(dat){
//		const label = dat.label;
//		log(`Asking for ${label}`);
//		const et = world.get_by_template(label);
//		log(et);
//	},

	query_mind({mind, client_id}){
		// Accept mind id (numeric string) or label (string)
		const mind_obj = /^\d+$/.test(mind)
			? DB.Mind.get_by_id(Number(mind))
			: DB.Mind.get_by_label(mind);

		if (!mind_obj) {
			log("Mind not found", mind);
			log(DB.Mind.db_by_id);
			return;
		}

		// Get the latest state from this mind
		const states = [...mind_obj.state];
		const state = states[states.length - 1];

		if (!state) {
			log("No state found for mind", mind);
      log(mind_obj.state);
			return;
		}

		const data = [];
		for (const belief of state.get_beliefs()) {
			data.push({
				id: belief._id,
				label: belief.label,
				desig: belief.sysdesig(),
			});
		}

		channel.postMessage({
			msg: "world_entity_list",
			server_id,
			client_id,
			state: {
				id: state._id,
				timestamp: state.timestamp,
				mind_id: state.in_mind._id,
				mind_label: state.in_mind.label,
				base_id: state.base?._id ?? null,
				beliefs: data,
			},
		});
	},

	query_state({state, client_id}){
		const state_id = Number(state);

		// Find state by searching all minds
		let state_obj = null;
		for (const [_id, mind] of DB.Mind.db_by_id) {
			for (const s of mind.state) {
				if (s._id === state_id) {
					state_obj = s;
					break;
				}
			}
			if (state_obj) break;
		}

		if (!state_obj) {
			log("State not found", state_id);
			return;
		}

		const data = [];
		for (const belief of state_obj.get_beliefs()) {
			data.push({
				id: belief._id,
				label: belief.label,
				desig: belief.sysdesig(),
			});
		}

		channel.postMessage({
			msg: "world_entity_list",
			server_id,
			client_id,
			state: {
				id: state_obj._id,
				timestamp: state_obj.timestamp,
				mind_id: state_obj.in_mind._id,
				mind_label: state_obj.in_mind.label,
				base_id: state_obj.base?._id ?? null,
				beliefs: data,
			},
		});
	},

	query_belief({belief, client_id}){
		const belief_id = Number(belief);

		// Find belief by searching all minds
		let belief_obj = null;
		for (const [_id, mind] of DB.Mind.db_by_id) {
			for (const b of mind.belief) {
				if (b._id === belief_id) {
					belief_obj = b;
					break;
				}
			}
			if (belief_obj) break;
		}

		if (!belief_obj) {
			log("Belief not found", belief_id);
			return;
		}

		channel.postMessage({
			msg: "world_entity",
			server_id,
			client_id,
			data: {
				data: belief_obj.inspect(),
			},
			desig: belief_obj.sysdesig(),
			mind: {id: belief_obj.in_mind._id, label: belief_obj.in_mind.label},
			about: belief_obj.about ? {
				id: belief_obj.about._id,
				label: belief_obj.about.label,
				mind: {id: belief_obj.about.in_mind._id, label: belief_obj.about.in_mind.label}
			} : null,
			bases: [...belief_obj.bases].map(b => ({id: b._id, label: b.label})),
		});
	},

	query_entity({id, client_id}){
		id = Number(id);
		log("query_entity", id);

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

		channel.postMessage({
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
				label: belief.about.label,
				mind: {id: belief.about.in_mind._id, label: belief.about.in_mind.label}
			} : null,
			bases: [...belief.bases].map(b => ({id: b._id, label: b.label})),
		});
	},
}




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
