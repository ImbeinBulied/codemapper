import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('C# parser', () => {
  it('parses a file with classes, interfaces, and methods', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(`${__dirname}/fixtures/cs`, `${__dirname}/fixtures/cs`);
    expect(result.nodes.some((n) => n.kind === 'file')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'class')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'interface')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'function')).toBe(true);
  });

  it('detects namespace via using statements (imports)', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(`${__dirname}/fixtures/cs`, `${__dirname}/fixtures/cs`);
    const imports = result.edges.filter((e) => e.kind === 'imports');
    expect(imports.length).toBeGreaterThanOrEqual(1);
    // using System -> module:System
    const moduleTargets = imports.map((e) => e.target);
    expect(moduleTargets.some((t) => t.startsWith('module:'))).toBe(true);
  });

  it('detects using statements', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(`${__dirname}/fixtures/cs`, `${__dirname}/fixtures/cs`);
    const imports = result.edges.filter((e) => e.kind === 'imports');
    const labels = imports.map((e) => e.label);
    expect(labels).toContain('System');
  });

  it('detects inheritance (class : Base)', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(`${__dirname}/fixtures/cs`, `${__dirname}/fixtures/cs`);
    const extendsEdges = result.edges.filter((e) => e.kind === 'extends');
    expect(extendsEdges.length).toBeGreaterThanOrEqual(1);
    // Dog extends BaseCreature
    const targets = extendsEdges.map((e) => e.target);
    expect(targets.some((t) => t.includes('BaseCreature'))).toBe(true);
  });

  it('detects async methods', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(`${__dirname}/fixtures/cs`, `${__dirname}/fixtures/cs`);
    const funcs = result.nodes.filter((n) => n.kind === 'function');
    const names = funcs.map((f) => f.label);
    // FetchAsync should be detected
    expect(names.some((n) => n.includes('Fetch') || n.includes('fetch'))).toBe(true);
  });

  it('detects generic types (struct)', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(`${__dirname}/fixtures/cs`, `${__dirname}/fixtures/cs`);
    const types = result.nodes.filter((n) => n.kind === 'type');
    expect(types.length).toBeGreaterThanOrEqual(1);
    // Point struct
    expect(types.some((t) => t.label === 'Point')).toBe(true);
  });

  it('detects enums', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(`${__dirname}/fixtures/cs`, `${__dirname}/fixtures/cs`);
    const types = result.nodes.filter((n) => n.kind === 'type');
    // Color enum
    expect(types.some((t) => t.label === 'Color')).toBe(true);
  });

  it('detects contains edges from file to class/interface', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(`${__dirname}/fixtures/cs`, `${__dirname}/fixtures/cs`);
    const contains = result.edges.filter((e) => e.kind === 'contains');
    expect(contains.length).toBeGreaterThanOrEqual(2);
  });

  it('skips non-C# files', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(`${__dirname}/fixtures/ts`, `${__dirname}/fixtures/ts`);
    expect(result.nodes.filter((n) => n.kind === 'file').length).toBe(0);
  });
});
