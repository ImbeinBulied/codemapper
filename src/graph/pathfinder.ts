/**
 * Pathfinder for dependency graphs.
 * BFS for unweighted shortest path and reachability analysis.
 * Dijkstra variant using coupling as edge weights (when available).
 */

import { GraphNode, GraphEdge } from './index.js';

export interface PathResult {
  /** Node IDs in order from source to target (inclusive) */
  path: string[];
  /** Whether a path was found */
  found: boolean;
  /** Total coupling score across all nodes in the path (if coupling data available) */
  totalCoupling?: number;
  /** Number of hops (edges) in the path */
  hops: number;
}

/**
 * Build adjacency list from edges.
 * Can optionally reverse direction (for tracing dependents / incoming edges).
 */
function buildAdjacency(edges: GraphEdge[], reverse: boolean = false): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const src = reverse ? e.target : e.source;
    const tgt = reverse ? e.source : e.target;
    if (!adj.has(src)) adj.set(src, []);
    adj.get(src)!.push(tgt);
  }
  return adj;
}

/**
 * BFS shortest path between two nodes.
 *
 * Handles cyclical graphs via a visited set and terminates safely.
 * Returns the first (shortest) path found in terms of number of edges.
 *
 * @param nodes - Graph nodes (used to validate node existence)
 * @param edges - Graph edges
 * @param sourceId - Source node ID
 * @param targetId - Target node ID
 * @param couplingMap - Optional map of nodeId → coupling score for weighted scoring
 * @returns PathResult with the shortest path, or { found: false } if none exists
 */
export function findPath(
  nodes: GraphNode[],
  edges: GraphEdge[],
  sourceId: string,
  targetId: string,
  couplingMap?: Map<string, number>,
): PathResult {
  // Validate node existence
  const nodeIdSet = new Set(nodes.map((n) => n.id));
  if (!nodeIdSet.has(sourceId)) {
    return { path: [], found: false, hops: 0 };
  }
  if (!nodeIdSet.has(targetId)) {
    return { path: [], found: false, hops: 0 };
  }

  // Same node — trivially a path of length 0
  if (sourceId === targetId) {
    return {
      path: [sourceId],
      found: true,
      hops: 0,
      totalCoupling: couplingMap ? (couplingMap.get(sourceId) ?? 0) : undefined,
    };
  }

  const adj = buildAdjacency(edges, false);

  // BFS with path tracking
  const visited = new Set<string>([sourceId]);
  // Queue stores { node, pathToNode }
  const queue: Array<{ node: string; path: string[] }> = [{ node: sourceId, path: [sourceId] }];
  let head = 0; // Use index-based queue for O(1) dequeue

  while (head < queue.length) {
    const { node, path } = queue[head++];

    const neighbors = adj.get(node);
    if (!neighbors) continue;

    for (const next of neighbors) {
      if (next === targetId) {
        const fullPath = [...path, next];
        return {
          path: fullPath,
          found: true,
          hops: path.length, // edges traversed = path length - 1 = current path length
          totalCoupling: couplingMap ? computeTotalCoupling(fullPath, couplingMap) : undefined,
        };
      }
      if (!visited.has(next)) {
        visited.add(next);
        queue.push({ node: next, path: [...path, next] });
      }
    }
  }

  return { path: [], found: false, hops: 0 };
}

/**
 * Dijkstra shortest path using coupling as edge weights.
 *
 * When coupling data is available, edge weight is derived from the target
 * node's coupling score: weight = 1 + (coupling / 100). This prefers paths
 * through lower-coupling nodes first.
 *
 * Falls back to unit weights (identical to BFS) when no coupling map is provided.
 *
 * @param nodes - Graph nodes
 * @param edges - Graph edges
 * @param sourceId - Source node ID
 * @param targetId - Target node ID
 * @param couplingMap - Optional map of nodeId → coupling score
 * @returns PathResult with the weighted-shortest path
 */
