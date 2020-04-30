// console.log('Loading');

const player = {};

const locs = {
  lobby: {
    title: "Lobby",
  }
}

const actors = {
  marjorie: {
    name: "Marjorie",
    location: locs.lobby,
  }
}

const dispatch = {
  ping(){
    self.postMessage('pong');
  },
  start(){
    self.postMessage(['header_set', "Location: Lobby"]);
    self.postMessage(['main_add', "Welcome"])
  }
};

self.addEventListener('message', e =>{
  let data = e.data;
  if( typeof data === 'string') data = [data];
  // console.log("Recieved message", data);
  const cmd = data.shift();

  if( dispatch[cmd] ) return dispatch[cmd](data);

  throw(Error(`Message ${cmd} not recognized`));
}, false);

// console.log('Ready');
