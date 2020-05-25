'use strict';
const log = console.log.bind(console);

const fs = require("fs");
const PNG = require("pngjs").PNG;

const color = {};

const heightmap = {
  "000000": 0,
  "000100": 0,
  "545F41": 1,
  "2B2E37": 1,
  "54587A": 1,
  "7683C3": 1,
  "7A80EB": 1,
  "758EA6": 1,
  "88A293": 1,
  "81A16C": 1,
  "7CA945": 2,
  "A9BD2E": 2,
  "C8E67E": 3,
  "C1DA44": 3,
  "D6D42D": 4,
  "F7C43C": 8,
  "EB9471": 12,
  "FF9C9C": 15,
}

const height = [];
const tile_sum = [];
const tile = [];
let tmax = 0;

fs.createReadStream("./docs/GDEM-10km-colorized-reduced2.png")
.pipe(
  new PNG({
    filterType: 4,
  })
)
.on("parsed", function(){
  const ymax = this.height;
  const xmax = this.width;
  const txmax = Math.floor(this.width/16);
  const tymax = Math.floor(this.height/16);
  const px = this.data;
  let tilex,tiley;
  tile_sum.length = txmax * tymax;
  tile_sum.fill( 0 );
  log('pixels', px.length);
  for( let y=0; y<ymax; y++ ){
    for( let x=0; x<xmax; x++){
      const o = y*xmax*4 + x*4;
      const rgb = [ px[o+0], px[o+1], px[o+2] ];
      const key = rgb.map(x=>x.toString(16).padStart(2,'0')).join("").toUpperCase();
      // log('key', key);
      if( !color[key] ) color[key] = 0;
      color[key] ++;
      height[y*xmax+x] = heightmap[key];
      tilex = Math.floor(x/16);
      tiley = Math.floor(y/16);
      tile_sum[tiley*txmax+tilex] += heightmap[key];
      // log(tiley, tilex,  heightmap[key]);
    }
  }

  const sl5p = {}; // Seglev 5 patterns

  log('tiles', tymax, txmax, tile_sum.length);
  
  const tilepng = new PNG({ width: 32, height: 16 });

  for( let y=0; y<tymax; y++ ){
    // let row = [];
    let row = "";
    for( let x=0; x<txmax; x++ ){
      const pos = y*txmax+x;
      const mass = tile_sum[pos];
      const idx = pos << 2;
      // row += mass + "|";
      // row += mass +"="+ Math.floor(Math.cbrt( mass*1.5 )).toString(16) + "|";
      const group = Math.floor(Math.cbrt( mass*1.5 ));
      tile[pos] = group;
      row += " " + group.toString(16);

      const hue = group * 16;
      tilepng.data[ idx + 0 ] = hue;
      tilepng.data[ idx + 1 ] = hue;
      tilepng.data[ idx + 2 ] = hue;
      tilepng.data[ idx + 3 ] = 0xff;
      
      if( !sl5p[group] ) sl5p[group] = {
        count: 0,
        dir: [{},{},{},{},{},{},{},{},{}],
      };
      sl5p[group].count ++;
    }
    log( row );
  }

  //## Iterate through each subtile and store relationship to neighbour. 3x3
  for( let y=-2; y<ymax+2; y++ ){
    for( let x=-2; x<xmax+2; x++){

      // Compute key
      let key = "";
      for( let sy=0; sy<3; sy++){
        for( let sx=0; sx<3; sx++){
          const gy = y+sy;
          const gx = x+sx;
          if( gy >= ymax || gy < 0 || gx >= xmax || gx < 0 ){key+="0";continue}
          key += height[gy*xmax+gx].toString(16);
          //## Numeric variant
          // key += height[gy*xmax+gx] * Math.pow( 16, sy*3+sx );
        }
      }
      // log(y,x,key);

      // Store key
      for( let sy=0; sy<3; sy++){
        for( let sx=0; sx<3; sx++){
          const gy = y+sy;
          const gx = x+sx;
          if( gy >= ymax || gy < 0 || gx >= xmax || gx < 0 ) continue;
      
          // gr lookup can be optimized
          tilex = Math.floor(gx/16);
          tiley = Math.floor(gy/16);
          const gr = sl5p[ tile[tiley*txmax+tilex] ];
          // log('gr', gr);

          const dir = gr.dir[sy*3+sx];
          if( !dir[key] ) dir[key] = 0;
          dir[key] ++;
        }
      }
    }
  }

  
  const Path = require('path');
  const tilefile = Path.join(__dirname, "/../public/tilefile.png");
  tilepng
  .pack()
  .pipe(fs.createWriteStream( tilefile ))
  .on("finish", function () {
    console.log("Written!");
  });
    
  for( const group in sl5p ){
    log('*', group, sl5p[group].count, sl5p[group].dir[0]);
    // log('*', group, sl5p[group].count);
  }


  // for( const key in color ){
  //   // log( '<div style="background:#'+key+'">#'+key+ " : " + color[key] + '</div>' );
  //   // log( key, color[key] );
  // }
  
});
