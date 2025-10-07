const log = console.log.bind(console);
//log('Loading Channel');

import {Adventure} from "./world.mjs";

const channel = new BroadcastChannel('inspect');
let client_id_sequence = 0; // Client id

const server_id = await increment_sequence("server_id");

log("Server id", server_id);
channel.postMessage({
	msg: "hello",
	server_id,
});


const dispatch = {
	connect(dat){
		const client_id = ++ client_id_sequence;
		channel.postMessage({
			msg: "welcome",
			client_id,
			server_id,
		});
	},
	hello(dat){
		throw Error("Multiple servers");
	},

//	query(dat){
//		const label = dat.label;
//		log(`Asking for ${label}`);
//		const et = world.get_by_template(label);
//		log(et);
//	},

	query_world({client_id}){
		const data = [];
		for (const belief of Adventure.state.get_beliefs()) {
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
			data,
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


function increment_sequence( label ){
	// Using IndexedID to absolutely elliminate race conditions

	return new Promise( (resolve,reject)=>{
		const db_req = indexedDB.open("adventure");
		db_req.onupgradeneeded = ev => {
			const db = ev.target.result;
			db.createObjectStore("counters");
		}

		db_req.onsuccess = ev => {
			const db = ev.target.result;
			const tr = db.transaction('counters', 'readwrite');
			const st = tr.objectStore('counters');

			const req_get = st.get(label);
			req_get.onsuccess = ()=>{
				let res = req_get.result;
				const value = 1 + (req_get.result ?? 0);
				st.put(value, label);
				resolve( value );
			}
		}
	});
}
