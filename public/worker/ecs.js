'use strict';
// log('Loading ECS');
// Taking some concepts from ECS and https://blog.mozvr.com/introducing-ecsy/
// And stuff from https://github.com/bvalosek/tiny-ecs

(()=>{
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

  add( et, props ){
    if( !props ) props = {};
    const e = world.createEntity();

    e.stamp(et, props);
    return e;
  }

  get_by_id( id ){
    return this.entity.get( id );
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
  
  // event( name, data ){}

}

class Entity {
  constructor(){
    // super();
    this.id = ++ Entity.cnt;
    this.name = undefined;
    this._component = {};
    this.referenced = {};
  }
  
  get( ct ){
    return this._component[ct];
  }
  
  modify( ct ){
  }
  
  component_names(){
    return Object.keys( this._component );
  }
  
  bake(){
    const obj = {};
    for( const ct in this._component ){
      obj[ct] = this.get(ct);
      obj.id = this.id;
      obj.name = this.name;
    }
    return obj;
  }
  
  add_component( Component, values ){
    // log('should add', this.id, Component.name, values);
    const c = new Component( this, values );
    this._component[ Component.name ] = c;
    // log('res', this);
  }
  
  set_referenced( ct, e ){
    const ref = this.referenced;
    if( !ref[ ct ] ) ref[ct] = new Set();
    ref[ct].add( e.id );
  }
  
  stamp( et, props ){
    const e = this;
    const def = TR[et];
    if( !def ) throw `Entity template ${et} missing`;

    const bases = def.base || [];
    for( const base of bases ){
      // log('base', et, base);
      e.stamp( base, props );
    }

    if( !CR[et] ) CR[et] = ComponentClass.create( {}, et );
    // log('add_component', et, CR[et]);
    e.add_component( CR[et] );

    const c_def = def.components;
    for( const ct in c_def ){
      const ctval = c_def[ct];
      let initvals =  props[ct];
      // log('entity', world.sysdesig(e), 'adding', et, ct, 'with', ctval, initvals );
      if( ctval === true ){
        e.add_component( CR[ct] );
        continue;
      }
      if( typeof initvals === 'string' ){
        initvals = Object.assign( {}, ctval, {value:initvals} );
      } else if( initvals instanceof ECS.Entity ){
        // keep
      } else {
        initvals = Object.assign( {}, ctval, initvals );
      }
      
      e.add_component( CR[ct], initvals );
    }

    return this;
  }

}
Entity.cnt = 0;

class Component {}

class TagComponent extends Component {}

const ComponentClass = {
  component: {},
  create( def, name ){
    // log('should create component', name, def);

    if( typeof def === 'string'){
      def = {value:{type:def}};
    }
    
    let C;
    if( !Object.keys(def).length ){
      C = class extends TagComponent{};
    } else {
      C = class extends Component{
        constructor( entity, values ){
          super();
          
          // log('init', entity.id, C.name, 'with', values, 'from', this);

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
                  // log('type', type);

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
      }
      C.schema = def;
    }

    
    if (typeof name === "undefined") throw "Component name missing";
    Object.defineProperty(C, "name", { value: name });
    // log('created comp', C.name );
    ComponentClass.component[name] = C;
    return C;
  },
  
  register( templates ){
    for( const t in templates ){
      ComponentClass.create( templates[t], t)
    }
  },
}

const CR = ComponentClass.component;

const Templates = {
  template: {},
  register( templates ){
    Object.assign( Templates.template, templates );
  }  
}

const TR = Templates.template;


// Set in global scope for Webworker
self.ECS = {
  World,
  Entity,
  Component,
  ComponentClass,
  TagComponent,
  Templates,
}


})(); //IIFE
