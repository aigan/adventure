const { src, dest } = require("gulp");

console.log(src);


//### For npw, link to own buld of ecsy

// function ecsy(cb){
//   src('node_modules/ecsy/build/ecsy.min.js').pipe(dest('public/vendor/'));
//   cb();
// }

exports.ecsy = ecsy;
