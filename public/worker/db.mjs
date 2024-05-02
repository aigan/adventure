const log = console.log.bind(console);
const DEBUG = false;

log('Loading DB');
// Taking some concepts from ECS and https://blog.mozvr.com/introducing-ecsy/
// And stuff from https://github.com/bvalosek/tiny-ecs

/*
	trait_def: trait definition (property class)
	archetype: Entity archetype (object class)
	ER: Entity archetype Registry
	TR: Trait definition Registry
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

  add( archetype, props ){
		const world = this;
    if( !props ) props = {};
    const e = world.create_entity();

    const base = this.get_by_archetype(archetype);
    e.add_base( base );
    e.stamp(props);
    return e;
  }

  get_by_archetype( archetype ){
    const world = this;
    const def = ER[archetype];
    if( !def ) throw Error(`Entity archetype ${archetype} missing`);
    if( def.entity_prototype ) return def.entity_prototype;
    const e = world.create_entity();
		e.is_archetype = archetype;
		
    for( const bt of def.base || [] ){
      const base = world.get_by_archetype( bt );
      e.add_base( base );
    }
    
    // TODO: Lock infered hierarchy of 'hypernym' or 'genls'
    if( !TR[archetype] ) TR[archetype] = Trait_def.create( {}, archetype );
    e.add_trait( TR[archetype] );
    
    const c_def = def.traits;
    for( const trait_def in c_def ){
      if( !TR[trait_def] ){
        throw Error(`Trait ${trait_def} not in registry`);
      }
      e.add_trait( TR[trait_def], c_def[trait_def] );
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

		if( entity.is_archetype ){
			return `${id} ${entity.is_archetype} Archetype`;
		}

		let tags = "";
    for( const child of [entity, ...entity.base]){
      for( const trait in child._trait ){
        // log('trait', trait, child._trait[trait]);
        if( child._trait[trait] instanceof Tag ) tags += ':'+trait;
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
the Name trait for public description, with extra info for if the
name is common knowledge or not.

base: Inheritence

_trait: Hash with this entity traits

forks: entities using this as a base

referenced: entities pointing to this

*/

export class Entity {
  constructor(){
    // super();
    this.id = ++ Entity.cnt;
    // this.label = undefined; // private for internal use
    this.base = [];
    this._trait = {};
    this.world = undefined,
    this.forks = new Set();
    this.referenced = {};
  }
  
  get( trait, pred ){
    // This will be accessed frequently. Compare with linked lists or
    // maybe bring up frequently accessed properties to the top. Maybe
    // try iteration rather than shift.
    const queue = []; // breadth first tree search
    queue.push( this );
    let c;
    while( queue.length ){
      const e = queue.shift();
      c = e._trait[trait];
      //log(`Looking for ${trait} in ${e.id}. Found`, c );
      if( c ) break;
      queue.push( ...(e.base||[]) );
    }
    
    if( !c ){
      return null;
      // console.error('For entity', this);
      // throw Error(`Trait ${trait} not found in entity`);  
    }
    // log('returning found', c, Object.getPrototypeOf(c).constructor.schema);
    if( pred ) return c[pred];
    return c;
  }

  getEntity( trait, pred='value' ){
    return World.get(this.world).get_by_id( this.get(trait,pred) );
  }
  
  modify( trait, props ){ // modify now or soon
    const _c = this._trait;
    if( _c[trait] ){
      return Object.assign( _c[trait], props );
    }

    // log('modify', trait, props);
    const Cc = Trait_def.definition[trait];
    return this.add_trait( Cc, props );
  }
  
  trait_names(){
    throw "fixme recursion";
    return Object.keys( this._trait );
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
  
      for( const trait in e._trait ){
        if( trait in obj ) continue;
        obj[trait] = e._trait[trait];
      }
      
      for( const trait in e.referenced ){
        // log('ref', trait);
        if( trait in obj.referenced ) continue;
        if( e.referenced[trait].size > 100 ){
          console.error('referenced for', e);
          throw "To many references for bake";
        }
        obj.referenced[trait] = [... e.referenced[trait].values()];
      }
      
      queue.push( ...(e.base||[]) );
    }
  
