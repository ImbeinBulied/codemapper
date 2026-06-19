/// <reference types="node" />
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/viewer/main.ts'],
  outfile: 'dist/viewer/bundle.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: false,
  sourcemap: false,
  external: ['d3', 'dagre'],
});

console.log('✓ Viewer bundle built: dist/viewer/bundle.js');
