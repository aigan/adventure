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
	query(dat){
		const label = dat.label;
		log(`Asking for ${label}`);
		const et = world.get_by_template(label);
		log(et);
	},
	query_world(dat){
		const out = [];
		for( const entity of world.entity.values()){
			out.push({
				id: entity.id,
				desig: world.sysdesig(entity),
			});
		}
		log(out);
	},
}




channel.onmessage = ev => {
	const dat = ev.data;
	const msg = dat.msg;
	if( !msg ) return console.error("Got confused message", dat);
	if( !dispatch[msg] ) return console.error('Message confused:', dat );
	log("message", dat);
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