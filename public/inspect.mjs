import { log, assert } from "./lib/debug.mjs";

// Browser-specific initialization
/** @type {BroadcastChannel|null} */
let channel = null;
/** @type {HTMLElement|null} */
let $path_bar = null;
/** @type {HTMLElement|null} */
let $state_table = null;
/** @type {HTMLElement|null} */
let $header = null;
/** @type {HTMLElement|null} */
let $main = null;
/** @type {number|null} */
let client_id = null;
/** @type {number|null} */
let server_id = null;
/** @type {any} */
let query = null;

/**
 * Ensure DOM elements are initialized
 * Called at the start of each render function to handle late initialization
 */
function ensure_dom_elements() {
  if (!$path_bar) $path_bar = document.querySelector(".path-bar");
  if (!$state_table) $state_table = document.querySelector(".state-table");
  if (!$header) $header = document.querySelector("header");
  if (!$main) $main = document.querySelector("main");
}

/**
 * Initialize the inspection page once DOM is ready
 */
function initialize() {
  log('Loading');
  channel = new BroadcastChannel('inspect');
  ensure_dom_elements();
  assert($header, 'header element not found');
  // @ts-ignore - assert ensures $header is not null
  $header.innerHTML = "Inspecting";

  // Set up message handler
  channel.postMessage({msg:"connect"});
  channel.onmessage = ev => {
    const dat = ev.data;
    const msg = dat.msg;
    if( !msg ) return console.error("Got confused message", dat);
    if( !dispatch[msg] ) return console.error('Message confused:', dat );
    log("message", dat);
    dispatch[msg](dat);
  };

  parse_url();
}

/**
 * Update footer with session metadata
 */
function update_footer() {
  const $footer = document.querySelector('footer.version');
  if ($footer && client_id !== null && server_id !== null) {
    $footer.textContent = `client:${client_id} server:${server_id}`;
  }
}

/**
 * Get formatted label with icon for mind based on type hierarchy
 * @param {any} mind - Mind object with id, label, type properties
 * @param {string|undefined} parent_type - Parent mind's type
 * @returns {string} Formatted label with appropriate icon
 */
function get_mind_label_with_icon(mind, parent_type) {
  const base_label = mind.label || `Mind #${mind.id}`;

  if (mind.type === 'Logos') {
    return '🌟';  // Only icon for logos
  } else if (mind.type === 'Eidos') {
    return `💠 ${base_label}`;  // Icon + label for eidos
  } else if (parent_type === 'Logos') {
    return `🌍 ${base_label}`;  // Icon + label for world minds (children of logos)
  } else if (parent_type === 'Eidos') {
    return `👤 ${base_label}`;  // Icon + label for prototype minds (children of eidos)
  } else if (parent_type === 'Materia') {
    return `🔮 ${base_label}`;  // Icon + label for NPC minds (children of materia)
  }
  return base_label;
}

if (typeof BroadcastChannel !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    // DOM already loaded (e.g., in tests or if script is deferred)
    initialize();
  }
}


if (typeof window !== 'undefined') {
  // @ts-ignore - adding custom property to window
  window.q = {
    // Query current Adventure state (world mind at current state)
    world(){
      assert(channel, 'channel not initialized');
      channel.postMessage({
        msg:'query_adventure',
        client_id,
        server_id,
      });
    }
  };
}

/** @type {Record<string, (dat: any) => void>} */
const dispatch = {
  /**
   * @param {any} dat
   */
  welcome(dat){
    client_id = dat.client_id;
    server_id = dat.server_id;
    log(`Connected as client ${client_id} to server ${server_id}`);

    update_footer();

    if( query?.msg ){
      assert(channel, 'channel not initialized');
      channel.postMessage({
        ... query,
        client_id,
        server_id,
      });
    }

  },
  /**
   * @param {any} dat
   */
  hello(dat){
    client_id = null;
    server_id = dat.server_id;
    assert(channel, 'channel not initialized');
    channel.postMessage({msg:"connect"});
  },
  /**
   * @param {any} dat
   */
  adventure_info(dat){
    // Got Adventure info - now query the world mind at the current state
    assert(channel, 'channel not initialized');
    channel.postMessage({
      msg: 'query_mind',
      mind: dat.world_mind_id,
      state_id: dat.state_id,
      client_id,
      server_id,
    });
  },
  /**
   * @param {any} dat
   */
  world_entity_list(dat){
    render_entity_list(dat);
  },
  /**
   * @param {any} dat
   */
  world_entity(dat){
    render_entity(dat);
  },
  /**
   * @param {any} dat
   */
  archetype_info(dat){
    render_archetype(dat);
  },
  /**
   * @param {any} dat
   */
  trait_view(dat){
    render_trait_view(dat);
  },
  /**
   * @param {any} dat
   */
  belief_not_found(dat){
    render_belief_not_found(dat);
  },
  /**
   * @param {any} dat
   */
  archetype_trait_view(dat){
    render_archetype_trait_view(dat);
  },
  /**
   * @param {any} dat
   */
  mind_info(dat){
    render_mind_info(dat);
  },
  /**
   * Handle notification that states have changed (debounced from worker)
   * @param {any} _dat
   */
  states_changed(_dat){
    // Always refresh the current view when any state changes
    if (query?.msg) {
      log('States changed, refreshing view')
      assert(channel, 'channel not initialized')
      channel.postMessage({
        ...query,
        client_id,
        server_id,
      })
    }
  },
}

