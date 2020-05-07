log('Loading world');
// Taking some concepts from ECS and https://blog.mozvr.com/introducing-ecsy/
// And stuff from https://github.com/bvalosek/tiny-ecs

importScripts('../vendor/ecsy.js'); // ECSY

const TComponent = {
  Referrable: {},
  // Parenting: {},
  InLocation: { value: {default:-1}},
  // Slot: {
  //   template: {default:''},
  //   name: {default:''},
  // },
  Labeled: {
    singular: {default:''},
    plural: {default:''},
  },
  Race: { value: {default:''}},
}

const TEntity = {
  Location: {
    components: {
      Referrable: true,
      Labeled: {},
    }
  },
  HumanRace: {
    components: {
      Labeled: {singular:'human'},
    }
  },
  Human: {
    components: {
      Race: 'HumanRace',
      InLocation: {},
      Labeled: {},
    }
  }
}

const estore = {};
const c = {};

function define_tag( t ){
  // log('tag', t);
  c[t] = class extends ECSY.TagComponent{};
  Object.defineProperty (c[t], 'name', {value: t});
}

for( const t in TComponent ){
  if( !Object.keys(TComponent[t]).length){
    define_tag( t );
    continue;
  }
  
  // log('component', t);
  c[t] = ECSY.createComponentClass(TComponent[t], t)
}

// for( const t in TEntity ){}

const world = new ECSY.World; //## <<<-------

function entity_add( t, props ){
  const def = TEntity[t];
  if( !def ) throw `Entity template ${t} missing`;
  if( !props ) props = {};
  const e = world.createEntity();
  if( !c[t] ) define_tag( t );
  e.addComponent( c[t] );
  const c_def = def.components;
  for( const ct in c_def ){
    const ctval = c_def[ct];
    log('adding', t, ct, 'with', ctval, props[ct] );
    if( ctval === true ){
      e.addComponent( c[ct] );
      continue;
    }
    if( props[ct] ){
      Object.assign( ctval, props[ct] );
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
    const label_component = entity.getComponent(c.Labeled);
    if( label_component ){
      name = label_component.singular;
    }
  }
  
  if( !name ) return id;
  return `${name}(${id})`;
}

class Registry extends ECSY.System{
  execute(){
    const placedQuery = this.queries.all;
    
    placedQuery.added.forEach( entity=>{
      estore[entity.id] = entity;
      log('addeded', entity.id);
    });

    placedQuery.removed.forEach( entity=>{
      delete estore[entity.id];
      log('removed', entity.id);
    });
  }
}
Registry.queries = {
  all: {
    components: [c.Referrable],
    listen: {
      added: true,
      removed: true,
    }
  }
}

class SystemPlaced extends ECSY.System{
  execute(){
    const placedQuery = this.queries.placed;
    
    placedQuery.added.forEach( entity=>{
      const parent_id = entity.getComponent(c.InLocation).value;
      log('added', sysdesig(entity), 'to', sysdesig(parent_id));
    });

    placedQuery.removed.forEach( entity=>{
      const parent_id = entity.getRemovedComponent(c.InLocation).value;
      log('removed', sysdesig(entity), 'from', sysdesig(parent_id));
    });
  }
}
SystemPlaced.queries = {
  placed: {
    components: [ c.InLocation ],
    listen: {
      added: true,
      removed: true,
    }
  }
}

world.registerSystem(Registry);
world.registerSystem( SystemPlaced );
world.createEntity(); // workaround for avoiding id 0


// const lobby = world.createEntity();
// lobby.addComponent(c.Location);
// lobby.addComponent(c.Referrable);
// lobby.addComponent(c.Labeled, {singular:'Lobby'});

const lobby = entity_add('Location',{Labeled:{singular:'Lobby'}})


const desk = world.createEntity();
desk.name = 'desk';
desk.addComponent(c.InLocation, {value:lobby.id});

// const human = world.createEntity();
// human.addComponent(c.Labeled, {singular:'human'});
// human.addComponent(c.HumanRace);

const human_race = entity_add('HumanRace')


// const npc1 = world.createEntity();
// npc1.addComponent(c.InLocation, {value:lobby.id});
// // npc1.addComponent(c.Slot, {template:'HumanRace', name:'Race'});
// npc1.addComponent(c.Labeled, {singular:'Catalina'});
// npc1.addComponent(c.Labeled, {singular:'Catlin'});
// npc1.addComponent(c.Race, {value:human_race.id})

const npc1 = entity_add('Human', {
  InLocation:lobby,
  Labeled: {singular:'Catalina'},
})

world.execute();
desk.remove();
world.execute();

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
