// log('Loading world');

importScripts('./ecs.js'); // ECS
importScripts('./observation.js');
importScripts('./Time.js');

const TComponent = {
  InLocation: 'Location',
  // Slot: {
  //   template: {default:''},
  //   name: {default:''},
  // },
  ObservationPattern: 'string',

  //### https://tei-c.org/release/doc/tei-p5-doc/en/html/ND.html
  //### http://xmlns.com/foaf/spec/#term_name
  Name: {
    value: 'string', // most general unspecific variant of name
  },

  Description: {
    short: 'string', // commonly known designation or brief description
  },
  HasRace: 'Race',
  HasGender: 'Gender',
  HasThoughts: {
    about: 'map',
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
  ThoughtAbout: 'Entity',
  ThoughtContent: 'Entity',
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
      Description: {short:'missing person incident'},
    },
  },
  Thought: {
    components: {
      ThoughtAbout: {},
      ThoughtContent: {},
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
      Description: {short:'woman'},
    }
  },
  Male: {
    base: ['Gender'],
    components: {
      Description: {short:'man'},
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
      Description: {short:'table'},
    }
  }
}


const world = new ECS.World; //## <<<-------
world.Time = {epoch:Time.from(1001,2,1,12,15)};
ECS.ComponentClass.register( TComponent );
ECS.Templates.register( TEntity );

const lobby = world.add('Location',{
  Description: {short:'Lobby'},
});

const desk = world.add('Table',{
  InLocation:lobby,
  Description: {short:'Desk'},
});

const catalina = world.add('Human', {
  InLocation: lobby,
  Name: 'Catalina',
  HasGender: 'Female',
})

const bride = world.add('Human', {
  HasGender: 'Female',
});

const investigator = world.add('Human', {
});

const missing1 = world.add('MissingPerson', {
  IncidentFacts: {
    victim: bride,
  },
  Time: {
    epoch: Time.from(1001,1,14),
    precision: Time.DAY,
  }
});

const emvin = world.add('Human', {
  Name: 'Emvin',
  HasGender: 'Male',
});

const missing2 = world.add('MissingPerson', {
  IncidentFacts: {
    victim: emvin,
  },
  Time: {
    epoch: Time.from(1001,2,1,11),
    precision: Time.HOUR,
  }
});

const player = Adventure.player = world.add('Player', {
  InLocation: lobby,
})

// const mem_catalina_emvin = Ponder.remember( catalina, emvin, {
//   Human: {},
//   HasGender: 'Male',
// });

const mem_player_emvin = Ponder.remember( player, emvin, {
  Human: {},
  Name: 'Emvin',
  HasGender: 'Male',
});

Ponder.remember( player, missing2, {
  MissingPerson: {},
  IncidentFacts: {
    victim: mem_player_emvin,
  },
  Time: {
    epoch: Time.from(1001,2,1,11),
    precision: Time.HOUR,
  }
});

const mem_catalina_bride = Ponder.remember( catalina, bride, {
  Human: {},
  HasGender: 'Female',
});

Ponder.remember( catalina, missing1, {
  MissingPerson: {},
  IncidentFacts: {
    victim: mem_catalina_bride,
  },
  Time: {
    epoch: Time.from(1001,1,14),
    precision: Time.DAY*3,
  }
});


function inspect( entity ){
  log('👁️', world.sysdesig(entity), entity.bake());
}

inspect( player );

// log( "today", Time.format( world.Time ));
// log( "target", Time.format( missing1 ) );
// log( Time.designation( missing1 ) );


world.player_enter_location = ()=>{
  // log('you', player)
  const loc = world.entity.get( Adventure.player.get('InLocation').value );

  // log('loc', loc);
  let location_name = loc.get('Description','short');
  postMessage(['header_set', `Location: ${location_name}`]);

  const observed = observation( Adventure.player, loc, loc );
  // log('observed', observed);

  const lines = observation_text( observed );
  
  // log('post', lines);
  postMessage(['main_add', ...lines ]);
}

// log( 'world', world.sysdesig(lobby), lobby );
