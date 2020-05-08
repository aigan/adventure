log('Loading world');
// Taking some concepts from ECS and https://blog.mozvr.com/introducing-ecsy/
// And stuff from https://github.com/bvalosek/tiny-ecs

importScripts('./ecs.js'); // ECSY

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
  }
}


const world = new ECS.World; //## <<<-------

const estore = {};
const c = {};

// function define_tag( t ){
//   // log('tag', t);
//   c[t] = class extends ECS.TagComponent{};
//   Object.defineProperty (c[t], 'name', {value: t});
// }

for( const t in TComponent ){
  // if( !Object.keys(TComponent[t]).length){
  //   define_tag( t );
  //   continue;
  // }
  
  // log('component', t);
  c[t] = ECS.createComponentClass(TComponent[t], t)
}

// for( const t in TEntity ){}

function entity_add( t, props ){
  const def = TEntity[t];
  if( !def ) throw `Entity template ${t} missing`;
  if( !props ) props = {};
  const e = world.createEntity();
  if( !c[t] ) c[t] = ECS.createComponentClass( {}, t );
  // log('addComponent', t, c[t]);
  e.addComponent( c[t] );
  const c_def = def.components;
  for( const ct in c_def ){
    const ctval = c_def[ct];
    // log('entity', sysdesig(e), 'adding', t, ct, 'with', ctval, props[ct] );
    if( ctval === true ){
      e.addComponent( c[ct] );
      continue;
    }
    let initvals =  props[ct];
    if( initvals ){
      if( typeof initvals === 'string' ){
        initvals = {value:initvals}
      }
      Object.assign( ctval, initvals );
    }
    e.addComponent( c[ct], ctval );
  }
  return e;
}

function sysdesig( entity ){
  let id;
  if( typeof entity === 'number' ){
    id = entity;
    entity = estore[id];
    if( !entity ) return id;
  }
  if( !entity ) return "<deleted>";
  id = entity.id;
  let name = entity.name;
  if( !name ){
    const label_component = entity[c.Labeled];
    if( label_component ){
      name = label_component.singular;
    }
  }
  
  if( !name ) return id;
  return `${name}(${id})`;
}



const lobby = entity_add('Location',{Labeled:'Lobby'})

// const desk = world.createEntity();
// desk.name = 'desk';
// desk.addComponent(c.InLocation, lobby);


// const human_race = entity_add('Race', {Labeled:'human'})

const npc1 = entity_add('Human', {
  InLocation:lobby,
  Labeled: 'Catalina',
})

// world.execute();
// desk.remove();
// world.execute();

log( 'estore', npc1 );



//## OO version: Hero extends Actor. Monster extends Actor. Monster has Breed.
// class Action has method perform() returns ActionResult.

//## Parent/child: Parenting{Parent}, Aiming, Aligning, Tracking, Interposing, Billboarding, Grabbing{Grip/Grab placement}

//#### Templates based on https://www.ultimate-adom.com/index.php/2018/10/25/making-ultimate-adom-moddable-by-using-entity-component-systems/
// ADOM core concepts: tiles, features, beings, items
// ADOM entity: Statistics, Brain

const ADOM_templates = {
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
  HumanoidHand: {
    baseTemplates: ['Hand'],
    components: [
      {
        BodyPartContentSlot: {
          permissableTypes: ['MeleeWeapon', 'Shield'],
          statusWhenContained: 'Wielded',
          canFumble: true,
          longStorageMessage: "HumanoidHandLongStorageMessage",
          longCurrentlyStoredMessage: "HJumanoidHandLongCurrentlyStoredMessage",
        },
      },
    ],
  },
  HumanRace: {
    baseTemplates: ['Humanoid'],
    components: [
      {
        labeled: {
          singular: 'HumanRaceSingularName',
          plural: 'HumanRacePluralName',
        },
      },
      {Strength:"=2d3+7"},
      {Dexterity:"=2d2+7"},
      {RacialAttribute:'HumanRacialAttribute'},
    ],
    types: ['Race'],
  },
  Human: {
    baseTemplates: ['Being'],
    slots: {
      Race: 'HumanRace',
    },
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
  },
  Player: {
    baseTemplates: ['Human'],
    components: ['controlled_by_ui'],
    slots: {
      Profession: 'Adventurer',
    },
  },
};
