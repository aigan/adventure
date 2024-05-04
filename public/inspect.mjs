const log = console.log.bind(console);
log('Loading');

const channel = new BroadcastChannel('inspect');

const $header = document.querySelector("header");
const $main = document.querySelector("main");
$header.innerHTML = "Inspecting";

let client_id, server_id, query;

parse_url();


window.q = {
	world(){
		channel.postMessage({
			msg:'query_world',
			client_id,
			server_id,
		});
	}
}


const dispatch = {
	welcome(dat){
		client_id = dat.client_id;
		server_id = dat.server_id;
		log_line(`Connected as client ${client_id} to server ${server_id}`);

		if( query ){
			channel.postMessage({
				... query,
			client_id,
			server_id,
		});

			//log("query", query.getAll());
		}

	},
	hello(dat){
		client_id = null;
		server_id = dat.server_id;
		channel.postMessage({msg:"connect"});
	},
	world_entity_list(dat){
		render({
			header: "World entities",
			table: {
				columns: ["desig"],
				rows: dat.data,
				row_link: {
					query: "entity",
					pass_column: ["id","v"],
				}
			},
		});
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

function render(a){
	if( a.header != null ) $header.innerText = a.header;
	if( a.table ) render_table( a );
}

function render_table(a){
	const at = a.table;
	const h_th = at.columns.map( t=>`<th>${t}</th>`).join("");

	let h_body = "";
	for( const row of at.rows ){
		let link = "?"+at.row_link.query;
		for( const col of at.row_link.pass_column ){
			link += `&${col}=${row[col]}`;
		}

		let h_row = "";
		for( const col of at.columns ){
			h_row += `<td><a href="${link}">${row[col]??"-"}</a></td>`;
		}
		h_body += `<tr>${h_row}</td>`;
	}
	
	const h_table = `<table><tr>${h_th}</tr>${h_body}</table>`;
	$main.innerHTML = h_table;
}

function parse_url(){
	let msg;
	query = {};
	for( const [key,val] of new URLSearchParams(location.search)){
		if( !query.msg && !val ){
			query.msg = "query_" + key;
			continue;
		}
		query[key]=val;
	}

	return query;
}
