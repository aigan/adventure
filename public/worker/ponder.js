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
  
  
  function compare( a, b, context ){
    const res = {
      neg: 0,
      unk: 0,
      pos: 0,
      certainty: undefined,
      thought: undefined,
    };
    
    log('compare entity', a, b);
    for( const ct in a ){
      if( ['id','label','referenced'].includes(ct) ) continue;
      log( 'check', ct);
      const c = b[ct];
      if( !c ){
        res.unk ++;
        continue;
      }
      
      if( c instanceof ECS.TagComponent ){
        const weight = Object.getPrototypeOf( c ).constructor.uniqueness;
        // log('tag score', weight, c)
        res.pos += weight;
        continue;
      }
      
      // Compare similarity
      const {weight, similarity} = c.similarTo( a[ct], context );
      log('similarity', similarity, weight);
      if( similarity > 0.5 ){
        res.pos += weight;
      } else {
        res.neg += weight;
      }
    }

    // just for rough comparisons
    res.certainty = (
      (res.pos - res.unk - 2*res.neg) /
      (res.pos + res.unk + 2*res.neg)
    );

    return res;
  }


  function recall( agent, components, context={} ){
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
    if( !context.world ) context.world = ECS.World.get(agent.world);
    
    const thoughts = agent.get('HasThoughts','about');
    for( const thought of thoughts.values()){
      const content = thought.getEntity('ThoughtContent');
      const contentc = content.bake();
      log('compare to thought content', contentc);
      
      // Rough apriximation for sorting matches
      const match = compare( components, contentc, context );
      match.thought = thought;

      const contref = contentc.referenced;
      for( const ct in components.referenced ){
        if( ct === "ThoughtContent") continue; // private
        if( !contref[ct] ){
          // log('no match for', ct);
          match.unk ++;
          continue;
        }
        const target_refs = components.referenced[ct];
        const weight = ECS.ComponentClass.component[ct].uniqueness;
        // log('check ref', ct, weight);
        for( const target_id of target_refs ){
          if( context.seen[target_id] ){
            console.warn('skip', target_id);
            continue;
          }
          const target = context.world.get_by_id(target_id).bake();
          context.seen[target_id] = target;
          log('check ref', ct, target);
          for( const ref_id of contref[ct] ){
            if( target_id === ref_id ){
              match.pos += weight;
              break;
            }

            if( context.seen[ref_id] ){
              console.warn('skip', ref_id);
              continue;
            }
            const e = context.world.get_by_id(ref_id).bake();
            context.seen[ref_id] = e;
            const partmatch = compare( target, e, context );
            log('FIXME compare', partmatch);
          }
        }

        
      }

      // for( const ct in contentc.referenced ){
      //   const refs = contentc.referenced[ct];
      //   log('ref', ct);
      //   for( const id of refs ){
      //     const e = world.get_by_id( id );
      //     log('id',id, e)
      //   }
      // }


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
    if( consider.neg || (consider.unk > consider.pos) ){
      res.certain = null;
      res.similar.push( consider );
      level = 'similar';
    } else {
      res.certain = consider;
    }
    
    for( const match of matches ){
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
