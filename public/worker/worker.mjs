//import {world} from "world.mjs";

const log = console.log.bind(console);
//log('Loading Worker');

//let DEBUG = true;

/*
	All imports async here in top worker for catching errors
*/
let world,Cosmos;
async function init(){
  const World = await import("./world.mjs");
  const Adventure = World.Adventure;

  Cosmos = await import("./cosmos.mjs");
  const Channel = await import("./channel.mjs");
  await Channel.init_channel(Adventure);

  //const world = Adventure.world;
  //world.player_enter_location();
  postMessage(['header_set', `Potence`]);
  postMessage(['main_add', 'Whirling...' ]);
}

/** @type {{[key: string]: Function}} */
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

/**
 * @param {string} label
 * @param {Function} handler
 */
export function handler_register( label, handler ){
  // log('register handler', label);
  dispatch[label] = handler;
}

addEventListener('message', async e =>{
  let msg = e.data;
  if( typeof msg === 'string') msg = [msg];
  const [cmd, data={}, ackid] = msg;
  //log("Recieved message", cmd, data );

	if( cmd === "start" ) return await dispatch.start();
	
  if( !dispatch[cmd] ) throw(Error(`Message ${cmd} not recognized`));

  //if( !data.from ) data.from = world.Adventure.player;
  //if( data.from ) data.world = DB.World.get(data.from._world);
  //if( data.target ) data.target = data.world.get_entity_current( data.target );
  
  // log('dispatch', cmd, data);
  const res = await dispatch[cmd](data);
  
  if( ackid ){
    postMessage(['ack', ackid, res ]);
  }

}, false);

//## Not implemented consistently
self.onerror = _err =>{
  console.log("worker on error");
}

//log('Ready');
