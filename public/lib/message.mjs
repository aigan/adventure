const log = console.log.bind(console);
// import {worker} from "./boot.mjs";
//## Firefox do not support worker modules yet!
// URL relative to containing HTML page.
export const worker = new Worker('worker/worker.mjs', {type:"module"});

const jobs = {};

const dispatch = {
  pong(){
    log("Worker is alive");
  },
  ack([ ackid, res ]){
    // log('ack', ackid, res);
    if( !jobs[ackid] ) throw `No job ${ackid} found`;
    jobs[ackid].resolve( res );
    delete jobs[ackid];
    // log('ack', ackid);
  },
};

worker.onmessage = e =>{
  let data = e.data;
  if( typeof data === 'string') data = [data];
  const cmd = data.shift();

  if( dispatch[cmd] ) return dispatch[cmd](data);

  throw(Error(`Message ${cmd} not recognized`));
}

let next_ackid = 1;

export const Message = {
  register( handlers ){
    for( const label in handlers ){
      // log('reg', label);
      dispatch[label] = handlers[label];
    }
  },
  send( cmd, data ){
    const ackid = next_ackid ++;
    return new Promise( (resolve,reject)=>{
      // log('regs resolve for', ackid);
      jobs[ackid] = {resolve,reject};
      worker.postMessage([cmd, data, ackid])
    })
  }
}

//#### Not implemented consistantly!
worker.onerror = e =>{
  console.error("catched worker error", e);
	// No info about what error
  e.preventDefault();
}

worker.onmessageerror = err =>{
  console.error("catched worker message error");
  err.preventDefault();
}

//worker.addEventListener("error", e=>{
//  console.log("worker on error", e);
//}, false);
//
//worker.addEventListener("messageerror", e=>{
//  console.log("worker on error");
//}, false);
//


