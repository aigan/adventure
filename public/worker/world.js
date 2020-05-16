// log('Loading world');

importScripts('./ecs.js'); // ECS
importScripts('./observation.js');

const TComponent = {
  InLocation: 'Location',
  // Slot: {
  //   template: {default:''},
  //   name: {default:''},
  // },
  ObservationPattern: 'string',
  Labeled: 'string',
  Description: {
    short: 'string',
  },
  HasRace: 'Race',
  HasGender: 'Gender',
}

const TEntity = {
  ObjectPhysical: {
    components: {
      InLocation: {},
    },
  },
  Location: {
    base: ['ObjectPhysical'],
    components: {
      // Labeled: {},
    }
  },
  Race: {
    components: {
      // Labeled: {},
    }
  },
  Being: {
    base: ['ObjectPhysical'],
  },
  Plant: {
    base: ['ObjectPhysical'],
  },
  Artifact: {
    base: ['ObjectPhysical'],
    components: {
      ObservationPattern: 'Artifact',
    },
  },
  Gender: {},
  Female: {
    base: ['Gender'],
    components: {
      Labeled: 'woman',
    }
  },
  Male: {
    base: ['Gender'],
    components: {
      Labeled: 'man',
    }
  },
  Human: {
    base: ['Being'],
    components: {
      HasGender: {},
      Description: {short:'human'},
      ObservationPattern: 'Human',
    },
  },
  
  Player: {
    base: ['Being'],
  },
  Table: {
    base: ['Artifact'],
    components: {
      Labeled: 'table',
    }
  }
}


const world = new ECS.World; //## <<<-------
ECS.ComponentClass.register( TComponent );
ECS.Templates.register( TEntity );

const lobby = world.add('Location',{Labeled:'Lobby'})
const desk = world.add('Table',{InLocation:lobby, Labeled:'desk'});

const npc1 = world.add('Human', {
  InLocation: lobby,
  Labeled: 'Catalina',
  HasGender: 'Female',
})

// const npc2 = world.add('Human', {
//   InLocation: lobby,
//   Labeled: 'Kendal',
//   HasGender: 'Female',
// })

const player = world.add('Player', {
  InLocation:lobby,
})

// log('npc', npc1);


world.player_enter_location = ()=>{
  // log('you', player)
  const loc = world.entity.get( player.get('InLocation').value );

  // log('loc', loc);
  let location_name = loc.get('Labeled').value;
  postMessage(['header_set', `Location: ${location_name}`]);

  const observed = observation( player, loc, loc );
  log('observed', observed);

  const lines = observation_text( observed );
  
  // log('post', lines);
  postMessage(['main_add', ...lines ]);
}

// log( 'world', world.sysdesig(lobby), lobby );
