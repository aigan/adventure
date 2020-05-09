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
  Location: {
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
  Human: {
    components: {
      // HasRace: 'HumanRace',
      InLocation: {},
      Labeled: {},
    }
  },
  Player: {
    components: {
      InLocation: {},
      Labeled: {},
    }
  }
}


const world = new ECS.World; //## <<<-------

for( const t in TComponent ){
  ECS.component_registry[t] = ECS.createComponentClass(TComponent[t], t)
}

Object.assign( ECS.entity_templates, TEntity );

const lobby = world.add('Location',{Labeled:'Lobby'})

// const desk = world.createEntity();
// desk.name = 'desk';
// desk.addComponent(c.InLocation, lobby);


// const human_race = world.add('Race', {Labeled:'human'})

const npc1 = world.add('Human', {
  InLocation:lobby,
  Labeled: 'Catalina',
})

const player = world.add('Player', {
  InLocation:lobby,
})

log( 'estore', world.sysdesig(lobby), lobby );
