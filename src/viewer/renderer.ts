// @ts-nocheck — Ported from plain JS. Types refined later.
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
} from './state.js';
import { updateMinimap } from './minimap.js';

export function render() {
  if (glRunning && nodes.length > 500) {
    renderWebGL();
    const canvas = document.getElementById('canvas');
    const glCanvas = document.getElementById('gl-canvas');
    if (canvas) canvas.style.display = 'block';
    if (glCanvas) glCanvas.style.display = 'block';
    return;
  }
  renderCanvas2D();
  const glCanvas = document.getElementById('gl-canvas');
  if (glCanvas) glCanvas.style.display = 'none';
  const canvas = document.getElementById('canvas');
  if (canvas) canvas.style.display = 'block';
  updateMinimap();
}

function renderCanvas2D() {
  const container = document.getElementById('canvas-container')!;
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const w = container.clientWidth,
    h = container.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

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
    const src = e.source,
      tgt = e.target;
    if (!src.x || !tgt.x) continue;
    const sx = src.x,
      sy = src.y,
      tx = tgt.x,
      ty = tgt.y;
    let cycleEdge = false,
      related = false,
      isFocusRelated = false;
    if (hasHover && (e.source === hoveredNode || e.target === hoveredNode)) related = true;
    if (hasFocus && (e.source === focusNode || e.target === focusNode)) isFocusRelated = true;
    if (showCycles && cycleNodes.size > 0 && cycleNodes.has(e.source.id) && cycleNodes.has(e.target.id))
      cycleEdge = true;
    ctx.strokeStyle = cycleEdge ? COLORS.cycle_edge : COLORS['edge_' + e.kind] || '#8b949e';
    ctx.lineWidth = related || isFocusRelated ? 2.5 / transform.k : 1.2 / transform.k;
    let alpha = 0.3;
    if (hasHover && !related) alpha = 0.06;
    if (hasFocus && isFocusRelated) alpha = 0.7;
    if (hasFocus && !isFocusRelated) alpha = 0.04;
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
    const color = COLORS[n.kind] || '#8b949e';
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

  ctx.restore();
}
let gl = null,
  glProgram = null,
  glCanvas = null;

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
    gl.clearColor(0.05, 0.07, 0.09, 1.0);
    setGlRunning(true);
    return true;
  } catch {
    return false;
  }
}

function renderWebGL() {
  if (!gl || !glProgram) return;
  const container = document.getElementById('canvas-container');
  const w = container.clientWidth,
    h = container.clientHeight;
  glCanvas.width = w;
  glCanvas.height = h;
  gl.viewport(0, 0, w, h);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const uOrigin = gl.getUniformLocation(glProgram, 'uOrigin');
  const uScale = gl.getUniformLocation(glProgram, 'uScale');
  const uRes = gl.getUniformLocation(glProgram, 'uRes');
  const uColor = gl.getUniformLocation(glProgram, 'uColor');
  gl.uniform2f(uOrigin, transform.x, transform.y);
  gl.uniform1f(uScale, transform.k);
  gl.uniform2f(uRes, w, h);
  const aPos = gl.getAttribLocation(glProgram, 'aPos');
  const edgeData = [];
  for (const e of edges) {
    const src = e.source,
      tgt = e.target;
    if (!src.x || !tgt.x) continue;
    edgeData.push(src.x, src.y, tgt.x, tgt.y);
  }
  if (edgeData.length) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(edgeData), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4f(uColor, 0.3, 0.4, 0.5, 0.3);
    gl.drawArrays(gl.LINES, 0, edgeData.length / 2);
  }
  const nodeData = [];
  for (const n of nodes) {
    if (n.x == null || hiddenKinds[n.kind]) continue;
    nodeData.push(n.x, n.y);
  }
  if (nodeData.length) {
    const buf2 = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf2);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nodeData), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4f(uColor, 0.34, 0.65, 1.0, 0.8);
    gl.drawArrays(gl.POINTS, 0, nodeData.length);
  }
  updateMinimap();
}