/**
 * Render entity list (beliefs in a mind/state)
 * @param {any} dat
 */
function render_entity_list(dat){
  ensure_dom_elements();
  assert($path_bar, 'path-bar element not found');
  assert($state_table, 'state-table element not found');
  assert($header, 'header element not found');
  assert($main, 'main element not found');

  // Build path bar from mind hierarchy
  let path_html = '';
  const mind_path = dat.mind_path || [];
  const state_id = Number(dat.state.id);
  for (let i = 0; i < mind_path.length; i++) {
    const mind = mind_path[i];
    const parent = i > 0 ? mind_path[i - 1] : null;
    const label = get_mind_label_with_icon(mind, parent?.type);
    const is_current = i === mind_path.length - 1;

    if (i > 0) {
      path_html += '<span class="sep">›</span>';
    }

    const vt_span = mind.vt !== null ? `<span class="vt">:${mind.vt}</span>` : '';

    // Link to state by default, or to mind info if already viewing that state
    const is_current_state = Number(mind.state_id) === state_id;
    const mind_link = is_current_state ? `?mind=${mind.id}` : `?mind=${mind.id}&state=${mind.state_id}`;
    const current_class = is_current ? ' current' : '';
    path_html += `
      <a href="${mind_link}" class="chip mind${current_class}">
        ${label}${vt_span}
      </a>
    `;
  }

  // Mutable badge
  if (dat.state.locked === false) {
    path_html += '<span class="badge mutable">MUTABLE</span>';
  }

  $path_bar.innerHTML = path_html;

  // State table for list view
  const prev_link = dat.state.base_id
    ? `<a href="?state=${dat.state.base_id}" class="state-chip">#${dat.state.base_id}</a>`
    : '';
  const next_links = dat.state.branch_ids?.map((/** @type {number} */ id) =>
    `<a href="?state=${id}" class="state-chip">#${id}</a>`
  ).join('') || '';

  const state_vt_label = dat.state.vt !== null ? `vt:${dat.state.vt}` : 'Current';
  $state_table.innerHTML = `
    <div>
      <div class="col-header">Previous</div>
      <div class="states">${prev_link}</div>
    </div>
    <div class="current">
      <div class="col-header">${state_vt_label}</div>
      <div class="states">
        <span class="state-chip active">#${dat.state.id}</span>
      </div>
    </div>
    <div>
      <div class="col-header">Next</div>
      <div class="states">${next_links}</div>
    </div>
  `;

  // Header - use current mind label from path or state
  const current_mind_label = mind_path.length > 0
    ? (mind_path[mind_path.length - 1].label || `Mind #${mind_path[mind_path.length - 1].id}`)
    : (dat.state.mind_label || dat.state.self_label || `Mind #${dat.state.mind_id}`);
  $header.innerHTML = `${current_mind_label} beliefs (State #${dat.state.id})`;

  // Determine belief icon based on mind hierarchy
  // 🌱 for eidos beliefs, 📍 for materia beliefs
  const current_mind = mind_path.length > 0 ? mind_path[mind_path.length - 1] : null;
  const in_eidos = current_mind && (
    current_mind.type === 'Eidos' ||
    mind_path.some((/** @type {any} */ m) => m.type === 'Eidos')
  );
  const belief_icon = in_eidos ? '🌱' : '📍';

  // Table of beliefs
  let rows = '';
  for (const belief of dat.state.beliefs) {
    const link = `?belief=${belief.id}&state=${dat.state.id}`;
    const label_display = belief.label ? `${belief.label} (#${belief.id})` : `#${belief.id}`;
    rows += `<tr>
      <td><a href="${link}">${belief_icon} ${label_display}</a></td>
      <td><a href="${link}">${belief.desig}</a></td>
    </tr>`;
  }

  $main.innerHTML = `
    <section>
      <h2>Beliefs</h2>
      <table class="traits beliefs-list">
        <tr><th>Belief</th><th>Description</th></tr>
        ${rows}
      </table>
    </section>
  `;
}

/**
 * Render a single belief entity
 * @param {any} dat
 */
