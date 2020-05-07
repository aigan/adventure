const log = console.log.bind(console);
log('Loading');

const store = {};

async function init(){
  // importScripts('./segments.js');
  // log('world', typeof world, world);
  importScripts('./world.js');

  store.hero = {}
  store.locs = {
    lobby: {
      title: "Lobby",
    }
  }
  store.actors = {
    marjorie: {
      name: "Marjorie",
      location: store.locs.lobby,
    }
  }
}

const dispatch = {
  ping(){
    self.postMessage('pong');
  },
  async start(){
    await init();
    self.postMessage(['main_clear'])
    self.postMessage(['header_set', "Location: Lobby"]);
    self.postMessage(['main_add', "Welcome"])
  }
}

// function send( cmd, data ){
//   if( !data ) data = []:
//   self.postMessage([cmd,...data]);
// }


self.addEventListener('message', e =>{
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


log('Ready');
