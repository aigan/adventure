const log = console.log.bind(console);

// Browser-specific initialization
let channel, $header, $main, client_id, server_id, query;

if (typeof BroadcastChannel !== 'undefined' && typeof document !== 'undefined') {
  log('Loading');
  channel = new BroadcastChannel('inspect');
  $header = document.querySelector("header");
  $main = document.querySelector("main");
  $header.innerHTML = "Inspecting";
  parse_url();
}


if (typeof window !== 'undefined') {
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

    const mind_prefix = dat.state.mind_label || dat.state.self_label || `Mind #${dat.state.mind_id}`;

    render({
      header: `${mind_prefix} beliefs (State #${dat.state.id}, timestamp: ${dat.state.timestamp}) ${state_nav}`,
      table: {
        columns: ["label", "desig"],
        rows: dat.state.beliefs,
        row_link: {
          query: "belief",
          pass_column: ["id"],
          state_id: dat.state.id,
        }
      },
    });
  },
  world_entity(dat){
    const mind_prefix = dat.mind?.label || `Mind #${dat.mind?.id}`;
    render({
      header: `${mind_prefix}: ${dat.desig}`,
      entity: dat,
      state_id: dat.state_id,  // Use state_id from server response
    });
  },
}

if (typeof BroadcastChannel !== 'undefined' && channel) {
  channel.postMessage({msg:"connect"});
  channel.onmessage = ev => {
    const dat = ev.data;
    const msg = dat.msg;
    if( !msg ) return console.error("Got confused message", dat);
    if( !dispatch[msg] ) return console.error('Message confused:', dat );
    log("message", dat);
    dispatch[msg](dat);
  };
}

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

function render_table(a, target = $main){
  const at = a.table;
  const h_th = at.columns.map( t=>`<th>${t}</th>`).join("");

  let h_body = "";
  for( const row of at.rows ){
    let link = `?${at.row_link.query}=${row[at.row_link.pass_column[0]]}`;
    // Add state_id to link if available
    if (at.row_link.state_id) {
      link += `&state=${at.row_link.state_id}`;
    }

    let h_row = "";
    for( const col of at.columns ){
      h_row += `<td><a href="${link}">${row[col]??"-"}</a></td>`;
    }
    h_body += `<tr>${h_row}</td>`;
  }

  const h_table = `<table><tr>${h_th}</tr>${h_body}</table>`;
  target.innerHTML = h_table;
}

function render_entity(a, target = $main){
  const belief_data = a.entity.data.data;
  const state_id = a.state_id;

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

  // Display about
  if (a.entity.about) {
    const about = a.entity.about;
    const mind_prefix = about.mind?.label || `Mind #${about.mind?.id}`;
    hout += `<dt>About</dt><dd>`;
    const about_link = state_id ? `?belief=${about.id}&state=${state_id}` : `?belief=${about.id}`;
    hout += `<a href="${about_link}">${mind_prefix}: #${about.id}${about.label ? ' (' + about.label + ')' : ''}</a>`;
    hout += `</dd>`;
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

      // Handle arrays
      if (Array.isArray(value)) {
        const items = value.map(item => {
          if (typeof item === 'object' && item !== null) {
            if (item._ref && item._type) {
              // Reference to another belief or object
              const type_lower = item._type.toLowerCase();
              const label_text = item.label ? ` (${item.label})` : '';
              const link = (type_lower === 'belief' && state_id)
                ? `?${type_lower}=${item._ref}&state=${state_id}`
                : `?${type_lower}=${item._ref}`;
              return `<a href="${link}">#${item._ref}${label_text}</a>`;
            } else {
              return JSON.stringify(item);
            }
          }
          return item;
        });
        display_value = items.join(', ');
      } else if (typeof value === 'object' && value !== null) {
        if (value._ref && value._type) {
          // Reference to another belief or object
          const type_lower = value._type.toLowerCase();
          const label_text = value.label ? ` (${value.label})` : '';
          const link = (type_lower === 'belief' && state_id)
            ? `?${type_lower}=${value._ref}&state=${state_id}`
            : `?${type_lower}=${value._ref}`;
          display_value = `<a href="${link}">#${value._ref}${label_text}</a>`;
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

  target.innerHTML = hout;
}

function parse_url(){
  if (typeof location === 'undefined') return null;

  const params = new URLSearchParams(location.search);

  if (params.has('mind')) {
    query = {msg: 'query_mind', mind: params.get('mind')};
  } else if (params.has('belief')) {
    // Check if state is also specified
    query = {msg: 'query_belief', belief: params.get('belief')};
    if (params.has('state')) {
      query.state_id = params.get('state');
    }
  } else if (params.has('state')) {
    query = {msg: 'query_state', state: params.get('state')};
  } else {
    // Default to world
    query = {msg: 'query_mind', mind: 'world'};
  }

  return query;
}

// Export for testing
export { render_entity, render_table };
