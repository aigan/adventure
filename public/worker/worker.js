console.log('Loading');

//#### Templates based on https://www.ultimate-adom.com/index.php/2018/10/25/making-ultimate-adom-moddable-by-using-entity-component-systems/

const templates = {
  Thing: {
    components: [],
  },
  Actor: {
    baseTempaltes: ['Thing'],
    components: [],
  },
  Location: {
    baseTempaltes: ['Thing'],
    components: [],
  },
  Item: {
    baseTemplate: ['Thing'],
    components: [],
  },
  Being: {
    baseTemplates: ['Actor'],
    components: [],
  },
  Human: {
    baseTemplates: ['Being'],
    components: [
      {defaultEquipment: []},
      {
        labeled: {
          singular: 'HumanSingularName',
          plural: 'HumanPluralName',
        },
      },
      {
        gendered: ['Male','Female'],
      },
      {
        slot: {
          template: 'HumanRace',
          name: 'Race',
        },
      },
      {
        Description: {
          verbosity: 'short',
          description: ['HumanDescription0', 'HumanDescription1'],
        },
      },
      {
        capability: "",
      },
      {
        triggeredEffect: {
          trigger: "",
          effects: [],
        }
      }
    ],
    types: ['Race'],
  },
  Player: {
    baseTemplates: ['Human'],
    components: ['controlled_by_ui'],
  },
};

const store = {};

async function init(){
  console.log('import world');
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


console.log('Ready');
