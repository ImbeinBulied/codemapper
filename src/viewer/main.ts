import {
  setNodes,
  setEdges,
  setNodeMap,
  setGraphData,
  setTransform,
  setShowMinimap,
  cycleNodes,
  WEBGL_THRESHOLD,
  transform,
  setFocusNode,
} from './state.js';
import { render } from './renderer.js';
import { initWebGL } from './renderer.js';
import { startForceSimulation } from './simulation.js';
import { computeDirectoryClusters, updateZoomLevel } from './minimap.js';
import { initSearch } from './search.js';
import { initInteraction } from './interaction.js';
import { closeSidebar } from './sidebar.js';
import './sidebar.js';
import './dagre-layout.js';
import './export-helper.js';

declare const d3: any;

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const statusBar = document.getElementById('status-bar')!;
const errorOverlay = document.getElementById('error-overlay')!;
const errorMsg = document.getElementById('error-msg')!;
const legend = document.getElementById('legend')!;

function showError(msg: string) {
  errorMsg.textContent = msg;
  errorOverlay.style.display = 'flex';
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const container = document.getElementById('canvas-container')!;
  const w = container.clientWidth,
    h = container.clientHeight;
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

const COLORS = {
  file: '#30363d',
  function: '#d2a8ff',
  class: '#58a6ff',
  interface: '#79c0ff',
  type: '#3fb950',
  module: '#8b949e',
  call: '#f0883e',
};

function buildLegend() {
  legend.innerHTML = Object.entries(COLORS)
    .map(
      ([k, v]) => '<div class="legend-item"><div class="legend-dot" style="background:' + v + '"></div>' + k + '</div>',
    )
    .join('');
}

function updateStats(data: any) {
  const s = data.stats;
  document.getElementById('stats')!.innerHTML =
    '<span class="stat"><b>' +
    s.files +
    '</b> files</span>' +
    '<span class="stat"><b>' +
    s.functions +
    '</b> funcs</span>' +
    '<span class="stat"><b>' +
    s.classes +
    '</b> types</span>' +
    '<span class="stat"><b>' +
    s.imports +
    '</b> imports</span>' +
    '<span class="stat"><b>' +
    data.graph.nodes.length +
    '</b> nodes · <b>' +
    data.graph.edges.length +
    '</b> edges</span>';
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
  const eds = data.graph.edges
    .map((e: any) => Object.assign({}, e, { source: nm.get(e.source), target: nm.get(e.target) }))
    .filter((e: any) => {
      if (!e.source || !e.target) {
        droppedEdges++;
        return false;
      }
      return true;
    });
  setEdges(eds);
  if (droppedEdges > 0) console.warn('Dropped ' + droppedEdges + ' edges with missing nodes');

  if (nds.length > WEBGL_THRESHOLD) {
    if (initWebGL()) console.log('WebGL renderer enabled (' + nds.length + ' nodes)');
  }
  if (nds.length > 20) setShowMinimap(true);

  const container = document.getElementById('canvas-container')!;
  const cx = container.clientWidth / 2,
    cy = container.clientHeight / 2;
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

document.addEventListener('keydown', (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault();
      transform.x += 60;
      render();
      break;
    case 'ArrowRight':
      e.preventDefault();
      transform.x -= 60;
      render();
      break;
    case 'ArrowUp':
      e.preventDefault();
      transform.y += 60;
      render();
      break;
    case 'ArrowDown':
      e.preventDefault();
      transform.y -= 60;
      render();
      break;
    case '+':
    case '=':
      e.preventDefault();
      transform.k *= 1.15;
      updateZoomLevel();
      render();
      break;
    case '-':
    case '_':
      e.preventDefault();
      transform.k /= 1.15;
      updateZoomLevel();
      render();
      break;
    case 'Escape':
      document.getElementById('context-menu')!.classList.remove('show');
      setFocusNode(null);
      closeSidebar();
      break;
    case '/':
      e.preventDefault();
      document.getElementById('search-input')!.focus();
      break;
    case 'k':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        document.getElementById('search-input')!.focus();
      }
      break;
    case '0':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        (window as any).resetZoom();
      }
      break;
  }
});

async function init() {
  if (typeof d3 === 'undefined') {
    showError('D3.js failed to load. Check your internet connection and reload.');
    statusBar.classList.remove('show');
    return;
  }
  statusBar.classList.add('show');
  initSearch();
  initInteraction();
  await loadGraph();
  resize();
  connectWebSocket();
}

function connectWebSocket() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${proto}//${window.location.host}`;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (ws) ws.close();
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'refresh') {
            statusBar.classList.add('show');
            document.getElementById('status-bar')!.querySelector('span')!.textContent =
              'Codebase changed, re-analyzing...';
            loadGraph().then(() => {
              document.getElementById('status-bar')!.querySelector('span')!.textContent = 'Analyzing codebase...';
            });
          }
        } catch {}
      };
      ws.onclose = () => {
        ws = null;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        ws?.close();
      };
    } catch {}
  }

  connect();
}

async function loadGraph() {
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
}

window.addEventListener('resize', resize);
document.addEventListener('DOMContentLoaded', init);
