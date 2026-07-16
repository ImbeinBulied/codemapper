// @ts-nocheck — WebGL path uses low-level typed arrays / context methods; types incomplete
import { COLORS, NODE_SIZE } from './colors.js';
import {
  nodes,
  edges,
  nodeMap,
  transform,
  hoveredNode,
  hoveredEdge,
  selectedNode,
  focusNode,
  searchTerm,
  matchedNodes,
  hiddenKinds,
  cycleNodes,
  showCycles,
  layoutMode,
  directoryClusters,
  sim,
  simSettled,
  glRunning,
  setGlRunning,
  transitioningNodes,
  ViewNode,
  ViewEdge,
  LODLevel,
  currentLOD,
  setLOD,
  hotspotMode,
  hotspotData,
  pathfinderActive,
  activePath,
  selectedSourceNode,
  selectedTargetNode,
  reachableNodes,
} from './state.js';
import { getNodeColor, getHotspotRange } from './hotspot.js';
import { updateMinimap } from './minimap.js';
import { saveStateToUrl } from './url-state.js';

// ── LOD (Level of Detail) ──────────────────────────────────────────

function getLODLevel(zoom: number): LODLevel {
  if (zoom < 0.2) return LODLevel.CLUSTER;
  if (zoom < 0.5) return LODLevel.MODULE;
  return LODLevel.DETAILED;
}

function updateLODIndicator(renderedCount: number, blobCount: number) {
  const el = document.getElementById('zoom-level');
  if (!el) return;
  const names = ['Cluster', 'Module', 'Detailed'];
  const current = getLODLevel(transform.k);
  const info =
    current === LODLevel.CLUSTER
      ? ` ${renderedCount} nodes → ${blobCount} blobs`
      : current === LODLevel.MODULE
        ? ` ${renderedCount} files`
        : ` ${renderedCount} nodes`;
  el.textContent = `${Math.round(transform.k * 100)}% | LOD: ${names[current]}${info}`;
}

interface ClusterBlob {
  dir: string;
  label: string;
  cx: number;
  cy: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  fileCount: number;
  avgComplexity: number;
}

function computeClusterBlobs(): ClusterBlob[] {
  const dirMap = new Map<string, ViewNode[]>();
  for (const n of nodes) {
    if (n.kind !== 'file' || n.x == null || n.y == null) continue;
    if (hiddenKinds[n.kind]) continue;
    const dir = n.filePath.split('/').slice(0, -1).join('/') || '/';
    if (!dirMap.has(dir)) dirMap.set(dir, []);
    dirMap.get(dir)!.push(n);
  }
  const blobs: ClusterBlob[] = [];
  for (const [dir, group] of dirMap) {
    if (group.length === 0) continue;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    let totalComplexity = 0;
    for (const n of group) {
      if (n.x! < minX) minX = n.x!;
      if (n.x! > maxX) maxX = n.x!;
      if (n.y! < minY) minY = n.y!;
      if (n.y! > maxY) maxY = n.y!;
      // Approximate complexity from description or kind
      const complexity = n.description ? Math.min(n.description.length / 10, 5) : 1;
      totalComplexity += complexity;
    }
    blobs.push({
      dir,
      label: dir.split('/').filter(Boolean).pop() || dir,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      minX,
      maxX,
      minY,
      maxY,
      fileCount: group.length,
      avgComplexity: totalComplexity / group.length,
    });
  }
  return blobs;
}

