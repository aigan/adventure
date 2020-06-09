// log('Loading');

(()=>{

  function memoryOf( agent, target ){
    const world = ECS.World.get(agent.world);
    // log( 'remember', world.sysdesig(agent), world.sysdesig(target) );
    const thoughts = agent.get('HasThoughts','about');
    const thought = thoughts.get(target); // from Map
    if( !thought ) return null;
    return thought.getEntity('ThoughtContent');
  }
  
  function remember( agent, entity, props ){
    const thoughts = agent.modify('HasThoughts');
    const about = thoughts.about;
    const world = ECS.World.get(agent.world);

    // Check that all referred entites are your own thoughts
    if( DEBUG )
    for( const ct in props ){
      let initvals =  props[ct];
      if( typeof initvals === 'string' ){
        initvals = {value:initvals};
      }
      for( const field in initvals ){
        const val = initvals[field];
        if(!( val instanceof ECS.Entity )) continue;

        // const thoughts = val.referenced.ThoughtContent;
        const thoughts = val.referenced.ThoughtContent;

        if( val.referenced.ThoughtAbout || !thoughts ){
          console.error(agent.sysdesig(), "thought about",
          entity.sysdesig(), "has content",
          ct, field, "reffering outside their mind", props)
          throw("mind breach");
        }

        for( const tid of thoughts ){
          const thought = world.get_by_id( tid );
          // log('check', tid, thought);
          for( const aid of thought.referenced.HasThoughts ){
            if( aid !== agent.id ){
              console.error(agent.sysdesig(), "thought about",
              entity.sysdesig(), "has content",
              ct, field, "reffering to another mind", props)
              throw("mind mismatch");
            }
          }
        }
      }
    }


    let thought = about.get( entity );
    if( !thought ){
      const content = world.create_entity();
      content.stamp(props);
      thought = world.add('Thought', {
        ThoughtAbout: entity,
        ThoughtContent: content,
      });
      about.set( entity, thought );
      thought.set_referenced( 'HasThoughts', agent );
      return content;
    }

    const content = thought.getEntity('ThoughtContent');
    for( const prop in props ){
      content.modify( prop, props[prop] );
    }

    // log('thought content', content);
    return content;
  }
  
  function recall( agent, components, context ){
    // TODO: maby use indexes

    // TODO: Add back-reference (rev) components
    // log('recall', agent.sysdesig(), components );

    const matches = [];

    const thoughts = agent.get('HasThoughts','about');
    for( const thought of thoughts.values()){
      const content = thought.getEntity('ThoughtContent');
      const contentc = content.bake();
      // log('t', contentc);
      
      // Rough apriximation for sorting matches
      const match = {
        neg: 0,
        unk: 0,
        pos: 0,
        thought,
        context,
      };
      for( const ct in components ){
        if( ct === 'id' ) continue; // todo: id not allowed
        const c = contentc[ct];
        if( !c ){
          match.unk ++;
          continue;
        }
        
        if( c instanceof ECS.TagComponent ){
          const weight = Object.getPrototypeOf( c ).constructor.uniqueness;
          // log('tag score', weight, c)
          match.pos += weight;
          continue;
        }

        // Compare similarity
        // log( 'check', ct);
        const {weight, similarity} = c.similarTo( contentc[ct] );
        if( similarity > 0.5 ){
          match.pos += weight;
        } else {
          match.neg += weight;
        }
      }

      if( !match.pos ) continue;
      matches.push( match );
      // log( 'association', contentc, neg, unk, pos );
    }

    // sort by max pos, min neg, min unk
    matches.sort( (a,b)=>{
      if( a.pos > b.pos ) return -1;
      if( a.pos < b.pos ) return +1;
      if( a.neg > b.neg ) return +1;
      if( a.neg < b.neg ) return -1;
      if( a.unk > b.unk ) return +1;
      if( a.unk < b.unk ) return -1;
      return 0;
    });
    
    log( 'matches', matches.map( el =>{
      el.thought = el.thought.inspect();
      return el;
    } ));

    return matches;
  }
  
  function designation( agent, target ){
    const memory = Ponder.memoryOf( agent, target );
    // log('agent', agent.sysdesig(), 'target', target.sysdesig(), memory.bake());

    if( !memory ) throw("agent has no memory of target");
    const name = memory.get('Name','value');
    if( name ) return name;

    // TODO: add context for distinguising between identical designations
    return description(target,{form:'definite'});
  }
  
  

  self.Ponder = {
    memoryOf,
    remember,
    designation,
    recall,
  }

})(); //IIFE
