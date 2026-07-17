import { graphData, showCycles, setShowCycles } from './state.js';
import { render } from './renderer.js';

/**
 * Close every toolbar dropdown (More menu + its submenus).
 * Called when one opens, on selection, and on outside clicks.
 */
function closeAllDropdowns() {
  for (const id of ['more-dropdown', 'hotspot-menu', 'export-dropdown']) {
    document.getElementById(id)?.classList.add('hidden');
  }
  const more = document.getElementById('more-btn');
  if (more) more.setAttribute('aria-expanded', 'false');
}

(window as any).closeAllDropdowns = closeAllDropdowns;

/** Toggle the top-level "More" dropdown. */
(window as any).toggleMoreMenu = function (e: MouseEvent) {
  e.stopPropagation();
  const dd = document.getElementById('more-dropdown');
  if (!dd) return;
  const btn = e.currentTarget as HTMLElement;
  const open = !dd.classList.contains('hidden');
  closeAllDropdowns();
  if (!open) {
    dd.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
  }
};

// Click outside any open dropdown closes them all.
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('.more-menu')) return; // inside the More container — let inner handlers run
  const anyOpen = ['more-dropdown', 'hotspot-menu', 'export-dropdown'].some(
    (id) => !document.getElementById(id)?.classList.contains('hidden'),
  );
  if (anyOpen) closeAllDropdowns();
});

(window as any).toggleExport = function (e: MouseEvent) {
  e.stopPropagation();
  const dd = document.getElementById('export-dropdown');
  if (!dd) return;
  const open = !dd.classList.contains('hidden');
  closeAllDropdowns();
  if (!open) dd.classList.remove('hidden');
};

(window as any).toggleCycles = function () {
  setShowCycles(!showCycles);
  const btn = document.getElementById('cycle-btn');
  if (btn) btn.classList.toggle('hidden-kind', !showCycles);
  render();
};

// NOTE: toggleTheme + saved-theme init live in main.ts (applyTheme).
// Theme handling was previously duplicated here; main.ts owns it since it
// also drives the canvas renderer's color set via setColorsTheme().

(window as any).exportPNG = function () {
  document.getElementById('export-dropdown')!.classList.add('hidden');
  const container = document.getElementById('canvas-container')!;
  const dpr = window.devicePixelRatio || 1;
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = container.clientWidth * dpr;
  exportCanvas.height = container.clientHeight * dpr;
  const exportCtx = exportCanvas.getContext('2d')!;
  exportCtx.fillStyle = '#0d1117';
  exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  exportCtx.drawImage(canvas, 0, 0);
  exportCanvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob!);
    a.download = 'codemapper-export.png';
    a.click();
    URL.revokeObjectURL(a.href);
  });
};

(window as any).exportJSON = function () {
  document.getElementById('export-dropdown')!.classList.add('hidden');
  const data = JSON.stringify(graphData, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'codemapper-export.json';
  a.click();
  URL.revokeObjectURL(a.href);
};
