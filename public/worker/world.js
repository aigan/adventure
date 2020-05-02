console.log("Loading world");
//##https://github.com/mikolalysenko/ndarray-tutorial

importScripts('../vendor/ndarray.js');
importScripts('../vendor/ndseg.js');

//## X, Y, Z. Plain is at X,Z. Up is Y
/*

Y    
|   Z
|  /
| /
0----X
*/


const ground = {name:'ground'};
const size = 16;
const max = size-1;

const world = ndseg([size,size,size]);

fill( world, [0,0,0],[max,8,max],ground)

function fill(a, [x0,y0,z0],[x1,y1,z1], v){
  for( let x = x0; x <= x1; x++)
  for( let y = y0; y <= y1; y++)
  for( let z = z0; z <= z1; z++) {
    a.set(x, y, z, v);
  };
}

function topmap( a ){
  const layer = ndarray( new Uint8Array(size ** 2), [size,size] );
  for( let x = 0; x < size; x++)
  for( let z = 0; z < size; z++) {
    for( let y = max; y >= 0; y-- ){
      const val = a.get(x,y,z);
      if( ! val ) continue;
      // console.log(x, z, y);
      layer.set(x,z,y);
      break;
    }
  }
  return layer;
}

function asciimap( layer ){
  let out = "";
  for( let z = max; z >= 0; z--){
    for( let x = 0; x < size; x++) {
      const val = layer.get(x,z);
      // console.log(x, z, val);
      out += parseInt( val||0, 16 );
    }
    out += "\n";
  }
  return out;
}

console.log( asciimap(topmap(world)) );
