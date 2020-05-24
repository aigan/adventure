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
  HasThoughts: {
    list: 'array',
  },
  IncidentFacts: {
    victim: 'Being',
    offender: 'Thing',
    plaintiff: 'Being',
  },
  Time: {
    epoch: 'number',
    precision: 'number',
  },
}

const TEntity = {
  ObjectPhysical: {
    components: {
      InLocation: {},
    },
  },
  Situation: {
    components:{
      InLocation: {},
    },
  },
  Kidnapping: {
    base: ['Situation'],
    components: {
      IncidentFacts: {},
      Time: {},
    },
  },
  Thought: {},
  SituationThought: {
    base: ['Thought']
  },
  IncidentThought: {
    base: ['SituationThought'],
    components: {
      Incident: {},
    },
  },
  Location: {
    base: ['ObjectPhysical'],
    components: {
    }
  },
  Race: {
    components: {
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
    components: {
      HasThoughts: {},
    },
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

const ted = world.add('Human', {
  Labeled: 'Emvin',
  HasGender: 'Male',
});

const kidnapping = world.add('Kidnapping', {
  IncidentFacts: {
    victim: ted,
  },
  Time: {
    epoch: Date.UTC(2021, 2, 1, 11),
    precision: 1000*60*60,
  }
});

const player = world.add('Player', {
  InLocation: lobby,
  // HasThoughts: {
  //   list: [{
  //   }],
  // },
})

function inspect( entity ){
  log('👁️', world.sysdesig(entity), entity.bake());
}

inspect( kidnapping );



world.player_enter_location = ()=>{
  // log('you', player)
  const loc = world.entity.get( player.get('InLocation').value );

  // log('loc', loc);
  let location_name = loc.get('Labeled').value;
  postMessage(['header_set', `Location: ${location_name}`]);

  const observed = observation( player, loc, loc );
  // log('observed', observed);

  const lines = observation_text( observed );
  
  // log('post', lines);
  postMessage(['main_add', ...lines ]);
}

// log( 'world', world.sysdesig(lobby), lobby );