function render_entity(dat){
  ensure_dom_elements();
  assert($path_bar, 'path-bar element not found');
  assert($state_table, 'state-table element not found');
  assert($header, 'header element not found');
  assert($main, 'main element not found');

  const belief_data = dat.data.data;
  const state_id = Number(dat.state_id);
  const belief_mind_id = dat.mind?.id;

  // Build path bar - each mind links to its state (when viewing a specific belief, not browsing)
  let path_html = '';
  const mind_path = dat.mind_path || [];
  for (let i = 0; i < mind_path.length; i++) {
    const mind = mind_path[i];
    const parent = i > 0 ? mind_path[i - 1] : null;
    const label = get_mind_label_with_icon(mind, parent?.type);
    const vt_span = mind.vt !== null ? `<span class="vt">:${mind.vt}</span>` : '';
    // Always link to the state when viewing a specific belief
    const mind_link = `?mind=${mind.id}&state=${mind.state_id}`;
    path_html += `
      <a href="${mind_link}" class="chip mind">
        ${label}${vt_span}
      </a>
      <span class="sep">›</span>
    `;
  }

  // Current belief chip with icon
  const current_mind = mind_path.length > 0 ? mind_path[mind_path.length - 1] : null;
  const in_eidos = current_mind && (
    current_mind.type === 'Eidos' ||
    mind_path.some((/** @type {any} */ m) => m.type === 'Eidos')
  );
  const belief_icon = in_eidos ? '🌱' : '📍';
  const belief_label = belief_data.label || `#${belief_data._id}`;
  const archetype_label = belief_data.archetypes?.[0] || '';
  path_html += `
    <span class="chip belief current">
      ${belief_icon} ${belief_label} <span class="type">[${archetype_label}]</span>
    </span>
  `;

  // Mutable badge
  if (belief_data.locked === false) {
    path_html += '<span class="badge mutable">MUTABLE</span>';
  }

  $path_bar.innerHTML = path_html;

  // Build state table
  // Check if we're at the origin state (where belief was created)
  const is_origin = dat.origin_state_id !== null && dat.state_id === dat.origin_state_id;

  const parent_links = (dat.parent_state_ids || []).map((/** @type {number} */ id) =>
    `<a href="?belief=${belief_data._id}&state=${id}" class="state-chip">#${id}</a>`
  ).join('');

  // Show "origin" when there are no parent states to navigate to for this belief
  const parent_content = is_origin
    ? '<span class="origin-marker">origin</span>'
    : parent_links;

  const sibling_chips = (dat.sibling_states || []).map((/** @type {{id: number, is_current: boolean}} */ s) =>
    s.is_current
      ? `<span class="state-chip active">#${s.id}</span>`
      : `<a href="?belief=${belief_data._id}&state=${s.id}" class="state-chip">#${s.id}</a>`
  ).join('');

  const child_links = (dat.branch_ids || []).map((/** @type {number} */ id) =>
    `<a href="?belief=${belief_data._id}&state=${id}" class="state-chip">#${id}</a>`
  ).join('');

  const state_vt_label = dat.state_vt !== null ? `vt:${dat.state_vt}` : 'Current';
  $state_table.innerHTML = `
    <div>
      <div class="col-header">Parents</div>
      <div class="states">${parent_content}</div>
    </div>
    <div class="current">
      <div class="col-header">${state_vt_label}</div>
      <div class="states">${sibling_chips}</div>
    </div>
    <div>
      <div class="col-header">Children</div>
      <div class="states">${child_links}</div>
    </div>
  `;

  // Header
  const mind_prefix = dat.mind?.label || `Mind #${dat.mind?.id}`;
  $header.innerHTML = `${mind_prefix}: ${dat.desig}`;

  // Main content
  let main_html = '';

  // Inheritance section
  main_html += '<section><h2>Inheritance</h2><dl>';

  // Prototypes
  if (belief_data.prototypes?.length > 0) {
    const proto_links = belief_data.prototypes.map((/** @type {any} */ p) => {
      if (p.type === 'Belief' && p.id) {
        return `<a href="?belief=${p.id}&state=${state_id}">${p.label}</a>`;
      }
      return `<a href="?archetype=${p.label}">${p.label}</a>`;
    }).join(' › ');
    main_html += `<dt>Prototypes</dt><dd>${proto_links}</dd>`;
  }

  // Bases
  if (dat.bases?.length > 0) {
    const base_links = dat.bases.map((/** @type {any} */ b) => {
      if (b.id) {
        const vt_span = dat.state_vt ? `<span class="vt">:${dat.state_vt}</span>` : '';
        const lock_icon = belief_data.locked !== false ? ' 🔒' : '';
        return `<a href="?belief=${b.id}&state=${state_id}">[${belief_data.archetypes?.[0] || ''}] ${b.label || ''} #${b.id}${vt_span}${lock_icon}</a>`;
      }
      return `<a href="?archetype=${b.label}">${b.label}</a>`;
    }).join(', ');
    main_html += `<dt>Base</dt><dd>${base_links}</dd>`;
  }

  main_html += '</dl></section>';

  // Traits section
  if (belief_data.traits && Object.keys(belief_data.traits).length > 0) {
    main_html += '<section><h2>Traits</h2><table class="traits">';

    // Separate regular traits and meta traits
    const regular_traits = [];
    const meta_traits = [];

    for (const [trait, value] of Object.entries(belief_data.traits)) {
      if (trait.startsWith('@')) {
        meta_traits.push([trait, value]);
      } else {
        regular_traits.push([trait, value]);
      }
    }

    // Render regular traits first, then meta traits
    for (const [trait, value] of [...regular_traits, ...meta_traits]) {
      const is_meta = /** @type {string} */ (trait).startsWith('@');
      const row_class = is_meta ? ' class="meta"' : '';
      const display_value = format_trait_value(value, state_id, belief_mind_id);
      const trait_link = `?belief=${belief_data._id}&state=${state_id}&trait=${encodeURIComponent(trait)}`;
      main_html += `<tr${row_class}><th><a href="${trait_link}">${trait}</a></th><td>${display_value}</td></tr>`;
    }

    main_html += '</table></section>';
  }

  // Reverse traits section
  const rev_traits = dat.data.rev_traits;
  if (rev_traits && Object.keys(rev_traits).length > 0) {
    main_html += '<section><h2>Referenced By</h2><table class="traits">';

    for (const [trait, refs] of Object.entries(rev_traits)) {
      const items = /** @type {any[]} */ (refs).map(item => {
        const label_text = item.label ? ` (${item.label})` : '';
        const link = `?belief=${item._ref}&state=${state_id}`;
        const mind_prefix = (item.mind_id && item.mind_id !== belief_mind_id)
          ? `${item.mind_label || 'Mind #' + item.mind_id}: `
          : '';
        return `<a href="${link}">${mind_prefix}#${item._ref}${label_text}</a>`;
      }).join(', ');
      main_html += `<tr><th>${trait}</th><td>${items}</td></tr>`;
    }

    main_html += '</table></section>';
  }

  // Raw JSON
  main_html += `<details><summary>Raw JSON</summary><pre>${JSON.stringify(belief_data, null, 2)}</pre></details>`;

  $main.innerHTML = main_html;
}

