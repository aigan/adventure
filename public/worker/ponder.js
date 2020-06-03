// log('Loading');

(()=>{

  function memoryOf( agent, target ){
    const world = agent.world;
    // log( 'remember', world.sysdesig(agent), world.sysdesig(target) );
    const thoughts = agent.get('HasThoughts','about');
    return thoughts.get(target);
  }
  
  function remember( agent, entity, props ){
    const thoughts = agent.modify('HasThoughts');
    const about = thoughts.about;
    let thought = about.get( entity );
    if( !thought ){
      thought = agent.world.add('Thought', props );
      about.set( entity, thought );
      return;
    }

    for( const prop in props ){
      thought.modify( prop, props[prop] );
    }

    // log('agent', agent);
    return;
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
