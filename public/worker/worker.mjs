//import {world} from "world.mjs";

const log = console.log.bind(console);
log('Loading');

let DEBUG = true;

/*
All imports async here in top worker for catching errors
 */
let world,ECS;
async function init(){
	({world} = await import("./world.mjs"));
	ECS = await import("./ecs.mjs");
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

export function handler_register( label, handler ){
  // log('register handler', label);
  dispatch[label] = handler;
}

addEventListener('message', async e =>{
  let msg = e.data;
  if( typeof msg === 'string') msg = [msg];
  const [cmd, data={}, ackid] = msg;
  log("Recieved message", cmd, data );

	if( cmd === "start" ) return await dispatch.start(data);
	
  if( !dispatch[cmd] ) throw(Error(`Message ${cmd} not recognized`));

  if( !data.from ) data.from = world.Adventure.player;
  if( data.from ) data.world = ECS.World.get(data.from.world);
  if( data.target ) data.target = data.world.entity.get( data.target );
  
  // log('dispatch', cmd, data);
  const res = await dispatch[cmd](data);
  
  if( ackid ){
    postMessage(['ack', ackid, res ]);
  }

}, false);

//## Not implemented consistently
self.onerror = err =>{
   console.log("worker on error");
}


log('Ready');
