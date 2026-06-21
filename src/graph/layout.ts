/**
 * Graph layout algorithms for code visualization.
 *
 * Supports:
 * - force: D3 force-directed (organic, good for exploration)
 * - hierarchical: dagre layered layout (best for dependency direction)
 * - grid: Simple grid layout (for large node sets)
 */

import dagre from 'dagre';
import { GraphNode, GraphEdge } from './index.js';

export type LayoutKind = 'force' | 'hierarchical' | 'grid';

export interface LayoutResult {
  nodes: Array<GraphNode & { x: number; y: number }>;
}

/**
 * Apply dagre hierarchical layout to the graph.
 * Best for import dependency graphs — shows direction flow clearly.
 *
 * @param nodes Graph nodes (will be assigned x,y positions)
 * @param edges Graph edges (used for hierarchy)
 * @param width Available width
 * @param height Available height
 */
export function layoutHierarchical(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
): LayoutResult {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR', // Left-to-right layout
    nodesep: 60,
    ranksep: 100,
    marginx: 40,
    marginy: 40,
    edgesep: 20,
  });

  // Add nodes
  for (const n of nodes) {
    const nodeSize = NODE_SIZES[n.kind] || 50;
    g.setNode(n.id, { width: nodeSize, height: nodeSize, label: n.label });
  }

  // Add edges (only structural ones that define hierarchy)
  for (const e of edges) {
    if (e.kind === 'imports' || e.kind === 'extends' || e.kind === 'implements') {
      g.setEdge(e.source, e.target);
    }
  }

  // Run layout
  dagre.layout(g);

  // Extract positions
  const result: LayoutResult = { nodes: [] };
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const n of nodes) {
    const dagreNode = g.node(n.id);
    if (dagreNode) {
      result.nodes.push({
        ...n,
        x: dagreNode.x,
        y: dagreNode.y,
      });
    } else {
      // Fallback: place isolated nodes in a grid
      result.nodes.push({ ...n, x: width / 2, y: height / 2 });
    }
  }

  return result;
}

/**
 * Simple grid layout — arrange nodes in rows/columns.
 * Useful for very large graphs where force sim is too slow.
 */
export function layoutGrid(nodes: GraphNode[], width: number, height: number): LayoutResult {
  const cols = Math.max(5, Math.ceil(Math.sqrt(nodes.length)));
  const cellW = width / cols;
  const cellH = height / Math.ceil(nodes.length / cols);
  const margin = 10;

  return {
    nodes: nodes.map((n, i) => ({
      ...n,
      x: margin + (i % cols) * cellW + cellW / 2,
      y: margin + Math.floor(i / cols) * cellH + cellH / 2,
    })),
  };
}

export function layoutForce(nodes: GraphNode[], _edges: GraphEdge[]): LayoutResult {
  // For force layout, just return initial positions
  // D3 will handle the simulation
  return { nodes: nodes.map((n) => ({ ...n, x: 0, y: 0 })) };
}

const NODE_SIZES: Record<string, number> = {
  file: 30,
  function: 40,
  class: 50,
  interface: 45,
  type: 40,
  module: 25,
  call: 30,
  directory: 0,
  enum: 40,
};
