/**
 * Cycle detection for dependency graphs.
 * Uses DFS with coloring to find cycles in the import/call graph.
 */

import { GraphEdge, GraphNode } from '../graph/index.js';

interface CycleResult {
  nodes: string[];
  edgeKind: string;
}

/**
 * Detect cycles in the file-level import graph.
 * Returns a list of cycles, each represented by the node IDs in the cycle.
 *
 * Algorithm: DFS with WHITE/GRAY/BLACK coloring.
 * WHITE = unvisited, GRAY = in current path (ancestor), BLACK = fully explored.
 */
export function detectCycles(
  nodes: GraphNode[],
  edges: GraphEdge[],
): CycleResult[] {
  // Build adjacency list for file → file imports
  const fileNodes = new Set<string>();
  const adj = new Map<string, string[]>();

  // Only track file-level edges
  for (const e of edges) {
    if (e.kind !== 'imports' && e.kind !== 'calls') continue;
    const src = e.source;
    const tgt = e.target;
    if (!adj.has(src)) adj.set(src, []);
    adj.get(src)!.push(tgt);
    fileNodes.add(src);
    fileNodes.add(tgt);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const cycles: CycleResult[] = [];

  for (const node of fileNodes) {
    color.set(node, WHITE);
    parent.set(node, null);
  }

  function dfs(node: string) {
    color.set(node, GRAY);

    const neighbors = adj.get(node) || [];
    for (const next of neighbors) {
      if (!color.has(next)) continue; // skip nodes outside our set

      if (color.get(next) === GRAY) {
        // Back-edge found! Reconstruct the cycle.
        const cycle: string[] = [];
        let cur: string | null = node;
        while (cur !== null && cur !== next) {
          cycle.unshift(cur);
          cur = parent.get(cur) ?? null;
        }
        cycle.unshift(next);
        cycle.push(next); // close the cycle

        if (cycle.length >= 3) {
          cycles.push({ nodes: cycle, edgeKind: 'imports' });
        }
      } else if (color.get(next) === WHITE) {
        parent.set(next, node);
        dfs(next);
      }
    }

    color.set(node, BLACK);
  }

  for (const node of fileNodes) {
    if (color.get(node) === WHITE) {
      dfs(node);
    }
  }

  // Deduplicate cycles (same set of nodes, different entry points)
  return dedupCycles(cycles);
}

function dedupCycles(cycles: CycleResult[]): CycleResult[] {
  const seen = new Set<string>();
  return cycles.filter(c => {
    const sorted = [...c.nodes].sort().join(',');
    if (seen.has(sorted)) return false;
    seen.add(sorted);
    return true;
  });
}

/**
 * Check if a node is part of any cycle.
 */
export function isInCycle(nodeId: string, cycles: CycleResult[]): boolean {
  return cycles.some(c => c.nodes.includes(nodeId));
}

/**
 * Get all nodes in any cycle.
 */
export function getCyclicNodes(cycles: CycleResult[]): Set<string> {
  const cyclic = new Set<string>();
  for (const c of cycles) {
    for (const n of c.nodes) cyclic.add(n);
  }
  return cyclic;
}
