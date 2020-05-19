const log = console.log.bind(console);
log('Loading GUI');

// import {cssP} from "./lib/load.mjs";
// cssP("./vendor/dialog-polyfill.css");

import dialogPolyfill from "../vendor/dialog-polyfill.esm.js";

setTimeout(()=>{
  const dialog = document.querySelector('dialog');
  dialogPolyfill.registerDialog(dialog);
  // dialog.showModal()
}, 1000);


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
}

export const Topic = {
  main: [],
  selected: null,
  next_id: 1,
  
  add( obj ){
    const topic = {
      id: Topic.next_id ++,
      obj,
    };
    Topic.main[ topic.id ] = topic;
    return topic;
  },

  register( parent ){
    for( const el of parent.querySelectorAll('.topic') ){
      Topic.main[el.id].element = el;
      // log('matched', Topic.main[el.id]);
    }
  },
  
  back(){
    Topic.unselect();
  },

  unselect(){
    if( !Topic.selected ) return;
    const el = Topic.selected.element;
    if( document.activeElement === el ) el.blur();
    el.classList.remove('selected');
    // log('blur', el, document.activeElement);
    Topic.selected = null;
  },

  select( tid ){
    const selected_new = Topic.main[tid];
    if( Topic.selected === selected_new ) return;
    Topic.unselect();
    Topic.selected = selected_new;
    const el = Topic.selected.element;
    el.classList.add('selected');
    log('focus', tid);
  },

  select_previous(){
    let tid;
    if( !Topic.selected ) tid = Topic.main.length;
    else tid = Topic.selected.id;
    if( tid === 1 ){ // At top 
      // flash
      return;
    }
    const topic = Topic.main[ tid - 1 ];
    topic.element.focus();
  },

  select_next(){
    let tid;
    if( !Topic.selected ) tid = 0;
    else tid = Topic.selected.id;
    if( tid === Topic.main.length - 1 ){ // At top 
      // flash
      return;
    }
    const topic = Topic.main[ tid + 1 ];
    topic.element.focus();
  },
  
  enter_submenu(){
    log('submenu');
  },

}




let delayedFocus = null;
let delayedClick = null;
document.addEventListener('focusin', e=>{
  delayedFocus = setTimeout(()=>{
    delayedFocus = null;
    Topic.select( e.target.id );
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
      // log('is topic');
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

  if( !shortcut[desc] ) return;
  shortcut[desc]();
  // log('key', desc);
  e.preventDefault();
})
