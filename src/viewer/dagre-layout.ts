import {
  nodes, edges, transform, layoutMode,
  setLayoutMode, ViewNode,
} from './state.js';
import { render } from './renderer.js';
import { computeDirectoryClusters, updateZoomLevel } from './minimap.js';
import { startForceSimulation, stopSimulation } from './simulation.js';

declare const dagre: any;

(window as any).cycleLayout = function() {
  if (layoutMode === 'force') setLayoutMode('hierarchical');
  else if (layoutMode === 'hierarchical') setLayoutMode('grid');
  else setLayoutMode('force');

  document.getElementById('layout-btn')!.textContent =
    layoutMode === 'force' ? '⊞ Force' :
    layoutMode === 'hierarchical' ? '⇨ Hierarchical' : '⊟ Grid';

  applyLayout();
};

function applyLayout() {
  if (!nodes.length) return;
  const container = document.getElementById('canvas-container')!;
  const w = container.clientWidth, h = container.clientHeight;

  if (layoutMode === 'force') {
    startForceSimulation();
    return;
  }

  stopSimulation();

  if (layoutMode === 'hierarchical' && typeof dagre !== 'undefined') {
    try {
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100, marginx: 40, marginy: 40 });

      for (const n of nodes) g.setNode(n.id, { width: 40, height: 30, label: n.label });
      for (const e of edges) {
        if (e.kind === 'imports' || e.kind === 'extends' || e.kind === 'implements') {
          g.setEdge(
            typeof e.source === 'string' ? e.source : (e.source as any).id,
            typeof e.target === 'string' ? e.target : (e.target as any).id
          );
        }
      }

      dagre.layout(g);

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of nodes) {
        const dn = g.node(n.id);
        if (dn) {
          n.x = dn.x; n.y = dn.y;
          if (dn.x < minX) minX = dn.x;
          if (dn.x > maxX) maxX = dn.x;
          if (dn.y < minY) minY = dn.y;
          if (dn.y > maxY) maxY = dn.y;
        }
      }

      const gcx = (minX + maxX) / 2, gcy = (minY + maxY) / 2;
      const gw = maxX - minX + 100, gh = maxY - minY + 100;
      const scale = Math.min(w / gw, h / gh, 1.5);
      transform.k = Math.max(scale, 0.1);
      transform.x = w / 2 - gcx * transform.k;
      transform.y = h / 2 - gcy * transform.k;
    } catch (e) {
      console.warn('dagre layout failed:', e);
    }
  } else if (layoutMode === 'grid') {
    const cols = Math.max(5, Math.ceil(Math.sqrt(nodes.length)));
    const cellW = w / cols;
    const cellH = h / Math.ceil(nodes.length / cols);
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].x = (i % cols) * cellW + cellW / 2;
      nodes[i].y = Math.floor(i / cols) * cellH + cellH / 2;
    }
    transform.x = 0; transform.y = 0; transform.k = 1;
  }

  computeDirectoryClusters();
  updateZoomLevel();
  render();
}