export function findShortestWeightedPath(
  nodes: GraphNode[],
  edges: GraphEdge[],
  sourceId: string,
  targetId: string,
  couplingMap?: Map<string, number>,
): PathResult {
  const nodeIdSet = new Set(nodes.map((n) => n.id));
  if (!nodeIdSet.has(sourceId)) {
    return { path: [], found: false, hops: 0 };
  }
  if (!nodeIdSet.has(targetId)) {
    return { path: [], found: false, hops: 0 };
  }

  if (sourceId === targetId) {
    return {
      path: [sourceId],
      found: true,
      hops: 0,
      totalCoupling: couplingMap ? (couplingMap.get(sourceId) ?? 0) : undefined,
    };
  }

  const adj = buildAdjacency(edges, false);

  // Dijkstra: distances and predecessors
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const settled = new Set<string>();

  // Initialize all nodes that appear as either source or target of an edge,
  // or are explicitly in the nodes list (but we iterate from source reachable)
  dist.set(sourceId, 0);
  prev.set(sourceId, null);

  // Priority queue via array (simple, fine for sparse graphs up to 50K nodes)
  const pq: Array<{ node: string; dist: number }> = [{ node: sourceId, dist: 0 }];

  while (pq.length > 0) {
    // Find minimum distance entry (linear scan — Dijkstra with binary heap
    // would be faster for dense graphs but this is simpler and fine for our use)
    let minIdx = 0;
    for (let i = 1; i < pq.length; i++) {
      if (pq[i].dist < pq[minIdx].dist) minIdx = i;
    }
    const { node } = pq[minIdx];
    pq.splice(minIdx, 1);

    if (node === targetId) {
      // Reconstruct path
      const path = reconstructPath(prev, targetId);
      return {
        path,
        found: true,
        hops: path.length - 1,
        totalCoupling: couplingMap ? computeTotalCoupling(path, couplingMap) : undefined,
      };
    }

    if (settled.has(node)) continue;
    settled.add(node);

    const neighbors = adj.get(node);
    if (!neighbors) continue;

    for (const next of neighbors) {
      if (settled.has(next)) continue;

      // Edge weight: 1 + coupling-based penalty
      const edgeWeight = couplingMap ? 1 + Math.max(0, (couplingMap.get(next) ?? 0) / 100) : 1;

      const newDist = (dist.get(node) ?? Infinity) + edgeWeight;

      if (newDist < (dist.get(next) ?? Infinity)) {
        dist.set(next, newDist);
        prev.set(next, node);
        pq.push({ node: next, dist: newDist });
      }
    }
  }

  return { path: [], found: false, hops: 0 };
}

/**
 * Trace all dependents of a node (incoming edges / what depends on this node).
 * Returns all nodes reachable via incoming edges within maxDepth hops.
 *
 * @param nodes - Graph nodes
 * @param edges - Graph edges
 * @param sourceId - Node to trace dependents for
 * @param maxDepth - Max traversal depth (default: Infinity for full traversal)
 * @returns Set of dependent node IDs (excluding the source itself)
 */
export function findDependents(
  nodes: GraphNode[],
  edges: GraphEdge[],
  sourceId: string,
  maxDepth: number = Infinity,
): Set<string> {
  return bfsReachable(edges, sourceId, maxDepth, true /* reverse */);
}

/**
 * Trace dependencies of a node (outgoing edges / what this node depends on).
 * Returns all nodes reachable via outgoing edges within maxDepth hops.
 *
 * @param nodes - Graph nodes
 * @param edges - Graph edges
 * @param sourceId - Node to trace dependencies for
 * @param maxDepth - Max traversal depth (default: Infinity for full traversal)
 * @returns Set of dependency node IDs (excluding the source itself)
 */
export function findDependencies(
  nodes: GraphNode[],
  edges: GraphEdge[],
  sourceId: string,
  maxDepth: number = Infinity,
): Set<string> {
  return bfsReachable(edges, sourceId, maxDepth, false /* forward */);
}

export interface BlastRadiusResult {
  /** Map of nodeId → depth (1 = direct dependent, 2 = dependent of dependent, etc.) */
  affected: Map<string, number>;
  /** Total number of affected nodes */
  totalAffected: number;
  /** Number of direct dependents (depth 1) */
  directDependents: number;
  /** Number of transitive dependents (depth > 1) */
  transitiveDependents: number;
  /** Percentage of graph affected (0-100) */
  percentageAffected: number;
  /** Max depth reached */
  maxDepth: number;
}

