function tt( strings, ...val_in){
  const values = [];
  for( const entity of val_in ){
    if( !entity ) continue;
    // Just expect enity for now
    const obj = { id: entity.id };
    obj.description_short = description_short( entity );
    // values.push( entity.bake() );
    values.push( obj );
  }
  return {strings,values};
}

function description_short(e){
  const desc = e.get('Description','short');
  if( desc ) return desc;
  const label = e.get('Labeled').value;
  if( label ) return label;
  log('describe', e);
  return 'stuff';
}

const observation_pattern = {
  Human: observing_human,
  Artifact: observing_artifact,
}

function observation( agent, focus, perspective ){
  const observed = { entity: focus };

  if( focus === perspective ){
    observed.here = true;
  }
  
  
  

  const world = agent.world;
  const seeing_inloc = [];
  const inloc = focus.referenced.InLocation || [];
  for( const eid of inloc ){
    const e = world.entity.get(eid);
    if( e === player ) continue;
    const obi = observation( agent, e, perspective );
    seeing_inloc.push( obi );
  }
  if( seeing_inloc.length ){
    observed.inLocation = seeing_inloc;
  }

  return observed;
}

function observing_human(){}
function observing_artifact(){}

function observation_text( obs ){
  const lines = [];
  // log('text for', obs);

  if( !obs.here ){
      lines.push( tt`${obs.entity}` );
  }

  if( obs.inLocation ){
    if( obs.here ){
      lines.push( "You see here:" );
    } else {
      const edesig = description_short( obs.entity );
      lines.push( `In ${edesig} you see:` );
    }
    for( const subobs of obs.inLocation ){
      lines.push( ... observation_text( subobs ));
      // lines.push( tt`${e}` );
    }
  }
  return lines;
}
