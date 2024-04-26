const log = console.log.bind(console);
log('Loading Time');

// Fantasy Time system. Simplified dates.

// Northen hemisphere seasons;
// Winter 12-02. (8-17)
// Spring 03-05. (7-19)
// Summer 06-08. (6-21)
// Fall   09-11. (7-19)

const SECOND =           1;
const MINUTE = SECOND * 60;
const HOUR   = MINUTE * 60;
const DAY    = HOUR   * 24;
const WEEK   = DAY    *  7;
const MONTH  = WEEK   *  4;
const YEAR   = MONTH  * 12;

const monthname = {
  1: "january",
  2: "february",
  3: "march",
  4: "april",
  5: "may",
  6: "june",
  7: "july",
  8: "august",
  9: "september",
  10: "october",
  11: "november",
  12: "december",
}

function from( year, month=1, day=1, hour=12, minute=0, second=0 ){
  return year*YEAR + (month-1)*MONTH + (day-1)*DAY + hour*HOUR + MINUTE*minute + second*SECOND;
}

function format( time ){
  if( time instanceof ECS.Entity ) time = time.get('Time');
  const [year,month,day,hour,minute,second] = Time.split( time );
  const m = month.toString().padStart(2,0);
  const d = day.toString().padStart(2,0);
  const tH = hour.toString().padStart(2,0);
  const tM = minute.toString().padStart(2,0);
  const tS = second.toString().padStart(2,0);
  return `${year}-${m}-${d} ${tH}:${tM}:${tS}`;
}

function split( time ){
  const epoch = time.epoch;
  if( !epoch ) throw "epoch not found";
  let rest = epoch;

  const year = Math.floor( rest / YEAR );
  rest %= YEAR;

  const month = Math.floor( rest / MONTH ) + 1;
  rest %= MONTH;
  
  const day = Math.floor( rest / DAY ) + 1;
  rest %= DAY;
  
  const hour = Math.floor( rest / HOUR );
  rest %= HOUR;
  
  const minute = Math.floor( rest / MINUTE );
  rest %= MINUTE;
  
  const second = Math.floor( rest / SECOND );
  rest %= SECOND;

  return [year,month,day,hour,minute,second,rest];
}

function timeOfDay( time ){
  const [,month,,h] = Time.split( time );
  
  if( h < 1 ) return "at midnight";
  if( h < 2 ) return "at night";
  if( h < 4 ) return "late night";

  let dm = month -1;
  if( dm > 6 ) dm = 12 - dm;

  const dawn = 8 - (dm/3);
  if( dawn - h > 1 ) return "before dawn";
  if( dawn - h > 0 ) return "at dawn";
  if( dawn - h > -1 ) return "at sunrise";

  if( h < 11 ) return "in the morning";
  if( h < 14 ) return "at noon";

  const dusk = 17 + (dm/1.5);
  if( dusk - h > 1 ) return "in the afternoon";
  if( dusk - h > 0 ) return "at sunset";
  if( dusk - h > -1 ) return "at dusk";

  if( h < 22 ) return "after dark";
  if( h < 23 ) return "at night";
  return "at midnight";
}

function timeOfMonth( time ){
  const precision = time.precision;
  
  const [,month,day] = Time.split( time );
  if( day < 3 ) return "new moon";
  if( day < 7 ) return "waxing crescent";
  if( day < 10 ) return "first quarter";
  if( day < 14 ) return "waxing gibbous";
  if( day < 17 ) return "full moon";
  if( day < 21 ) return "waning gibbous";
  if( day < 24 ) return "last quarter";
  if( day < 28 ) return "waning crescent";
  return "last day before the new moon";
}

// TODO: also handle Duration
function relative( time, base ){
  let fromNow = false;
  if( !base ){
    base = World.get(Adventure.player.world).Time;
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

function designation( time ){
  const base = World.get(Adventure.player.world).Time;
  if( time instanceof ECS.Entity ) time = time.get('Time');
  const epoch = time.epoch;
  if( !epoch ) throw "epoch not found";

  const delta = base.epoch - epoch;
  const precision = time.precision || Math.abs(delta / 5);
  let rest = Math.abs(delta);
  const years = Math.floor( rest / YEAR );
  rest %= YEAR;

  if( years > 3 ) return Time.relative( time );

  const [ty,tm,td,th] = Time.split(time);
  const [cy,cm,cd,ch] = Time.split(base);
  
  let text = "";

  if( precision <= HOUR * 3 ){
    const dh = Math.abs( th - ch );
    if( dh < 2 ){
      // log('dh', dh, delta/HOUR)
      if( Math.abs(delta) > HOUR * 3 ) text += "at this time";
      else return "now";
    } else text += Time.timeOfDay( time );
  } else if( precision <= HOUR * 6 ){
    text += Time.timeOfDay( time );
  }
  
  function delta_years(){
    const dy = ty-cy;
    const dya = Math.abs(dy);
    if( dy === 0 ){}
    else if( dy === -1 ) text += " of last year";
    else if( dy === +1 ) text += " of next year";
    else if( dy < -1 ) text += `, ${dya} years ago`;
    else text += ` in ${dya} years`;
  }

  function delta_months(){
    const months = Math.floor( Math.abs( delta / MONTH ) );
    // log(months, delta)
    if( months === 0 ) text += " of this month";
    else if( months === 1 ){
      if( delta < 0 ) text += " of next month";
      else text += " of last month";
    } else if( months < 4 ){
      if( delta < 0 ) text += ` in ${months} months`;
      else text += ` ${months} months ago`;
    } else {
      text += ` in ${monthname[tm]}`;
      delta_years();
    }
  }

  if( precision <= DAY * 2 ){
    const days = Math.floor( Math.abs( delta / DAY ) );
    const dd = td - cd;
    if( days >= 21 ){
      text += ` on the ${td} day`;
      delta_months();
      // text += Time.timeOfMonth( time );
    } else if( dd === -1 ){
      text += ` yesterday`;
    } else if( dd === 0 ){
      if( precision <= HOUR * 3) text += ` today`;
    } else if( dd === 1){
      text += ` tomorrow`;
    } else {
      if( delta > 0 ) text += ` ${days} days ago`;
      else text += ` in ${days} days`;
    }
  } else if( precision <= WEEK ){
    const days = Math.floor( Math.abs( delta / DAY ) );
    text += "at the " + Time.timeOfMonth( time );
    delta_months();
  }
  
  return text.trim();
}

export default {
  from,
  format,
  relative,
  designation,
  split,
  timeOfDay,
  timeOfMonth,
  SECOND,
  MINUTE,
  HOUR,
  DAY,
  WEEK,
  MONTH,
  YEAR,
};
