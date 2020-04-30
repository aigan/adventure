// console.log('Loading');
const worker = new Worker('worker.mjs');

const el_header = document.querySelector('header');
const el_main = document.querySelector('main');

const dispatch = {
  pong(){
    console.log("Worker is alive");
  },
  header_set( html ){
    el_header.innerHTML = html;
  },
  main_add( text ){
    // console.log('appending', typeof text, text);
    const p = document.createElement('p');
    p.innerHTML = text;
    el_main.appendChild(p);
  }
};


worker.addEventListener('message', e=>{
  let data = e.data;
  if( typeof data === 'string') data = [data];
  const cmd = data.shift();

  if( dispatch[cmd] ) return dispatch[cmd](data);

  throw(Error(`Message ${cmd} not recognized`));
}, false);


worker.postMessage('ping');
worker.postMessage('start');
console.log('Ready')
