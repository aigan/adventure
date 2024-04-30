const log = console.log.bind(console);
log('Loading');

const channel = new BroadcastChannel('inspect');

const $header = document.querySelector("header");
const $main = document.querySelector("main");
$header.innerHTML = "Inspecting";

window.q = {
	world(){
		channel.postMessage({
			msg:'query_world',
		});
	}
}

let client_id, server_id;


const dispatch = {
	welcome(dat){
		client_id = dat.client_id;
		server_id = dat.server_id;
		log_line(`Connected as client ${client_id} to server ${server_id}`);
	},
	hello(dat){
		client_id = null;
		server_id = dat.server_id;
		channel.postMessage({msg:"connect"});
	},
	
}


channel.postMessage({msg:"connect"});
channel.onmessage = ev => {
	const dat = ev.data;
	const msg = dat.msg;
	if( !msg ) return console.error("Got confused message", dat);
	if( !dispatch[msg] ) return console.error('Message confused:', dat );
	log("message", dat);
	dispatch[msg](dat);
};

function log_line(text){
	const $p = document.createElement('p');
	$p.innerText = text;
	$main.append($p);
}
