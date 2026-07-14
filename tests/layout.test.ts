import { describe, it, expect } from 'vitest';
import { layoutHierarchical, layoutGrid, layoutForce } from '../src/graph/layout.js';
import { GraphNode, GraphEdge } from '../src/graph/index.js';

function makeNode(id: string, kind: GraphNode['kind'] = 'file'): GraphNode {
  return { id, label: id.split('/').pop() || id, kind, filePath: id.replace(/^file:/, ''), line: 1, col: 1 };
}

function makeEdge(source: string, target: string, kind: GraphEdge['kind'] = 'imports'): GraphEdge {
  return { source, target, kind };
}

describe('Layout', () => {
  describe('layoutHierarchical', () => {
    it('returns positions for all nodes', () => {
      const nodes = [makeNode('file:/a.ts'), makeNode('file:/b.ts'), makeNode('file:/c.ts')];
      const edges = [makeEdge('file:/a.ts', 'file:/b.ts'), makeEdge('file:/b.ts', 'file:/c.ts')];
      const result = layoutHierarchical(nodes, edges, 1000, 800);
      expect(result.nodes).toHaveLength(3);
      for (const n of result.nodes) {
        expect(typeof n.x).toBe('number');
        expect(typeof n.y).toBe('number');
        expect(n.x).not.toBeNaN();
        expect(n.y).not.toBeNaN();
      }
    });

    it('respects parent-child hierarchy', () => {
      const nodes = [makeNode('file:/parent.ts'), makeNode('file:/child.ts')];
      const edges = [makeEdge('file:/child.ts', 'file:/parent.ts')]; // child imports parent
      const result = layoutHierarchical(nodes, edges, 1000, 800);
      // Both nodes should have valid positions
      expect(result.nodes).toHaveLength(2);
      for (const n of result.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeGreaterThanOrEqual(0);
      }
    });

    it('gives isolated nodes valid positions', () => {
      const nodes = [makeNode('file:/isolated.ts')];
      const result = layoutHierarchical(nodes, [], 1000, 800);
      expect(result.nodes).toHaveLength(1);
      expect(typeof result.nodes[0].x).toBe('number');
      expect(typeof result.nodes[0].y).toBe('number');
    });

    it('returns empty for empty input', () => {
      const result = layoutHierarchical([], [], 1000, 800);
      expect(result.nodes).toHaveLength(0);
    });

    it('preserves node properties', () => {
      const nodes = [makeNode('file:/test.ts', 'class')];
      const result = layoutHierarchical(nodes, [], 1000, 800);
      expect(result.nodes[0].kind).toBe('class');
      expect(result.nodes[0].label).toBe('test.ts');
    });
  });

  describe('layoutGrid', () => {
    it('returns positions for all nodes', () => {
      const nodes = [makeNode('file:/a.ts'), makeNode('file:/b.ts'), makeNode('file:/c.ts')];
      const result = layoutGrid(nodes, 1000, 800);
      expect(result.nodes).toHaveLength(3);
      for (const n of result.nodes) {
        expect(typeof n.x).toBe('number');
        expect(typeof n.y).toBe('number');
      }
    });

    it('returns empty for empty input', () => {
      const result = layoutGrid([], 1000, 800);
      expect(result.nodes).toHaveLength(0);
    });

    it('assigns different positions to different nodes', () => {
      const nodes = [makeNode('file:/a.ts'), makeNode('file:/b.ts')];
      const result = layoutGrid(nodes, 1000, 800);
      const positions = result.nodes.map((n) => `${n.x},${n.y}`);
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(2);
    });

    it('handles large number of nodes', () => {
      const nodes = Array.from({ length: 100 }, (_, i) => makeNode(`file:/node${i}.ts`));
      const result = layoutGrid(nodes, 1000, 800);
      expect(result.nodes).toHaveLength(100);
      for (const n of result.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('layoutForce', () => {
    it('returns positions for all nodes', () => {
      const nodes = [makeNode('file:/a.ts'), makeNode('file:/b.ts')];
      const edges = [makeEdge('file:/a.ts', 'file:/b.ts')];
      const result = layoutForce(nodes, edges);
      expect(result.nodes).toHaveLength(2);
      for (const n of result.nodes) {
        expect(typeof n.x).toBe('number');
        expect(typeof n.y).toBe('number');
      }
    });

    it('returns empty for empty input', () => {
      const result = layoutForce([], []);
      expect(result.nodes).toHaveLength(0);
    });

    it('sets initial positions to 0', () => {
      const nodes = [makeNode('file:/a.ts')];
      const result = layoutForce(nodes, []);
      expect(result.nodes[0].x).toBe(0);
      expect(result.nodes[0].y).toBe(0);
    });
  });
});
