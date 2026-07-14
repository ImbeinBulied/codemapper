import { describe, it, expect } from 'vitest';
import { detectCycles, isInCycle, getCyclicNodes } from '../src/graph/cycles.js';
import { GraphNode, GraphEdge } from '../src/graph/index.js';

function makeNode(id: string, kind: GraphNode['kind'] = 'file'): GraphNode {
  return { id, label: id.split('/').pop() || id, kind, filePath: id.replace(/^file:/, ''), line: 1, col: 1 };
}

function makeEdge(source: string, target: string, kind: GraphEdge['kind'] = 'imports'): GraphEdge {
  return { source, target, kind };
}

describe('Cycle Detection', () => {
  describe('simple 3-node cycle', () => {
    it('detects A→B→C→A', () => {
      const nodes = [makeNode('file:/a.ts'), makeNode('file:/b.ts'), makeNode('file:/c.ts')];
      const edges = [
        makeEdge('file:/a.ts', 'file:/b.ts'),
        makeEdge('file:/b.ts', 'file:/c.ts'),
        makeEdge('file:/c.ts', 'file:/a.ts'),
      ];
      const cycles = detectCycles(nodes, edges);
      expect(cycles.length).toBeGreaterThanOrEqual(1);
      expect(cycles[0].nodes).toContain('file:/a.ts');
      expect(cycles[0].nodes).toContain('file:/b.ts');
      expect(cycles[0].nodes).toContain('file:/c.ts');
    });
  });

  describe('no-cycle case (linear graph)', () => {
    it('returns empty for A→B→C', () => {
      const nodes = [makeNode('file:/a.ts'), makeNode('file:/b.ts'), makeNode('file:/c.ts')];
      const edges = [makeEdge('file:/a.ts', 'file:/b.ts'), makeEdge('file:/b.ts', 'file:/c.ts')];
      const cycles = detectCycles(nodes, edges);
      expect(cycles.length).toBe(0);
    });
  });

  describe('self-referencing node', () => {
    it('does not treat self-loop as a cycle (length < 3)', () => {
      const nodes = [makeNode('file:/self.ts')];
      const edges = [makeEdge('file:/self.ts', 'file:/self.ts')];
      const cycles = detectCycles(nodes, edges);
      // Self-loop: A→A has only 2 nodes in path, which is < 3
      expect(cycles.length).toBe(0);
    });
  });

  describe('disconnected components', () => {
    it('detects cycle only in one component', () => {
      const nodes = [
        makeNode('file:/cycle1.ts'),
        makeNode('file:/cycle2.ts'),
        makeNode('file:/cycle3.ts'),
        makeNode('file:/linear1.ts'),
        makeNode('file:/linear2.ts'),
      ];
      const edges = [
        // Cycle component
        makeEdge('file:/cycle1.ts', 'file:/cycle2.ts'),
        makeEdge('file:/cycle2.ts', 'file:/cycle3.ts'),
        makeEdge('file:/cycle3.ts', 'file:/cycle1.ts'),
        // Linear component (no cycle)
        makeEdge('file:/linear1.ts', 'file:/linear2.ts'),
      ];
      const cycles = detectCycles(nodes, edges);
      expect(cycles.length).toBeGreaterThanOrEqual(1);
      // The cycle should only involve the cycle component nodes
      const cycleNodeSet = new Set(cycles[0].nodes);
      expect(cycleNodeSet.has('file:/linear1.ts')).toBe(false);
      expect(cycleNodeSet.has('file:/linear2.ts')).toBe(false);
    });
  });

  describe('cycle deduplication', () => {
    it('returns only one cycle for the same loop discovered from different entry points', () => {
      const nodes = [makeNode('file:/a.ts'), makeNode('file:/b.ts'), makeNode('file:/c.ts')];
      const edges = [
        makeEdge('file:/a.ts', 'file:/b.ts'),
        makeEdge('file:/b.ts', 'file:/c.ts'),
        makeEdge('file:/c.ts', 'file:/a.ts'),
      ];
      const cycles = detectCycles(nodes, edges);
      // Should be deduplicated to 1
      expect(cycles.length).toBe(1);
    });
  });

  describe('isInCycle', () => {
    it('returns true for nodes in a cycle', () => {
      const cycles = [{ nodes: ['a', 'b', 'c', 'a'], edgeKind: 'imports' }];
      expect(isInCycle('a', cycles)).toBe(true);
      expect(isInCycle('d', cycles)).toBe(false);
    });
  });

  describe('getCyclicNodes', () => {
    it('returns all nodes that appear in any cycle', () => {
      const cycles = [
        { nodes: ['a', 'b', 'c', 'a'], edgeKind: 'imports' },
        { nodes: ['d', 'e', 'f', 'd'], edgeKind: 'imports' },
      ];
      const cyclic = getCyclicNodes(cycles);
      expect(cyclic.size).toBe(6);
      expect(cyclic.has('a')).toBe(true);
      expect(cyclic.has('f')).toBe(true);
    });
  });
});
