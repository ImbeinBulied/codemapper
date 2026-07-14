import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Swift parser', () => {
  it('parses a file with structs, classes, protocols, and enums', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(`${__dirname}/fixtures/swift`, `${__dirname}/fixtures/swift`);
    expect(result.nodes.some((n) => n.kind === 'file')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'class')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'interface')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'type')).toBe(true);
  });

  it('detects function declarations', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(`${__dirname}/fixtures/swift`, `${__dirname}/fixtures/swift`);
    const funcs = result.nodes.filter((n) => n.kind === 'function');
    expect(funcs.length).toBeGreaterThanOrEqual(1);
    const names = funcs.map((f) => f.label);
    expect(names).toContain('speak');
    expect(names).toContain('fetch');
  });

  it('detects import statements', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(`${__dirname}/fixtures/swift`, `${__dirname}/fixtures/swift`);
    const imports = result.edges.filter((e) => e.kind === 'imports');
    expect(imports.length).toBeGreaterThanOrEqual(2);
    const labels = imports.map((e) => e.label);
    expect(labels).toContain('Foundation');
    expect(labels).toContain('UIKit');
  });

  it('detects extensions', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(`${__dirname}/fixtures/swift`, `${__dirname}/fixtures/swift`);
    // Extensions are stored as kind 'call' with label 'ext <Name>'
    const extensions = result.nodes.filter((n) => n.description === 'extension');
    expect(extensions.length).toBeGreaterThanOrEqual(1);
    expect(extensions.some((e) => e.label.includes('Dog'))).toBe(true);
  });

  it('detects access modifiers (public, private)', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(`${__dirname}/fixtures/swift`, `${__dirname}/fixtures/swift`);
    // ServiceManager is public, start() is public, stop() is private
    const classes = result.nodes.filter((n) => n.kind === 'class');
    expect(classes.some((c) => c.label === 'ServiceManager')).toBe(true);
  });

  it('detects protocols', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(`${__dirname}/fixtures/swift`, `${__dirname}/fixtures/swift`);
    const interfaces = result.nodes.filter((n) => n.kind === 'interface');
    expect(interfaces.some((i) => i.label === 'Animal')).toBe(true);
  });

  it('detects structs', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(`${__dirname}/fixtures/swift`, `${__dirname}/fixtures/swift`);
    const types = result.nodes.filter((n) => n.kind === 'type');
    expect(types.some((t) => t.label === 'Point')).toBe(true);
  });

  it('detects enums', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(`${__dirname}/fixtures/swift`, `${__dirname}/fixtures/swift`);
    const types = result.nodes.filter((n) => n.kind === 'type');
    expect(types.some((t) => t.label === 'Color')).toBe(true);
  });

  it('detects typealias', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(`${__dirname}/fixtures/swift`, `${__dirname}/fixtures/swift`);
    const types = result.nodes.filter((n) => n.description === 'typealias');
    expect(types.length).toBeGreaterThanOrEqual(1);
  });

  it('skips non-Swift files', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(`${__dirname}/fixtures/ts`, `${__dirname}/fixtures/ts`);
    expect(result.nodes.filter((n) => n.kind === 'file').length).toBe(0);
  });
});