/**
 * Compute blast radius: all nodes that would be affected by a change to sourceId.
 * Uses reverse BFS (traces incoming edges) up to maxDepth hops.
 *
 * @param nodes - Graph nodes
 * @param edges - Graph edges
 * @param sourceId - The node being changed
 * @param maxDepth - Maximum traversal depth (default: 3)
 * @returns BlastRadiusResult with affected nodes and statistics
 */
export function computeBlastRadius(
  nodes: GraphNode[],
  edges: GraphEdge[],
  sourceId: string,
  maxDepth: number = 3,
): BlastRadiusResult {
  const adj = buildAdjacency(edges, true); // reverse: trace incoming edges

  const affected = new Map<string, number>();
  const queue: Array<{ node: string; depth: number }> = [];
  let head = 0;

  // Start from direct dependents (depth 1)
  const directNeighbors = adj.get(sourceId);
  if (directNeighbors) {
    for (const next of directNeighbors) {
      if (next !== sourceId) {
        affected.set(next, 1);
        queue.push({ node: next, depth: 1 });
      }
    }
  }

  // BFS to find transitive dependents
  while (head < queue.length) {
    const { node, depth } = queue[head++];

    if (depth >= maxDepth) continue;

    const neighbors = adj.get(node);
    if (!neighbors) continue;

    for (const next of neighbors) {
      if (next === sourceId) continue; // skip self
      if (!affected.has(next)) {
        affected.set(next, depth + 1);
        queue.push({ node: next, depth: depth + 1 });
      }
    }
  }

  const directDependents = Array.from(affected.values()).filter((d) => d === 1).length;
  const transitiveDependents = affected.size - directDependents;
  const totalNodes = nodes.length;
  const percentageAffected = totalNodes > 0 ? (affected.size / totalNodes) * 100 : 0;
  const maxDepthReached = affected.size > 0 ? Math.max(...affected.values()) : 0;

  return {
    affected,
    totalAffected: affected.size,
    directDependents,
    transitiveDependents,
    percentageAffected,
    maxDepth: maxDepthReached,
  };
}

/**
 * Find all reachable nodes from sourceId within maxDepth hops.
 *
 * @param nodes - Graph nodes
 * @param edges - Graph edges
 * @param sourceId - Starting node ID
 * @param maxDepth - Maximum number of hops (default: Infinity)
 * @returns Set of reachable node IDs (excluding the source itself)
 */
export function findReachable(
  nodes: GraphNode[],
  edges: GraphEdge[],
  sourceId: string,
  maxDepth: number = Infinity,
): Set<string> {
  return bfsReachable(edges, sourceId, maxDepth, false);
}

/**
 * Core BFS reachability with depth limit.
 */
function bfsReachable(edges: GraphEdge[], sourceId: string, maxDepth: number, reverse: boolean): Set<string> {
  const adj = buildAdjacency(edges, reverse);

  const visited = new Set<string>([sourceId]);
  const reachable = new Set<string>();
  const queue: Array<{ node: string; depth: number }> = [{ node: sourceId, depth: 0 }];
  let head = 0;

  while (head < queue.length) {
    const { node, depth } = queue[head++];

    if (depth > 0) reachable.add(node);
    if (depth >= maxDepth) continue;

    const neighbors = adj.get(node);
    if (!neighbors) continue;

    for (const next of neighbors) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push({ node: next, depth: depth + 1 });
      }
    }
  }

  return reachable;
}

/**
 * Reconstruct path from predecessor map (for Dijkstra).
 */
function reconstructPath(prev: Map<string, string | null>, targetId: string): string[] {
  const path: string[] = [];
  let cur: string | null = targetId;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev.get(cur) ?? null;
  }
  return path;
}

/**
 * Sum coupling scores for all nodes in the path.
 */
function computeTotalCoupling(path: string[], couplingMap: Map<string, number>): number {
  let total = 0;
  for (const id of path) {
    total += couplingMap.get(id) ?? 0;
  }
  return total;
}
