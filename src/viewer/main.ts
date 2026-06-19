/**
 * codemapper viewer — entry point.
 *
 * Bundled by esbuild. Loads all modules and initializes the graph viewer.
 * D3 and dagre are loaded as globals via script tags in index.html.
 */

import { setNodes, setEdges, setNodeMap, setGraphData, setTransform, setShowMinimap, cycleNodes, WEBGL_THRESHOLD, transform } from './state.js';
import { render } from './renderer.js';
import { initWebGL } from './renderer.js';
import { startForceSimulation } from './simulation.js';
import { computeDirectoryClusters, updateZoomLevel } from './minimap.js';
import { initSearch } from './search.js';
import './interaction.js';
import './sidebar.js';
import './dagre-layout.js';
import './export-helper.js';

declare const d3: any;

// ── Bootstrap ──────────────────────────────────────────────────────

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const statusBar = document.getElementById('status-bar')!;
const errorOverlay = document.getElementById('error-overlay')!;
const errorMsg = document.getElementById('error-msg')!;
const legend = document.getElementById('legend')!;
const zoomLevelEl = document.getElementById('zoom-level')!;

function showError(msg: string) {
  errorMsg.textContent = msg;
  errorOverlay.style.display = 'flex';
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const container = document.getElementById('canvas-container')!;
  const w = container.clientWidth, h = container.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const glCanvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
  if (glCanvas) {
    glCanvas.width = w;
    glCanvas.height = h;
    glCanvas.style.width = w + 'px';
    glCanvas.style.height = h + 'px';
  }
  render();
}

function buildLegend() {
  const COLORS = {
    file: '#30363d', function: '#d2a8ff', class: '#58a6ff',
    interface: '#79c0ff', type: '#3fb950', module: '#8b949e',
    call: '#f0883e',
  };
  legend.innerHTML = Object.entries(COLORS)
    .map(([k, v]) => '<div class="legend-item"><div class="legend-dot" style="background:' + v + '"></div>' + k + '</div>')
    .join('');
}

function updateStats(data: any) {
  const s = data.stats;
  const cycleCount = data.cycleCount || 0;
  document.getElementById('stats')!.innerHTML =
    '<span class="stat"><b>' + s.files + '</b> files</span>' +
    '<span class="stat"><b>' + s.functions + '</b> funcs</span>' +
    '<span class="stat"><b>' + s.classes + '</b> types</span>' +
    '<span class="stat"><b>' + s.imports + '</b> imports</span>' +
    '<span class="stat"><b>' + data.graph.nodes.length + '</b> nodes · <b>' + data.graph.edges.length + '</b> edges</span>' +
    (cycleCount > 0 ? '<span class="stat" style="color:#f85149"><b>' + cycleCount + '</b> cycles</span>' : '');
}

function initGraph(data: any) {
  setGraphData(data);
  const nm = new Map<string, any>();
  const nds = data.graph.nodes.map((n: any) => {
    const obj = Object.assign({}, n, { x: null, y: null, vx: 0, vy: 0 });
    nm.set(n.id, obj);
    return obj;
  });
  setNodes(nds);
  setNodeMap(nm);

  let droppedEdges = 0;
  const eds = data.graph.edges.map((e: any) =>
    Object.assign({}, e, { source: nm.get(e.source), target: nm.get(e.target) })
  ).filter((e: any) => {
    if (!e.source || !e.target) { droppedEdges++; return false; }
    return true;
  });
  setEdges(eds);
  if (droppedEdges > 0) console.warn('Dropped ' + droppedEdges + ' edges with missing nodes');

  // Detect cycles
  if (data.cycles) {
    for (const c of data.cycles) {
      for (const n of c.nodes) cycleNodes.add(n);
    }
  }

  // Init WebGL for large graphs
  if (nds.length > WEBGL_THRESHOLD) {
    if (initWebGL()) {
      console.log('WebGL renderer enabled (' + nds.length + ' nodes)');
    }
  }

  // Enable minimap for non-trivial graphs
  if (nds.length > 20) setShowMinimap(true);

  const container = document.getElementById('canvas-container')!;
  const cx = container.clientWidth / 2, cy = container.clientHeight / 2;
  nds.forEach((n: any, i: number) => {
    const angle = (i / nds.length) * Math.PI * 2;
    const rad = Math.min(container.clientWidth, container.clientHeight) * 0.3;
    n.x = cx + rad * Math.cos(angle);
    n.y = cy + rad * Math.sin(angle);
  });

  startForceSimulation();
  updateStats(data);
  buildLegend();
  statusBar.classList.remove('show');
  updateZoomLevel();
}

// ── Keyboard shortcuts ─────────────────────────────────────────────

import { setFocusNode } from './state.js';
import { closeSidebar } from './sidebar.js';

document.addEventListener('keydown', (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

  const PAN = 60;
  const ZOOM = 1.15;

  switch (e.key) {
    case 'ArrowLeft': e.preventDefault(); transform.x += PAN; render(); break;
    case 'ArrowRight': e.preventDefault(); transform.x -= PAN; render(); break;
    case 'ArrowUp': e.preventDefault(); transform.y += PAN; render(); break;
    case 'ArrowDown': e.preventDefault(); transform.y -= PAN; render(); break;
    case '+': case '=': e.preventDefault(); transform.k *= ZOOM; updateZoomLevel(); render(); break;
    case '-': case '_': e.preventDefault(); transform.k /= ZOOM; updateZoomLevel(); render(); break;
    case 'Escape':
      document.getElementById('context-menu')!.classList.remove('show');
      setFocusNode(null);
      closeSidebar();
      break;
    case '/': e.preventDefault(); document.getElementById('search-input')!.focus(); break;
    case 'k': if (e.ctrlKey || e.metaKey) { e.preventDefault(); document.getElementById('search-input')!.focus(); } break;
    case '0': if (e.ctrlKey || e.metaKey) { e.preventDefault(); (window as any).resetZoom(); } break;
  }
});

// ── Init ───────────────────────────────────────────────────────────

async function init() {
  if (typeof (d3 as any) === 'undefined') {
    showError('D3.js failed to load. Check your internet connection and reload.');
    statusBar.classList.remove('show');
    return;
  }
  statusBar.classList.add('show');
  initSearch();
  try {
    const res = await fetch('/api/analyze');
    if (!res.ok) throw new Error('Server returned ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    initGraph(data);
  } catch (err: any) {
    showError('Failed to analyze codebase: ' + err.message);
    statusBar.classList.remove('show');
  }
  resize();
}

window.addEventListener('resize', resize);
document.addEventListener('DOMContentLoaded', init);
