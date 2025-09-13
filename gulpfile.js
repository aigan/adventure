const { series, src, dest } = require("gulp");
const {exec} = require('child_process');
 
const rollupBuild = (cb)=>{
  exec('node_modules/rollup/dist/bin/rollup -c', (err, stdout, stderr)=>{
    if(stderr) console.error(stderr);
    cb(err);
  });
}

function copy(){
  //return src('node_modules/dialog-polyfill/dist/*').pipe(dest('public/vendor/'));
}

exports.default = series(rollupBuild);
