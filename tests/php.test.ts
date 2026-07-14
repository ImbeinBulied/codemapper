import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('PHP parser', () => {
  it('parses a file with classes, interfaces, and traits', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(`${__dirname}/fixtures/php`, `${__dirname}/fixtures/php`);
    expect(result.nodes.some((n) => n.kind === 'file')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'class')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'interface')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'type')).toBe(true); // traits
  });

  it('detects namespace/use declarations', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(`${__dirname}/fixtures/php`, `${__dirname}/fixtures/php`);
    const imports = result.edges.filter((e) => e.kind === 'imports');
    expect(imports.length).toBeGreaterThanOrEqual(2);
    const labels = imports.map((e) => e.label);
    expect(labels).toContain('User');
    expect(labels).toContain('AuthService');
  });

  it('detects function declarations', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(`${__dirname}/fixtures/php`, `${__dirname}/fixtures/php`);
    const funcs = result.nodes.filter((n) => n.kind === 'function');
    expect(funcs.length).toBeGreaterThanOrEqual(1);
    expect(funcs.some((f) => f.label === 'createUser')).toBe(true);
  });

  it('detects inheritance (extends)', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(`${__dirname}/fixtures/php`, `${__dirname}/fixtures/php`);
    const extendsEdges = result.edges.filter((e) => e.kind === 'extends');
    expect(extendsEdges.length).toBeGreaterThanOrEqual(1);
    const targets = extendsEdges.map((e) => e.target);
    expect(targets.some((t) => t.includes('BaseEntity'))).toBe(true);
  });

  it('detects interface implementations', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(`${__dirname}/fixtures/php`, `${__dirname}/fixtures/php`);
    const implementsEdges = result.edges.filter((e) => e.kind === 'implements');
    expect(implementsEdges.length).toBeGreaterThanOrEqual(1);
    const targets = implementsEdges.map((e) => e.target);
    expect(targets.some((t) => t.includes('Drawable'))).toBe(true);
  });

  it('detects PHP 8 features (readonly properties, enums)', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(`${__dirname}/fixtures/php`, `${__dirname}/fixtures/php`);
    // Status enum
    const types = result.nodes.filter((n) => n.kind === 'type');
    expect(types.some((t) => t.label === 'Status' && t.description === 'enum')).toBe(true);
    // Trait Loggable
    expect(types.some((t) => t.label === 'Loggable' && t.description === 'trait')).toBe(true);
  });

  it('detects traits', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(`${__dirname}/fixtures/php`, `${__dirname}/fixtures/php`);
    const types = result.nodes.filter((n) => n.description === 'trait');
    expect(types.length).toBeGreaterThanOrEqual(1);
    expect(types.some((t) => t.label === 'Loggable')).toBe(true);
  });

  it('skips non-PHP files', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(`${__dirname}/fixtures/ts`, `${__dirname}/fixtures/ts`);
    expect(result.nodes.filter((n) => n.kind === 'file').length).toBe(0);
  });
});
