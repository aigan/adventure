const log = console.log.bind(console);
// log('Loading');

const store = {};

async function init(){
  // importScripts('./segments.js');
  // log('world', typeof world, world);
  importScripts('./world.js');

  log('player', world.sysdesig(player));
  // world.event('player_enter_location');
  world.player_enter_location();
  
}

const dispatch = {
  ping(){
    postMessage('pong');
  },
  async start(){
    postMessage(['main_clear'])
    postMessage(['main_add', "Welcome"])

    await init();
  }
}

// function send( cmd, data ){
//   if( !data ) data = []:
//   self.postMessage([cmd,...data]);
// }


addEventListener('message', e =>{
  let data = e.data;
  if( typeof data === 'string') data = [data];
  // console.log("Recieved message", data);
  const cmd = data.shift();

  if( dispatch[cmd] ) return dispatch[cmd](data);

  throw(Error(`Message ${cmd} not recognized`));
}, false);

//## Not implemented consistently
// self.onerror = err =>{
//   console.log("worker on error");
// }


// log('Ready');
