// log("Loading observation");

importScripts("../vendor/indefinite.min.js"); // indefinite

function ucfirst( str ){
  return str[0].toUpperCase() + str.slice(1); 
}

function tt( strings, ...val_in){
  const values = [];
  for( const obs of val_in ){
    if( !obs ) continue;
    values.push( bake_obs( obs ) );
  }
  return {strings,values};
}

function bake_obs( obs ){
  const obj = { id: obs.entity.id };
  obj.description_short = description( obs );
  obj.actions = obs.actions;
  return obj;
}

function description(e, {form='indefinite',length='short'}={}){
  let desc;

  // support passing of either entity orobservation
  let descriptor = e;
  if( e.entity ){
    descriptor = e.primary_descriptor || e.entity;
    e = e.entity;
  }

  desc = descriptor.get('Description','short');
  if( !desc ) desc = descriptor.get('Labeled','value');
  // log('desc', e.id, desc, indefinite(short));

  if( form === 'indefinite'){
    desc = indefinite(desc);
  } else if( form === 'definite' ){
    desc = "the " + desc;
  } else if( form === 'third-subj' ){
    const gender = e.getEntity('HasGender');
    if( gender.get('Female') ) return 'she';
    if( gender.get('Male') ) return 'he';
    return 'it';
  } else if( form === 'third-obj' ){
    const gender = e.getEntity('HasGender');
    if( gender.get('Female') ) return 'her';
    if( gender.get('Male') ) return 'him';
    return 'it';
  }

  if( !desc ) desc = 'stuff';
  return desc;
}

const observation_pattern = {
  Human: observing_human,
  Artifact: observing_artifact,
}

function observation( agent, target, perspective ){
  const observed = { entity: target, actions: [] };
  // log('obs', target.sysdesig(), pattern);

  if( !perspective ) perspective = agent;
  if( target === perspective ){
    observed.here = true;
  }
  
  const pattern = target.get('ObservationPattern','value');
  if( pattern ){
    observation_pattern[pattern]({agent,target,perspective,observed});
  }
  
  const world = agent.world;
  const seeing_inloc = [];
  const inloc = target.referenced.InLocation || [];
  for( const eid of inloc ){
    const e = world.entity.get(eid);
    if( e === Adventure.player ) continue;
    const obi = observation( agent, e, perspective );
    seeing_inloc.push( obi );
  }
  if( seeing_inloc.length ){
    observed.inLocation = seeing_inloc;
  }

  return observed;
}

function observing_human({agent, target, observed}){
  const gender = target.getEntity('HasGender');
  if( gender ) observed.primary_descriptor = gender;
  // log('observing human', target, observed);

  if( Dialog.has_attention({agent,target}) ){
    const html_target = description(observed,{form:'third-obj'})
    observed.actions.push({
      do: 'ask-about-self',
      target: target.id,
      name:`ask about ${html_target}self`,
    });
  } else {
    observed.actions.push({
      do:'greet',
      target: target.id,
      name:"Initiate dialog",
    });
  }
}

function observing_artifact(){}

function observation_text( obs ){
  const lines = [];
  // log('text for', obs);

  if( !obs.here ){
    lines.push( tt`${obs}` );
  }

  if( obs.inLocation ){
    if( obs.here ){
      lines.push( "You see here:" );
    } else {
      const edesig = description( obs.entity );
      lines.push( `In ${edesig} you see:` );
    }
    for( const subobs of obs.inLocation ){
      lines.push( ... observation_text( subobs ));
      // lines.push( tt`${e}` );
    }
  }
  return lines;
}
