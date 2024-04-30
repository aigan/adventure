const log = console.log.bind(console);
const DEBUG = false;

log('Loading ECS');
// Taking some concepts from ECS and https://blog.mozvr.com/introducing-ecsy/
// And stuff from https://github.com/bvalosek/tiny-ecs

/*
	ct: Component template (property class) Rename to trait schema?
	et: Entity template (object class) Rename to blueprint or archetype?
	ER: Entity template Registry
	CR: Component template Registry
*/


export class World {
  constructor(){
    // super();
    this.entity = new Map();
    this.Time = undefined; // reserved for Time component
    this.id = World.cnt ++;
    World.store[this.id] = this;
  }
  
  static get( id ){
    return World.store[id];
  }
  
  create_entity(){
    const e = new Entity();
    this.entity.set(e.id,e);
    e.world = this.id;
    return e;
  }

  add( et, props ){
		const world = this;
    if( !props ) props = {};
    const e = world.create_entity();

    const base = this.get_by_template(et);
    e.add_base( base );
    e.stamp(props);
    return e;
  }

  get_by_template( et ){
    const world = this;
    const def = ER[et];
    if( !def ) throw Error(`Entity template ${et} missing`);
    if( def.entity_prototype ) return def.entity_prototype;
    const e = world.create_entity();
		e.is_template = et;
		
    for( const bt of def.base || [] ){
      const base = world.get_by_template( bt );
      e.add_base( base );
    }
    
    // TODO: Lock infered hierarchy of 'hypernym' or 'genls'
    if( !CR[et] ) CR[et] = ComponentClass.create( {}, et );
    e.add_component( CR[et] );
    
    const c_def = def.components;
    for( const ct in c_def ){
      if( !CR[ct] ){
        throw Error(`Component ${ct} not in registry`);
      }
      e.add_component( CR[ct], c_def[ct] );
    }

    if( def.label ) e.label = def.label;

    return def.entity_prototype = e;
  }

  get_by_id( id ){
    return this.entity.get( id );
  }

  //## Maybe rename to be similar to nodejs util.inspect
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
    const label = entity.label;

		if( entity.is_template ){
			return `${id} ${entity.is_template} Template`;
		}

		let tags = "";
    for( const child of [entity, ...entity.base]){
      for( const ct in child._component ){
        // log('ct', ct, child._component[ct]);
        if( child._component[ct] instanceof TagComponent ) tags += ':'+ct;
      }
    }

		const desc = entity.get("Description", "short");
		const name = entity.get("Name", "value");
		
    let desig = id;

    if( label ) desig += `#${label}`;
    desig += tags;

		if( label ){}
		else if( name ) desig += ` "${name}"`;
		else if( desc ) desig += ` "${desc}"`;

		return desig;
  }

}

World.cnt = 0;
World.store = [];

/*
label property reserved for debugging or programmatic identifier. Use
the Name component for public description, with extra info for if the
name is common knowledge or not.

base: Inheritence

_component: Hash with this entity components

forks: entities using this as a base

referenced: entities pointing to this

*/

export class Entity {
  constructor(){
    // super();
    this.id = ++ Entity.cnt;
    // this.label = undefined; // private for internal use
    this.base = [];
    this._component = {};
    this.world = undefined,
    this.forks = new Set();
    this.referenced = {};
  }
  
