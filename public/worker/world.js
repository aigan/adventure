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
  IncidentFacts: { // Problem
    victim: 'Being',
    offender: 'Thing',
    plaintiff: 'Being',
  },
  Time: {
    epoch: 'number',
    precision: 'number',
  },
  KnowledgeAbout: {
    list: 'array',
  },
  Attention: {
    focus: 'ObjectPhysical',
  }
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
  MissingPerson: {
    base: ['Situation'], // Problem
    components: {
      IncidentFacts: {},
      Time: {},
    },
  },
  Thought: {
    components: {
      KnowledgeAbout: {},
    },
  },
  // Problem: {
  //   base: ['Thought'],
  //   components: {
  //     KnowledgeAbout: {},
  //   },
  // },
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
      Attention: {},
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

const bride = world.add('Human', {
  HasGender: 'Female'
});

const investigator = world.add('Human', {
});

const missing1 = world.add('MissingPerson', {
  IncidentFacts: {
    victim: bride,
  },
  Time: {
    epoch: Date.UTC(2001,1,14),
    precision: 1000*60*60*24*3,
  }
});

const emvin = world.add('Human', {
  Labeled: 'Emvin',
  HasGender: 'Male',
});

const missing2 = world.add('MissingPerson', {
  IncidentFacts: {
    victim: emvin,
  },
  Time: {
    epoch: Date.UTC(2001, 2, 1, 11),
    precision: 1000*60*60,
  }
});

const quest1 = world.add('Thought', {
  KnowledgeAbout: missing2,
  IncidentFacts: {
    victim: emvin,
  },
  Time: {
    epoch: Date.UTC(2001, 2, 1, 11),
    precision: 1000*60*60,
  }
});

const knowsEmvin = world.add('Thought', {
  KnowledgeAbout: emvin,
  Labeled: 'Emvin',
  HasGender: 'Male',
});

const player = Adventure.player = world.add('Player', {
  InLocation: lobby,
  HasThoughts: {
    list: [
      quest1,
      knowsEmvin,
    ],
  },
})



function inspect( entity ){
  log('👁️', world.sysdesig(entity), entity.bake());
}


world.player_enter_location = ()=>{
  // log('you', player)
  const loc = world.entity.get( Adventure.player.get('InLocation').value );

  // log('loc', loc);
  let location_name = loc.get('Labeled').value;
  postMessage(['header_set', `Location: ${location_name}`]);

  const observed = observation( Adventure.player, loc, loc );
  // log('observed', observed);

  const lines = observation_text( observed );
  
  // log('post', lines);
  postMessage(['main_add', ...lines ]);
}

// log( 'world', world.sysdesig(lobby), lobby );