/**
 * Render message when belief doesn't exist at the requested state
 * @param {any} dat
 */
function render_belief_not_found(dat) {
  ensure_dom_elements();
  assert($path_bar, 'path_bar element not found');
  assert($state_table, 'state-table element not found');
  assert($main, 'main element not found');

  // Build path bar - same as render_entity
  let path_html = '';
  const mind_path = dat.mind_path || [];
  for (let i = 0; i < mind_path.length; i++) {
    const mind = mind_path[i];
    const parent = i > 0 ? mind_path[i - 1] : null;
    const label = get_mind_label_with_icon(mind, parent?.type);
    const vt_span = mind.vt !== null ? `<span class="vt">:${mind.vt}</span>` : '';
    const mind_link = `?mind=${mind.id}&state=${mind.state_id}`;
    path_html += `
      <a href="${mind_link}" class="chip mind">
        ${label}${vt_span}
      </a>
      <span class="sep">›</span>
    `;
  }

  // Current belief chip
  const archetype_label = dat.archetypes?.[0] || '';
  path_html += `
    <span class="chip belief current">
      📍 #${dat.belief_id} <span class="type">[${archetype_label}]</span>
    </span>
  `;

  $path_bar.innerHTML = path_html;

  // Build state table - same as render_entity
  const parent_links = (dat.parent_state_ids || []).map((/** @type {number} */ id) =>
    `<a href="?belief=${dat.belief_id}&state=${id}" class="state-chip">#${id}</a>`
  ).join('');

  const sibling_chips = (dat.sibling_states || []).map((/** @type {{id: number, is_current: boolean}} */ s) =>
    s.is_current
      ? `<span class="state-chip active">#${s.id}</span>`
      : `<a href="?belief=${dat.belief_id}&state=${s.id}" class="state-chip">#${s.id}</a>`
  ).join('');

  const child_links = (dat.branch_ids || []).map((/** @type {number} */ id) =>
    `<a href="?belief=${dat.belief_id}&state=${id}" class="state-chip">#${id}</a>`
  ).join('');

  const state_vt_label = dat.state_vt !== null ? `vt:${dat.state_vt}` : 'Current';
  $state_table.innerHTML = `
    <div>
      <div class="col-header">Parents</div>
      <div class="states">${parent_links}</div>
    </div>
    <div class="current">
      <div class="col-header">${state_vt_label}</div>
      <div class="states">${sibling_chips}</div>
    </div>
    <div>
      <div class="col-header">Children</div>
      <div class="states">${child_links}</div>
    </div>
  `;

  // Main content - not found message
  $main.innerHTML = `
    <section class="not-found">
      <h2>Belief Does Not Exist Here</h2>
      <p>Belief #${dat.belief_id} was created at vt ${dat.belief_created_vt}.</p>
      <p class="detail">You are viewing state #${dat.state_id} at vt ${dat.state_vt}, which is before this belief existed.</p>
    </section>
  `;
}

