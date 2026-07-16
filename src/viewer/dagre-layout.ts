import { nodes, edges, transform, layoutMode, setLayoutMode, ViewNode } from './state.js';
import { render } from './renderer.js';
import { computeDirectoryClusters, updateZoomLevel } from './minimap.js';
import { startForceSimulation, stopSimulation } from './simulation.js';
import { createLayoutWorker, computeLayoutWithWorker, terminateAllWorkers } from './worker-manager.js';
import type { LayoutResult } from './workers/protocol.js';

let workerInitialized = false;

/**
 * Ensure the layout worker is created (lazy init on first hierarchical layout).
 */
function ensureWorker(): void {
  if (!workerInitialized) {
    createLayoutWorker();
    workerInitialized = true;
  }
}

(window as any).cycleLayout = function () {
  if (layoutMode === 'force') setLayoutMode('hierarchical');
  else if (layoutMode === 'hierarchical') setLayoutMode('grid');
  else setLayoutMode('force');

  document.getElementById('layout-btn')!.textContent =
    layoutMode === 'force' ? '⊞ Force' : layoutMode === 'hierarchical' ? '⇨ Hierarchical' : '⊟ Grid';

  applyLayout();
};

function applyLayout() {
  if (!nodes.length) return;
  const container = document.getElementById('canvas-container')!;
  const w = container.clientWidth,
    h = container.clientHeight;

  if (layoutMode === 'force') {
    startForceSimulation();
    return;
  }

  stopSimulation();

  if (layoutMode === 'hierarchical') {
    applyHierarchicalLayout(w, h);
  } else if (layoutMode === 'grid') {
    applyGridLayout(w, h);
  }
}

/**
 * Apply hierarchical layout via the web worker.
 * Shows a loading indicator while computing, then applies positions.
 */
async function applyHierarchicalLayout(w: number, h: number) {
  ensureWorker();

  // Show loading skeleton
  const statusBar = document.getElementById('status-bar')!;
  const wasVisible = statusBar.classList.contains('show');
  if (!wasVisible) {
    statusBar.classList.add('show');
    statusBar.querySelector('span')!.textContent = 'Computing layout...';
  }

  // Collect raw data for structured clone transfer
  const nodeIds = nodes.map((n) => n.id);
  const edgeData = edges
    .filter((e) => e.kind === 'imports' || e.kind === 'extends' || e.kind === 'implements')
    .map((e) => ({
      source: typeof e.source === 'string' ? e.source : (e.source as ViewNode).id,
      target: typeof e.target === 'string' ? e.target : (e.target as ViewNode).id,
      kind: e.kind,
    }));

  try {
    const result = await computeLayoutWithWorker({
      mode: 'hierarchical',
      nodeIds,
      edges: edgeData,
      width: w,
      height: h,
    });

    applyWorkerResult(result, w, h);
  } catch (err) {
    console.warn('Hierarchical layout failed, falling back to grid:', err);
    applyGridLayout(w, h);
  } finally {
    // Restore status bar
    if (!wasVisible) {
      statusBar.classList.remove('show');
    }
  }
}

/**
 * Apply the layout result from the worker to the nodes and transform.
 */
function applyWorkerResult(result: LayoutResult, w: number, h: number) {
  const { positions, bounds } = result;

  for (const n of nodes) {
    const pos = positions[n.id];
    if (pos) {
      n.x = pos.x;
      n.y = pos.y;
    }
  }

  const gcx = (bounds.minX + bounds.maxX) / 2;
  const gcy = (bounds.minY + bounds.maxY) / 2;
  const gw = bounds.maxX - bounds.minX + 100;
  const gh = bounds.maxY - bounds.minY + 100;
  const scale = Math.min(w / gw, h / gh, 1.5);
  transform.k = Math.max(scale, 0.1);
  transform.x = w / 2 - gcx * transform.k;
  transform.y = h / 2 - gcy * transform.k;

  computeDirectoryClusters();
  updateZoomLevel();
  render();
}

/**
 * Grid layout — synchronous, no worker needed.
 */
function applyGridLayout(w: number, h: number) {
  const cols = Math.max(5, Math.ceil(Math.sqrt(nodes.length)));
  const cellW = w / cols;
  const cellH = h / Math.ceil(nodes.length / cols);
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].x = (i % cols) * cellW + cellW / 2;
    nodes[i].y = Math.floor(i / cols) * cellH + cellH / 2;
  }
  transform.x = 0;
  transform.y = 0;
  transform.k = 1;

  computeDirectoryClusters();
  updateZoomLevel();
  render();
}

/**
 * Clean up worker resources. Called when the viewer is closing.
 */
export function cleanupLayoutWorker(): void {
  terminateAllWorkers();
  workerInitialized = false;
}
