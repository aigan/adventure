const log = console.log.bind(console);
log('Loading GUI');

// import {cssP} from "./lib/load.mjs";
// cssP("./vendor/dialog-polyfill.css");

import dialogPolyfill from "../vendor/dialog-polyfill.esm.js";

// let refkey = 'a'.charCodeAt();
// function nextkey(){
//   return String.fromCodePoint(refkey++);
// }


const Content = {
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
    dialogPolyfill.registerDialog(el_dialog);
    return el_dialog;
    // el_dialog.showModal();
  },
}

export const Topic = {
  main: {
    topics: [],
    next_id: 1,
    slug: 'main',
    is_menu: true,
  },
  topics: {},
  selected: null,
  
  add( menu, subject ){
    const topic = {
      id: menu.next_id ++,
      parent: menu,
      subject,
    };
    topic.slug = `${menu.slug}-${topic.id}`;
    menu.topics[ topic.id ] = topic;
    Topic.topics[ topic.slug ] = topic;
    return topic;
  },

  register( menu, el_container ){
    for( const el of el_container.querySelectorAll('.topic') ){
      // log('register', el.id );
      Topic.topics[el.id].element = el;
      // log('matched', Topic.main[el.id]);
    }
  },
  
  back(){
    let selected = Topic.selected;
    // log('back from', selected);
    if( !selected ) return;
    if( selected.element ){
       selected = Topic.unselect( selected );
     }
    if( selected.dialog ){
      selected.dialog.close();
      Topic.selected = selected.parent;
    }
    return Topic.selected;
  },

  unselect( topic = Topic.selected ){
    if( !topic ) return;
    const el = topic.element;
    if( el ){    
      if( document.activeElement === el ) el.blur();
      el.classList.remove('selected');
      // log('blur', el, document.activeElement);
    }
    return Topic.selected = topic.parent;
  },

  select( selected_new ){
    // const selected_new = Topic.main[tid];
    if( Topic.selected === selected_new ) return;
    // log('select', selected_new);
    Topic.unselect();
    Topic.selected = selected_new;
    const el = Topic.selected.element;
    el.classList.add('selected');
    // log('focus', selected_new.id );
  },

  select_previous(){
    let tid, menu;
    const selected = Topic.selected || Topic.main;
    if( selected.is_menu ){
      menu = selected;
      tid = menu.topics.length;
    } else {
      menu = selected.parent;
      tid = selected.id;
    }
    
    // log('select_previous', tid);
    if( tid <= 1 ){ // At top 
      // flash
      return;
    }
    const topic = menu.topics[ tid - 1 ];
    topic.element.focus();
  },

  select_next(){
    let tid, menu;
    const selected = Topic.selected || Topic.main;
    if( selected.is_menu ){
      menu = selected;
      tid = 0;
    } else {
      menu = selected.parent;
      tid = selected.id;
    }
    
    // log('select_next', tid, menu.topics.length);
    if( tid >= menu.topics.length - 1 ){ // At top 
      // flash
      return;
    }
    const topic = menu.topics[ tid + 1 ];
    topic.element.focus();
  },
  
  enter_submenu(){
    const selected = Topic.selected;
    if( !selected || selected.is_menu ) return;
    const menu = Topic.menu( Topic.selected );
    if( !menu ) return;
    if( menu.dialog ){
      Topic.enter_dialog( menu )
    } else {
      throw "fixme";
    }
  },
  
  execute(){
    const selected = Topic.selected;
    if( !selected ) return;
    const subj = selected.subject;
    if( !subj ) return;
    const action = subj.do || null;
    if( action === 'abort' ){
      return Topic.back();
    }
    Topic.enter_submenu();
  },
  
  menu( topic ){
    if( topic.menu ) return topic.menu;

    if( !topic.subject.actions ) return;
    // log('Create menu for', topic);

    const menu = {
      parent: topic,
      topics: [],
      is_menu: true,
      next_id: 1,
      slug: topic.slug,
    };

    const subj = topic.subject;
    // log('action', subj.actions);
    if( subj.actions ){
      for( const action of subj.actions ){
        Topic.add( menu, action );
      }
    }
    Topic.add( menu, {do:'abort',name:"Never mind"});

    const html_subtopics = menu.topics.filter(t=>t).map( t=>
      `<li class=topic id="${t.slug}" tabindex=0>`+
      `${desig(t.subject)}</li>`).join("\n");

    const dialog = Content.dialog();
    dialog.innerHTML = `
    <header>${ucfirst(desig(topic.subject))}</header>
    <ul>
      ${html_subtopics}
    </ul>
    `;
    menu.dialog = dialog;
    // log('submenu', menu);
    Topic.register( menu, dialog);
    return menu;
  },
  
  enter_dialog( menu ){
    const dialog = menu.dialog;
    if( !dialog ) throw "No dialog for menu";
    dialog.showModal();
    Topic.selected = menu;
  },

}


let delayedFocus = null;
let delayedClick = null;
document.addEventListener('focusin', e=>{
  const topic = Topic.topics[ e.target.id ];
  if( !topic ) return;
  // log('focus', e.target);
  delayedFocus = setTimeout(()=>{
    delayedFocus = null;
    Topic.select( topic );
  })
})

document.addEventListener('focusout', e=>{
  if(delayedFocus){
    log('prevented focus');
    clearTimeout(delayedFocus);
    return;
  }
})

// fallback click handler for deselecting target
document.addEventListener('click', e=>{
  if( !Topic.selected ) return;
  const path = e.composedPath();
  // log('click', path);
  for( const el of path ){
    if( el.id && el.classList.contains('topic')){
      // Focus is done before click. But maby check?
      Topic.execute();
      break;
    }
    if( el === document ){
      Topic.back();
    }
  }
})

const shortcut = {
  "shift-ArrowDown": ()=> Content.scrollStepDown(),
  "shift-ArrowUp": ()=> Content.scrollStepUp(),
  ArrowUp(){ Topic.select_previous() },
  ArrowDown(){ Topic.select_next() },
  Escape(){ Topic.back() },
  ArrowRight(){ Topic.enter_submenu() },
  ArrowLeft(){ Topic.back() },
  Enter(){ Topic.execute() },
};

const shortcut_filter = Object.keys(shortcut).map(key=>key.match(/\w+$/)[0]);

document.addEventListener('keydown', e=>{
   if( !shortcut_filter.includes(e.key) ) return;
  let desc = "";
  if( e.ctrlKey ) desc += "ctrl-";
  if( e.shiftKey ) desc += "shift-";
  if( e.altKey ) desc += "alt-";
  if( e.metaKey ) desc += "meta-";
  desc += e.key;

  // log('key', desc);
  if( !shortcut[desc] ) return;
  shortcut[desc]();
  e.preventDefault();
})

export function desig( entity ){
  if( entity.description_short ) return entity.description_short;
  if( entity.Labeled ) return entity.Labeled.value;
  if( entity.name ) return entity.name;
  return entity.id;
}

export function ucfirst( str ){
  return str[0].toUpperCase() + str.slice(1); 
}