/**
 * Format a trait value for display
 * @param {any} value
 * @param {number} state_id
 * @param {number|undefined} belief_mind_id
 * @returns {string}
 */
function format_trait_value(value, state_id, belief_mind_id) {
  if (value === null || value === undefined) {
    return '-';
  }

  if (Array.isArray(value)) {
    const items = value.map(item => format_trait_value(item, state_id, belief_mind_id));
    return items.join(', ');
  }

  if (typeof value === 'object') {
    if (value._type === 'Archetype') {
      return `<a href="?archetype=${value.label}">[${value.label}]</a>`;
    }
    // Handle unavailable subjects (exist in different mind/state)
    if (value._unavailable && value._type === 'Subject') {
      const mind_prefix = value.mind_label ? `${value.mind_label}: ` : '';
      return `<span class="unavailable" title="Subject not visible in this state">${mind_prefix}sid:${value.sid}</span>`;
    }
    if (value._ref && value._type) {
      if (value._type === 'Mind' && value.states) {
        // For Mind traits, link to the core state (first state in the array)
        // which is the state synchronized to the current ground state
        const core_state = value.states[0];
        if (core_state) {
          const mind_label = value.label ? ` (${value.label})` : '';
          return `<a href="?mind=${value._ref}&state=${core_state._ref}">Mind #${value._ref}${mind_label}</a>`;
        }
      }
      const type_lower = value._type.toLowerCase();
      const label_text = value.label ? ` (${value.label})` : '';
      // For cross-mind beliefs, use the state_id from the reference (if available)
      // This ensures we link to the correct state in the target belief's mind
      const is_cross_mind = value.mind_id && value.mind_id !== belief_mind_id;
      const link_state_id = (is_cross_mind && value.state_id) ? value.state_id : state_id;
      const link = (type_lower === 'belief' && link_state_id)
        ? `?${type_lower}=${value._ref}&state=${link_state_id}`
        : `?${type_lower}=${value._ref}`;
      const mind_prefix = is_cross_mind
        ? `${value.mind_label || 'Mind #' + value.mind_id}: `
        : '';
      const about_text = value.about_label ? ` about ${value.about_label}` : '';
      return `<a href="${link}">${mind_prefix}#${value._ref}${label_text}${about_text}</a>`;
    }
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Render archetype view
 * @param {any} dat
 */
function render_archetype(dat){
  ensure_dom_elements();
  assert($path_bar, 'path-bar element not found');
  assert($state_table, 'state-table element not found');
  assert($header, 'header element not found');
  assert($main, 'main element not found');

  const archetype_data = dat.data;

  // Build path bar - minds (Eidos) › archetype
  let path_html = '';
  const mind_path = dat.mind_path || [];
  for (let i = 0; i < mind_path.length; i++) {
    const mind = mind_path[i];
    const parent = i > 0 ? mind_path[i - 1] : null;
    const label = get_mind_label_with_icon(mind, parent?.type);
    path_html += `
      <a href="?mind=${mind.id}" class="chip mind">
        ${label}
      </a>
      <span class="sep">›</span>
    `;
  }

  // Archetype chip
  const archetype_icon = '⭕';
  path_html += `
    <span class="chip belief current">
      ${archetype_icon} ${archetype_data.label} <span class="type">[Archetype]</span>
    </span>
  `;

  $path_bar.innerHTML = path_html;

  // Clear state table for archetype view
  $state_table.innerHTML = '';

  // Header
  $header.innerHTML = dat.desig;

  // Main content
  let main_html = '<section><h2>Archetype</h2><dl>';

  // Bases
  if (archetype_data.bases?.length > 0) {
    const base_links = archetype_data.bases.map((/** @type {any} */ b) =>
      `<a href="?archetype=${b.label}">${b.label}</a>`
    ).join(' › ');
    main_html += `<dt>Bases</dt><dd>${base_links}</dd>`;
  }

  main_html += '</dl></section>';

  // Traits section
  if (archetype_data.traits && Object.keys(archetype_data.traits).length > 0) {
    main_html += '<section><h2>Traits Template</h2><table class="traits">';

    for (const [trait, value] of Object.entries(archetype_data.traits)) {
      const is_meta = trait.startsWith('@');
      const row_class = is_meta ? ' class="meta"' : '';
      const trait_link = `?archetype=${encodeURIComponent(archetype_data.label)}&trait=${encodeURIComponent(trait)}`;
      let display_value = value;
      if (typeof value === 'object' && value !== null && value._type === 'Archetype') {
        display_value = `<a href="?archetype=${value.label}">[${value.label}]</a>`;
      } else if (value === null) {
        display_value = '<em>null</em>';
      } else if (typeof value === 'object') {
        display_value = JSON.stringify(value);
      }
      main_html += `<tr${row_class}><th><a href="${trait_link}">${trait}</a></th><td>${display_value}</td></tr>`;
    }

    main_html += '</table></section>';
  }

  // Raw JSON
  main_html += `<details><summary>Raw JSON</summary><pre>${JSON.stringify(archetype_data, null, 2)}</pre></details>`;

  $main.innerHTML = main_html;
}

/**
 * Render trait detail view
 * @param {any} dat
 */
function render_trait_view(dat){
  ensure_dom_elements();
  assert($path_bar, 'path-bar element not found');
  assert($state_table, 'state-table element not found');
  assert($header, 'header element not found');
  assert($main, 'main element not found');

  // Build path bar - minds › belief › trait
  let path_html = '';
  const mind_path = dat.mind_path || [];
  for (let i = 0; i < mind_path.length; i++) {
    const mind = mind_path[i];
    const parent = i > 0 ? mind_path[i - 1] : null;
    const label = get_mind_label_with_icon(mind, parent?.type);
    const vt_span = mind.vt !== null ? `<span class="vt">:${mind.vt}</span>` : '';
    // Always link to the state when viewing a specific trait
    const mind_link = `?mind=${mind.id}&state=${mind.state_id}`;
    path_html += `
      <a href="${mind_link}" class="chip mind">
        ${label}${vt_span}
      </a>
      <span class="sep">›</span>
    `;
  }

  // Belief chip
  const belief_label = dat.belief_label || `#${dat.belief_id}`;
  const current_mind = mind_path.length > 0 ? mind_path[mind_path.length - 1] : null;
  const in_eidos = current_mind && (
    current_mind.type === 'Eidos' ||
    mind_path.some((/** @type {any} */ m) => m.type === 'Eidos')
  );
  const belief_icon = in_eidos ? '🌱' : '📍';
  path_html += `
    <a href="?belief=${dat.belief_id}&state=${dat.state_id}" class="chip belief">
      ${belief_icon} ${belief_label}
    </a>
    <span class="sep">›</span>
  `;

  // Current trait chip
  const value_display = format_trait_value(dat.current_value, dat.state_id, dat.belief_id);
  path_html += `
    <span class="chip trait current">
      <span class="chip-label">${dat.trait_name}</span>
      <span class="chip-value">${value_display}</span>
    </span>
  `;

  // Mutable badge
  if (dat.state_locked === false) {
    path_html += '<span class="badge mutable">MUTABLE</span>';
  }

  $path_bar.innerHTML = path_html;

  // Build state table
  const parent_links = (dat.parent_state_ids || []).map((/** @type {number} */ id) =>
    `<a href="?belief=${dat.belief_id}&state=${id}&trait=${encodeURIComponent(dat.trait_name)}" class="state-chip">#${id}</a>`
  ).join('');

  const sibling_chips = (dat.sibling_states || []).map((/** @type {{id: number, is_current: boolean}} */ s) =>
    s.is_current
      ? `<span class="state-chip active">#${s.id}</span>`
      : `<a href="?belief=${dat.belief_id}&state=${s.id}&trait=${encodeURIComponent(dat.trait_name)}" class="state-chip">#${s.id}</a>`
  ).join('');

  const child_links = (dat.branch_ids || []).map((/** @type {number} */ id) =>
    `<a href="?belief=${dat.belief_id}&state=${id}&trait=${encodeURIComponent(dat.trait_name)}" class="state-chip">#${id}</a>`
  ).join('');

  const state_vt_label = dat.state_vt !== null ? `vt:${dat.state_vt}` : 'Current';
  $state_table.innerHTML = `
    <div>
      <div class="col-header">Parents</div>
      <div class="states">${parent_links}</div>
    </div>
    <div class="current">
      <div class="col-header">${state_vt_label}</div>
      <div class="states">${sibling_chips}</div>
    </div>
    <div>
      <div class="col-header">Children</div>
      <div class="states">${child_links}</div>
    </div>
  `;

  // Header
  $header.innerHTML = `${dat.belief_desig}: ${dat.trait_name}`;

  // Main content
  let main_html = '';

  // Current value section
  main_html += '<section class="trait-value-display"><h3>Value</h3>';
  main_html += `<div class="value-box"><span class="value-content">${value_display}</span></div>`;
  main_html += '</section>';

  // Source section
  main_html += '<section class="trait-source"><h3>Source</h3><dl class="compact">';
  const source_note = dat.source === 'own' ? '(own trait)' : '(inherited)';
  const source_link = `<a href="?belief=${dat.source_belief_id}&state=${dat.state_id}">${source_note}</a>`;
  main_html += `<dt>Defined in</dt><dd>${source_link}</dd>`;
  main_html += '</dl></section>';

  // Value history section
  if (dat.history && dat.history.length > 0) {
    main_html += '<section class="trait-history"><h3>History</h3><div class="history-list">';
    for (const item of dat.history) {
      const item_class = item.is_current ? ' current' : '';
      const vt_display = item.vt !== null ? `vt:${item.vt}` : '-';
      const value_str = format_trait_value(item.value, item.state_id, dat.belief_id);
      main_html += `<div class="history-item${item_class}">`;
      main_html += `<span class="history-state"><a href="?belief=${dat.belief_id}&state=${item.state_id}&trait=${encodeURIComponent(dat.trait_name)}">#${item.state_id}</a></span>`;
      main_html += `<span class="history-value">${value_str}</span>`;
      main_html += `<span class="history-vt">${vt_display}</span>`;
      main_html += `</div>`;
    }
    main_html += '</div></section>';
  }

  $main.innerHTML = main_html;
}

/**
 * Render archetype trait view (trait metadata without value history)
 * @param {any} dat
 */
function render_archetype_trait_view(dat){
  ensure_dom_elements();
  assert($path_bar, 'path-bar element not found');
  assert($state_table, 'state-table element not found');
  assert($header, 'header element not found');
  assert($main, 'main element not found');

  // Build path bar - Eidos › archetype › trait
  let path_html = '';
  const mind_path = dat.mind_path || [];
  for (let i = 0; i < mind_path.length; i++) {
    const mind = mind_path[i];
    const parent = i > 0 ? mind_path[i - 1] : null;
    const label = get_mind_label_with_icon(mind, parent?.type);
    path_html += `
      <a href="?mind=${mind.id}" class="chip mind">
        ${label}
      </a>
      <span class="sep">›</span>
    `;
  }

  // Archetype chip
  const archetype_label = dat.archetype_label;
  const archetype_icon = '⭕';
  path_html += `
    <a href="?archetype=${encodeURIComponent(archetype_label)}" class="chip belief">
      ${archetype_icon} ${archetype_label} <span class="type">[Archetype]</span>
    </a>
    <span class="sep">›</span>
  `;

  // Trait chip
  const trait_name = dat.trait_name;
  path_html += `
    <span class="chip trait current">
      ${trait_name}
    </span>
  `;

  $path_bar.innerHTML = path_html;

  // Clear state table for archetype trait view
  $state_table.innerHTML = '';

  // Header
  $header.innerHTML = `Trait: ${trait_name}`;

  // Main content
  let main_html = '';

  // Trait value from archetype template
  main_html += '<section class="trait-value-display"><h2>Template Value</h2>';
  const template_value = dat.template_value;
  let display_value = template_value;
  if (template_value === null) {
    display_value = '<em>null</em>';
  } else if (typeof template_value === 'object') {
    display_value = JSON.stringify(template_value, null, 2);
  }
  main_html += `<div class="value-box"><div class="value-content">${display_value}</div></div>`;
  main_html += '</section>';

  // Traittype metadata (if available)
  if (dat.traittype_metadata) {
    main_html += '<section><h2>TraitType Metadata</h2><dl class="compact">';
    const meta = dat.traittype_metadata;
    if (meta.label) {
      main_html += `<dt>Label</dt><dd>${meta.label}</dd>`;
    }
    if (meta.data_type) {
      main_html += `<dt>Data Type</dt><dd>${meta.data_type}</dd>`;
    }
    if (meta.composable !== undefined) {
      main_html += `<dt>Composable</dt><dd>${meta.composable}</dd>`;
    }
    if (meta.values) {
      main_html += `<dt>Values</dt><dd>${JSON.stringify(meta.values)}</dd>`;
    }
    if (meta.exposure) {
      main_html += `<dt>Exposure</dt><dd>${meta.exposure}</dd>`;
    }
    if (meta.container) {
      main_html += `<dt>Container</dt><dd>${meta.container.name || meta.container}</dd>`;
    }
    if (meta.mind_scope) {
      main_html += `<dt>Mind Scope</dt><dd>${meta.mind_scope}</dd>`;
    }
    if (meta.constraints && (meta.constraints.min !== null || meta.constraints.max !== null)) {
      const constraints = [];
      if (meta.constraints.min !== null) constraints.push(`min: ${meta.constraints.min}`);
      if (meta.constraints.max !== null) constraints.push(`max: ${meta.constraints.max}`);
      main_html += `<dt>Constraints</dt><dd>${constraints.join(', ')}</dd>`;
    }
    main_html += '</dl></section>';
  }

  $main.innerHTML = main_html;
}

/**
 * Render mind info view
 * @param {any} dat
 */
function render_mind_info(dat){
  ensure_dom_elements();
  assert($path_bar, 'path-bar element not found');
  assert($state_table, 'state-table element not found');
  assert($header, 'header element not found');
  assert($main, 'main element not found');

  const mind_data = dat.data;

  // Build path bar from mind hierarchy
  let path_html = '';
  const mind_path = dat.mind_path || [];
  for (let i = 0; i < mind_path.length; i++) {
    const mind = mind_path[i];
    const parent = i > 0 ? mind_path[i - 1] : null;
    const label = get_mind_label_with_icon(mind, parent?.type);
    const is_current = i === mind_path.length - 1;

    if (i > 0) {
      path_html += '<span class="sep">›</span>';
    }

    if (is_current) {
      // Current mind - highlighted
      path_html += `
        <span class="chip mind current">
          ${label}
        </span>
      `;
    } else {
      path_html += `
        <a href="?mind=${mind.id}" class="chip mind">
          ${label}
        </a>
      `;
    }
  }

  $path_bar.innerHTML = path_html;

  // Clear state table for mind view
  $state_table.innerHTML = '';

  // Header
  $header.innerHTML = dat.desig;

  // Main content
  let main_html = '';

  // Self (if present)
  if (mind_data.self_label) {
    main_html += '<section><h2>Mind Details</h2><dl>';
    main_html += `<dt>Self</dt><dd>${mind_data.self_label}</dd>`;
    main_html += '</dl></section>';
  }

  // Child minds section
  if (mind_data.child_minds && mind_data.child_minds.length > 0) {
    main_html += '<section><h2>Child Minds</h2><table class="traits">';
    main_html += '<tr><th>ID</th><th>Label</th></tr>';

    for (const child of mind_data.child_minds) {
      let child_label = child.label || `Mind #${child.id}`;

      // Determine icon based on child's type
      if (child.type === 'Eidos') {
        child_label = `💠 ${child_label}`;
      } else if (child.type === 'Materia' && mind_data.type === 'Logos') {
        // World minds (materia children of logos)
        child_label = `🌍 ${child_label}`;
      } else if (child.type === 'Materia' && mind_data.type === 'Eidos') {
        // Prototype minds (materia children of eidos)
        child_label = `👤 ${child_label}`;
      } else if (child.type === 'Materia') {
        // NPC minds (materia children of materia)
        child_label = `🔮 ${child_label}`;
      }
      const child_link = `<a href="?mind=${child.id}">${child_label}</a>`;
      main_html += `<tr><td><a href="?mind=${child.id}">#${child.id}</a></td><td>${child_link}</td></tr>`;
    }

    main_html += '</table></section>';
  }

  // States section
  if (mind_data.states && mind_data.states.length > 0) {
    // Sort states by tt descending (most recent first), handling null tt for timeless minds
    const sorted_states = [...mind_data.states].sort((a, b) => {
      const tt_a = a.tt !== null ? a.tt : -Infinity;
      const tt_b = b.tt !== null ? b.tt : -Infinity;
      return tt_b - tt_a;
    });

    main_html += '<section><h2>States</h2><table class="traits">';
    main_html += '<tr><th>ID</th><th>TT</th><th>VT</th><th>Locked</th><th>Base</th></tr>';

    for (const state of sorted_states) {
      const state_link = `<a href="?state=${state.id}">#${state.id}</a>`;
      const tt_display = state.tt !== null ? state.tt : '-';
      const vt_display = state.vt !== null ? state.vt : '-';
      const locked_display = state.locked ? '🔒' : '-';
      const base_display = state.base_id ? `<a href="?state=${state.base_id}">#${state.base_id}</a>` : '-';

      main_html += `<tr>
        <td>${state_link}</td>
        <td>${tt_display}</td>
        <td>${vt_display}</td>
        <td>${locked_display}</td>
        <td>${base_display}</td>
      </tr>`;
    }

    main_html += '</table></section>';
  }

  // Raw JSON
  main_html += `<details><summary>Raw JSON</summary><pre>${JSON.stringify(mind_data, null, 2)}</pre></details>`;

  $main.innerHTML = main_html;
}

function parse_url(){
  if (typeof location === 'undefined') return null;

  const params = new URLSearchParams(location.search);

  if (params.has('mind') && params.has('state')) {
    query = {msg: 'query_mind', mind: params.get('mind'), state_id: params.get('state')};
  } else if (params.has('mind')) {
    query = {msg: 'query_mind_info', mind: params.get('mind')};
  } else if (params.has('belief') && params.has('state') && params.has('trait')) {
    query = {msg: 'query_trait', belief: params.get('belief'), state_id: params.get('state'), trait: params.get('trait')};
  } else if (params.has('belief') && params.has('state')) {
    query = {msg: 'query_belief', belief: params.get('belief'), state_id: params.get('state')};
  } else if (params.has('archetype') && params.has('trait')) {
    query = {msg: 'query_archetype_trait', archetype: params.get('archetype'), trait: params.get('trait')};
  } else if (params.has('archetype')) {
    query = {msg: 'query_archetype', archetype: params.get('archetype')};
  } else if (params.has('state')) {
    query = {msg: 'query_state', state: params.get('state')};
  } else {
    // Default to current Adventure state
    query = {msg: 'query_adventure'};
  }

  return query;
}

// Export for testing
export { render_entity };
