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
  theme,
  setTheme,
  setHotspotMode,
  setHotspotData,
  hotspotMode,
  selectedNode,
  blastRadiusActive,
  blastRadiusSource,
  blastRadiusAffected,
  setBlastRadiusActive,
  setBlastRadiusSource,
  setBlastRadiusAffected,
  heatmapOverlayEnabled,
  setHeatmapOverlayEnabled,
  hullsEnabled,
  setHullGroups,
  hullGroups,
  toggleHulls,
} from './state.js';
import { render, initWebGL } from './renderer.js';
import { setTheme as setColorsTheme, toggleColorblindMode, isColorblind } from './colors.js';
import { startForceSimulation } from './simulation.js';
import { computeDirectoryClusters, updateZoomLevel } from './minimap.js';
import { initSearch } from './search.js';
import { initInteraction } from './interaction.js';
import { initUrlHandler, restoreStateFromUrl, applyViewState, saveStateToUrl } from './url-state.js';
import { closeSidebar, renderStatsDashboard } from './sidebar.js';
import type { HotspotMode, HotspotData } from './hotspot.js';
import './sidebar.js';
import { createParserWorker, terminateAllWorkers } from './worker-manager.js';
import { cleanupLayoutWorker } from './dagre-layout.js';
import './export-helper.js';
import { computeHullGroups } from './hulls.js';

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
  let html =
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

  if (data.healthScore) {
    const hs = data.healthScore;
    const gradeColor = hs.score >= 80 ? '#3fb950' : hs.score >= 50 ? '#d29922' : '#f85149';
    html +=
      ' <span class="stat" style="color:' +
      gradeColor +
      '"><b>Health:</b> ' +
      hs.score +
      '/100 (' +
      hs.grade +
      ')</span>';
  }

  if (data.violations && data.violations.length > 0) {
    html +=
      ' <span class="stat" style="color:#f85149"><b>\u26A0\uFE0F ' +
      data.violations.length +
      ' rule violations</b></span>';
  }

  document.getElementById('stats')!.innerHTML = html;
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

  // Populate stats dashboard panels
  renderStatsDashboard(data);

  // Populate hotspot data from analytics and git info
  if (data.analytics && data.analytics.metrics) {
    const hData = new Map<string, HotspotData>();
    for (const [id, m] of data.analytics.metrics) {
      hData.set(id, {
        nodeId: id,
        complexity: m.complexity,
        churn: m.churn,
        coupling: m.coupling,
        maintainability: m.maintainability,
      });
    }
    setHotspotData(hData);
  }

  // Restore view state from URL hash
  const urlState = restoreStateFromUrl();
  applyViewState(urlState, nm);
}

// ── URL state saving on interactions ───────────────────────────────

let urlSaveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSaveUrl() {
  if (urlSaveTimer) clearTimeout(urlSaveTimer);
  urlSaveTimer = setTimeout(saveStateToUrl, 500);
}

// Hook into existing interaction functions
const origFilter = (window as any).toggleFilter;
(window as any).toggleFilter = function (kind: string) {
  if (origFilter) origFilter(kind);
  debouncedSaveUrl();
};

const origLayout = (window as any).cycleLayout;
(window as any).cycleLayout = function () {
  if (origLayout) origLayout();
  setTimeout(saveStateToUrl, 600); // after layout applies
};

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
    case 'h':
      e.preventDefault();
      (window as any).toggleHotspotMenu();
      break;
    case 'H':
      e.preventDefault();
      toggleHulls();
      if (hullsEnabled) {
        setHullGroups(computeHullGroups());
      }
      render();
      break;
    case '1':
      (window as any).setHotspotMode('complexity');
      break;
    case '2':
      (window as any).setHotspotMode('churn');
      break;
    case '3':
      (window as any).setHotspotMode('coupling');
      break;
    case '4':
      (window as any).setHotspotMode('maintainability');
      break;
    case 'p':
    case 'P':
      e.preventDefault();
      (window as any).clearPathfinder();
      break;
    case 'b':
    case 'B':
      e.preventDefault();
      if (selectedNode) {
        const nodeId = selectedNode.id;
        if (blastRadiusActive && blastRadiusSource === nodeId) {
          // Toggle off
          setBlastRadiusActive(false);
          setBlastRadiusSource(null);
          setBlastRadiusAffected(new Map());
        } else {
          // Fetch blast radius for selected node
          fetch(`/api/blast-radius?node=${encodeURIComponent(nodeId)}&depth=3`)
            .then((r) => r.json())
            .then((data) => {
              const affected = new Map<string, number>(Object.entries(data.affected).map(([k, v]) => [k, v as number]));
              setBlastRadiusActive(true);
              setBlastRadiusSource(nodeId);
              setBlastRadiusAffected(affected);
              render();
            })
            .catch(() => {});
        }
        render();
      }
      break;
    case '5':
      (window as any).setHotspotMode('hotspot');
      break;
    case '6':
      e.preventDefault();
      toggleHeatmapOverlay();
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
  initUrlHandler();

  // Create the parser worker (lazy — gracefully handles unavailability)
  createParserWorker();

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

