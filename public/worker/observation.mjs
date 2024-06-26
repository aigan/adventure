const log = console.log.bind(console);
log("Loading observation");

import indefinite from "../vendor/indefinite.mjs";
import * as Ponder from "./ponder.mjs";
import * as DB from "./db.mjs";
import * as Dialog from "./dialog.mjs";

export function ucfirst( str ){
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

export function bake_obs( obs ){
  // log('bake obs', obs);
  const obj = { id: obs.entity.id };
  obj.description_short = obs.knownAs || description( obs );
  obj.actions = obs.actions;
  obj.is = 'entity';
  return obj;
}

export function description(e, {form='indefinite',length='short'}={}){
  let desc;

  // support passing of either entity or observation
  let descriptor = e;
  if( e.entity ){
    descriptor = e.primary_descriptor || e.entity;
    // descriptor = e.entity;
    e = e.entity;
  }

  desc = descriptor.get('Description',length);
  if( !desc ) desc = descriptor.get('Description','short');
  // if( !desc ) desc = descriptor.get('Labeled','value');
  //log('desc', e.id, desc);

  if( !desc ) return 'stuff';

  if( form === 'base' ){} // no change
  else if( form === 'indefinite'){
    desc = indefinite(desc);
  } else if( form === 'definite' ){
    desc = "the " + desc;
  } else if( form === 'third-subj' ){
    const gender = e.get_entity('HasGender');
    if( gender.get('Female') ) return 'she';
    if( gender.get('Male') ) return 'he';
    return 'it';
  } else if( form === 'third-obj' ){
    const gender = e.get_entity('HasGender');
    if( gender.get('Female') ) return 'her';
    if( gender.get('Male') ) return 'him';
    return 'it';
  } else {
    throw `form ${form} not recognized`;
  }

  return desc;
}

const observation_pattern = {
  Human: observing_human,
  Artifact: observing_artifact,
}

export function observation( agent, target, perspective ){
  const observed = { entity: target, actions: [] };
  //console.warn('obs', target );

  if( !perspective ) perspective = agent;
  if( target === perspective ){
    observed.here = true;
  }
  
  const pattern = target.get('ObservationPattern','value');
  if( pattern ){
    observation_pattern[pattern]({agent,target,perspective,observed});
  }
  
  const seeing_inloc = [];
  const inloc = target.get_referenced("InLocation");
  //const inloc = target.referenced.InLocation || [];
  //log("Target referenced InLocation", ... inloc.values() );

  const world = target.world;
  for( const e of inloc ){
    if( e === world.Adventure.player ) continue;
    const obi = observation( agent, e, perspective );
    seeing_inloc.push( obi );
  }
  if( seeing_inloc.length ){
    observed.inLocation = seeing_inloc;
  }

  // log('obs', observed);
  return observed;
}

function observing_human({agent, target, observed}){
  const gender = target.get_entity('HasGender');
  if( gender ) observed.primary_descriptor = gender;
  // log('observing human', target, observed);

  const memory = Ponder.memoryOf( agent, target );
  if( memory ){
    const name = memory.get('Name','value');
    if( name ) observed.knownAs = name;
  }

  //TODO: Factor out
  if( Dialog.has_attention({agent,target}) ){
    const html_target = description(observed,{form:'third-obj'})

    // Should introduce yourself first
    observed.actions.push({
      do: 'ask-about',
      target: target.id,
      subject: target.id,
      label:`ask about ${html_target}self`,
    });
    
    const about = agent.get('HasThoughts','about');
    for( const [subject,thought] of about ){
      if( subject === target ) continue;
      const desig = Ponder.designation(agent,subject);
      observed.actions.push({
        do: 'ask-about',
        target: target.id,
        subject: subject.id,
        label:`ask about ${desig}`,
      });
      
      // log('ask about', Ponder.designation(agent,target),thought);
    }
    
    
  } else {
    observed.actions.push({
      do:'greet',
      target: target.id,
      label:"Initiate dialog",
    });
  }
}

function observing_artifact(){}

export function observation_text( obs ){
  const lines = [];
  //log('text for', obs);

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
