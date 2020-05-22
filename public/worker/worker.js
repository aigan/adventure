const log = console.log.bind(console);
// log('Loading');

const store = {};

async function init(){
  // importScripts('./segments.js');
  // log('world', typeof world, world);
  importScripts('./world.js');

  // log('player', world.sysdesig(player));
  // world.event('player_enter_location');
  world.player_enter_location();
  
}

const dispatch = {
  ping(){
    postMessage('pong');
  },
  async start(){
    log('Starting');
    postMessage(['main_clear'])
    // postMessage(['main_add', "Welcome"])

    await init();
  },
  async greet(context){
    log("Greeting", context)
    const lines = ["&#8250; You greet"];
    postMessage(['main_add', ...lines ]);
  }
}

// function send( cmd, data ){
//   if( !data ) data = []:
//   self.postMessage([cmd,...data]);
// }


addEventListener('message', async e =>{
  let msg = e.data;
  if( typeof msg === 'string') msg = [msg];
  // console.log("Recieved message", data);
  const [cmd, data, ackid] = msg;

  if( !dispatch[cmd] ) throw(Error(`Message ${cmd} not recognized`));

  // log('dispatch', cmd, data);
  const res = await dispatch[cmd](data);
  
  if( ackid ){
    postMessage(['ack', ackid, res ]);
  }

}, false);

//## Not implemented consistently
// self.onerror = err =>{
//   console.log("worker on error");
// }


// log('Ready');
