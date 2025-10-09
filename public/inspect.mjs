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
      msg:'query_mind',
      mind: 'world',
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

    if( query?.msg ){
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
    const state_nav = dat.state.base_id
      ? `<a href="?state=${dat.state.base_id}">← Previous State</a>`
      : '';

    render({
      header: `${dat.state.mind_label} entities (State #${dat.state.id}, timestamp: ${dat.state.timestamp}) ${state_nav}`,
      table: {
        columns: ["desig"],
        rows: dat.state.beliefs,
        row_link: {
          query: "belief",
          pass_column: ["id"],
        }
      },
    });
  },
  world_entity(dat){
    render({
      header: dat.desig,
      entity: dat,
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
  if( a.header != null ) $header.innerHTML = a.header;
  if( a.table ) render_table( a );
  if( a.entity ) render_entity( a );
}

function render_table(a){
  const at = a.table;
  const h_th = at.columns.map( t=>`<th>${t}</th>`).join("");

  let h_body = "";
  for( const row of at.rows ){
    let link = `?${at.row_link.query}=${row[at.row_link.pass_column[0]]}`;

    let h_row = "";
    for( const col of at.columns ){
      h_row += `<td><a href="${link}">${row[col]??"-"}</a></td>`;
    }
    h_body += `<tr>${h_row}</td>`;
  }

  const h_table = `<table><tr>${h_th}</tr>${h_body}</table>`;
  $main.innerHTML = h_table;
}

function render_entity(a){
  const belief_data = a.entity.data.data;

  let hout = "<dl>";

  // Display ID
  hout += `<dt>ID</dt><dd>#${belief_data._id}</dd>`;

  // Display label
  if (belief_data.label) {
    hout += `<dt>Label</dt><dd>${belief_data.label}</dd>`;
  }

  // Display archetypes
  if (belief_data.archetypes?.length > 0) {
    hout += `<dt>Archetypes</dt><dd>${belief_data.archetypes.join(', ')}</dd>`;
  }

  // Display bases
  if (a.bases?.length > 0) {
    hout += `<dt>Bases</dt><dd>`;
    for (const base of a.bases) {
      hout += `<a href="?entity&id=${base.id}">#${base.id}${base.label ? ' (' + base.label + ')' : ''}</a> `;
    }
    hout += `</dd>`;
  }

  // Display traits
  if (belief_data.traits && Object.keys(belief_data.traits).length > 0) {
    hout += `<dt>Traits</dt><dd><dl>`;
    for (const [trait, value] of Object.entries(belief_data.traits)) {
      let display_value = value;
      if (typeof value === 'object' && value !== null) {
        if (value._ref && value._type) {
          // Reference to another entity
          const type_lower = value._type.toLowerCase();
          const label_text = value.label ? ` (${value.label})` : '';
          display_value = `<a href="?${type_lower}=${value._ref}">#${value._ref}${label_text}</a>`;
        } else {
          display_value = JSON.stringify(value, null, 2);
        }
      }
      hout += `<dt>${trait}</dt><dd>${display_value}</dd>`;
    }
    hout += `</dl></dd>`;
  }

  hout += "</dl>";

  // Display raw JSON for debugging
  hout += `<details><summary>Raw JSON</summary><pre>${JSON.stringify(belief_data, null, 2)}</pre></details>`;

  $main.innerHTML = hout;
}

function parse_url(){
  const params = new URLSearchParams(location.search);

  if (params.has('mind')) {
    query = {msg: 'query_mind', mind: params.get('mind')};
  } else if (params.has('state')) {
    query = {msg: 'query_state', state: params.get('state')};
  } else if (params.has('belief')) {
    query = {msg: 'query_belief', belief: params.get('belief')};
  } else {
    // Default to world
    query = {msg: 'query_mind', mind: 'world'};
  }

  return query;
}