function renderClusterBlobs(
  ctx: CanvasRenderingContext2D,
  blobs: ClusterBlob[],
  visMinX: number,
  visMinY: number,
  visMaxX: number,
  visMaxY: number,
) {
  for (const blob of blobs) {
    // Viewport culling
    if (blob.minX > visMaxX || blob.maxX < visMinX || blob.minY > visMaxY || blob.maxY < visMinY) continue;
    const r = Math.sqrt(blob.fileCount) * 8;
    // Color by average complexity (green → yellow → red)
    const complexity = Math.min(blob.avgComplexity / 5, 1);
    const rr = Math.round(0x30 + complexity * 0xc8);
    const gg = Math.round(0x60 - complexity * 0x30);
    const bb = Math.round(0x3d - complexity * 0x20);
    const color = `rgb(${rr},${gg},${bb})`;
    const isHovered = hoveredNode && blob.dir.includes(hoveredNode.filePath.split('/').slice(0, -1).join('/'));
    ctx.save();
    ctx.translate(blob.cx, blob.cy);
    // Glow for hovered cluster
    if (isHovered) {
      ctx.shadowColor = '#58a6ff';
      ctx.shadowBlur = 16;
    }
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = color + '44';
    ctx.fill();
    ctx.strokeStyle = isHovered ? '#58a6ff' : color;
    ctx.lineWidth = isHovered ? 2.5 / transform.k : 1.5 / transform.k;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Label
    if (transform.k > 0.1) {
      ctx.fillStyle = '#e6edf3';
      ctx.font = Math.max(9, Math.round(11 * transform.k)) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelText = blob.fileCount > 1 ? `${blob.label} (${blob.fileCount})` : blob.label;
      ctx.fillText(labelText, 0, 0);
    }
    ctx.restore();
  }
}

// Store computed blobs for hit testing
let lastClusterBlobs: ClusterBlob[] = [];
export function getClusterBlobs(): ClusterBlob[] {
  return lastClusterBlobs;
}

// ── Pathfinder helpers ──────────────────────────────────────────

/** Build a set of node IDs on the active path for O(1) lookup. */
function buildActivePathSet(): Set<string> {
  return new Set(activePath);
}

/** Build a set of edge keys (source→target) on the active path for O(1) lookup. */
function buildPathEdgeSet(): Set<string> {
  const edgeSet = new Set<string>();
  for (let i = 0; i < activePath.length - 1; i++) {
    edgeSet.add(`${activePath[i]}→${activePath[i + 1]}`);
  }
  return edgeSet;
}

/**
 * Draw the pathfinder overlay: highlighted path edges, animated dashes,
 * and source/target node markers.
 * Used by both Canvas 2D mode (integrated) and WebGL mode (overlay on 2D canvas).
 */
