// log('Loading ECS');
// Taking some concepts from ECS and https://blog.mozvr.com/introducing-ecsy/
// And stuff from https://github.com/bvalosek/tiny-ecs

const component_registry = {};
const CR = component_registry;
const entity_templates = {};

class World {
  constructor(){
    // super();
    this.entity = new Map();
  }
  createEntity(){
    const e = new Entity();
    this.entity.set(e.id,e);
    return e;
  }

  add( t, props ){
    const def = entity_templates[t];
    if( !def ) throw `Entity template ${t} missing`;
    if( !props ) props = {};
    const e = world.createEntity();
    if( !CR[t] ) CR[t] = ECS.createComponentClass( {}, t );
    // log('addComponent', t, CR[t]);
    e.addComponent( CR[t] );
    const c_def = def.components;
    for( const ct in c_def ){
      let ctval = c_def[ct];
      let initvals =  props[ct];
      // log('entity', world.sysdesig(e), 'adding', t, ct, 'with', ctval, initvals );
      if( ctval === true ){
        e.addComponent( CR[ct] );
        continue;
      }
      if( initvals ){
        if( typeof initvals === 'string' ){
          initvals = {value:initvals}
          Object.assign( ctval, initvals );
        } else if( initvals instanceof ECS.Entity ){
          ctval = initvals;
        } else {
          Object.assign( ctval, initvals );
        }
      }
      e.addComponent( CR[ct], ctval );
    }
    return e;
  }


  sysdesig( entity ){
    let id;
    if( typeof entity === 'number' ){
      id = entity;
      entity = this.entity.get(id);
      if( !entity ) return `${id}<deleted>`;
    }
    if( !entity ) return "<deleted>";
    id = entity.id;
    let name = entity.name;
    if( !name ){
      const label_component = entity.Labeled;
      if( label_component ){
        name = label_component.value;
      }
    }

    let tags = "";
    for( const ct in entity ){
      if( entity[ct] instanceof TagComponent )   tags += ':'+ct;
    }
    
    let desig = id;
    if( name ) desig += `(${name})`;
    desig += tags;
    return desig;
  }

}

class Entity {
  constructor(){
    // super();
    this.id = ++ Entity.cnt;
  }
  
  addComponent( Component, values ){
    // log('should add', this.id, Component.name, values);
    const c = new Component( this, values );
    this[ Component.name ] = c;
    // log('res', this);
  }
  
  set_referenced( ct, e ){
    if( !this._referenced ) this._referenced = {};
    const ref = this._referenced;
    if( !ref[ ct ] ) ref[ct] = new Set();
    ref[ct].add( e.id );
  }

}
Entity.cnt = 0;

class Component {}

class TagComponent extends Component {}

function createComponentClass( def, name ){
  // log('should create component', name, def);

  if( typeof def === 'string'){
    def = {value:{type:def}};
  }
  
  let C;
  if( !Object.keys(def).length ){
    C = class extends TagComponent{};
  } else {
    C = function( entity, values ){
      // log('init', entity.id, C.name, 'with', values);

      // Convert singulars
      if( typeof values === 'string' ){
        values = {value:values};
      }
      
      // Convert entity values to id
      if( values.id ){
        values = {value:values}
      }

      for( const key in def ){
        let val = values[key];
        const attr = def[key];
        if( val ){
          const type = attr.type;
          if( type === 'string' ){}
          else {
            if( typeof val === 'string' ){
              throw `Component ${C.name} ${key} expects entity. Got ${val}`;
            }
            //## TODO: verify type
            const target = val;
            val = val.id;
            
            // log('set backref for', target, target.set_referenced);
            target.set_referenced(C.name, entity);
          }
        }


        // log('set', key, val, attr);
        this[key] = val;
      }
    }
    C.prototype.schema = def;
  }

  if (typeof name !== "undefined") {
    Object.defineProperty(C, "name", { value: name });
  }

  // log('created comp', C.name );
  return C;
}

const ECS = {
  World,
  Entity,
  Component,
  TagComponent,
  createComponentClass,
  component_registry,
  entity_templates,
};
