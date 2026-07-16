import { describe, it, expect } from 'vitest';
import {
  findPath,
  findShortestWeightedPath,
  findReachable,
  findDependencies,
  findDependents,
} from '../src/graph/pathfinder.js';
import { GraphNode, GraphEdge } from '../src/graph/index.js';

function makeNode(id: string, kind: GraphNode['kind'] = 'file'): GraphNode {
  return { id, label: id.split('/').pop() || id, kind, filePath: id.replace(/^file:/, ''), line: 1, col: 1 };
}

function makeEdge(source: string, target: string, kind: GraphEdge['kind'] = 'imports'): GraphEdge {
  return { source, target, kind };
}

describe('Pathfinder - BFS shortest path', () => {
  describe('simple 3-node linear graph', () => {
    it('finds A→C via A→B→C', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
      const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
      const result = findPath(nodes, edges, 'a', 'c');
      expect(result.found).toBe(true);
      expect(result.path).toEqual(['a', 'b', 'c']);
      expect(result.hops).toBe(2);
    });
  });

  describe('source equals target', () => {
    it('returns path with just the source node (0 hops)', () => {
      const nodes = [makeNode('a')];
      const edges: GraphEdge[] = [];
      const result = findPath(nodes, edges, 'a', 'a');
      expect(result.found).toBe(true);
      expect(result.path).toEqual(['a']);
      expect(result.hops).toBe(0);
    });
  });

  describe('no path exists', () => {
    it('returns found=false for disconnected graph', () => {
      const nodes = [makeNode('a'), makeNode('b')];
      const edges: GraphEdge[] = [];
      const result = findPath(nodes, edges, 'a', 'b');
      expect(result.found).toBe(false);
      expect(result.path).toEqual([]);
    });
  });

  describe('non-existent source node', () => {
    it('returns found=false', () => {
      const nodes = [makeNode('a'), makeNode('b')];
      const edges = [makeEdge('a', 'b')];
      const result = findPath(nodes, edges, 'nonexistent', 'b');
      expect(result.found).toBe(false);
    });
  });

  describe('non-existent target node', () => {
    it('returns found=false', () => {
      const nodes = [makeNode('a'), makeNode('b')];
      const edges = [makeEdge('a', 'b')];
      const result = findPath(nodes, edges, 'a', 'nonexistent');
      expect(result.found).toBe(false);
    });
  });
});

describe('Pathfinder - Cyclical graphs', () => {
  describe('A→B→C→A cycle', () => {
    it('finds shortest path and terminates without infinite loop', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
      const edges = [
        makeEdge('a', 'b'),
        makeEdge('b', 'c'),
        makeEdge('c', 'a'), // back edge creating cycle
      ];
      // Path from a to c should be a→b→c (2 hops), not going through cycle
      const result = findPath(nodes, edges, 'a', 'c');
      expect(result.found).toBe(true);
      expect(result.path).toEqual(['a', 'b', 'c']);
    });

    it('finds path across cycle entry point', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')];
      const edges = [
        makeEdge('a', 'b'),
        makeEdge('b', 'c'),
        makeEdge('c', 'a'), // cycle
        makeEdge('c', 'd'), // exit from cycle
      ];
      const result = findPath(nodes, edges, 'a', 'd');
      expect(result.found).toBe(true);
      expect(result.path).toEqual(['a', 'b', 'c', 'd']);
    });
  });

  describe('self-referencing node', () => {
    it('finds no path from A to A with self-loop but no outgoing edges', () => {
      const nodes = [makeNode('a')];
      const edges = [makeEdge('a', 'a')];
      const result = findPath(nodes, edges, 'a', 'a');
      expect(result.found).toBe(true);
      expect(result.path).toEqual(['a']);
    });
  });
});

describe('Pathfinder - Multiple paths', () => {
  it('returns shortest path when multiple exist', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d'), makeNode('e')];
    const edges = [
      makeEdge('a', 'b'), // short path: a→b→e
      makeEdge('b', 'e'),
      makeEdge('a', 'c'), // long path: a→c→d→e
      makeEdge('c', 'd'),
      makeEdge('d', 'e'),
    ];
    const result = findPath(nodes, edges, 'a', 'e');
    expect(result.found).toBe(true);
    expect(result.path).toEqual(['a', 'b', 'e']);
    expect(result.hops).toBe(2);
  });
});

describe('Pathfinder - Dijkstra weighted path', () => {
  it('finds path with coupling weights', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')];
    const edges = [makeEdge('a', 'b'), makeEdge('a', 'c'), makeEdge('b', 'd'), makeEdge('c', 'd')];
    const couplingMap = new Map([
      ['a', 5],
      ['b', 1], // low coupling — preferred
      ['c', 20], // high coupling
      ['d', 3],
    ]);
    const result = findShortestWeightedPath(nodes, edges, 'a', 'd', couplingMap);
    expect(result.found).toBe(true);
    // Both paths have 2 hops, but a→b→d has lower coupling weight
    expect(result.path).toEqual(['a', 'b', 'd']);
  });

  it('falls back to unit weights when no coupling map', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
    const result = findShortestWeightedPath(nodes, edges, 'a', 'c');
    expect(result.found).toBe(true);
    expect(result.path).toEqual(['a', 'b', 'c']);
  });
});

