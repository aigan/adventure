import { log, assert } from "./debug.mjs";
// log('Loading GUI');

// import {cssP} from "./lib/load.mjs";
// import {worker} from "./boot.mjs";
import {Message} from "./message.mjs";

const el_header = document.querySelector('header');
const el_main = document.querySelector('main');

export const Content = {
  scrollStepDown(){
    window.scrollBy({
      top: 80,
      behavior: 'smooth',
    })
  },
  scrollStepUp(){
    window.scrollBy({
      top: -80,
      behavior: 'smooth',
    })
  },
  dialog(){
    const el_dialog = document.createElement('dialog');
    document.body.appendChild(el_dialog);
    return el_dialog;
    // el_dialog.showModal();
  },
}



Message.register({
  /**
   * @param {string} html
   */
  header_set( html ){
    assert(el_header, 'header element not found')
    el_header.innerHTML = html;
  },
  main_clear(){
    assert(el_main, 'main element not found')
    el_main.innerHTML = "";
  },
  /**
   * @param {any[]} textarr
   */
  main_add( textarr ){
    // console.log('appending', typeof textarr, textarr);
    assert(el_main, 'main element not found')
    const p = document.createElement('p');
    let htmlparts = [];
    const main = Locus.main;
    for( const part of textarr ){
      // log('part', part);
      if( typeof part === 'string' ){
        htmlparts.push( part );
        continue;
      }

      const {strings,values} = part;
      if( strings && values ){
        let html = "";
        for( let i=0; i<strings.length; i++){
          html += strings[i];
          const topic = values[i];
          if( topic ){
            const locus = Locus.add(main, topic)
            // log('displaying', locus);
            html += `<b class=topic id="${locus.slug}" tabindex=0>${desig(topic)}</b>`;
          }
        }
        htmlparts.push( html );
      }

    }

    let text = htmlparts.join("\n");
    p.innerHTML = text.replace(/\n/g,'<br>');
    el_main.appendChild(p);
    Locus.register( main, p );
  },
  /**
   * @param {[any]} param0
   */
  topic_update([topic]){
    log('update topic', desig(topic));
    for( const slug in Locus.loci ){
      const old_topic = Locus.loci[slug].topic;
      if( old_topic.is !== 'subject' ) continue;
      if( old_topic.id !== topic.id ) continue;
      Object.assign( old_topic, topic );
    }

  },
})

/** @type {any} */
export const Locus = {
  main: {
    loci: [],
    next_id: 1,
    slug: 'main',
    is_menu: true,
  },
  loci: {},
  selected: null,
  lock: false,

  /**
   * @param {any} menu
   * @param {any} topic - The topic data to display
   */
  add( menu, topic ){
    const locus = {
      id: menu.next_id ++,
      parent: menu,
      topic,
      slug: '',
    };
    locus.slug = `${menu.slug}-${locus.id}`;
    menu.loci[ locus.id ] = locus;
    Locus.loci[ locus.slug ] = locus;
    return locus;
  },

  /**
   * @param {any} menu
   * @param {HTMLElement} el_container
   */
  register( menu, el_container ){
    for( const el of el_container.querySelectorAll('.topic') ){
      // log('register', el.id );
      Locus.loci[el.id].element = el;
      // log('matched', Locus.main[el.id]);
    }
  },
  
  back(){
    let selected = Locus.selected;
    // log('back from', selected);
    if( !selected ) return;
    if( selected.element ){
       selected = Locus.unselect( selected );
     }
    if( selected.dialog ){
      selected.dialog.close();
      // log('back to parent', selected.parent);
      Locus.selected = selected.parent;
    }
    return Locus.selected;
  },

  unselect( locus = Locus.selected ){
    if( !locus ) return;
    const el = locus.element;
    // log('blur', locus.slug, locus.is_menu, el);
    if( el ){
      if( document.activeElement === el ) el.blur();
      el.classList.remove('selected');
    }
    return Locus.selected = locus.parent;
  },

  /**
   * @param {any} selected_new
   */
  select( selected_new ){
    if( Locus.selected === selected_new ) return;
    // log('select', selected_new);
    Locus.unselect();
    // log('selected', selected_new.slug, selected_new.is_menu );
    Locus.selected = selected_new;
    const el = Locus.selected.element;
    // log('selected marked', el, Locus.selected)
    el.classList.add('selected');
  },

  select_previous(){
    let tid, menu;
    const selected = Locus.selected || Locus.main;
    if( selected.is_menu ){
      menu = selected;
      tid = menu.loci.length;
    } else {
      menu = selected.parent;
      tid = selected.id;
    }

    // log('select_previous', tid);
    if( tid <= 1 ){ // At top
      // flash
      return;
    }
    const locus = menu.loci[ tid - 1 ];
    locus.element.focus();
  },

  select_next(){
    let tid, menu;
    const selected = Locus.selected || Locus.main;
    if( selected.is_menu ){
      menu = selected;
      tid = 0;
    } else {
      menu = selected.parent;
      tid = selected.id;
    }

    // log('select_next', tid);
    if( tid >= menu.loci.length - 1 ){ // At top
      // flash
      return;
    }
    const locus = menu.loci[ tid + 1 ];
    locus.element.focus();
  },
  
  enter_submenu(){
    const selected = Locus.selected;
    if( !selected || selected.is_menu ) return;
    const menu = Locus.menu( Locus.selected );
    if( !menu ) return;
    if( menu.dialog ){
      Locus.enter_dialog( menu )
    } else {
      throw "fixme";
    }
  },

  async execute(){
    const selected = Locus.selected;
    if( !selected ) return;
    const topic = selected.topic;
    if( !topic ) return;
    const action = topic.do || null;
    if( !action ) return Locus.enter_submenu();
    if( action === 'abort' ) return Locus.back();
    // log('action', selected, action, topic);

    const menu = selected.parent;
    if( menu.dialog ){
      menu.dialog.setAttribute("disabled","");
    }
    Locus.lock = true;
    let navigate = 'back';

    try{
      const res = await Message.send(action, topic)
      // log('action', action, res);
      if( res === 'stay') navigate = res;

    } catch( err ){
      console.error(`Action ${action} got`, err);
    }

    Locus.lock = false;
    if( menu.dialog ){
      menu.dialog.removeAttribute("disabled");
      Locus.back();
    }

    if( navigate === 'stay' ){
      // log('selected', Locus.selected);
      Locus.enter_submenu(); // Should fixate on right topic first
    }
  },
  
  /**
   * @param {any} locus - The locus to create menu for
   */
  menu( locus ){
    if( locus.menu ) return locus.menu;

    if( !locus.topic.actions ) return;
    // log('Create menu for', locus);

    const menu = {
      parent: locus,
      loci: /** @type {any[]} */ ([]),
      is_menu: true,
      next_id: 1,
      slug: locus.slug,
      dialog: /** @type {HTMLDialogElement|null} */ (null),
    };

    const topic = locus.topic;
    // log('action', topic.actions);
    if( topic.actions ){
      for( const action of topic.actions ){
        Locus.add( menu, action );
      }
    }
    Locus.add( menu, {do:'abort',label:"Never mind"});

    const html_subtopics = menu.loci.filter((l/** @type {any} */)=>l).map( (l/** @type {any} */)=>
      `<li class=topic id="${l.slug}" tabindex=0>`+
      `${desig(l.topic)}</li>`).join("\n");

    const dialog = Content.dialog();
    dialog.innerHTML = `
    <header>${ucfirst(desig(locus.topic))}</header>
    <ul>
      ${html_subtopics}
    </ul>
    `;
    menu.dialog = dialog;
    // log('submenu', menu);
    Locus.register( menu, dialog);
    return menu;
  },

  /**
   * @param {any} menu
   */
  enter_dialog( menu ){
    const dialog = menu.dialog;
    assert(dialog, "No dialog for menu");
    dialog.showModal();
    Locus.selected = menu;
  },

}


