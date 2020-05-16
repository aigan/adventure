// log("Loading observation");

importScripts("../vendor/indefinite.min.js"); // indefinite

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
  let short;
  short = e.get('Description','short');
  if( !short ) short = e.get('Labeled','value');
  // log('desc', e.id, short, indefinite(short));
  short = indefinite(short);

  if( !short ) short = 'stuff';
  return short;
}

const observation_pattern = {
  Human: observing_human,
  Artifact: observing_artifact,
}

function observation( agent, focus, perspective ){
  const observed = { entity: focus };
  // log('obs', focus.sysdesig(), pattern);

  if( focus === perspective ){
    observed.here = true;
  }
  
  const pattern = focus.get('ObservationPattern','value');
  if( pattern ){
    observation_pattern[pattern]({agent,focus,perspective,observed});
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

function observing_human({focus,observed}){
  const gender = focus.getEntity('HasGender');
  observed.primary = gender;
  // log('Obs Human', gender);
}

function observing_artifact(){}

function observation_text( obs ){
  const lines = [];
  // log('text for', obs);

  if( !obs.here ){
    const primary = obs.primary || obs.entity;
    lines.push( tt`${primary}` );
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
