/**
 * Shareable view URLs — encodes viewer state in the URL hash so
 * graph views can be bookmarked, shared, and navigated (back/forward).
 *
 * Encoded state:
 *   x, y    — pan position
 *   k       — zoom level
 *   h       — hidden kinds (bitmask or comma list)
 *   l       — layout mode (f/h/g)
 *   t       — theme (d/l)
 *   q       — search query
 *   s       — selected node id
 *
 * URL example: #x=100&y=50&k=1.5&h=module,call&l=h&t=l&q=utils
 */

import {
  transform, hiddenKinds, layoutMode, theme, searchTerm, selectedNode,
  setLayoutMode, setTheme, setSearchTerm, setSelectedNode,
  ViewNode,
} from './state.js';

// ── Key used for debounce timer ─────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;

// ── State fields to serialize ───────────────────────────────────────

interface ViewState {
  x?: number;
  y?: number;
  k?: number;
  h?: string;    // comma-separated hidden kinds
  l?: string;    // f=force, h=hierarchical, g=grid
  t?: string;    // d=dark, l=light
  q?: string;    // search query
  s?: string;    // selected node id
}

const HIDDEN_DEFAULTS = 'module,call';

// ── Save current state to URL ──────────────────────────────────────

export function saveStateToUrl() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const parts: string[] = [];

    // Only encode non-default values to keep URLs short
    if (Math.abs(transform.x) > 1) parts.push(`x=${Math.round(transform.x)}`);
    if (Math.abs(transform.y) > 1) parts.push(`y=${Math.round(transform.y)}`);
    if (Math.abs(transform.k - 1) > 0.05) parts.push(`k=${transform.k.toFixed(2)}`);

    const hiddenStr = Object.entries(hiddenKinds)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .sort()
      .join(',');
    if (hiddenStr && hiddenStr !== HIDDEN_DEFAULTS) parts.push(`h=${encodeURIComponent(hiddenStr)}`);

    if (layoutMode !== 'force') parts.push(`l=${layoutMode[0]}`); // f/h/g
    if (theme !== 'dark') parts.push(`t=l`);
    if (searchTerm) parts.push(`q=${encodeURIComponent(searchTerm)}`);
    if (selectedNode) parts.push(`s=${encodeURIComponent(selectedNode.id)}`);

    const hash = parts.join('&');
    if (hash) {
      history.replaceState(null, '', '#' + hash);
    } else if (location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }, 300); // debounce 300ms
}

// ── Restore state from URL ──────────────────────────────────────────

export function restoreStateFromUrl(): ViewState {
  const hash = location.hash.slice(1); // remove '#'
  if (!hash) return {};

  const params = new URLSearchParams(hash);
  const state: ViewState = {};

  const x = params.get('x');
  const y = params.get('y');
  const k = params.get('k');
  const h = params.get('h');
  const l = params.get('l');
  const t = params.get('t');
  const q = params.get('q');
  const s = params.get('s');

  if (x) state.x = parseFloat(x);
  if (y) state.y = parseFloat(y);
  if (k) state.k = parseFloat(k);
  if (h) state.h = h;
  if (l) state.l = l;
  if (t) state.t = t;
  if (q) state.q = q;
  if (s) state.s = s;

  return state;
}

// ── Apply restored state after graph is initialized ────────────────

export function applyViewState(state: ViewState, nodeMap: Map<string, ViewNode>) {
  if (!state || Object.keys(state).length === 0) return;

  if (state.x !== undefined) transform.x = state.x;
  if (state.y !== undefined) transform.y = state.y;
  if (state.k !== undefined) transform.k = state.k;

  if (state.h !== undefined) {
    const hidden = state.h.split(',').filter(Boolean);
    for (const kind of ['file', 'function', 'class', 'interface', 'type', 'module', 'call']) {
      hiddenKinds[kind] = hidden.includes(kind);
    }
  }

  if (state.l === 'h') setLayoutMode('hierarchical');
  else if (state.l === 'g') setLayoutMode('grid');
  else if (state.l === 'f') setLayoutMode('force');

  if (state.t === 'l') {
    setTheme('light');
    document.documentElement.classList.add('light');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = '☀️';
  }

  if (state.q) {
    setSearchTerm(state.q);
    const input = document.getElementById('search-input') as HTMLInputElement;
    if (input) input.value = state.q;
  }

  if (state.s && nodeMap) {
    const node = nodeMap.get(state.s);
    if (node) setSelectedNode(node);
  }

  // Update filter buttons to match restored state
  const fn = (window as any).updateFilterButtons;
  if (typeof fn === 'function') fn();
}

// ── Listen for hash changes (back/forward navigation) ──────────────

export function initUrlHandler() {
  window.addEventListener('hashchange', () => {
    const state = restoreStateFromUrl();
    // Import nodeMap dynamically to avoid circular deps
    import('./state.js').then(({ nodeMap }) => {
      applyViewState(state, nodeMap);
      import('./renderer.js').then(({ render }) => render());
    });
  });
}
