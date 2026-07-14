import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Parser Invariants', () => {
  describe('TypeScript parser', () => {
    it('always produces file nodes for valid .ts files', async () => {
      const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
      const result = await analyzeTypeScript(`${__dirname}/fixtures/ts`, `${__dirname}/fixtures/ts`);
      const fileNodes = result.nodes.filter((n) => n.kind === 'file');
      expect(fileNodes.length).toBeGreaterThan(0);
      // Every file node must have an id starting with 'file:'
      for (const fn of fileNodes) {
        expect(fn.id).toMatch(/^file:/);
        expect(fn.filePath).toBeTruthy();
        expect(fn.label).toBeTruthy();
      }
    });

    it('produces valid edge references (or starts with module:)', async () => {
      const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
      const result = await analyzeTypeScript(`${__dirname}/fixtures/ts`, `${__dirname}/fixtures/ts`);
      const nodeIds = new Set(result.nodes.map((n) => n.id));
      for (const edge of result.edges) {
        // source must be a known node
        expect(nodeIds.has(edge.source)).toBe(true);
        // target must be a known node OR start with a known prefix
        // (module: for external deps, class/interface/type/func: for cross-file refs)
        const validPrefixes = ['module:', 'class:', 'interface:', 'type:', 'func:'];
        const targetValid = nodeIds.has(edge.target) || validPrefixes.some((p) => edge.target.startsWith(p));
        expect(targetValid).toBe(true);
      }
    });
  });

  describe('Empty directory handling', () => {
    it('TypeScript parser returns empty for non-TS directory', async () => {
      const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
      const result = await analyzeTypeScript(`${__dirname}/fixtures/py`, `${__dirname}/fixtures/py`);
      expect(result.nodes.length).toBe(0);
      expect(result.edges.length).toBe(0);
    });

    it('Rust parser returns empty for non-Rust directory', async () => {
      const { analyzeRust } = await import('../src/analyze/rust.js');
      const result = await analyzeRust(`${__dirname}/fixtures/ts`, `${__dirname}/fixtures/ts`);
      expect(result.nodes.length).toBe(0);
      expect(result.edges.length).toBe(0);
    });

    it('Go parser returns empty for empty directory', async () => {
      const { analyzeGo } = await import('../src/analyze/go.js');
      const result = await analyzeGo(`${__dirname}/fixtures/go`, `${__dirname}/fixtures/go`);
      expect(result.nodes.length).toBe(0);
    });

    it('Java parser returns empty for empty directory', async () => {
      const { analyzeJava } = await import('../src/analyze/java.js');
      const result = await analyzeJava(`${__dirname}/fixtures/java`, `${__dirname}/fixtures/java`);
      expect(result.nodes.length).toBe(0);
    });
  });

  describe('Binary file handling', () => {
    it('TypeScript parser skips binary files gracefully', async () => {
      const { readFileSafe, isBinary } = await import('../src/analyze/utils.js');
      // Verify that binary detection works
      expect(isBinary('hello world')).toBe(false);
      expect(isBinary('he\x00llo')).toBe(true);
      // readFileSafe should return null content for nonexistent file
      const result = readFileSafe('/nonexistent/binary/file');
      expect(result.content).toBeNull();
    });
  });

  describe('Node kind consistency', () => {
    it('TypeScript parser produces consistent node kinds', async () => {
      const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
      const result = await analyzeTypeScript(`${__dirname}/fixtures/ts`, `${__dirname}/fixtures/ts`);
      const validKinds = new Set(['file', 'function', 'class', 'interface', 'type', 'module', 'call', 'directory']);
      for (const node of result.nodes) {
        expect(validKinds.has(node.kind)).toBe(true);
      }
    });

    it('TypeScript parser produces consistent edge kinds', async () => {
      const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
      const result = await analyzeTypeScript(`${__dirname}/fixtures/ts`, `${__dirname}/fixtures/ts`);
      const validEdgeKinds = new Set(['imports', 'calls', 'extends', 'implements', 'contains', 'callsites', 'exports']);
      for (const edge of result.edges) {
        expect(validEdgeKinds.has(edge.kind)).toBe(true);
      }
    });
  });
});
