// console.log('Loading');
const log = console.log.bind(console);

//## Firefox do not support worker modules yet!
const worker = new Worker('./worker/worker.js', {type:"classic"});

const el_header = document.querySelector('header');
const el_main = document.querySelector('main');

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

const Topic = {
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

}


// let refkey = 'a'.charCodeAt();
// function nextkey(){
//   return String.fromCodePoint(refkey++);
// }




const dispatch = {
  pong(){
    console.log("Worker is alive");
  },
  header_set( html ){
    el_header.innerHTML = html;
  },
  main_clear(){
    el_main.innerHTML = "";
  },
  main_add( textarr ){
    // console.log('appending', typeof textarr, textarr);
    const p = document.createElement('p');
    let htmlparts = [];
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
          const obj = values[i];
          if( obj ){
            const topic = Topic.add(obj)
            log('displaying', topic);
            html += `<b class=topic id="${topic.id}" tabindex=0>${desig(obj)}</b>`;
          }
        }
        htmlparts.push( html );
      }

    }

    let text = htmlparts.join("\n");
    p.innerHTML = text.replace(/\n/g,'<br>');
    el_main.appendChild(p);
    Topic.register( p );
  },
};

worker.onmessage = e =>{
  let data = e.data;
  if( typeof data === 'string') data = [data];
  const cmd = data.shift();

  if( dispatch[cmd] ) return dispatch[cmd](data);

  throw(Error(`Message ${cmd} not recognized`));
}

function desig( entity ){
  if( entity.description_short ) return entity.description_short;
  if( entity.Labeled ) return entity.Labeled.value;
  if( entity.name ) return entity.name;
  return entity.id;
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


document.addEventListener('keydown', e=>{
  if( !['ArrowUp','ArrowDown','Escape'].includes(e.key) ) return;
  let desc = "";
  if( e.ctrlKey ) desc += "ctrl-";
  if( e.shiftKey ) desc += "shift-";
  if( e.altKey ) desc += "alt-";
  if( e.metaKey ) desc += "meta-";
  desc += e.key;

  if( desc === "shift-ArrowDown"){
    Content.scrollStepDown();
  } else if( desc === "shift-ArrowUp"){
    Content.scrollStepUp();
  } else if( desc === "ArrowUp" ){
    Topic.select_previous();
  } else if( desc === "ArrowDown" ){
    Topic.select_next();
  } else if( desc === "Escape" ){
    Topic.back();
  } else {
    return;
  }

  // log('key', desc);
  e.preventDefault();
})






// document.body.addEventListener('keyup', e=>{
//   if( e.key === 'e' ) return dispatch.genworld();
// })

//#### Not implemented consistantly!
/*
worker.onerror = e =>{
  console.error("catched worker error");
  console.log( e.data );
  e.preventDefault();
}
worker.onmessageerror = err =>{
  console.error("catched worker message error");
  err.preventDefault();
}

worker.addEventListener("error", e=>{
  console.log("worker on error");
}, false);

worker.addEventListener("messageerror", e=>{
  console.log("worker on error");
}, false);
*/

worker.postMessage('ping');
worker.postMessage('start');
console.log('Starting')
