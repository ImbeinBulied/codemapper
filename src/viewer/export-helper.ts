import { graphData, showCycles, setShowCycles } from './state.js';
import { render } from './renderer.js';

(window as any).toggleExport = function(e: MouseEvent) {
  const dd = document.getElementById('export-dropdown')!;
  dd.classList.toggle('show');
  e.stopPropagation();
};

(window as any).toggleCycles = function() {
  setShowCycles(!showCycles);
  const btn = document.getElementById('cycle-btn');
  if (btn) btn.classList.toggle('hidden-kind', !showCycles);
  render();
};

(window as any).exportPNG = function() {
  document.getElementById('export-dropdown')!.classList.remove('show');
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

(window as any).exportJSON = function() {
  document.getElementById('export-dropdown')!.classList.remove('show');
  const data = JSON.stringify(graphData, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'codemapper-export.json';
  a.click();
  URL.revokeObjectURL(a.href);
};
