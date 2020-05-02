console.log('install extra libs');
require = require("esm")(module);

const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const json = require('@rollup/plugin-json');
const builtins = require('rollup-plugin-node-builtins');
const rollup = require('rollup');

(async ()=>{
  const inputOptions = {
    input: 'node_modules/ndarray/ndarray.js',
    external: [
    ],
    plugins: [
      resolve({
        preferBuiltins: false,
        browser: true,
      }),
      commonjs(),
    ],
  };
  
  const outputOptions = {
    file: 'public/vendor/ndarray.js',
    format: 'iife',
    name: 'ndarray',
    paths: {
    },
  };
  
  const bundle = await rollup.rollup( inputOptions );		
  await bundle.generate( outputOptions );
  await bundle.write( outputOptions );
})();


(async ()=>{
  const inputOptions = {
    input: 'node_modules/ndarray-segment/ndseg.js',
    external: [
      'ndarray',
    ],
    plugins: [
      resolve({
        preferBuiltins: false,
        browser: true,
      }),
      commonjs({
//        ignore: ['ndarray'],
      }),
    ],
  };
  
  const outputOptions = {
    file: 'public/vendor/ndseg.js',
    format: 'iife',
    name: 'ndseg',
    // paths: {ndarray: '/vendor/ndarray.js'},
    globals: {ndarray:'ndarray'},
  };
  
  const bundle = await rollup.rollup( inputOptions );		
  await bundle.generate( outputOptions );
  await bundle.write( outputOptions );
})();

// 
// (async ()=>{
//   const inputOptions = {
//     input: 'node_modules/cwise/lib/cwise-transform.js',
//     external: [
//     ],
//     plugins: [
//       resolve({
//         preferBuiltins: false,
//         browser: true,
//       }),
//       commonjs({}),
//       json(),
//       builtins(),
//     ],
//   };
// 
//   const outputOptions = {
//     file: 'public/vendor/cwise.js',
//     format: 'iife',
//     name: 'cwise',
//     // globals: {ndarray:'ndarray'},
//   };
// 
//   const bundle = await rollup.rollup( inputOptions );		
//   await bundle.generate( outputOptions );
//   await bundle.write( outputOptions );
// })();
