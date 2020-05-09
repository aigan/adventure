// log('Loading world');

importScripts('./ecs.js'); // ECS


const TComponent = {
  // Referrable: {},
  // Parenting: {},
  InLocation: 'Location',
  // Slot: {
  //   template: {default:''},
  //   name: {default:''},
  // },
  Labeled: 'string',
  HasRace: 'Race',
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
      // Referrable: true,
      Labeled: {},
    }
  },
  Race: {
    components: {
      Labeled: {},
    }
  },
  Being: {
    base: ['ObjectPhysical'],
    components: {
      Labeled: {},
    }
  },
  Human: {
    base: ['Being'],
  },
  Player: {
    base: ['Being'],
  },
  Table: {
    base: ['ObjectPhysical'],
    components: {
      Labeled: {},
    }
  }
}


const world = new ECS.World; //## <<<-------
ECS.ComponentClass.register( TComponent );
ECS.Templates.register( TEntity );

const lobby = world.add('Location',{Labeled:'Lobby'})
const desk = world.add('Table',{InLocation:lobby, Labeled:'desk'});

const npc1 = world.add('Human', {
  InLocation:lobby,
  Labeled: 'Catalina',
})

const player = world.add('Player', {
  InLocation:lobby,
})

world.player_enter_location = ()=>{
  const loc = world.entity.get( player.InLocation.value );

  let location_name = loc.Labeled.value;
  postMessage(['header_set', `Location: ${location_name}`]);

  log('you', player)

  let msg = "You see here:\n";
  for( const eid of loc._referenced.InLocation){
    const e = world.entity.get(eid);
    // if( e === player ) continue;
    msg += world.sysdesig(e) + "\n";
  }

  postMessage(['main_add', msg.trimEnd() ]);
}

// log( 'world', world.sysdesig(lobby), lobby );
