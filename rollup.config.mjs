import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'node_modules/indefinite/lib/indefinite.js',
  output: {
    file: 'public/vendor/indefinite.mjs',
    format: 'es'
  },
  plugins: [
    resolve(),
    commonjs(),
  ]
};
