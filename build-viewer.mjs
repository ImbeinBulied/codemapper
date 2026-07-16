/// <reference types="node" />
import * as esbuild from 'esbuild';
import { existsSync, mkdirSync, cpSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, 'dist/viewer');
const SRC = path.resolve(__dirname, 'src/viewer');
const WORKERS_DIR = path.join(DIST, 'workers');

// Ensure output directories exist
if (!existsSync(WORKERS_DIR)) mkdirSync(WORKERS_DIR, { recursive: true });

// ── Main viewer bundle ──────────────────────────────────────────────
// d3 is still used directly by main-thread code (force sim, quadtree).
// dagre is NO LONGER needed by the main bundle — it's bundled into the
// layout worker instead.
await esbuild.build({
  entryPoints: [path.join(SRC, 'main.ts')],
  outfile: path.join(DIST, 'bundle.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: false,
  sourcemap: false,
  external: ['d3'],
});

console.log('✓ Viewer bundle built: dist/viewer/bundle.js');

// ── Layout worker ───────────────────────────────────────────────────
// dagre is bundled INTO the worker so it only lives in one bundle.
await esbuild.build({
  entryPoints: [path.join(SRC, 'workers', 'layout.worker.ts')],
  outfile: path.join(WORKERS_DIR, 'layout.worker.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: false,
  sourcemap: false,
  external: [],
});

console.log('✓ Layout worker built: dist/viewer/workers/layout.worker.js');

// ── Parser worker ───────────────────────────────────────────────────
// web-tree-sitter is kept external because it contains Node.js-specific
// dynamic imports that esbuild cannot resolve for browser target.
// At runtime the worker loads it from the copied file.
await esbuild.build({
  entryPoints: [path.join(SRC, 'workers', 'parser.worker.ts')],
  outfile: path.join(WORKERS_DIR, 'parser.worker.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: false,
  sourcemap: false,
  external: ['web-tree-sitter'],
});

console.log('✓ Parser worker built: dist/viewer/workers/parser.worker.js');

// ── Copy web-tree-sitter runtime for the parser worker ──────────────
const tsSrc = path.resolve(__dirname, 'node_modules', 'web-tree-sitter', 'web-tree-sitter.js');
const tsDst = path.join(WORKERS_DIR, 'web-tree-sitter.js');
copyFileSync(tsSrc, tsDst);
console.log('✓ web-tree-sitter copied: dist/viewer/workers/web-tree-sitter.js');

// Also copy the WASM file for use at runtime
const wasmSrc = path.resolve(__dirname, 'node_modules', 'web-tree-sitter', 'web-tree-sitter.wasm');
const wasmDst = path.join(WORKERS_DIR, 'web-tree-sitter.wasm');
copyFileSync(wasmSrc, wasmDst);
console.log('✓ web-tree-sitter.wasm copied: dist/viewer/workers/web-tree-sitter.wasm');
