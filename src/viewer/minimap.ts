// @ts-nocheck — Ported from plain JS. Types refined later.
import {
  nodes,
  nodeMap,
  transform,
  directoryClusters,
  hiddenKinds,
  edges,
  showMinimap,
  setShowMinimap,
  setDirectoryClusters,
  ViewNode,
} from './state.js';
import { COLORS } from './colors.js';
import { render } from './renderer.js';

const minimap = document.getElementById('minimap')!;
const mmCanvas = document.getElementById('mm-canvas') as HTMLCanvasElement;
const mmViewport = document.getElementById('mm-viewport')!;

export function updateMinimap() {
  if (!showMinimap || nodes.length < 5) {
    minimap.style.display = 'none';
    return;
  }
  minimap.style.display = 'block';

  const w = 160,
    h = 120;
  mmCanvas.width = w;
  mmCanvas.height = h;
  const mmCtx = mmCanvas.getContext('2d')!;

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    if (n.x == null) continue;
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  const rangeX = maxX - minX || 1,
    rangeY = maxY - minY || 1;
  const scale = Math.min(w / rangeX, h / rangeY) * 0.9;
  const ox = (w - rangeX * scale) / 2 - minX * scale;
  const oy = (h - rangeY * scale) / 2 - minY * scale;

  mmCtx.fillStyle = '#0d1117';
  mmCtx.fillRect(0, 0, w, h);

  mmCtx.strokeStyle = '#30363d';
  mmCtx.lineWidth = 0.5;
  for (const e of edges) {
    const src = e.source,
      tgt = e.target;
    if (!src.x || !tgt.x) continue;
    mmCtx.beginPath();
    mmCtx.moveTo(src.x * scale + ox, src.y * scale + oy);
    mmCtx.lineTo(tgt.x * scale + ox, tgt.y * scale + oy);
    mmCtx.stroke();
  }

  for (const n of nodes) {
    if (n.x == null || hiddenKinds[n.kind]) continue;
    const c = COLORS[n.kind] || '#8b949e';
    mmCtx.fillStyle = c;
    mmCtx.fillRect(n.x * scale + ox - 1.5, n.y * scale + oy - 1.5, 3, 3);
  }

  const vx = (-transform.x / transform.k) * scale + ox;
  const vy = (-transform.y / transform.k) * scale + oy;
  const vw = (container.clientWidth / transform.k) * scale;
  const vh = (container.clientHeight / transform.k) * scale;
  mmViewport.style.left = Math.max(0, vx) + 'px';
  mmViewport.style.top = Math.max(0, vy) + 'px';
  mmViewport.style.width = Math.min(w - Math.max(0, vx), vw) + 'px';
  mmViewport.style.height = Math.min(h - Math.max(0, vy), vh) + 'px';
}

const container = document.getElementById('canvas-container')!;
minimap.addEventListener('click', (e: MouseEvent) => {
  const rect = minimap.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    if (n.x == null) continue;
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  const rangeX = maxX - minX || 1,
    rangeY = maxY - minY || 1;
  const w = 160,
    h = 120;
  const scale2 = Math.min(w / rangeX, h / rangeY) * 0.9;
  const ox2 = (w - rangeX * scale2) / 2 - minX * scale2;
  const oy2 = (h - rangeY * scale2) / 2 - minY * scale2;

  transform.x = container.clientWidth / 2 - ((mx - ox2) / scale2) * transform.k;
  transform.y = container.clientHeight / 2 - ((my - oy2) / scale2) * transform.k;
  updateZoomLevel();
  render();
});

export function computeDirectoryClusters() {
  const dirMap = new Map<string, ViewNode[]>();
  for (const n of nodes) {
    if (n.kind !== 'file' || n.x == null) continue;
    const dir = n.filePath.substring(0, n.filePath.lastIndexOf('/')) || '/';
    if (!dirMap.has(dir)) dirMap.set(dir, []);
    dirMap.get(dir)!.push(n);
  }
  const clusters: any[] = [];
  for (const [dir, group] of dirMap) {
    if (group.length < 2) continue;
    const xs = group.map((n) => n.x!);
    const ys = group.map((n) => n.y!);
    const minX2 = Math.min(...xs),
      maxX2 = Math.max(...xs);
    const minY2 = Math.min(...ys),
      maxY2 = Math.max(...ys);
    const pad = 30;
    clusters.push({
      dir,
      label: dir.split('/').pop() || dir,
      minX: minX2 - pad,
      maxX: maxX2 + pad,
      minY: minY2 - pad,
      maxY: maxY2 + pad,
      cx: (minX2 + maxX2) / 2,
      cy: (minY2 + maxY2) / 2,
    });
  }
  setDirectoryClusters(clusters);
}

export function updateZoomLevel() {
  const el = document.getElementById('zoom-level');
  if (el) el.textContent = Math.round(transform.k * 100) + '%';
}
