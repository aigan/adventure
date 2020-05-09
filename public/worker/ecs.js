// log('Loading ECS');
// Taking some concepts from ECS and https://blog.mozvr.com/introducing-ecsy/
// And stuff from https://github.com/bvalosek/tiny-ecs



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
};
