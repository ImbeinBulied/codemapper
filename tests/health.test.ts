import { describe, it, expect } from 'vitest';
import { computeHealthScore, HealthScore } from '../src/graph/health.js';
import { GraphNode, GraphEdge } from '../src/graph/index.js';

function makeNode(id: string, kind: GraphNode['kind'] = 'file'): GraphNode {
  return { id, label: id.split('/').pop() || id, kind, filePath: id.replace(/^file:/, ''), line: 1, col: 1 };
}

function makeEdge(source: string, target: string, kind: GraphEdge['kind'] = 'imports'): GraphEdge {
  return { source, target, kind };
}

describe('Health Score', () => {
  it('returns 100 for an empty graph', () => {
    const result = computeHealthScore([], []);
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
    expect(result.negatives).toEqual([]);
  });

  it('returns 100 for a healthy graph with no issues', () => {
    const nodes = [makeNode('file:/a.ts'), makeNode('file:/b.ts')];
    const edges = [makeEdge('file:/a.ts', 'file:/b.ts')];
    const result = computeHealthScore(nodes, edges, {
      metrics: new Map([
        ['file:/a.ts', { instability: 0.3, heat: 0.2, fanOut: 3 }],
        ['file:/b.ts', { instability: 0.1, heat: 0.1, fanOut: 1 }],
      ]),
      cycleNodes: new Set(),
    });
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.grade).toBe('A');
  });

  it('penalizes cycles in the graph', () => {
    // 1 out of 2 files in a cycle → 50% * 2 * 0.3 = 30 penalty
    const nodes = [makeNode('file:/a.ts'), makeNode('file:/b.ts')];
    const edges = [makeEdge('file:/a.ts', 'file:/b.ts'), makeEdge('file:/b.ts', 'file:/a.ts')];
    const result = computeHealthScore(nodes, edges, {
      cycleNodes: new Set(['file:/a.ts']),
    });
    expect(result.score).toBeLessThan(100);
    expect(result.negatives.some((n) => n.factor === 'Cycles')).toBe(true);
  });

  it('penalizes high instability', () => {
    const nodes = [makeNode('file:/a.ts'), makeNode('file:/b.ts')];
    const edges = [makeEdge('file:/a.ts', 'file:/b.ts')];
    // a.ts has instability > 0.7 → 1/2 * 100 * 2 * 0.25 = 25 penalty
    const result = computeHealthScore(nodes, edges, {
      metrics: new Map([
        ['file:/a.ts', { instability: 0.9, heat: 0.1, fanOut: 1 }],
        ['file:/b.ts', { instability: 0.1, heat: 0.1, fanOut: 1 }],
      ]),
    });
    expect(result.score).toBeLessThan(100);
    expect(result.negatives.some((n) => n.factor === 'Instability')).toBe(true);
  });

  it('penalizes high heat hotspots', () => {
    const nodes = [makeNode('file:/a.ts'), makeNode('file:/b.ts')];
    const edges = [makeEdge('file:/a.ts', 'file:/b.ts')];
    const result = computeHealthScore(nodes, edges, {
      metrics: new Map([
        ['file:/a.ts', { instability: 0.1, heat: 0.9, fanOut: 1 }],
        ['file:/b.ts', { instability: 0.1, heat: 0.1, fanOut: 1 }],
      ]),
    });
    expect(result.score).toBeLessThan(100);
    expect(result.negatives.some((n) => n.factor === 'Hotspots')).toBe(true);
  });

  it('penalizes high coupling', () => {
    const nodes = [makeNode('file:/a.ts'), makeNode('file:/b.ts')];
    const edges = [makeEdge('file:/a.ts', 'file:/b.ts')];
    const result = computeHealthScore(nodes, edges, {
      metrics: new Map([
        ['file:/a.ts', { instability: 0.1, heat: 0.1, fanOut: 15 }],
        ['file:/b.ts', { instability: 0.1, heat: 0.1, fanOut: 1 }],
      ]),
    });
    expect(result.score).toBeLessThan(100);
    expect(result.negatives.some((n) => n.factor === 'Coupling')).toBe(true);
  });

  it('computes grade A for score >= 90', () => {
    const result = computeHealthScore([makeNode('file:/a.ts')], [], {
      metrics: new Map([['file:/a.ts', { instability: 0, heat: 0, fanOut: 0 }]]),
      cycleNodes: new Set(),
    });
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.grade).toBe('A');
  });

  it('computes grade B for score >= 80', () => {
    // 2 out of 5 files with moderate issues → moderate penalty → B grade
    const result = computeHealthScore(
      [
        makeNode('file:/a.ts'),
        makeNode('file:/b.ts'),
        makeNode('file:/c.ts'),
        makeNode('file:/d.ts'),
        makeNode('file:/e.ts'),
      ],
      [],
      {
        metrics: new Map([
          ['file:/a.ts', { instability: 0.8, heat: 0.1, fanOut: 2 }],
          ['file:/b.ts', { instability: 0.1, heat: 0.8, fanOut: 2 }],
          ['file:/c.ts', { instability: 0.3, heat: 0.2, fanOut: 3 }],
          ['file:/d.ts', { instability: 0.1, heat: 0.1, fanOut: 1 }],
          ['file:/e.ts', { instability: 0.1, heat: 0.1, fanOut: 1 }],
        ]),
        cycleNodes: new Set(),
      },
    );
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.score).toBeLessThan(90);
    expect(result.grade).toBe('B');
  });

  it('computes grade F for score < 50', () => {
    // Create many problematic nodes to drive score down
    const nodes = Array.from({ length: 10 }, (_, i) => makeNode(`file:/bad${i}.ts`));
    const metrics = new Map(nodes.map((n) => [n.id, { instability: 0.9, heat: 0.9, fanOut: 20 }]));
    const result = computeHealthScore(nodes, [], {
      metrics,
      cycleNodes: new Set(nodes.map((n) => n.id)),
    });
    expect(result.score).toBeLessThan(50);
    expect(result.grade).toBe('F');
  });

  it('handles missing analytics gracefully', () => {
    const result = computeHealthScore([makeNode('file:/a.ts')], []);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.negatives).toEqual([]);
  });
});
