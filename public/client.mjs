// console.log('Loading');

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
  main_add( text ){
    // console.log('appending', typeof text, text);
    const p = document.createElement('p');
    p.innerHTML = text;
    el_main.appendChild(p);
  },
};

worker.onmessage = e =>{
  let data = e.data;
  if( typeof data === 'string') data = [data];
  const cmd = data.shift();

  if( dispatch[cmd] ) return dispatch[cmd](data);

  throw(Error(`Message ${cmd} not recognized`));
}

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
