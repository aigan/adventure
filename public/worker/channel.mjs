const log = console.log.bind(console);
log('Loading Channel');

import {world} from "./world.mjs";

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
	query(dat){
		const label = dat.label;
		log(`Asking for ${label}`);
		const et = world.get_by_template(label);
		log(et);
	},
	query_world({client_id}){
		const data = [];
		for( const eh of world.entity_history.values()){
			const e = eh.current();
			data.push({
				id: e.id,
				v: e.v,
				desig: e.sysdesig(),
			});
		}
		channel.postMessage({
			msg: "world_entity_list",
			server_id,
			client_id,
			data,
		});
	},
	query_entity({id,v,client_id}){
		id = Number(id);
		v = Number(v);
		log("query_entity", id, v);
		const e = world.get_entity(id,v);
		channel.postMessage({
			msg: "world_entity",
			data: e.bake(),
			desig: e.sysdesig(),
			bases: e.bases.map(b=>({id:b.id,v:b.v})),
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
