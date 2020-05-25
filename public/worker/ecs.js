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
  create_entity(){
    const e = new Entity();
    this.entity.set(e.id,e);
    e.world = this;
    return e;
  }

  add( et, props ){
    if( !props ) props = {};
    const e = world.create_entity();

    const base = this.get_by_template(et);
    e.add_base( base );
    e.stamp(props);
    return e;
  }

  get_by_template( et ){
    const world = this;
    const def = TR[et];
    if( !def ) throw Error(`Entity template ${et} missing`);
    if( def.entity_prototype ) return def.entity_prototype;
    const e = world.create_entity();

    for( const bt of def.base || [] ){
      const base = world.get_by_template( bt );
      e.add_base( base );
    }
    
    if( !CR[et] ) CR[et] = ComponentClass.create( {}, et );
    e.add_component( CR[et] );
    
    const c_def = def.components;
    for( const ct in c_def ){
      if( !CR[ct] ){
        throw Error(`Component ${ct} not in registry`);
      }
      e.add_component( CR[ct], c_def[ct] );
    }

    return def.entity_prototype = e;
  }

  get_by_id( id ){
    return this.entity.get( id );
  }

  //## Maby rename to be similar to nodejs util.inspect
  sysdesig( entity ){
    let id;
    if( typeof entity === 'number' ){
      id = entity;
      entity = this.entity.get(id);
      if( !entity ) return `${id}<deleted>`;
    }
    if( !entity ) return "<deleted>";

    // return entity.bake();
    
    id = entity.id;
    let name = entity.name;
    if( !name ){
      name =  entity.get('Labeled','value');
    }

    let tags = "";
    for( const child of [entity, ...entity.base]){
      for( const ct in child._component ){
        // log('ct', ct, child._component[ct]);
        if( child._component[ct] instanceof TagComponent ) tags += ':'+ct;
      }
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
    this.name = undefined;
    this.base = [];
    this._component = {};
    this.world = undefined,
    this.forks = new Set();
    this.referenced = {};
  }
  
  get( ct, pred ){
    // This will be accessed frequently. Compare with linked lists or maby bring
    // up frequently accessed properties to the top. Maby try iteration rather
    // than shift.
    const queue = []; // breadth first tree search
    queue.push( this );
    let c;
    while( queue.length ){
      const e = queue.shift();
      c = e._component[ct];
      // log(`Looking for ${ct} in ${e.id}. Found`, c );
      if( c ) break;
      queue.push( ...(e.base||[]) );
    }
    
    if( !c ){
      return null;
      // console.error('For entity', this);
      // throw Error(`Component ${ct} not found in entity`);  
    }
    // log('returning found', c, Object.getPrototypeOf(c).constructor.schema);
    if( pred ) return c[pred];
    return c;
  }

  getEntity( ct, pred='value' ){
    return this.world.get_by_id( this.get(ct,pred) );
  }
  
  modify( ct ){
  }
  
  component_names(){
    throw "fixme recursion";
    return Object.keys( this._component );
  }
  
  // Generalized version of get()
  bake(){
    const obj = {
      id: this.id,
      name: this.name,
    };
  
    const queue = []; // breadth first tree search
    queue.push( this );
    while( queue.length ){
      const e = queue.shift();
  
      for( const ct in e._component ){
        if( ct in obj ) continue;
        obj[ct] = e._component[ct];
      }
      queue.push( ...(e.base||[]) );
    }
  
    return obj;
  }
  
  add_component( C, values={} ){
    const e = this;
    const c = new C();
    e._component[ C.name ] = c;

    // log('init', e.id, C.name, 'with', values, 'from', c, 'with schema', C.schema );
    
    // Convert singulars
    if( typeof values === 'string' ){
      values = {value:values};
    }
    
    // Convert entity values to id
    if( values.id ){
      values = {value:values}
    }
    
    const def = C.schema;
    for( const key in def ){
      let val = values[key];
      const attr = def[key];
      if( val ){
        const type = attr.type;
        if( ['string','number'].includes(type) ){}
        else {
          if( typeof val === 'string' ){
            // log('set', e.id, C.name, key, val );
            val = e.world.get_by_template( val );
            // log('resolved to', val.id);
          }
          //## TODO: verify type
          const target = val;
          val = val.id;
          
          // log('set backref for', target, target.set_referenced);
          target.set_referenced(C.name, e);
        }
      }
      
      
      // log('set', key, val, attr);
      c[key] = val;
    }

    // log('res', this);
  }
  
  set_referenced( ct, e ){
    const ref = this.referenced;
    if( !ref[ ct ] ) ref[ct] = new Set();
    ref[ct].add( e.id );
  }
  
  add_base( base ){
    const e = this;
    if( base.forks.has( e )) return e;
    base.forks.add( e );
    e.base.push( base );
  }
  
  stamp( props ){
    const e = this;

    for( const ct in props ){

      let initvals =  props[ct];
      // log('entity', world.sysdesig(e), 'adding', ct, 'with', initvals );

      if( typeof initvals === 'string' ){
        initvals = {value:initvals};
      }
      
      e.add_component( CR[ct], initvals );
    }

    return this;
  }
  
  sysdesig(){
    return this.world.sysdesig(this);
  }

}
Entity.cnt = 0;

class Component {}

class TagComponent extends Component {}

const ComponentClass = {
  component: {},
  create( def, name ){
    // log('should create component', name, def);

    if( ['string','number'].includes(typeof def)){
      def = {value:{type:def}};
    }
    
    let C;
    if( !Object.keys(def).length ){
      C = class extends TagComponent{};
    } else {
      C = class extends Component{};
      for( const pred in def ){
        // log('def', pred, def[pred]);
        if( typeof def[pred] === 'string' ){
          def[pred] = {type:def[pred]};
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
