// console.log('Loading');
const log = console.log.bind(console);
import {Topic} from "./lib/gui.mjs";

//## Firefox do not support worker modules yet!
const worker = new Worker('./worker/worker.js', {type:"classic"});

const el_header = document.querySelector('header');
const el_main = document.querySelector('main');

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
