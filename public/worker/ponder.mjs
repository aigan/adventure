import * as DB from "./db.mjs";
import {description} from "./observation.mjs";

const log = console.log.bind(console);
const DEBUG = false;

log('Loading Ponder');

export function memoryOf( agent, target ){
  const world = agent.world;
  // log( 'remember', world.sysdesig(agent), world.sysdesig(target) );
  const thoughts = agent.get('HasThoughts','about');
  const thought = thoughts.get(target); // from Map
  if( !thought ) return null;
  return thought.get_entity('ThoughtContent');
}

export function remember( agent, entity, props ){
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
        if(!( val instanceof DB.Entity )) continue;

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

  const content = thought.get_entity('ThoughtContent');
  for( const prop in props ){
    content.modify( prop, props[prop] );
  }

  // log('thought content', content);
  return content;
}


function compare( a, b, context ){
  const res = {
    neg: 0,
    unk: 0,
    pos: 0,
    certainty: undefined,
    thought: undefined,
  };
  
  // log('compare entity', a, b, context.compare_a, context.compare_b);
  for( const ct in a ){
    if( ['id','label','referenced'].includes(ct) ) continue;
    // log( 'check', ct);
    const c = b[ct];
    if( !c ){
      res.unk ++;
      continue;
    }
    
    if( c instanceof DB.TagComponent ){
      const weight = Object.getPrototypeOf( c ).constructor.uniqueness;
      // log('tag score', weight, c)
      res.pos += weight;
      continue;
    }

    // avoid back-back-reference loops
    // log('*** MATCH', a.id, context.compare_a, b.id, context.compare_b);
    
    // Compare similarity
    const {weight, similarity} = c.similarTo( a[ct], context );
    // log('similarity', ct, similarity, weight);
    if( similarity > 0.5 ){
      res.pos += weight;
    } else {
      res.neg += weight;
    }
  }

  certainty_update( res );
  return res;
}

function certainty_update( res ){
  // just for rough comparisons
  res.certainty = (
    (res.pos - res.unk - 2*res.neg) /
      (res.pos + res.unk + 2*res.neg)
  );
}

export function recall( agent, components, context={} ){
  // TODO: maby use indexes
  log('recall', agent.sysdesig(), components );

  if( !context.seen ) context.seen={};

  const res = {
    certain: undefined,
    uncertain: [],
    similar: [],
    confidence: 0,
  };


  const matches = [];
  if( !context.world ) context.world = agent.world;
  context.compare_a = components.id;
  
  const thoughts = agent.get('HasThoughts','about');
  for( const thought of thoughts.values()){
    const content = thought.get_entity('ThoughtContent');
    const contentc = content.bake();
    // log('compare to thought content', contentc);
    
    // Rough apriximation for sorting matches
    const match = compare( components, contentc, context );
    match.thought = thought;
    // overwrite with current matching to avoid loops
    context.compare_b = contentc.id;

    const contref = contentc.referenced;
    for( const ct in components.referenced ){
      if( ct === "ThoughtContent") continue; // private
      if( !contref[ct] ){
        // log('no match for', ct);
        match.unk ++; // component not in recall
        continue;
      }
      const target_refs = components.referenced[ct];
      const weight = DB.ComponentClass.component[ct].uniqueness;
      // log('check ref', ct, weight);

      for( const target_id of target_refs ){
        if( context.seen[target_id] ){
          console.warn('skip', target_id, context.world.get_by_id(target_id) );
          continue;
        }
        const target = context.world.get_by_id(target_id).bake();
        context.seen[target_id] = target;
        // log('check ref', ct, target,'from',components,'with',contentc);

        // Only one of the refs need to match
        let ref_pos = 0;
        let ref_unk = 0;
        for( const ref_id of contref[ct] ){
          if( target_id === ref_id ){
            ref_pos ++;
            break;
          }

          if( context.seen[ref_id] ){
            console.warn('skip', ref_id);
            continue;
          }
          const e = context.world.get_by_id(ref_id).bake();
          context.seen[ref_id] = e;
          
          // log('*** compare', target.id, context.compare_a, e.id, context.compare_b);
          const partmatch = compare( target, e, context );
          if( partmatch.certainty > .5 ){
            ref_pos ++;
            break;
          } else if( partmatch.unk > .5 ){
            ref_unk ++;
          }
          // log('FIXME compare', partmatch, target);
          // Look for next possible match
          continue;
        }
        
        if( ref_pos ){
          match.pos += weight;
        } else if( ref_unk ){
          match.unk += weight;
        } else {
          match.neg += weight;
        }
      }
    }

    // recalc certainty
    certainty_update( match );

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

  // log( 'matches', ...matches );

  if( !matches[0] ){
    res.certain = null;
    return res;
  }

  let level = 'uncertain';
  let consider = matches.shift();
  res.confidence = consider.certainty;
  // log('classifying', res.confidence, (res.confidence < .5));
  if( consider.neg || (consider.unk > consider.pos) ){
    res.certain = null;
    res.similar.push( consider );
    level = 'similar';
  } else if( res.confidence < .5 ){
    res.certain = null;
    res.uncertain.push( consider );
  } else  {
    res.certain = consider;
  }

  // log('confidence', consider.certainty, consider.thought.inspect());
  
  for( const match of matches ){
    // log('confidence', match.certainty, match.thought.inspect());
    // log('diff', consider.certainty - match.certainty);
    if( consider.certainty - match.certainty > .5  ){
      if( level === 'similar' ) break;
      if( res.certain ) break;
      level = 'similar';
    } else {
      if( res.certain ){
        res.uncertain.push( res.certain );
        res.certain = null;
        res.confidence = res.confidence / 2;
      }
    }
    
    res[level].push( match );
    consider = match;

    if( res.similar.length > 6 ) break;
  }    

  return res;
}

export function designation( agent, target ){
  const memory = memoryOf( agent, target );
  // log('agent', agent.sysdesig(), 'target', target.sysdesig(), memory.bake());

  if( !memory ) throw("agent has no memory of target");
  const name = memory.get('Name','value');
  if( name ) return name;

  // TODO: add context for distinguising between identical designations
  return description(target,{form:'definite'});
}


//export default {
//	memoryOf,
//	remember,
//	recall,
//	designation,
//}
//
