const { src, dest } = require("gulp");

function copy(cb){
  src('node_modules/indefinite/dist/indefinite.min.js').pipe(dest('public/vendor/'));
  cb();
}
exports.copy = copy;