/** @type {ReturnType<typeof setTimeout>|null} */
let delayedFocus = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let delayedClick = null;
document.addEventListener('focusin', e=>{
  if( Locus.lock ) return;
  const target = /** @type {HTMLElement} */ (e.target)
  const locus = Locus.loci[ target.id ];
  if( !locus ) return;
  // log('focus', e.target);
  // Locus.select( locus );
  delayedFocus = setTimeout(()=>{
    // log('focus delayed', e.target);
    delayedFocus = null;
    Locus.select( locus );
  })
})

document.addEventListener('focusout', e=>{
  if( Locus.lock ) return;
  if(delayedFocus){
    // log('prevented focus');
    clearTimeout(delayedFocus);
    return;
  }
})

// fallback click handler for deselecting target
document.addEventListener('click', e=>{
  if( Locus.lock ) return;
  if( !Locus.selected ) return;
  const path = e.composedPath();
  // log('click', e.target);
  for( const el of path ){
    const element = /** @type {HTMLElement} */ (el)
    if( element.id && element.classList?.contains('topic')){
      // Delayed focus not done before click on mobile
      const target = /** @type {HTMLElement} */ (e.target)
      const locus = Locus.loci[ target.id ];
      if( !locus ) break;
      Locus.select( locus );
      Locus.execute();
      break;
    }
    if( el === document ){
      Locus.back();
    }
  }
})

/** @type {Record<string, () => void>} */
const shortcut = {
  "shift-ArrowDown": ()=> Content.scrollStepDown(),
  "shift-ArrowUp": ()=> Content.scrollStepUp(),
  ArrowUp(){ Locus.select_previous() },
  ArrowDown(){ Locus.select_next() },
  Escape(){ Locus.back() },
  ArrowRight(){ Locus.enter_submenu() },
  ArrowLeft(){ Locus.back() },
  Enter(){ Locus.execute() },
};

const shortcut_filter = Object.keys(shortcut).map(key=>{
  const match = key.match(/\w+$/)
  assert(match, `Invalid shortcut key: ${key}`)
  return match[0]
});

document.addEventListener('keydown', e=>{
  if( !shortcut_filter.includes(e.key) ) return;
  let desc = "";
  if( e.ctrlKey ) desc += "ctrl-";
  if( e.shiftKey ) desc += "shift-";
  if( e.altKey ) desc += "alt-";
  if( e.metaKey ) desc += "meta-";
  desc += e.key;

  // log('KEY', desc);
  if( !shortcut[desc] ) return;
  e.preventDefault();
  if( Locus.lock ) return;
  shortcut[desc]();
})

/**
 * @param {any} entity
 * @returns {string}
 */
export function desig( entity ){
  if( entity.description_short ) return entity.description_short;
  if( entity.Labeled ) return entity.Labeled.value;
  if( entity.label ) return entity.label;
  return entity.id;
}

/**
 * @param {string} str
 * @returns {string}
 */
export function ucfirst( str ){
  return str[0].toUpperCase() + str.slice(1);
}
