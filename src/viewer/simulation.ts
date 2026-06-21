import { nodes, edges, nodeMap, sim, simSettled, layoutMode, setSim, setSimSettled, ViewNode } from './state.js';
import { NODE_SIZE } from './colors.js';
import { render } from './renderer.js';
import { computeDirectoryClusters } from './minimap.js';

declare const d3: any;

export function startForceSimulation() {
  if (sim) sim.stop();
  const container = document.getElementById('canvas-container')!;
  const cx = container.clientWidth / 2,
    cy = container.clientHeight / 2;

  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2;
    const rad = Math.min(container.clientWidth, container.clientHeight) * 0.3;
    n.x = cx + rad * Math.cos(angle);
    n.y = cy + rad * Math.sin(angle);
    n.fx = null;
    n.fy = null;
  });

  setSimSettled(false);
  const s = d3
    .forceSimulation(nodes)
    .force(
      'link',
      d3
        .forceLink(edges)
        .id((d: any) => d.id)
        .distance((d: any) => {
          if (d.kind === 'contains') return 60;
          if (d.kind === 'imports') return 200;
          return 150;
        })
        .strength((d: any) => (d.kind === 'contains' ? 0.8 : 0.3)),
    )
    .force('charge', d3.forceManyBody().strength(-600))
    .force('center', d3.forceCenter(cx, cy))
    .force(
      'collision',
      d3.forceCollide().radius((d: any) => NODE_SIZE[d.kind] || 20),
    )
    .alphaDecay(0.05)
    .on('tick', () => {
      computeDirectoryClusters();
      render();
    })
    .on('end', () => {
      setSimSettled(true);
    });
  setSim(s);
}

export function stopSimulation() {
  if (sim) {
    sim.stop();
    setSim(null);
  }
}
