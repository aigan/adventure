// log('Loading');

// Fantasy Time system. Simplified dates.

// Northen hemisphere seasons;
// Winter 12-02.
// Spring 03-05.
// Summer 06-08.
// Fall   09-11.

(()=>{
  const SECOND =           1;
  const MINUTE = SECOND * 60;
  const HOUR   = MINUTE * 60;
  const DAY    = HOUR   * 24;
  const WEEK   = DAY    *  7;
  const MONTH  = WEEK   *  4;
  const YEAR   = MONTH  * 12;

  function from( year, month=1, day=1, hour=12, minute=0, second=0 ){
    return year*YEAR + (month-1)*MONTH + (day-1)*DAY + hour*HOUR + MINUTE*minute + second*SECOND;
  }
  
  function format( time ){
    if( time instanceof ECS.Entity ) time = time.get('Time');
    
    const epoch = time.epoch;
    if( !epoch ) throw "epoch not found";
    let rest = epoch;

    const year = Math.floor( rest / YEAR );
    rest %= YEAR;

    const month = Math.floor( rest / MONTH ) + 1;
    const m = month.toString().padStart(2,0);
    rest %= MONTH;
    
    const day = Math.floor( rest / DAY ) + 1;
    const d = day.toString().padStart(2,0);
    rest %= DAY;
    
    const hour = Math.floor( rest / HOUR );
    const tH = hour.toString().padStart(2,0);
    rest %= HOUR;
    
    const minute = Math.floor( rest / MINUTE );
    const tM = minute.toString().padStart(2,0);
    rest %= MINUTE;
    
    const second = Math.floor( rest / SECOND );
    const tS = second.toString().padStart(2,0);
    rest %= SECOND;

    return `${year}-${m}-${d} ${tH}:${tM}:${tS}`;
  }
  
  // TODO: also handle Duration
  function relative( time, base ){
    let fromNow = false;
    if( !base ){
      base = Adventure.player.world.Time;
      fromNow = true;
    }
    if( time instanceof ECS.Entity ) time = time.get('Time');
    const epoch = time.epoch;
    if( !epoch ) throw "epoch not found";

    const delta = base.epoch - epoch;

    let precision; // undef for precision based on time duration
    if( time.precision ){
      precision = Math.max( (base.precision||0), time.precision );
    } else {
      precision = Math.abs(delta / 5);
    }
    
    let rest = Math.abs(delta);
    
    const year = Math.floor( rest / YEAR );
    rest %= YEAR;
    
    // log('precision months', Math.abs( precision / MONTH ) );

    let post;
    if( fromNow ) post = (delta > 0) ? " ago" : " in the future";
    else post = (delta > 0) ? " earlier" : " later";

    let text = "";
    const millennia = Math.abs( Math.round( year / 1000 ) );
    
    if( millennia > 3 ){
      text += "millennias" + post;
    } else if( millennia > 1 ){
      text += "more than a millennia" + post;
    } else if( millennia === 1 ){
      text += "a millennia" + post;
    }
    
    if( !text && precision < YEAR * 500 ){
      const century = Math.abs( Math.round( year / 100 ) );
      
      if( century > 3 ){
        text += "centuries" + post;
      } else if( century > 1 ){
        text += "more than a century" + post;
      } else if( century === 1 ){
        text += "a century" + post;
      }
    }
    
    if( !text && precision < YEAR * 50 ){
      const decade = Math.abs( Math.round( year / 10 ) );
      
      if( decade > 3 ){
        text += "decades" + post;
      } else if( decade > 1 && precision > YEAR * 5 ){
        text += "more than a decade" + post;
      } else if( decade === 1 && precision > YEAR * 3 ){
        text += "a decade" + post;
      }
    }

    if( !text && precision < YEAR * 20 && precision > YEAR ){
      if( year > 5 ){
        text += "many years" + post;
      } else if( year > 3 ){
        text += "several years" + post;
      } else if( year > 1 ){
        text += "a couple of years" + post;
      } else if( year === 1 ){
        text += "a year" + post;
      }
    }

    if( text ) return text;

    const month = Math.floor( rest / MONTH );
    rest %= MONTH;
    
    const day = Math.floor( rest / DAY );
    rest %= DAY;
    
    let about = false;
    let fallback = "a long time";

    if( !text && precision <= YEAR ){
      if( year > 3 ){
        text += year + " years";
      } else if( year > 1 ){
        about = true;
        text += year + " years";
      } else if( year === 1 ){
        text += "a year";
      } else if( month > 10 && precision > MONTH ){
        about = true;
        text += "a year";
      }
      
      fallback = "some time";
    }

    if( precision <= MONTH ){
      let prefix = text ? " and " : "";
      if( month > 1 ){
        text += prefix + month + " months";
      } else if( month === 1  && precision > WEEK ){
        text += prefix + "a month";
      } else if( day > 20 && precision > WEEK ){
        about = true;
        text += prefix + "a month";
      }
    }
    
    if( !text && precision <= WEEK && precision > DAY ){
      const week = Math.round( Math.abs( delta / WEEK ) ); 
      if( week > 1 ){
        text += week + " weeks";
      } else if( week === 1 ){
        text += "a week";
      }
    }
    
    if( precision <= DAY ){
      if( day > 1 ){
        text += day + " days";
      } else if( day === 1 && precision > HOUR ){
        text += "a day";
      }
      fallback = "a short time";
    }
    
    const hour = Math.floor( rest / HOUR );
    rest %= HOUR;

    if( !text && precision <= HOUR ){
      if( hour > 1 ){
        text += hour + " hours";
      } else if( hour === 1 && precision > MINUTE ){
        text += "an hour";
      }
      
      fallback = "moments";
    }

    const minute = Math.floor( rest / MINUTE );
    rest %= MINUTE;

    if( !text && precision <= MINUTE ){
      if( minute > 4 ){
        text += minute + " minutes";
      } else {
        if( fromNow ){
          post = "";
          if( delta > 0 ){
            text += "just now";
          } else {
            text += "any time now";
          }
        } else {
          text += "at the same time";
          post = "";
        }
      }
    }
    
    if( text ){
      if( about ) text = "about " + text;
      text += post;
    } else {
      text = fallback + post;
    }

    return text;
  }
  
  self.Time = {
    from,
    format,
    relative,
    SECOND,
    MINUTE,
    HOUR,
    DAY,
    WEEK,
    MONTH,
    YEAR,
  };

})(); //IIFE
