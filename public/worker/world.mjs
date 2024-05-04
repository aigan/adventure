import * as DB from "./db.mjs";
import {observation,observation_text} from "./observation.mjs";
import Time from "./time.mjs";
import * as Ponder from "./ponder.mjs";

const log = console.log.bind(console);

const trait_defs = {
  InLocation: 'Location',
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

const archetypes = {
  ObjectPhysical: {
    traits: {
      InLocation: {},
    },
  },
  Situation: {
    traits:{
      InLocation: {},
    },
  },
  MissingPerson: {
    base: ['Situation'], // Problem
    traits: {
      IncidentFacts: {},
      Time: {},
      Description: {short:'missing person incident'},
    },
    //behaviors
  },
  Thought: {
    traits: {
      ThoughtAbout: {},
      ThoughtContent: {},
    },
  },
  // Problem: {
  //   base: ['Thought'],
  //   traits: {
  //     KnowledgeAbout: {},
  //   },
  // },
  Location: {
    base: ['ObjectPhysical'],
    traits: {
    }
  },
  Race: {
    traits: {
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
    traits: {
      ObservationPattern: 'Artifact',
    },
  },
  Gender: {},
  Female: {
    base: ['Gender'],
    traits: {
      Description: {short:'woman'},
    }
  },
  Male: {
    base: ['Gender'],
    traits: {
      Description: {short:'man'},
    }
  },
  Human: {
    base: ['Being'],
    traits: {
      HasGender: {},
      Description: {short:'human'},
      ObservationPattern: 'Human',
      Attention: {},
    },
  },
  Player: {
    base: ['Being'],
    traits: {
      HasThoughts: {},
    },
  },
  Table: {
    base: ['Artifact'],
    traits: {
      Description: {short:'table'},
    }
  }
}


const Adventure = {};

export const world = new DB.World; //## <<<-------
world.Time = {epoch:Time.from(1001,2,1,12,15)};
world.Adventure = Adventure;
DB.Trait_def.register( trait_defs );
DB.Entity_Archetypes.register( archetypes );

const lobby = world.add('Location',{
  Description: {short:'Lobby'},
});

const player = Adventure.player = world.add('Player', {
  InLocation: lobby,
})

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
  label: "bride",
  HasGender: 'Female',
});

const investigator = world.add('Human', {
  label: 'investigator',
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

// This will create a virtual human entity that exists as a though for
// the player.
const mem_player_emvin = Ponder.remember( player, emvin, {
  Human: {},
  Name: 'Emvin',
  HasGender: 'Male',
});

/*

// This will creat a virtual missin person entity that exists as a
// thought for the player
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

*/

function inspect( obj ){
  const e = obj.versions ? obj.versions.slice(-1)[0] : obj;
  log('👁️', world.sysdesig(obj), e.bake());
}

//inspect( player );
//log("player", Adventure.player, world);
//log("world", world);
//log("find", world.get_by_archetype("Player"));
//log("ER", DB.Entity_Archetypes.archetype);
//inspect(world.get_by_id(7));


  for( const eh of world.entity_history.values() ){
		if( eh.is_archetype ) continue;
		//inspect( eh );
  }


// log( "today", Time.format( world.Time ));
// log( "target", Time.format( missing1 ) );
// log( Time.designation( missing1 ) );


world.player_enter_location = ()=>{
  //log('you', Adventure.player)

  const loc = Adventure.player.get('InLocation').entity();

  //const loc = world.entity.get( Adventure.player.get('InLocation').value );

  //log('loc', loc);
  let location_name = loc.get('Description','short');
  postMessage(['header_set', `Location: ${location_name}`]);

  const observed = observation( Adventure.player, loc, loc );
  // log('observed', observed);

  const lines = observation_text( observed );
  
  // log('post', lines);
  postMessage(['main_add', ...lines ]);
}

// log( 'world', world.sysdesig(lobby), lobby );