  get( ct, pred ){
    // This will be accessed frequently. Compare with linked lists or
    // maybe bring up frequently accessed properties to the top. Maybe
    // try iteration rather than shift.
    const queue = []; // breadth first tree search
    queue.push( this );
    let c;
    while( queue.length ){
      const e = queue.shift();
      c = e._component[ct];
      //log(`Looking for ${ct} in ${e.id}. Found`, c );
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
    return World.get(this.world).get_by_id( this.get(ct,pred) );
  }
  
  modify( ct, props ){ // modify now or soon
    const _c = this._component;
    if( _c[ct] ){
      return Object.assign( _c[ct], props );
    }

    // log('modify', ct, props);
    const Cc = ComponentClass.component[ct];
    return this.add_component( Cc, props );
  }
  
  component_names(){
    throw "fixme recursion";
    return Object.keys( this._component );
  }
  
  // Generalized version of get()
  bake(){
    const obj = {
      id: this.id,
      referenced: {},
    };

    if( this.label ) obj.label = this.label;
  
    const queue = []; // breadth first tree search
    queue.push( this );
    while( queue.length ){
      const e = queue.shift();
  
      for( const ct in e._component ){
        if( ct in obj ) continue;
        obj[ct] = e._component[ct];
      }
      
      for( const ct in e.referenced ){
        // log('ref', ct);
        if( ct in obj.referenced ) continue;
        if( e.referenced[ct].size > 100 ){
          console.error('referenced for', e);
          throw "To many references for bake";
        }
        obj.referenced[ct] = [... e.referenced[ct].values()];
      }
      
      queue.push( ...(e.base||[]) );
    }
  
    return obj;
  }
  
  add_component( C, values={} ){
    const e = this;
    //log('add component', C);
    const c = new C();
    e._component[ C.name ] = c;

    //log('init', e.id, C.name, 'with', values, 'from', c, 'with schema', C.schema );
    
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
      const type = attr.type;
      if( attr.type === 'map' ){
        if( val ) throw "handle map val";
        c[key] = new Map();
        continue;
      }

      if( !val ){
        c[key] = val;
        continue;
      }
      
      if( ['string','number'].includes(type) ){}
      else {
        if( typeof val === 'string' ){
          // log('set', e.id, C.name, type, key, val );
          val = World.get(e.world).get_by_template( val );
          // log('resolved to', val.id);
        }
        
        if( Array.isArray(val) ){
          const val_in = val;
          val = [];
          for( const target of val_in ){
            //## TODO: verify type
            val.push( target.id );
            target.set_referenced(C.name, e);
          }
        } else {
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
    return c;
  }
  
  set_referenced( ct, e ){
    const ref = this.referenced;
    if( !ref[ ct ] ) ref[ct] = new Set();
		//log("set_referenced", this, ct, e);
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
      if( ct === 'label' ){
        e.label = props.label;
        continue;
      }

      let initvals =  props[ct];
      // log('entity', world.sysdesig(e), 'adding', ct, 'with', initvals );

      if( typeof initvals === 'string' ){
        initvals = {value:initvals};
      }
      
      if( DEBUG ){
        if( !CR[ct] ) throw `Component ${ct} not found`;
      }
      
      e.add_component( CR[ct], initvals );
    }

    return this;
  }
  
  sysdesig(){
    return World.get(this.world).sysdesig(this);
  }

  inspect({seen={}}={}){
    // TODO: add seen for loops. add depth
    if(seen[this.id]) return seen[this.id];
    const baked = this.bake();
    const world = World.get(this.world);
    // log('baked', baked);
    const obj = seen[this.id] = {id:baked.id,referenced:{}};
    if( this.label ) obj.label = this.label;
    for( const ct in baked.referenced ){
      const refs = obj.referenced[ct] = [];
      for( const id of baked.referenced[ct]){
        refs.push( world.get_by_id(id).inspect({seen}) );
      }
    }
    for( const ct in baked ){
      if( ['id','label','referenced'].includes(ct) ) continue;
      const cb = {};
      obj[ct] = cb;
      const c = baked[ct];
      const def = Object.getPrototypeOf(c).constructor.schema;
      for( const pred in c ){
        // log('get entity', ct, pred, def[pred].type, c[pred]);
        if( def[pred] && c[pred] ){
          const type = def[pred].type;
          if( type === 'Entity' || CR[type] ){
            cb[pred] = world.get_by_id(c[pred]).inspect({seen});
            continue;
          } else if( type === 'map'){
            cb[pred] = [...c[pred].values()].map(e => e.inspect({seen}));
            continue;
          }
        }
        cb[pred] = c[pred];
      }
    }
    return obj;
  }

}
Entity.cnt = 0;

export class Component {
  static uniqueness = .6;
  similarTo( target, context ){
    const C = Object.getPrototypeOf( this );
    const weight = C.constructor.uniqueness;
    const def = C.constructor.schema;
    
    // log('similarTo', this, target, context.compare_b, context.compare_a);
    for( const key in target ){
      if( target[key] === this[key] ) continue;

      const type = def[key].type;
      if( type === 'Entity' || CR[type] ){
        const world = context.world;

        if( this[key] === context.compare_b && target[key] === context.compare_a ){
          // log('similarity assumed for sake of comparison here');
          continue;
        }
        
        log('FIXME similarTo', key, type, this[key], context.compare_b, target[key], context.compare_a );
        // cb[pred] = world.get_by_id(c[pred]).inspect({seen});
        // continue;
      }

      return {weight, similarity:0};
    }

    for( const key in this ){
      if(!( key in target )){
        // log('key', key, 'missing in target');
        return {weight, similarity:0};  
      }
    }

    return {weight, similarity:1};
  }
}

/*
	A TagComponent is a component that has no content. It is only used
	for adding a tag to the entity.
 */
export class TagComponent extends Component {
  static uniqueness = .3;
}

export const ComponentClass = {
  component: {},
  create( def, name ){
//    log('should create component', name, def);

    if( ['string','number','map','set'].includes(typeof def)){
      def = {value:{type:def}};
    }
    
    let C;
    if( !Object.keys(def).length ){
      C = class extends TagComponent{};
      C.schema = {}; // Todo. Could just use the same object for all
    } else {
      C = class extends Component{};
      for( const pred in def ){
//        log('def', pred, def[pred]);
        if( typeof def[pred] === 'string' ){
          def[pred] = {type:def[pred]};
        }
      }

      C.schema = def;
    }

    
    if (typeof name === "undefined") throw "Component name missing";
    Object.defineProperty(C, "name", { value: name });
    // log('created comp', Object.getPrototypeOf(C).name );
    // log('created comp', C.name );
    ComponentClass.component[name] = C;
    return C;
  },
  
  register( templates ){
    for( const t in templates ){
      ComponentClass.create( templates[t], t)
    }
  },
  
  add( C ){
    if( DEBUG ){
      const ct = C.name;
      if( !ct ) throw "No name for component class";
      if( CR[ct] ) throw `Component class ${ct} already registred`;
      if( !C.schema ) throw `Schema missing from ${ct}`;
    }

    CR[C.name] = C;
  }
}

const CR = ComponentClass.component;

export const Entity_Templates = {
  template: {},
  register( templates ){
    Object.assign( Entity_Templates.template, templates );
  }  
}

const ER = Entity_Templates.template;
