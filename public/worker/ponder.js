log('Loading');

(()=>{

  function memoryOf( agent, target ){
    return null;
  }
  
  function remember( agent, entity, props ){
    const thoughts = agent.modify('HasThoughts');

    // TODO: setup new Map()    

    log('agent', agent);
    return;
  }

  self.Ponder = {
    memoryOf,
    remember,
  }

})(); //IIFE
