import { log } from "./lib/debug.mjs";

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
    // Query current Adventure state (world mind at current state)
    world(){
      channel.postMessage({
        msg:'query_adventure',
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
  adventure_info(dat){
    // Got Adventure info - now query the world mind at the current state
    channel.postMessage({
      msg: 'query_mind',
      mind: dat.world_mind_id,
      state_id: dat.state_id,
      client_id,
      server_id,
    });
  },
  world_entity_list(dat){
    const state_nav = dat.state.base_id
      ? `<a href="?state=${dat.state.base_id}">← Previous State</a>`
      : '';

    const mind_prefix = dat.state.mind_label || dat.state.self_label || `Mind #${dat.state.mind_id}`;
    const mutable_indicator = dat.state.locked === false ? ' <span style="color: orange; font-weight: bold;">[MUTABLE]</span>' : '';
    const time_info = dat.state.vt !== dat.state.tt && dat.state.vt !== undefined
      ? `tt: ${dat.state.tt}, vt: ${dat.state.vt}`
      : `tt: ${dat.state.tt}`;

    render({
      header: `${mind_prefix} beliefs (State #${dat.state.id}, ${time_info}) ${state_nav}${mutable_indicator}`,
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
  const belief_mind_id = a.entity.mind?.id;

  let hout = "<dl>";

  // Display ID with mutable indicator if unlocked
  const mutable_indicator = belief_data.locked === false ? ' <span style="color: orange; font-weight: bold;">[MUTABLE]</span>' : '';
  hout += `<dt>ID</dt><dd>#${belief_data._id}${mutable_indicator}</dd>`;

  // Display label
  if (belief_data.label) {
    hout += `<dt>Label</dt><dd>${belief_data.label}</dd>`;
  }

  // Display prototypes (Archetypes and shared Beliefs with labels)
  if (belief_data.prototypes?.length > 0) {
    const prototype_labels = belief_data.prototypes.map(p => p.label).join(', ');
    hout += `<dt>Prototypes</dt><dd>${prototype_labels}</dd>`;
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
              // Add mind prefix if different mind
              const mind_prefix = (item.mind_id && item.mind_id !== belief_mind_id)
                ? `${item.mind_label || 'Mind #' + item.mind_id}: `
                : '';
              return `<a href="${link}">${mind_prefix}#${item._ref}${label_text}</a>`;
            } else {
              return JSON.stringify(item);
            }
          }
          return item;
        });
        display_value = items.join(', ');
      } else if (typeof value === 'object' && value !== null) {
        if (value._ref && value._type) {
          // Handle Mind type specially - render its states instead of linking to Mind
          if (value._type === 'Mind' && value.states) {
            const state_links = value.states.map(s => {
              const link = `?state=${s._ref}`;
              return `<a href="${link}">#${s._ref}</a>`;
            });
            display_value = state_links.join(', ');
          } else {
            // Reference to another belief or object
            const type_lower = value._type.toLowerCase();
            const label_text = value.label ? ` (${value.label})` : '';
            const link = (type_lower === 'belief' && state_id)
              ? `?${type_lower}=${value._ref}&state=${state_id}`
              : `?${type_lower}=${value._ref}`;
            // Add mind prefix if different mind
            const mind_prefix = (value.mind_id && value.mind_id !== belief_mind_id)
              ? `${value.mind_label || 'Mind #' + value.mind_id}: `
              : '';
            display_value = `<a href="${link}">${mind_prefix}#${value._ref}${label_text}</a>`;
          }
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

  if (params.has('mind') && params.has('state')) {
    query = {msg: 'query_mind', mind: params.get('mind'), state_id: params.get('state')};
  } else if (params.has('belief') && params.has('state')) {
    query = {msg: 'query_belief', belief: params.get('belief'), state_id: params.get('state')};
  } else if (params.has('state')) {
    query = {msg: 'query_state', state: params.get('state')};
  } else {
    // Default to current Adventure state
    query = {msg: 'query_adventure'};
  }

  return query;
}

// Export for testing
export { render_entity, render_table };
