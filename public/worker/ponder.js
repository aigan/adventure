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

    log('agent', agent);
    return;
  }

  self.Ponder = {
    memoryOf,
    remember,
  }

})(); //IIFE
