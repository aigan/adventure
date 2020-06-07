// log('Loading');

(()=>{

  function memoryOf( agent, target ){
    const world = agent.world;
    // log( 'remember', world.sysdesig(agent), world.sysdesig(target) );
    const thoughts = agent.get('HasThoughts','about');
    const thought = thoughts.get(target); // from Map
    if( !thought ) return null;
    return thought.getEntity('ThoughtContent');
  }
  
  function remember( agent, entity, props ){
    const thoughts = agent.modify('HasThoughts');
    const about = thoughts.about;
    const world = agent.world;

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
  }

})(); //IIFE