    return obj;
  }
  
  add_trait( C, values={} ){
    const e = this;
    //log('add trait', C);
    const c = new C();
    e._trait[ C.name ] = c;

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
          val = World.get(e.world).get_by_archetype( val );
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
  
  set_referenced( trait, e ){
    const ref = this.referenced;
    if( !ref[ trait ] ) ref[trait] = new Set();
		//log("set_referenced", this, trait, e);
    ref[trait].add( e.id );
  }
  
  add_base( base ){
    const e = this;
    if( base.forks.has( e )) return e;
    base.forks.add( e );
    e.base.push( base );
  }
  
  stamp( props ){
    const e = this;

    for( const trait in props ){
      if( trait === 'label' ){
        e.label = props.label;
        continue;
      }

      let initvals =  props[trait];
      // log('entity', world.sysdesig(e), 'adding', trait, 'with', initvals );

      if( typeof initvals === 'string' ){
        initvals = {value:initvals};
      }
      
      if( DEBUG ){
        if( !TR[trait] ) throw `Trait ${trait} not found`;
      }
      
      e.add_trait( TR[trait], initvals );
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
    for( const trait in baked.referenced ){
      const refs = obj.referenced[trait] = [];
      for( const id of baked.referenced[trait]){
        refs.push( world.get_by_id(id).inspect({seen}) );
      }
    }
    for( const trait in baked ){
      if( ['id','label','referenced'].includes(trait) ) continue;
      const cb = {};
      obj[trait] = cb;
      const c = baked[trait];
      const def = Object.getPrototypeOf(c).constructor.schema;
      for( const pred in c ){
        // log('get entity', trait, pred, def[pred].type, c[pred]);
        if( def[pred] && c[pred] ){
          const type = def[pred].type;
          if( type === 'Entity' || TR[type] ){
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

export class Trait {
  static uniqueness = .6;
  similarTo( target, context ){
    const C = Object.getPrototypeOf( this );
    const weight = C.constructor.uniqueness;
    const def = C.constructor.schema;
    
    // log('similarTo', this, target, context.compare_b, context.compare_a);
    for( const key in target ){
      if( target[key] === this[key] ) continue;

      const type = def[key].type;
      if( type === 'Entity' || TR[type] ){
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
	A Tag is a trait that has no content. It is only used
	for adding a tag to the entity.
 */
export class Tag extends Trait {
  static uniqueness = .3;
}

export const Trait_def = {
  definition: {},
  create( def, name ){
//    log('should create definition', name, def);

    if( ['string','number','map','set'].includes(typeof def)){
      def = {value:{type:def}};
    }
    
    let C;
    if( !Object.keys(def).length ){
      C = class extends Tag{};
      C.schema = {}; // Todo. Could just use the same object for all
    } else {
      C = class extends Trait{};
      for( const pred in def ){
//        log('def', pred, def[pred]);
        if( typeof def[pred] === 'string' ){
          def[pred] = {type:def[pred]};
        }
      }

      C.schema = def;
    }

    
    if (typeof name === "undefined") throw "Trait name missing";
    Object.defineProperty(C, "name", { value: name });
    // log('created comp', Object.getPrototypeOf(C).name );
    // log('created comp', C.name );
    Trait_def.definition[name] = C;
    return C;
  },
  
  register( archetypes ){
    for( const t in archetypes ){
      Trait_def.create( archetypes[t], t)
    }
  },
  
  add( C ){
    if( DEBUG ){
      const trait = C.name;
      if( !trait ) throw "No name for trait definition";
      if( TR[trait] ) throw `Trait class ${trait} already registred`;
      if( !C.schema ) throw `Schema missing from ${trait}`;
    }

    TR[C.name] = C;
  }
}

const TR = Trait_def.definition;

export const Entity_Archetypes = {
  archetype: {},
  register( archetypes ){
    Object.assign( Entity_Archetypes.archetype, archetypes );
  }  
}

const ER = Entity_Archetypes.archetype;