function applyTheme(t: 'dark' | 'light') {
  setTheme(t);
  setColorsTheme(t);
  document.documentElement.classList.toggle('light', t === 'light');
  // Preserve the "<emoji> Theme" label structure; only swap the leading glyph.
  const btn = document.getElementById('theme-btn');
  if (btn && btn.firstChild) btn.firstChild.textContent = t === 'light' ? '\u{2600}\u{FE0F} ' : '\u{1F319} ';
  render();
}

(window as any).toggleTheme = () => {
  const next = theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem('codemapper-theme', next);
  } catch {}
};

// Hull toggle with button state
(window as any).toggleHulls = () => {
  toggleHulls();
  if (hullsEnabled) {
    setHullGroups(computeHullGroups());
  }
  const btn = document.getElementById('hull-btn');
  if (btn) btn.setAttribute('aria-pressed', String(hullsEnabled));
  render();
};

// Colorblind mode toggle with localStorage persistence
(window as any).toggleColorblind = () => {
  toggleColorblindMode();
  const btn = document.getElementById('cb-btn');
  if (btn) btn.setAttribute('aria-pressed', String(isColorblind));
  try {
    localStorage.setItem('codemapper-colorblind', String(isColorblind));
  } catch {}
  render();
};

// Load saved colorblind preference on init
try {
  const savedCb = localStorage.getItem('codemapper-colorblind');
  if (savedCb === 'true' && !isColorblind) {
    toggleColorblindMode();
    const btn = document.getElementById('cb-btn');
    if (btn) btn.setAttribute('aria-pressed', 'true');
  }
} catch {}

// Load saved theme on init
try {
  const saved = localStorage.getItem('codemapper-theme') as 'dark' | 'light' | null;
  if (saved && saved !== theme) applyTheme(saved);
} catch {}

window.addEventListener('resize', resize);

// Clean up worker threads when the viewer closes
window.addEventListener('beforeunload', () => {
  cleanupLayoutWorker();
  terminateAllWorkers();
});

document.addEventListener('DOMContentLoaded', init);

// ── Hotspot mode toggle ───────────────────────────────────────────────

let hotspotMenuOpen = false;

(window as any).toggleHotspotMenu = (e?: MouseEvent) => {
  e?.stopPropagation();
  const menu = document.getElementById('hotspot-menu');
  const btn = document.getElementById('hotspot-btn');
  if (!menu || !btn) return;
  hotspotMenuOpen = !hotspotMenuOpen;
  menu.classList.toggle('hidden', !hotspotMenuOpen);
  btn.classList.toggle('active', hotspotMenuOpen);
};

(window as any).setHotspotMode = (mode: HotspotMode) => {
  setHotspotMode(mode);
  // Update button state
  const btn = document.getElementById('hotspot-btn');
  if (btn) {
    btn.classList.toggle('active', mode !== 'default');
    btn.setAttribute('data-mode', mode);
  }
  // Update menu active state
  const menu = document.getElementById('hotspot-menu');
  if (menu) {
    menu.querySelectorAll('button').forEach((b: HTMLElement) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.mode === mode);
    });
  }
  // Close menu
  const hotspotMenu = document.getElementById('hotspot-menu');
  if (hotspotMenu) hotspotMenu.classList.add('hidden');
  hotspotMenuOpen = false;
  if (btn) btn.classList.remove('active');
  // Refresh git panel stats (hot files may change with different mode)
  renderStatsDashboard();
  render();
};

// Close hotspot menu on outside click
document.addEventListener('click', (e: MouseEvent) => {
  const menu = document.getElementById('hotspot-menu');
  const btn = document.getElementById('hotspot-btn');
  if (menu && btn && !menu.contains(e.target as Node) && e.target !== btn) {
    menu.classList.add('hidden');
    hotspotMenuOpen = false;
    btn.classList.remove('active');
  }
});
