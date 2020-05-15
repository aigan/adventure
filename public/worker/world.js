// log('Loading world');

importScripts('./ecs.js'); // ECS


const TComponent = {
  InLocation: 'Location',
  // Slot: {
  //   template: {default:''},
  //   name: {default:''},
  // },
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
    components: {
      // Labeled: {},
    }
  },
  Gender: {},
  Female: {
    base: ['Gender'],
    components: {
      Labeled: 'women',
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
      Description: {short:'a human'},
    },
  },
  
  Player: {
    base: ['Being'],
  },
  Table: {
    base: ['ObjectPhysical'],
    components: {
      Description: {
        short: 'a table',
      },
      // Labeled: {},
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

function tt( strings, ...val_in){
  const values = [];
  for( const entity of val_in ){
    if( !entity ) continue;
    // Just expect enity for now
    const obj = { id: entity.id };
    obj.description_short = world.description_short( entity );
    // values.push( entity.bake() );
    values.push( obj );
  }
  return {strings,values};
}

world.description_short = (e)=>{
  const desc = e.get('Description','short');
  if( desc ) return desc;
  const label = e.get('Labeled').value;
  if( label ) return label;
  log('describe', e);
  return 'stuff';
}

world.observation = ( agent, focus, perspective )=>{
  const observed = { entity: focus };

  if( focus === perspective ){
    observed.here = true;
  }

  const seeing_inloc = [];
  const inloc = focus.referenced.InLocation || [];
  for( const eid of inloc ){
    const e = world.entity.get(eid);
    if( e === player ) continue;
    const obi = world.observation( agent, e, perspective );
    seeing_inloc.push( obi );
  }
  if( seeing_inloc.length ){
    observed.inLocation = seeing_inloc;
  }

  return observed;
}

function observation_text( obs ){
  const lines = [];
  // log('text for', obs);

  if( !obs.here ){
      lines.push( tt`${obs.entity}` );
  }

  if( obs.inLocation ){
    if( obs.here ){
      lines.push( "You see here:" );
    } else {
      const edesig = world.description_short( obs.entity );
      lines.push( `In ${edesig} you see:` );
    }
    for( const subobs of obs.inLocation ){
      lines.push( ... observation_text( subobs ));
      // lines.push( tt`${e}` );
    }
  }
  return lines;
}

world.player_enter_location = ()=>{
  // log('you', player)
  const loc = world.entity.get( player.get('InLocation').value );

  // log('loc', loc);
  let location_name = loc.get('Labeled').value;
  postMessage(['header_set', `Location: ${location_name}`]);

  const observed = world.observation( player, loc, loc );
  log('observed', observed);

  const lines = observation_text( observed );
  
  // log('post', lines);
  postMessage(['main_add', ...lines ]);
}

// log( 'world', world.sysdesig(lobby), lobby );
