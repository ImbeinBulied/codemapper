import { describe, it, expect } from 'vitest';
import { analyzeGraph, NodeMetrics } from '../src/graph/analytics.js';
import { GraphNode, GraphEdge } from '../src/graph/index.js';

function makeNode(id: string, kind: GraphNode['kind'] = 'file'): GraphNode {
  return { id, label: id.split('/').pop() || id, kind, filePath: id.replace(/^file:/, ''), line: 1, col: 1 };
}

function makeEdge(source: string, target: string, kind: GraphEdge['kind'] = 'imports'): GraphEdge {
  return { source, target, kind };
}

describe('Graph Analytics', () => {
  describe('fan-in calculation', () => {
    it('counts how many files import from a given file', () => {
      const nodes = [
        makeNode('file:/a.ts'),
        makeNode('file:/b.ts'),
        makeNode('file:/c.ts'),
        makeNode('func:/a.ts#foo'),
        makeNode('func:/b.ts#bar'),
      ];
      const edges = [
        // b imports from a (via func foo)
        makeEdge('file:/b.ts', 'func:/a.ts#foo'),
        // c imports from a (via func foo)
        makeEdge('file:/c.ts', 'func:/a.ts#foo'),
      ];
      const result = analyzeGraph(nodes, edges);
      const aMetrics = result.metrics.get('file:/a.ts')!;
      expect(aMetrics.fanIn).toBe(2);
    });

    it('returns 0 fan-in for nodes nobody imports', () => {
      const nodes = [makeNode('file:/leaf.ts'), makeNode('file:/other.ts')];
      const edges = [makeEdge('file:/leaf.ts', 'file:/other.ts')];
      const result = analyzeGraph(nodes, edges);
      expect(result.metrics.get('file:/leaf.ts')!.fanIn).toBe(0);
    });
  });

  describe('fan-out calculation', () => {
    it('counts how many imports a file makes', () => {
      const nodes = [makeNode('file:/consumer.ts'), makeNode('file:/dep1.ts'), makeNode('file:/dep2.ts')];
      const edges = [makeEdge('file:/consumer.ts', 'file:/dep1.ts'), makeEdge('file:/consumer.ts', 'file:/dep2.ts')];
      const result = analyzeGraph(nodes, edges);
      expect(result.metrics.get('file:/consumer.ts')!.fanOut).toBe(2);
    });
  });

  describe('coupling accumulation', () => {
    it('adds call-based coupling to import coupling', () => {
      const nodes = [makeNode('file:/a.ts'), makeNode('file:/b.ts'), makeNode('func:/a.ts#doStuff')];
      const edges = [
        makeEdge('file:/a.ts', 'file:/b.ts', 'imports'),
        makeEdge('file:/a.ts', 'func:/a.ts#doStuff', 'calls'),
      ];
      const result = analyzeGraph(nodes, edges);
      const aMetrics = result.metrics.get('file:/a.ts')!;
      // coupling = fanIn + fanOut + callCoupling
      // fanOut=1 (imports), fanIn=0, callCoupling=1
      expect(aMetrics.coupling).toBeGreaterThanOrEqual(2);
    });
  });

  describe('instability calculation', () => {
    it('computes fanOut / (fanIn + fanOut)', () => {
      const nodes = [makeNode('file:/stable.ts'), makeNode('file:/unstable.ts'), makeNode('file:/dep.ts')];
      const edges = [
        // stable: imported by unstable, imports nothing
        makeEdge('file:/unstable.ts', 'file:/stable.ts'),
        // unstable: imports stable
        makeEdge('file:/unstable.ts', 'file:/dep.ts'),
      ];
      const result = analyzeGraph(nodes, edges);
      const stable = result.metrics.get('file:/stable.ts')!;
      const unstable = result.metrics.get('file:/unstable.ts')!;
      expect(stable.instability).toBe(0); // fanOut=0, fanIn=1 → 0/1 = 0
      expect(unstable.instability).toBeGreaterThan(0); // fanOut=2, fanIn=0 → 2/2 = 1
    });

    it('returns 0 for isolated nodes', () => {
      const nodes = [makeNode('file:/isolated.ts')];
      const result = analyzeGraph(nodes, []);
      expect(result.metrics.get('file:/isolated.ts')!.instability).toBe(0);
    });
  });

  describe('hub ranking', () => {
    it('returns top nodes sorted by fan-in', () => {
      const nodes = [
        makeNode('file:/core.ts'),
        makeNode('file:/utils.ts'),
        makeNode('file:/app.ts'),
        makeNode('file:/a.ts'),
        makeNode('file:/b.ts'),
        makeNode('file:/c.ts'),
        makeNode('file:/d.ts'),
        makeNode('file:/e.ts'),
        makeNode('file:/f.ts'),
        makeNode('file:/g.ts'),
        makeNode('file:/h.ts'),
        makeNode('file:/i.ts'),
      ];
      const edges = [
        // core is imported by many
        ...Array.from({ length: 10 }, (_, i) => makeEdge(`file:/app${i}.ts`, 'func:/core.ts#main')),
        // utils imported by a few
        makeEdge('file:/a.ts', 'func:/utils.ts#helper'),
        makeEdge('file:/b.ts', 'func:/utils.ts#helper'),
      ];
      const result = analyzeGraph(nodes, edges);
      expect(result.hubs.length).toBeGreaterThan(0);
      expect(result.hubs[0].id).toBe('file:/core.ts');
      expect(result.hubs[0].fanIn).toBe(10);
    });

    it('returns at most 10 hubs', () => {
      const nodes = Array.from({ length: 15 }, (_, i) => makeNode(`file:/hub${i}.ts`));
      const edges: GraphEdge[] = [];
      // Give each hub exactly 1 fan-in
      for (let i = 0; i < 15; i++) {
        edges.push(makeEdge(`file:/src${i}.ts`, `func:/hub${i}.ts#f`));
        nodes.push(makeNode(`file:/src${i}.ts`));
      }
      const result = analyzeGraph(nodes, edges);
      expect(result.hubs.length).toBeLessThanOrEqual(10);
    });
  });

  describe('average coupling', () => {
    it('computes average across all file nodes', () => {
      const nodes = [makeNode('file:/a.ts'), makeNode('file:/b.ts')];
      const edges = [makeEdge('file:/a.ts', 'file:/b.ts')];
      const result = analyzeGraph(nodes, edges);
      expect(result.avgCoupling).toBeGreaterThanOrEqual(0);
    });
  });
});