describe('Pathfinder - Reachability', () => {
  describe('findReachable within maxDepth', () => {
    it('finds all nodes within 1 hop', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')];
      const edges = [makeEdge('a', 'b'), makeEdge('a', 'c'), makeEdge('b', 'd')];
      const reachable = findReachable(nodes, edges, 'a', 1);
      expect(reachable.size).toBe(2);
      expect(reachable.has('b')).toBe(true);
      expect(reachable.has('c')).toBe(true);
      expect(reachable.has('d')).toBe(false);
    });

    it('finds all nodes within 2 hops', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')];
      const edges = [makeEdge('a', 'b'), makeEdge('a', 'c'), makeEdge('b', 'd')];
      const reachable = findReachable(nodes, edges, 'a', 2);
      expect(reachable.size).toBe(3);
      expect(reachable.has('d')).toBe(true);
    });

    it('handles maxDepth=0 (no traversal)', () => {
      const nodes = [makeNode('a'), makeNode('b')];
      const edges = [makeEdge('a', 'b')];
      const reachable = findReachable(nodes, edges, 'a', 0);
      expect(reachable.size).toBe(0);
    });
  });

  describe('findDependencies (outgoing edges)', () => {
    it('traces what a node depends on', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
      const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
      // a depends on b and c (transitively)
      const deps = findDependencies(nodes, edges, 'a');
      expect(deps.size).toBe(2);
      expect(deps.has('b')).toBe(true);
      expect(deps.has('c')).toBe(true);
    });
  });

  describe('findDependents (incoming edges)', () => {
    it('traces what depends on a node', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
      const edges = [makeEdge('b', 'a'), makeEdge('c', 'a')];
      // a has dependents b and c
      const deps = findDependents(nodes, edges, 'a');
      expect(deps.size).toBe(2);
      expect(deps.has('b')).toBe(true);
      expect(deps.has('c')).toBe(true);
    });
  });
});

describe('Pathfinder - Edge cases', () => {
  describe('empty graph', () => {
    it('returns found=false for any query', () => {
      const result = findPath([], [], 'a', 'b');
      expect(result.found).toBe(false);
    });
  });

  describe('single node with no edges', () => {
    it('finds path to itself', () => {
      const nodes = [makeNode('a')];
      const result = findPath(nodes, [], 'a', 'a');
      expect(result.found).toBe(true);
      expect(result.path).toEqual(['a']);
    });

    it('no path to another node', () => {
      const nodes = [makeNode('a')];
      const result = findPath(nodes, [], 'a', 'nonexistent');
      expect(result.found).toBe(false);
    });
  });

  describe('straight line graph', () => {
    it('A→B→C→D→E finds path correctly', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d'), makeNode('e')];
      const edges = [makeEdge('a', 'b'), makeEdge('b', 'c'), makeEdge('c', 'd'), makeEdge('d', 'e')];
      const result = findPath(nodes, edges, 'a', 'e');
      expect(result.found).toBe(true);
      expect(result.path).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(result.hops).toBe(4);
    });
  });

  describe('totalCoupling scoring', () => {
    it('computes coupling sum when coupling map provided', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
      const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
      const couplingMap = new Map([
        ['a', 5],
        ['b', 3],
        ['c', 7],
      ]);
      const result = findPath(nodes, edges, 'a', 'c', couplingMap);
      expect(result.found).toBe(true);
      expect(result.totalCoupling).toBe(5 + 3 + 7);
    });
  });
});

describe('Pathfinder - Large / stress scenarios', () => {
  it('handles diamond-shaped graph', () => {
    const nodes = [makeNode('s'), makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d'), makeNode('t')];
    const edges = [
      makeEdge('s', 'a'),
      makeEdge('s', 'b'),
      makeEdge('a', 'c'),
      makeEdge('b', 'c'),
      makeEdge('c', 'd'),
      makeEdge('d', 't'),
    ];
    const result = findPath(nodes, edges, 's', 't');
    expect(result.found).toBe(true);
    expect(result.path).toEqual(['s', 'a', 'c', 'd', 't']);
  });

  it('handles dense graph quickly', () => {
    // 100 nodes in a fully connected graph
    const nodeCount = 100;
    const nodes: GraphNode[] = [];
    for (let i = 0; i < nodeCount; i++) {
      nodes.push(makeNode(`n${i}`));
    }
    const edges: GraphEdge[] = [];
    for (let i = 0; i < nodeCount; i++) {
      for (let j = 0; j < nodeCount; j++) {
        if (i !== j) {
          edges.push(makeEdge(`n${i}`, `n${j}`));
        }
      }
    }
    // BFS should find single-hop path
    const start = performance.now();
    const result = findPath(nodes, edges, 'n0', 'n50');
    const elapsed = performance.now() - start;
    expect(result.found).toBe(true);
    expect(result.hops).toBe(1);
    // Should complete quickly even for dense graph
    expect(elapsed).toBeLessThan(2000); // 2 second budget
  });
});
