const log = console.log.bind(console);
// log('Loading');

const Adventure = {};
let DEBUG = true;

async function init(){
  // importScripts('./segments.js');
  // log('world', typeof world, world);
  importScripts('./world.js');
  importScripts('./dialog.js');

  // log('player', world.sysdesig(player));
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
}

function handler_register( label, handler ){
  // log('register handler', label);
  dispatch[label] = handler;
}

addEventListener('message', async e =>{
  let msg = e.data;
  if( typeof msg === 'string') msg = [msg];
  // console.log("Recieved message", data);
  const [cmd, data={}, ackid] = msg;

  if( !dispatch[cmd] ) throw(Error(`Message ${cmd} not recognized`));

  if( !data.from ) data.from = Adventure.player;
  if( data.from ) data.world = ECS.World.get(data.from.world);
  if( data.target ) data.target = data.world.entity.get( data.target );
  
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
