import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { analyzeRust } from '../src/analyze/rust.js';
import { analyzeGo } from '../src/analyze/go.js';
import { analyzeJava } from '../src/analyze/java.js';
import { readFileSafe, findLine, isBinary, walkFiles } from '../src/analyze/utils.js';
import { loadConfig } from '../src/config.js';
import { toSVG } from '../src/export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('TypeScript parser (TS Compiler API)', () => {
  it('parses a fixture with functions, classes, and imports', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const result = await analyzeTypeScript(`${__dirname}/fixtures/ts`, `${__dirname}/fixtures/ts`);
    expect(result.nodes.some((n) => n.kind === 'file')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'function')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'class')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'interface')).toBe(true);
    expect(result.edges.some((e) => e.kind === 'imports')).toBe(true);
    expect(result.edges.some((e) => e.kind === 'contains')).toBe(true);
    expect(result.edges.some((e) => e.kind === 'calls')).toBe(true);
  });

  it('detects arrow functions and const-assigned functions', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const result = await analyzeTypeScript(`${__dirname}/fixtures/ts`, `${__dirname}/fixtures/ts`);
    const funcs = result.nodes.filter((n) => n.kind === 'function');
    const names = funcs.map((f) => f.label);
    expect(names).toContain('createDog');
    expect(names).toContain('main');
    expect(names).toContain('fetchData');
    expect(names).toContain('defaultHandler');
    expect(names).toContain('exportedArrow');
  });

  it('detects class methods', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const result = await analyzeTypeScript(`${__dirname}/fixtures/ts`, `${__dirname}/fixtures/ts`);
    const funcs = result.nodes.filter((n) => n.kind === 'function');
    const names = funcs.map((f) => f.label);
    expect(names).toContain('Dog.speak');
    expect(names).toContain('Dog.wagTail');
    expect(names).toContain('Dog.constructor');
  });

  it('detects interfaces and type aliases', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const result = await analyzeTypeScript(`${__dirname}/fixtures/ts`, `${__dirname}/fixtures/ts`);
    const interfaces = result.nodes.filter((n) => n.kind === 'interface');
    const types = result.nodes.filter((n) => n.kind === 'type');
    expect(interfaces.some((i) => i.label === 'Animal')).toBe(true);
    expect(interfaces.some((i) => i.label === 'Pet')).toBe(true);
    expect(types.some((t) => t.label === 'Callback')).toBe(true);
  });

  it('detects imports with aliases', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const result = await analyzeTypeScript(`${__dirname}/fixtures/ts`, `${__dirname}/fixtures/ts`);
    const imports = result.edges.filter((e) => e.kind === 'imports');
    expect(imports.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Rust parser', () => {
  it('parses a fixture with structs, enums, traits, and functions', async () => {
    const result = await analyzeRust(`${__dirname}/fixtures/rs`, `${__dirname}/fixtures/rs`);
    expect(result.nodes.some((n) => n.kind === 'file')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'function')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'type')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'interface')).toBe(true);
    expect(result.edges.some((e) => e.kind === 'imports')).toBe(true);
    expect(result.edges.some((e) => e.kind === 'calls')).toBe(true);
  });

  it('skips non-rust files and binary files', async () => {
    const result = await analyzeRust(`${__dirname}/fixtures/ts`, `${__dirname}/fixtures/ts`);
    expect(result.nodes.filter((n) => n.kind === 'file').length).toBe(0);
  });
});

describe('Python parser', () => {
  it('parses a fixture with classes, functions, and imports', async () => {
    const { analyzePython } = await import('../src/analyze/python.js');
    const result = await analyzePython(`${__dirname}/fixtures/py`, `${__dirname}/fixtures/py`);
    expect(result.nodes.some((n) => n.kind === 'file')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'function')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'class')).toBe(true);
    expect(result.edges.some((e) => e.kind === 'imports')).toBe(true);
  });

  it('handles various import styles', async () => {
    const { analyzePython } = await import('../src/analyze/python.js');
    const result = await analyzePython(`${__dirname}/fixtures/py`, `${__dirname}/fixtures/py`);
    const imports = result.edges.filter((e) => e.kind === 'imports');
    expect(imports.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Go parser', () => {
  it('handles empty directory gracefully', async () => {
    const result = await analyzeGo(`${__dirname}/fixtures/go`, `${__dirname}/fixtures/go`);
    expect(result.nodes.length).toBe(0);
  });
});

describe('Java parser', () => {
  it('handles empty directory gracefully', async () => {
    const result = await analyzeJava(`${__dirname}/fixtures/java`, `${__dirname}/fixtures/java`);
    expect(result.nodes.length).toBe(0);
  });
});

describe('utils', () => {
  it('findLine finds the correct line', () => {
    expect(findLine(['a', 'b', 'c'], 'b')).toBe(2);
    expect(findLine(['abc', 'def'], 'ghi')).toBe(1);
  });

  it('isBinary detects null bytes', () => {
    expect(isBinary('hello world')).toBe(false);
    expect(isBinary('he\x00llo')).toBe(true);
  });

  it('readFileSafe returns null for nonexistent file', () => {
    const result = readFileSafe('/nonexistent/path');
    expect(result.content).toBeNull();
  });

  it('walkFiles returns files from directory', async () => {
    const files = await walkFiles(`${__dirname}/fixtures/ts`);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith('.ts'))).toBe(true);
  });
});

describe('config', () => {
  it('loadConfig returns empty for missing config', () => {
    const cfg = loadConfig('/nonexistent');
    expect(cfg).toEqual({});
  });
});

describe('export', () => {
  it('toSVG generates valid SVG', () => {
    const result = {
      graph: {
        nodes: [{ id: 'n1', label: 'test', kind: 'class' as const, filePath: '/test.ts', line: 1, col: 1 }],
        edges: [],
      },
      root: '/test',
      stats: { files: 1, functions: 0, classes: 1, imports: 0 },
    };
    const svg = toSVG(result);
    expect(svg).toContain('<svg');
    expect(svg).toContain('test');
    expect(svg).toContain('</svg>');
  });
});