function renderPathOverlay(ctx: CanvasRenderingContext2D, w: number, h: number) {
  if (!pathfinderActive || activePath.length === 0) return;

  const pathNodeSet = buildActivePathSet();
  const pathEdgeSet = buildPathEdgeSet();
  const time = Date.now() / 1000; // seconds for animation

  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  // ── 1. Draw highlighted path edges ──
  for (const e of edges) {
    const src = e.source as any;
    const tgt = e.target as any;
    if (!src?.x || !tgt?.x) continue;
    const srcId = src.id ?? src;
    const tgtId = tgt.id ?? tgt;
    const edgeKey = `${srcId}→${tgtId}`;
    if (!pathEdgeSet.has(edgeKey)) continue;

    const sx = src.x,
      sy = src.y,
      tx = tgt.x,
      ty = tgt.y;

    // Glow
    ctx.shadowColor = '#58a6ff';
    ctx.shadowBlur = 8;

    // Main edge line
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 3 / transform.k;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ── 2. Animated particles along edge ──
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) continue;

    // Draw 3 particles per edge, staggered
    const particleSpeed = 1.5; // cycles per second
    for (let p = 0; p < 3; p++) {
      const progress = (time * particleSpeed + p / 3) % 1;
      const px = sx + dx * progress;
      const py = sy + dy * progress;

      const alpha = 1 - progress; // fade toward target
      const particleSize = 3 + (1 - progress) * 2; // shrink toward target

      ctx.fillStyle = '#58a6ff';
      ctx.globalAlpha = alpha * 0.9;
      ctx.beginPath();
      ctx.arc(px, py, particleSize / transform.k, 0, Math.PI * 2);
      ctx.fill();
    }

    // Direction arrow at midpoint
    ctx.globalAlpha = 0.7;
    const midX = (sx + tx) / 2;
    const midY = (sy + ty) / 2;
    const angle = Math.atan2(dy, dx);
    const arrowSize = 6 / transform.k;
    ctx.fillStyle = '#58a6ff';
    ctx.beginPath();
    ctx.moveTo(midX + arrowSize * Math.cos(angle), midY + arrowSize * Math.sin(angle));
    ctx.lineTo(midX + arrowSize * 0.5 * Math.cos(angle + 2.4), midY + arrowSize * 0.5 * Math.sin(angle + 2.4));
    ctx.lineTo(midX + arrowSize * 0.5 * Math.cos(angle - 2.4), midY + arrowSize * 0.5 * Math.sin(angle - 2.4));
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // ── 3. Source and target node highlights ──
  for (const n of nodes) {
    if (n.x == null || n.y == null) continue;
    const nid = n.id;

    if (nid === selectedSourceNode || nid === selectedTargetNode) {
      const isSrc = nid === selectedSourceNode;
      const color = isSrc ? '#3fb950' : '#f85149'; // green source, red target
      const label = isSrc ? 'SOURCE' : 'TARGET';

      ctx.save();
      ctx.translate(n.x, n.y);

      // Glow
      ctx.shadowColor = color;
      ctx.shadowBlur = isSrc ? 24 : 24;

      // Outer ring
      ctx.strokeStyle = color;
      ctx.lineWidth = 3 / transform.k;
      ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(time * 2));
      ctx.beginPath();
      ctx.arc(0, 0, 22 / transform.k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Label above
      ctx.fillStyle = color;
      ctx.globalAlpha = 1;
      ctx.font = `bold ${Math.max(9, Math.round(10 * transform.k))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, 0, -24 / transform.k - 2 / transform.k);

      ctx.restore();
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

export function render() {
  if (glRunning && nodes.length > 500) {
    renderWebGL();
    // Draw pathfinder overlay on 2D canvas when WebGL is active
    if (pathfinderActive && activePath.length > 0) {
      const container = document.getElementById('canvas-container')!;
      const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, container.clientWidth, container.clientHeight);
        renderPathOverlay(ctx, container.clientWidth, container.clientHeight);
      }
    }
    const canvas = document.getElementById('canvas');
    const glCanvas = document.getElementById('gl-canvas');
    if (canvas) canvas.style.display = 'block';
    if (glCanvas) glCanvas.style.display = 'block';
    saveStateToUrl();
    return;
  }
  renderCanvas2D();
  // Draw pathfinder overlay on top of Canvas 2D
  if (pathfinderActive && activePath.length > 0) {
    const container = document.getElementById('canvas-container')!;
    const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      renderPathOverlay(ctx, container.clientWidth, container.clientHeight);
    }
  }
  const glCanvas = document.getElementById('gl-canvas');
  if (glCanvas) glCanvas.style.display = 'none';
  const canvas = document.getElementById('canvas');
  if (canvas) canvas.style.display = 'block';
  updateMinimap();
  saveStateToUrl();
}

function renderCanvas2D() {
  const container = document.getElementById('canvas-container')!;
  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = container.clientWidth,
    h = container.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  // Viewport culling: calculate visible bounds with 50px padding
  const PAD = 50 / transform.k;
  const visMinX = -transform.x / transform.k - PAD;
  const visMinY = -transform.y / transform.k - PAD;
  const visMaxX = visMinX + w / transform.k + PAD * 2;
  const visMaxY = visMinY + h / transform.k + PAD * 2;

  // Compute LOD level based on zoom
  const lod = getLODLevel(transform.k);
  setLOD(lod);

  const gridSize = 40;
  ctx.strokeStyle = '#161b22';
  ctx.lineWidth = 1 / transform.k;
  const minX = -transform.x / transform.k - gridSize;
  const minY = -transform.y / transform.k - gridSize;
  const maxX = minX + w / transform.k + gridSize * 2;
  const maxY = minY + h / transform.k + gridSize * 2;
  ctx.beginPath();
  for (let x = Math.floor(minX / gridSize) * gridSize; x < maxX; x += gridSize) {
    ctx.moveTo(x, minY);
    ctx.lineTo(x, maxY);
  }
  for (let y = Math.floor(minY / gridSize) * gridSize; y < maxY; y += gridSize) {
    ctx.moveTo(minX, y);
    ctx.lineTo(maxX, y);
  }
  ctx.stroke();

  const hasHover = !!hoveredNode;
  const hasFocus = !!focusNode;

  // ── LOD: CLUSTER level — render directory blobs instead of nodes ──
  if (lod === LODLevel.CLUSTER) {
    const blobs = computeClusterBlobs();
    lastClusterBlobs = blobs;
    // Render edges (very faint at cluster level)
    ctx.globalAlpha = 0.05;
    for (const e of edges) {
      const src = e.source as any,
        tgt = e.target as any;
      if (!src.x || !tgt.x) continue;
      if (
        (src.x < visMinX && tgt.x < visMinX) ||
        (src.x > visMaxX && tgt.x > visMaxX) ||
        (src.y < visMinY && tgt.y < visMinY) ||
        (src.y > visMaxY && tgt.y > visMaxY)
      )
        continue;
      ctx.strokeStyle = COLORS['edge_' + e.kind] || '#8b949e';
      ctx.lineWidth = 0.8 / transform.k;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    renderClusterBlobs(ctx, blobs, visMinX, visMinY, visMaxX, visMaxY);
    updateLODIndicator(nodes.length, blobs.length);
    ctx.restore();
    return;
  }

  for (const dc of directoryClusters) {
    if (dc.minX > maxX || dc.maxX < minX || dc.minY > maxY || dc.maxY < minY) continue;
    const cx2 = (dc.minX + dc.maxX) / 2,
      cy2 = dc.minY;
    ctx.fillStyle = '#161b22';
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 1 / transform.k;
    const rr = 8 / transform.k;
    ctx.beginPath();
    ctx.moveTo(dc.minX + rr, dc.minY);
    ctx.lineTo(dc.maxX - rr, dc.minY);
    ctx.quadraticCurveTo(dc.maxX, dc.minY, dc.maxX, dc.minY + rr);
    ctx.lineTo(dc.maxX, dc.maxY - rr);
    ctx.quadraticCurveTo(dc.maxX, dc.maxY, dc.maxX - rr, dc.maxY);
    ctx.lineTo(dc.minX + rr, dc.maxY);
    ctx.quadraticCurveTo(dc.minX, dc.maxY, dc.minX, dc.maxY - rr);
    ctx.lineTo(dc.minX, dc.minY + rr);
    ctx.quadraticCurveTo(dc.minX, dc.minY, dc.minX + rr, dc.minY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (transform.k > 0.3) {
      ctx.fillStyle = '#30363d';
      ctx.font = Math.max(9, Math.round(10 * transform.k)) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(dc.label, cx2, cy2 - 4 / transform.k);
    }
  }

  for (const e of edges) {
    const src = e.source as any,
      tgt = e.target as any;
    if (!src.x || !tgt.x) continue;
    // Viewport culling: skip edges entirely outside visible area
    if (
      (src.x < visMinX && tgt.x < visMinX) ||
      (src.x > visMaxX && tgt.x > visMaxX) ||
      (src.y < visMinY && tgt.y < visMinY) ||
      (src.y > visMaxY && tgt.y > visMaxY)
    )
      continue;
    const sx = src.x,
      sy = src.y,
      tx = tgt.x,
      ty = tgt.y;
    let cycleEdge = false,
      related = false,
      isFocusRelated = false;
    if (hasHover && (e.source === hoveredNode || e.target === hoveredNode)) related = true;
    if (hasFocus && (e.source === focusNode || e.target === focusNode)) isFocusRelated = true;
    if (
      showCycles &&
      cycleNodes.size > 0 &&
      cycleNodes.has((e.source as any).id) &&
      cycleNodes.has((e.target as any).id)
    )
      cycleEdge = true;
    ctx.strokeStyle = cycleEdge ? COLORS.cycle_edge : COLORS['edge_' + e.kind] || '#8b949e';
    ctx.lineWidth = related || isFocusRelated ? 2.5 / transform.k : 1.2 / transform.k;
    let alpha = 0.3;
    if (hasHover && !related) alpha = 0.06;
    if (hasFocus && isFocusRelated) alpha = 0.7;
    if (hasFocus && !isFocusRelated) alpha = 0.04;
    // Dim non-path edges when pathfinder is active
    if (pathfinderActive && activePath.length > 0) {
      const srcId = (e.source as any).id ?? e.source;
      const tgtId = (e.target as any).id ?? e.target;
      const edgeKey = `${srcId}→${tgtId}`;
      if (!buildPathEdgeSet().has(edgeKey)) {
        alpha *= 0.15;
      }
    }
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (e.label && (related || isFocusRelated) && transform.k > 0.4) {
      ctx.fillStyle = '#8b949e';
      ctx.font = Math.max(8, Math.round(9 * transform.k)) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(e.label, (sx + tx) / 2, (sy + ty) / 2 - 3 / transform.k);
    }
  }

  const drawnNodes = nodes.filter((n) => {
    if (n.x == null) return false;
    // Viewport culling: skip nodes outside visible area
    if (n.x < visMinX || n.x > visMaxX || n.y < visMinY || n.y > visMaxY) return false;
    // LOD: MODULE level — only render file nodes, skip functions/classes
    if (lod === LODLevel.MODULE && n.kind !== 'file' && n.kind !== 'directory') return false;
    if (!hiddenKinds[n.kind]) return true;
    return transitioningNodes.has(n.id) && transitioningNodes.get(n.id)! > 0;
  });
  drawnNodes.sort((a, b) => (a === hoveredNode ? 1 : b === hoveredNode ? -1 : 0));

  for (const n of drawnNodes) {
    let fadeAlpha = 1;
    if (hiddenKinds[n.kind]) {
      fadeAlpha = transitioningNodes.get(n.id) ?? 1;
      if (fadeAlpha <= 0) continue;
    }
    const size = (NODE_SIZE[n.kind] || 20) * 0.5;
    const isHover = n === hoveredNode,
      isSel = n === selectedNode;
    const isMatch = searchTerm && matchedNodes.includes(n);
    const isFocus = n === focusNode;
    const isInCycle = showCycles && cycleNodes.has(n.id);
    ctx.save();
    ctx.translate(n.x, n.y);
    const defaultColor = COLORS[n.kind] || '#8b949e';
    const color =
      hotspotMode !== 'default' ? getNodeColor(n as any, hotspotMode, hotspotData, defaultColor) : defaultColor;
    let glowColor = null,
      glowBlur = 0;
    if (isInCycle) {
      glowColor = '#f85149';
      glowBlur = 16;
    } else if (isSel) {
      glowColor = '#58a6ff';
      glowBlur = 20;
    } else if (isHover) {
      glowColor = color;
      glowBlur = 12;
    } else if (isMatch) {
      glowColor = '#f0883e';
      glowBlur = 16;
    } else if (isFocus) {
      glowColor = '#58a6ff';
      glowBlur = 16;
    }
    if (glowColor) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = glowBlur;
    }
    if (fadeAlpha < 1) ctx.globalAlpha *= fadeAlpha;
    // Dim non-path nodes when pathfinder is active
    if (pathfinderActive && activePath.length > 0 && !buildActivePathSet().has(n.id)) {
      ctx.globalAlpha *= 0.15;
    }
    ctx.beginPath();
    let borderColor = '#30363d';
    if (isInCycle) borderColor = '#f85149';
    else if (isSel) borderColor = '#58a6ff';
    else if (isHover) borderColor = '#e6edf3';
    else if (isMatch) borderColor = '#f0883e';
    else if (isFocus) borderColor = '#58a6ff';
    let bw = 1;
    if (isSel || isHover || isFocus || isMatch) bw = 2;
    const r = size;
    if (n.kind === 'file') {
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    } else if (n.kind === 'function') {
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
    } else if (n.kind === 'class') {
      const rr2 = Math.min(4 / transform.k, r);
      ctx.moveTo(-r, -r + rr2);
      ctx.quadraticCurveTo(-r, -r, -r + rr2, -r);
      ctx.lineTo(r - rr2, -r);
      ctx.quadraticCurveTo(r, -r, r, -r + rr2);
      ctx.lineTo(r, r - rr2);
      ctx.quadraticCurveTo(r, r, r - rr2, r);
      ctx.lineTo(-r + rr2, r);
      ctx.quadraticCurveTo(-r, r, -r, r - rr2);
      ctx.closePath();
    } else if (n.kind === 'interface' || n.kind === 'type') {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
      }
      ctx.closePath();
    } else {
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
    }
    ctx.fillStyle = color + '22';
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = bw / transform.k;
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (transform.k > 0.3) {
      let textColor = '#8b949e';
      if (isHover) textColor = '#e6edf3';
      else if (isMatch) textColor = '#f0883e';
      else if (isFocus) textColor = '#e6edf3';
      ctx.fillStyle = textColor;
      ctx.font = Math.max(9, Math.round(11 * transform.k)) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(n.label.length > 18 ? n.label.slice(0, 16) + '..' : n.label, 0, size + 3 / transform.k);
    }
    ctx.restore();
  }

  // Animate transitions: fade hidden nodes out over ~200ms
  if (transitioningNodes.size > 0) {
    for (const [id, alpha] of transitioningNodes) {
      const next = alpha - 0.08;
      if (next <= 0) transitioningNodes.delete(id);
      else transitioningNodes.set(id, next);
    }
    // Keep rendering until all transitions complete
    if (sim && simSettled && transitioningNodes.size > 0) {
      requestAnimationFrame(() => render());
    }
  }

  // Update LOD indicator
  if (lod !== LODLevel.CLUSTER) {
    updateLODIndicator(drawnNodes.length, 0);
  }

  // Draw hotspot legend when in hotspot mode
  if (hotspotMode !== 'default') {
    const range = getHotspotRange(hotspotMode);
    const legendX = 20;
    const legendY = h - 80;
    const legendW = 200;
    const legendH = 12;

    // Background
    ctx.fillStyle = '#161b22ee';
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(legendX - 8, legendY - 28, legendW + 16, legendH + 44, 6);
    ctx.fill();
    ctx.stroke();

    // Title
    ctx.fillStyle = '#e6edf3';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(range.label, legendX, legendY - 4);

    // Gradient bar — use Magma palette for hotspot mode
    if (hotspotMode === 'hotspot') {
      // Draw Magma palette gradient
      const gradient = ctx.createLinearGradient(legendX, 0, legendX + legendW, 0);
      gradient.addColorStop(0, 'rgb(0, 0, 0)');
      gradient.addColorStop(0.2, 'rgb(51, 0, 89)');
      gradient.addColorStop(0.4, 'rgb(102, 41, 0)');
      gradient.addColorStop(0.6, 'rgb(166, 95, 0)');
      gradient.addColorStop(0.8, 'rgb(230, 56, 0)');
      gradient.addColorStop(1, 'rgb(255, 251, 240)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(legendX, legendY, legendW, legendH, 3);
      ctx.fill();
    } else {
      // Standard green-yellow-red gradient
      const gradient = ctx.createLinearGradient(legendX, 0, legendX + legendW, 0);
      gradient.addColorStop(0, 'rgb(0, 200, 50)');
      gradient.addColorStop(0.5, 'rgb(255, 200, 50)');
      gradient.addColorStop(1, 'rgb(255, 0, 50)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(legendX, legendY, legendW, legendH, 3);
      ctx.fill();
    }

    // Min/Max labels
    ctx.fillStyle = '#8b949e';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(range.min), legendX, legendY + legendH + 2);
    ctx.textAlign = 'right';
    ctx.fillText(String(range.max), legendX + legendW, legendY + legendH + 2);
  }

  ctx.restore();
}
let gl: WebGLRenderingContext | null = null,
  glProgram: WebGLProgram | null = null,
  glCanvas: HTMLCanvasElement | null = null,
  glEdgeBuffer: WebGLBuffer | null = null,
  glNodeBuffer: WebGLBuffer | null = null,
  // Pre-allocated typed arrays (grown on demand, never shrunk)
  glEdgeData: Float32Array = new Float32Array(4096),
  glEdgeCount = 0,
  glNodeData: Float32Array = new Float32Array(2048),
  glNodeCount = 0,
  glLocations: {
    uOrigin: WebGLUniformLocation | null;
    uScale: WebGLUniformLocation | null;
    uRes: WebGLUniformLocation | null;
    uColor: WebGLUniformLocation | null;
    aPos: number;
  } | null = null;

export function initWebGL() {
  if (gl) return true;
  try {
    glCanvas = document.createElement('canvas');
    glCanvas.id = 'gl-canvas';
    glCanvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0';
    const container = document.getElementById('canvas-container');
    container.insertBefore(glCanvas, document.getElementById('canvas'));
    const canvas = document.getElementById('canvas');
    canvas.style.cssText = 'position:relative;z-index:1';
    gl =
      glCanvas.getContext('webgl', { antialias: true, alpha: false }) ||
      glCanvas.getContext('experimental-webgl', { antialias: true, alpha: false });
    if (!gl) return false;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(
      vs,
      'attribute vec2 aPos;uniform vec2 uOrigin;uniform float uScale;uniform vec2 uRes;void main(){vec2 p=(aPos*uScale+uOrigin)/uRes*2.0-1.0;p.y=-p.y;gl_Position=vec4(p,0.0,1.0);gl_PointSize=6.0;}',
    );
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, 'precision mediump float;uniform vec4 uColor;void main(){gl_FragColor=uColor;}');
    gl.compileShader(fs);
    glProgram = gl.createProgram();
    gl.attachShader(glProgram, vs);
    gl.attachShader(glProgram, fs);
    gl.linkProgram(glProgram);
    if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) return false;
    gl.useProgram(glProgram);
    // Cache uniform/attribute locations
    glLocations = {
      uOrigin: gl.getUniformLocation(glProgram, 'uOrigin'),
      uScale: gl.getUniformLocation(glProgram, 'uScale'),
      uRes: gl.getUniformLocation(glProgram, 'uRes'),
      uColor: gl.getUniformLocation(glProgram, 'uColor'),
      aPos: gl.getAttribLocation(glProgram, 'aPos'),
    };
    gl.clearColor(0.05, 0.07, 0.09, 1.0);
    setGlRunning(true);
    return true;
  } catch {
    return false;
  }
}

function renderWebGL() {
  if (!gl || !glProgram || !glLocations) return;
  const container = document.getElementById('canvas-container');
  const w = container.clientWidth,
    h = container.clientHeight;
  glCanvas.width = w;
  glCanvas.height = h;
  gl.viewport(0, 0, w, h);
  gl.clear(gl.COLOR_BUFFER_BIT);
  // Use cached uniform/attribute locations (no per-frame lookups)
  const { uOrigin, uScale, uRes, uColor, aPos } = glLocations;
  gl.uniform2f(uOrigin, transform.x, transform.y);
  gl.uniform1f(uScale, transform.k);
  gl.uniform2f(uRes, w, h);
  // Compute LOD level
  const lod = getLODLevel(transform.k);
  setLOD(lod);

  // ── CLUSTER level: render blob centers as large points ──
  if (lod === LODLevel.CLUSTER) {
    const blobs = computeClusterBlobs();
    lastClusterBlobs = blobs;
    // Render edges (very faint)
    glEdgeCount = 0;
    for (const e of edges) {
      const src = e.source,
        tgt = e.target;
      if (!src.x || !tgt.x) continue;
      if (glEdgeCount + 4 > glEdgeData.length) {
        const grown = new Float32Array(glEdgeData.length * 2);
        grown.set(glEdgeData);
        glEdgeData = grown;
      }
      glEdgeData[glEdgeCount++] = src.x;
      glEdgeData[glEdgeCount++] = src.y;
      glEdgeData[glEdgeCount++] = tgt.x;
      glEdgeData[glEdgeCount++] = tgt.y;
    }
    if (glEdgeCount) {
      if (!glEdgeBuffer) glEdgeBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, glEdgeBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, glEdgeData.subarray(0, glEdgeCount), gl.STREAM_DRAW);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform4f(uColor, 0.3, 0.4, 0.5, 0.05);
      gl.drawArrays(gl.LINES, 0, glEdgeCount / 2);
    }
    // Render cluster blobs as large points
    glNodeCount = 0;
    for (const blob of blobs) {
      if (glNodeCount + 2 > glNodeData.length) {
        const grown = new Float32Array(glNodeData.length * 2);
        grown.set(glNodeData);
        glNodeData = grown;
      }
      glNodeData[glNodeCount++] = blob.cx;
      glNodeData[glNodeCount++] = blob.cy;
    }
    if (glNodeCount) {
      if (!glNodeBuffer) glNodeBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, glNodeBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, glNodeData.subarray(0, glNodeCount), gl.STREAM_DRAW);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      // Color blobs by complexity
      const avgComplexity = blobs.length ? blobs.reduce((s, b) => s + b.avgComplexity, 0) / blobs.length : 0;
      const c = Math.min(avgComplexity / 5, 1);
      gl.uniform4f(uColor, 0.19 + c * 0.78, 0.38 - c * 0.19, 0.24 - c * 0.13, 0.6);
      gl.drawArrays(gl.POINTS, 0, glNodeCount);
    }
    updateLODIndicator(nodes.length, blobs.length);
    updateMinimap();
    return;
  }

  // ── Edges ──
  glEdgeCount = 0;
  for (const e of edges) {
    const src = e.source,
      tgt = e.target;
    if (!src.x || !tgt.x) continue;
    // Grow buffer if needed (2x strategy)
    if (glEdgeCount + 4 > glEdgeData.length) {
      const grown = new Float32Array(glEdgeData.length * 2);
      grown.set(glEdgeData);
      glEdgeData = grown;
    }
    glEdgeData[glEdgeCount++] = src.x;
    glEdgeData[glEdgeCount++] = src.y;
    glEdgeData[glEdgeCount++] = tgt.x;
    glEdgeData[glEdgeCount++] = tgt.y;
  }
  if (glEdgeCount) {
    if (!glEdgeBuffer) glEdgeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, glEdgeBuffer);
    if (glEdgeCount <= glEdgeData.length / 2) {
      // Fits in existing GPU buffer — sub-update
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, glEdgeData.subarray(0, glEdgeCount));
    } else {
      // Buffer too small — reallocate on GPU
      gl.bufferData(gl.ARRAY_BUFFER, glEdgeData.subarray(0, glEdgeCount), gl.STREAM_DRAW);
    }
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4f(uColor, 0.3, 0.4, 0.5, 0.3);
    gl.drawArrays(gl.LINES, 0, glEdgeCount / 2);
  }

  // ── Nodes ──
  glNodeCount = 0;
  for (const n of nodes) {
    if (n.x == null || hiddenKinds[n.kind]) continue;
    // LOD: MODULE level — only render file nodes
    if (lod === LODLevel.MODULE && n.kind !== 'file' && n.kind !== 'directory') continue;
    if (glNodeCount + 2 > glNodeData.length) {
      const grown = new Float32Array(glNodeData.length * 2);
      grown.set(glNodeData);
      glNodeData = grown;
    }
    glNodeData[glNodeCount++] = n.x;
    glNodeData[glNodeCount++] = n.y;
  }
  if (glNodeCount) {
    if (!glNodeBuffer) glNodeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, glNodeBuffer);
    if (glNodeCount <= glNodeData.length / 2) {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, glNodeData.subarray(0, glNodeCount));
    } else {
      gl.bufferData(gl.ARRAY_BUFFER, glNodeData.subarray(0, glNodeCount), gl.STREAM_DRAW);
    }
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4f(uColor, 0.34, 0.65, 1.0, 0.8);
    gl.drawArrays(gl.POINTS, 0, glNodeCount);
  }
  // Update LOD indicator
  if (lod !== LODLevel.CLUSTER) {
    updateLODIndicator(glNodeCount / 2, 0);
  }
  updateMinimap();
}
