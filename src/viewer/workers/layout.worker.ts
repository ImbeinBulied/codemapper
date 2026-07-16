/**
 * Web worker for dagre hierarchical layout computation.
 *
 * Bundled separately from the main viewer bundle so dagre is only loaded
 * when a hierarchical layout is requested. Runs in a dedicated worker
 * thread, keeping the main thread responsive.
 *
 * Protocol:
 *   Request:  { type: 'layout:compute', payload: LayoutRequestPayload, id: number }
 *   Response: { type: 'layout:result',  payload: LayoutResult,         id: number }
 *   Error:    { type: 'layout:error',   payload: null,                  id: number, error: string }
 */

/// <reference lib="webworker" />

import type { WorkerRequest, LayoutRequestPayload, LayoutResult } from './protocol.js';
import { MessageType } from './protocol.js';

const dagre: any = require('dagre');

self.onmessage = (event: MessageEvent<WorkerRequest<LayoutRequestPayload>>) => {
  const msg = event.data;

  if (msg.type !== MessageType.LAYOUT_COMPUTE) {
    postMessage({ type: MessageType.LAYOUT_ERROR, payload: null, id: msg.id, error: `Unknown type: ${msg.type}` });
    return;
  }

  try {
    const result = computeHierarchicalLayout(msg.payload);
    postMessage({ type: MessageType.LAYOUT_RESULT, payload: result, id: msg.id }, { transfer: [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    postMessage({ type: MessageType.LAYOUT_ERROR, payload: null, id: msg.id, error: message });
  }
};

function computeHierarchicalLayout(payload: LayoutRequestPayload): LayoutResult {
  const { nodeIds, edges, width, height } = payload;

  if (nodeIds.length === 0) {
    return { positions: {}, bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100, marginx: 40, marginy: 40 });

  for (const id of nodeIds) {
    g.setNode(id, { width: 40, height: 30 });
  }

  for (const e of edges) {
    if (e.kind === 'imports' || e.kind === 'extends' || e.kind === 'implements') {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  for (const id of nodeIds) {
    const dn = g.node(id);
    if (dn) {
      const x = dn.x;
      const y = dn.y;
      positions[id] = { x, y };
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // Fallback for isolated nodes not returned by dagre
  for (const id of nodeIds) {
    if (!positions[id]) {
      positions[id] = { x: width / 2, y: height / 2 };
    }
  }

  return {
    positions,
    bounds: {
      minX: minX === Infinity ? 0 : minX,
      maxX: maxX === -Infinity ? width : maxX,
      minY: minY === Infinity ? 0 : minY,
      maxY: maxY === -Infinity ? height : maxY,
    },
  };
}
