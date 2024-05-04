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
    this.entity_history = new Map();
    this.Time = undefined; // reserved for Time component
    this.id = World.cnt ++;
    World.store[this.id] = this;
  }
  
  static get( id ){
    return World.store[id];
  }
  
  create_entity(){
    const eh = new EntityHistory(this.id);
    this.entity_history.set(eh.id,eh);
    return eh.add_version();
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
    const eh = e.history;
    eh.is_archetype = archetype;

    //log("get_by_archetype", archetype, e);
    
    for( const bt of def.bases || [] ){
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

  get_history_by_id( id ){
    return this.entity_history.get( id );
  }

  get_entity( id, v ){
    if( typeof v !== "number" ) throw Error("expected version number");
    return this.entity_history.get(id).versions[v];
  }

  get_entity_current( id ){
    return this.get_history_by_id( id ).current();
    
  }

  //## Maybe rename to be similar to nodejs util.inspect
  sysdesig( entity ){
    let id, eh;
    //log("sysdesig", entity);

    if( typeof entity === 'number' ){
      id = entity;
      entity = this.entity_history.get(id);
      if( !entity ) return `${id}<deleted>`;
    }
    if( !entity ) return "<deleted>";

    id = entity.id;
    const label = entity.label;

    let desig = id;
		
    if( entity instanceof EntityHistory ){
			eh = entity;
      desig += "*";
      entity = entity.versions.slice(-1)[0];
    } else {
			eh = entity.history;
		}
    
    if( eh.is_archetype ){
      return `${desig} ${eh.is_archetype} Archetype`;
    }

    //log("getting tags from", entity);
    let tags = "";
    for( const child of [entity, ...entity.bases]){
      for( const trait in child.traits ){
        // log('trait', trait, child.traits[trait]);
        if( child.traits[trait] instanceof Tag ) tags += ':'+trait;
      }
    }

    const desc = entity.get("Description", "short");
    const name = entity.get("Name", "value");
    
    
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

	trait: Hash with this entity traits

	inheritors: entities using this as a base

	referenced: entities pointing to this

*/

export class EntityHistory {
  static cnt = 0;

  constructor( world_id ){
    //log("create entity in world", world_id);
    this.id = ++ EntityHistory.cnt;
    this.label = undefined; // private for internal use
    this.is_archetype = undefined;
    this._world = world_id;
    this.versions = [];
  }

  add_version(){
    const v = this.versions.length;
    const e = new Entity(this._world, this.id, v);
    this.versions.push( e );
    return e;
  }

  current(){
    return this.versions.slice(-1)[0];
  }
}

export class Entity {
  constructor(world_id, id,v){
    this.id = id;
    this.v = v;
    this._world = world_id;
    this.bases = [];
    this.traits = {};
    this.inheritors = new Set();
    this.referenced = {};

    //console.warn("Created entity", this);
  }
  
  get( trait, pred ){
    // This will be accessed frequently. Compare with linked lists or
    // maybe bring up frequently accessed properties to the top. Maybe
    // try iteration rather than shift.
    const queue = []; // breadth first tree search
    queue.push( this );
    let t;
    while( queue.length ){
      const e = queue.shift();
      t = e.traits[trait];
      //log(`Looking for ${trait} ${pred ?? 'value'} in ${e.id}. Found`, t );
      if( t ) break;
      queue.push( ...(e.bases||[]) );
    }
    
    if( !t ){
      return null;
      // console.error('For entity', this);
      // throw Error(`Trait ${trait} not found in entity`);  
    }
    //log('returning found', t, Object.getPrototypeOf(t).constructor.schema);

    if( pred ) return t.get(pred);


    return t;
  }

  /* // suggested changes
		 get(trait, pred) {
		 const queue = [this];
		 let c = null;

		 for (let i = 0; i < queue.length; i++) {
     const e = queue[i];
     c = e.traits[trait];
     if (c) break;
     if (e.bases) {
     for (const base of e.bases.values()) {
     queue.push(base);
     }
     }
		 }

		 if (!c) return null;  // Return null if trait not found

		 return pred ? c[pred] : c;
		 }
	*/
  

  
  get_entity( trait, pred='value' ){
		//log("get_entity", this, trait, pred, this.get(trait,pred));
		const val = this.get(trait,pred);
		if( !val ) return null;
		return this.world.get_entity( val.id, val.v );
    //return this.world.get_by_id( this.get(trait,pred) );
  }

	get_referenced( trait ){
		//log("Get referenced", this, trait);

		// TODO: specify version to get rather than latest
		const world = World.get(this._world);
		const res = [];
		for( const eid of this.referenced[trait] ?? [] ){
			const eh = world.get_history_by_id(eid);
			const e = eh.current();

			// Should only need to check direct properties
			
			const t = e.traits[trait];
			if( !t.refers_to_eid( this.id ) ) continue;
			res.push(e);
			// TODO: also return inheritors?
		}
		//log("return", res);
		return res;
	}

	get history(){
		//log("Get history for", this);
		return this.world.entity_history.get(this.id);
	}

	get world(){
		return World.store[ this._world ];
	}
  
  modify( trait, props ){ // modify now or soon
    const _c = this.traits;
    if( _c[trait] ){
      return Object.assign( _c[trait], props );
    }

    log('modify', trait, props);
    const Cc = Trait_def.definition[trait];
    return this.add_trait( Cc, props );
  }
  
  trait_names(){
    throw "fixme recursion";
    return Object.keys( this.traits );
  }
  
  // Generalized version of get()
  bake(){
		log("bake", this);

		const obj = {
      id: this.id,
      referenced: {},
    };

    if( this.label ) obj.label = this.label;
		
    const queue = []; // breadth first tree search
    queue.push( this );
    while( queue.length ){
      const e = queue.shift();
			
      for( const trait in e.traits ){
        if( trait in obj ) continue;
        obj[trait] = e.traits[trait];
      }
      
      for( const trait in e.referenced ){
        // log('ref', trait);
        if( trait in obj.referenced ) continue;
        if( e.referenced[trait].size > 100 ){
          console.error('referenced for', e);
          throw "To many references for bake";
        }
				// FIXME
        obj.referenced[trait] = [... e.referenced[trait].values()];
      }
      
      queue.push( ...(e.bases||[]) );
    }
		
    return obj;
  }
  
  add_trait( T, values={} ){
    const e = this;
    //log('add trait', T.name, values, e);
    const t = new T(e._world, e.id);
    e.traits[ T.name ] = t;

    //log('init', e.id, T.name, 'with', values, 'from', t, 'with schema', T.schema );
    
    // Convert singulars
    if( typeof values === 'string' ){
      values = {value:values};
    }
    
    // Convert entity values to id
    if( values.id ){
      values = {value:values}
    }
    
    const def = T.schema;
    for( const key in def ){
      let val = values[key];
      const attr = def[key];
      const type = attr.type;
      if( attr.type === 'map' ){
        if( val ) throw "handle map val";
        t[key] = new Map();
        continue;
      }

      if( !val ){
        t[key] = val;
        continue;
      }
      
      if( ['string','number'].includes(type) ){}
      else {
        if( typeof val === 'string' ){
          // log('set', e.id, T.name, type, key, val );
          val = e.world.get_by_archetype( val );
          // log('resolved to', val.id);
        }
        
        if( Array.isArray(val) ){
          const val_in = val;
          val = [];
          for( const target of val_in ){
            //## TODO: verify type
            val.push( target.id );
            target.set_referenced(T.name, e);
          }
        } else {
          //## TODO: verify type
          const target = val;
          val = {id: val.id, v: val.v};
          
          // log('set backref for', target, target.set_referenced);
          target.set_referenced(T.name, e);
        }
      }
      
      //log('set', key, val, attr);
      t[key] = val;
    }

    // log('res', this);
    return t;
  }
  
  set_referenced( trait, e ){
    const ref = this.referenced;
		//throw Error("fixme (version)");
    if( !ref[ trait ] ) ref[trait] = new Set();
    //log("set_referenced", this.id, trait, e.id);
    ref[trait].add( e.id );
  }
  
  add_base( base ){
    const e = this;
    if( base.inheritors.has( e )) return e;
    //log("Adding base to entity", base, e);
    base.inheritors.add( e );
    e.bases.push( base );
  }
  
  stamp( props ){
    const e = this;

    for( const trait in props ){
      if( trait === 'label' ){
        e.label = props.label;
        continue;
      }

      let initvals =  props[trait];

      //log('entity', e.world.sysdesig(e), 'adding', trait, 'with', initvals );

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
    return this.world.sysdesig(this);
  }

  inspect({seen={}}={}){
    // TODO: add seen for loops. add depth
    if(seen[this.id]) return seen[this.id];
    const baked = this.bake();
    const world = World.get(this._world);
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

export class Trait {
  static uniqueness = .6;

	constructor(world_id, eid){
		this._world = world_id;
		this._eid = eid;
	}
	
	get( pred ){
		return this[pred];
	}

	get world(){
		return World.store[this._world];
	}
	
	entity( pred='value' ){
		const {id,v} = this[pred];
		//log("Get enitity", pred, this);
		return this.world.entity_history.get(id).versions[v];
	}

	refers_to_eid( eid ){
		//log("check refers of", this, eid);
		for( const val of Object.values( this ) ){
			// Only check entity ref objs
			if( typeof val !== "object" ) continue;
			if( val?.id === eid ) return true;
		}
		return false;
	}

	similar_to( target, context ){
    const C = Object.getPrototypeOf( this );
    const weight = C.constructor.uniqueness;
    const def = C.constructor.schema;
    
    // log('similar_to', this, target, context.compare_b, context.compare_a);
    for( const key in target ){
      if( target[key] === this[key] ) continue;

      const type = def[key].type;
      if( type === 'Entity' || TR[type] ){
        const world = context._world;

        if( this[key] === context.compare_b && target[key] === context.compare_a ){
          // log('similarity assumed for sake of comparison here');
          continue;
        }
        
        log('FIXME similar_to', key, type, this[key], context.compare_b, target[key], context.compare_a );
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
