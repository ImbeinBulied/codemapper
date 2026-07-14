import {
  nodes,
  edges,
  nodeMap,
  transform,
  hoveredNode,
  hoveredEdge,
  selectedNode,
  dragNode,
  isDragging,
  isPanning,
  panStart,
  focusNode,
  sim,
  simSettled,
  hiddenKinds,
  layoutMode,
  setHoveredNode,
  setHoveredEdge,
  setSelectedNode,
  setIsDragging,
  setIsPanning,
  setDragNode,
  setPanStart,
  setFocusNode,
  setSimSettled,
  setContextMenuNode,
  contextMenuNode,
  transitioningNodes,
  ViewNode,
  ViewEdge,
} from './state.js';
import { COLORS, NODE_SIZE } from './colors.js';
import { render } from './renderer.js';
import { updateZoomLevel, computeDirectoryClusters } from './minimap.js';
import { selectNode, closeSidebar } from './sidebar.js';

const container = document.getElementById('canvas-container')!;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const tooltip = document.getElementById('tooltip')!;
const contextMenu = document.getElementById('context-menu')!;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function screenToCanvas(sx: number, sy: number) {
  return { x: (sx - transform.x) / transform.k, y: (sy - transform.y) / transform.k };
}

function hitTest(cx: number, cy: number): ViewNode | null {
  let best: ViewNode | null = null,
    bestDist = Infinity;
  for (const n of nodes) {
    if (n.x == null || n.y == null) continue;
    if (n.kind === 'directory') continue;
    const size = (NODE_SIZE[n.kind] || 20) * 0.5 + 4;
    const dx = cx - n.x,
      dy = cy - n.y;
    const dist = dx * dx + dy * dy;
    if (dist < size * size && dist < bestDist) {
      best = n;
      bestDist = dist;
    }
  }
  return best;
}

function hitTestEdge(cx: number, cy: number): ViewEdge | null {
  let best: ViewEdge | null = null,
    bestDist = 150;
  for (const e of edges) {
    const src = e.source as any,
      tgt = e.target as any;
    if (!src.x || !tgt.x) continue;
    const sx = src.x,
      sy = src.y,
      tx = tgt.x,
      ty = tgt.y;
    const dx = tx - sx,
      dy = ty - sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;
    const t = Math.max(0, Math.min(1, ((cx - sx) * dx + (cy - sy) * dy) / (len * len)));
    const d = Math.hypot(cx - (sx + t * dx), cy - (sy + t * dy));
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

function clampTooltip() {
  const ttW = tooltip.offsetWidth || 300;
  const ttH = tooltip.offsetHeight || 60;
  let tx = parseFloat(tooltip.style.left) || 0;
  let ty = parseFloat(tooltip.style.top) || 0;
  if (tx + ttW > window.innerWidth - 4) tx = window.innerWidth - ttW - 4;
  if (ty + ttH > window.innerHeight - 4) ty = window.innerHeight - ttH - 4;
  if (tx < 4) tx = 4;
  if (ty < 4) ty = 4;
  tooltip.style.left = tx + 'px';
  tooltip.style.top = ty + 'px';
}

container.addEventListener('mousedown', (e: MouseEvent) => {
  if (e.target !== canvas) return;
  const p = screenToCanvas(e.clientX, e.clientY);
  const hit = hitTest(p.x, p.y);
  if (hit) {
    setIsDragging(true);
    setDragNode(hit);
    container.classList.add('dragging');
    if (sim && !simSettled) sim.alphaTarget(0.3).restart();
    selectNode(hit);
    return;
  }
  setIsPanning(true);
  setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
});

container.addEventListener('mousemove', (e: MouseEvent) => {
  const p = screenToCanvas(e.clientX, e.clientY);

  if (isDragging && dragNode) {
    dragNode.fx = p.x;
    dragNode.fy = p.y;
    if (sim && simSettled) {
      sim.alphaTarget(0.15).restart();
      setSimSettled(false);
    }
    render();
    return;
  }

  const hit = hitTest(p.x, p.y);
  const edgeHit = hit ? null : hitTestEdge(p.x, p.y);

  if (hit !== hoveredNode || edgeHit !== hoveredEdge) {
    setHoveredEdge(edgeHit);
    setHoveredNode(hit);

    if (edgeHit && !hit) {
      container.style.cursor = 'pointer';
      tooltip.style.display = 'block';
      tooltip.innerHTML =
        '<div class="tt-label">' +
        escapeHtml(edgeHit.label || edgeHit.kind) +
        '</div><div class="tt-path">' +
        escapeHtml(edgeHit.kind) +
        '</div>';
      tooltip.style.left = e.clientX + 12 + 'px';
      tooltip.style.top = e.clientY + 12 + 'px';
      clampTooltip();
    } else if (hit) {
      container.style.cursor = 'pointer';
      tooltip.style.display = 'block';
      const edgeLabelsArr: string[] = [];
      for (const edge of edges) {
        if ((edge.source as any) === hit || (edge.target as any) === hit) {
          if (edge.label && !edgeLabelsArr.includes(edge.label)) edgeLabelsArr.push(edge.label);
        }
      }
      const edgesInfo = edgeLabelsArr.length
        ? edgeLabelsArr
            .slice(0, 5)
            .map((l) => '<div style="color:#8b949e;font-size:10px">→ ' + escapeHtml(l) + '</div>')
            .join('')
        : '';
      tooltip.innerHTML =
        '<div class="tt-label">' +
        escapeHtml(hit.label) +
        '</div><div class="tt-path">' +
        escapeHtml(hit.filePath) +
        ':' +
        hit.line +
        '</div>' +
        (hit.description ? '<div class="tt-desc">' + escapeHtml(hit.description) + '</div>' : '') +
        edgesInfo;
      tooltip.style.left = e.clientX + 12 + 'px';
      tooltip.style.top = e.clientY + 12 + 'px';
      clampTooltip();
    } else {
      tooltip.style.display = 'none';
    }
    render();
  }

  if (isPanning && !hit) {
    transform.x = e.clientX - panStart.x;
    transform.y = e.clientY - panStart.y;
    render();
  }
});

container.addEventListener('mouseup', () => {
  if (isDragging && dragNode) {
    if (sim) {
      sim.alphaTarget(0);
      if (sim.alpha() < 0.005) sim.stop();
    }
    dragNode.fx = null;
    dragNode.fy = null;
    setIsDragging(false);
    setDragNode(null);
    container.classList.remove('dragging');
  }
  setIsPanning(false);
});

container.addEventListener('mouseleave', () => {
  setIsPanning(false);
  setHoveredNode(null);
  setHoveredEdge(null);
  tooltip.style.display = 'none';
  render();
});

container.addEventListener(
  'wheel',
  (e: WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const mx = e.clientX,
      my = e.clientY;
    transform.x = mx - (mx - transform.x) * zoomFactor;
    transform.y = my - (my - transform.y) * zoomFactor;
    transform.k *= zoomFactor;
    updateZoomLevel();
    render();
  },
  { passive: false },
);

container.addEventListener('contextmenu', (e: MouseEvent) => {
  if (e.target !== canvas) return;
  e.preventDefault();
  const p = screenToCanvas(e.clientX, e.clientY);
  const hit = hitTest(p.x, p.y);
  if (!hit) {
    contextMenu.classList.remove('show');
    return;
  }
  setContextMenuNode(hit);
  const nodeIdx = nodes.indexOf(hit);
  contextMenu.innerHTML =
    '<button class="cm-item" data-action="copy-path" data-path="' +
    escapeAttr(hit.filePath) +
    '">Copy path</button>' +
    '<div class="cm-sep"></div>' +
    '<button class="cm-item" data-action="show-deps" data-idx="' +
    nodeIdx +
    '">Show dependents</button>' +
    '<button class="cm-item" data-action="focus-kind" data-kind="' +
    escapeAttr(hit.kind) +
    '">Show only ' +
    escapeHtml(hit.kind) +
    '</button>' +
    '<button class="cm-item" data-action="hide-kind" data-kind="' +
    escapeAttr(hit.kind) +
    '">Hide ' +
    escapeHtml(hit.kind) +
    '</button>';
  contextMenu.style.left = e.clientX + 'px';
  contextMenu.style.top = e.clientY + 'px';
  contextMenu.classList.add('show');
});

document.addEventListener('click', (e: MouseEvent) => {
  if (!contextMenu.contains(e.target as Node)) contextMenu.classList.remove('show');

  // Context menu action delegation
  const btn = (e.target as HTMLElement).closest('.cm-item') as HTMLElement | null;
  if (btn && contextMenu.contains(btn)) {
    const action = btn.dataset.action;
    if (action === 'copy-path') {
      navigator.clipboard.writeText(btn.dataset.path || '').catch(() => {});
    } else if (action === 'show-deps') {
      setFocusNode(nodes[parseInt(btn.dataset.idx || '0')] || null);
    } else if (action === 'focus-kind') {
      focusKind(btn.dataset.kind || '');
    } else if (action === 'hide-kind') {
      hideKind(btn.dataset.kind || '');
    }
    contextMenu.classList.remove('show');
    return;
  }

  const dd = document.getElementById('export-dropdown');
  if (dd && !(e.target as HTMLElement).closest('.export-btn')) dd.classList.remove('show');
});

// Touch
let lastTouchDist = 0;
let touchPanStart: { x: number; y: number } | null = null;

container.addEventListener(
  'touchstart',
  (e: TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const p = screenToCanvas(t.clientX, t.clientY);
      const hit = hitTest(p.x, p.y);
      if (hit) {
        setIsDragging(true);
        setDragNode(hit);
        if (sim && !simSettled) sim.alphaTarget(0.3).restart();
      } else {
        setIsPanning(true);
        touchPanStart = { x: t.clientX - transform.x, y: t.clientY - transform.y };
      }
    } else if (e.touches.length === 2) {
      setIsPanning(false);
      setIsDragging(false);
      const t1 = e.touches[0],
        t2 = e.touches[1];
      lastTouchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    }
  },
  { passive: true },
);

container.addEventListener(
  'touchmove',
  (e: TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      if (isDragging && dragNode) {
        const p = screenToCanvas(t.clientX, t.clientY);
        dragNode.fx = p.x;
        dragNode.fy = p.y;
        if (sim && simSettled) {
          sim.alphaTarget(0.15).restart();
          setSimSettled(false);
        }
        render();
      } else if (isPanning && touchPanStart) {
        transform.x = t.clientX - touchPanStart.x;
        transform.y = t.clientY - touchPanStart.y;
        render();
      }
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0],
        t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const cx2 = (t1.clientX + t2.clientX) / 2,
        cy2 = (t1.clientY + t2.clientY) / 2;
      if (lastTouchDist > 0) {
        const f = dist / lastTouchDist;
        transform.x = cx2 - (cx2 - transform.x) * f;
        transform.y = cy2 - (cy2 - transform.y) * f;
        transform.k *= f;
        updateZoomLevel();
      }
      lastTouchDist = dist;
      render();
    }
  },
  { passive: true },
);

container.addEventListener(
  'touchend',
  () => {
    if (isDragging && dragNode) {
      if (sim) {
        sim.alphaTarget(0);
        if (sim.alpha() < 0.005) sim.stop();
      }
      dragNode.fx = null;
      dragNode.fy = null;
      setIsDragging(false);
      setDragNode(null);
    }
    setIsPanning(false);
    lastTouchDist = 0;
    touchPanStart = null;
  },
  { passive: true },
);

function focusKind(kind: string) {
  for (const k of ['file', 'function', 'class', 'interface', 'type', 'module', 'call']) {
    const was = hiddenKinds[k];
    hiddenKinds[k] = k !== kind;
    if (was !== hiddenKinds[k]) scheduleFade(k);
  }
  updateFilterButtons();
  contextMenu.classList.remove('show');
  render();
}
function hideKind(kind: string) {
  hiddenKinds[kind] = !hiddenKinds[kind];
  scheduleFade(kind);
  updateFilterButtons();
  contextMenu.classList.remove('show');
  render();
}
(window as any).toggleFilter = (kind: string) => {
  if (['file', 'function', 'class', 'interface', 'type'].includes(kind)) {
    hiddenKinds[kind] = !hiddenKinds[kind];
    scheduleFade(kind);
    updateFilterButtons();
    render();
  }
};

function scheduleFade(kind: string) {
  for (const n of nodes) {
    if (n.kind === kind && n.id) {
      transitioningNodes.set(n.id, 1);
    }
  }
}
(window as any).resetZoom = () => {
  if (sim) sim.stop();
  setSimSettled(true);
  transform.x = 0;
  transform.y = 0;
  transform.k = 1;
  updateZoomLevel();
  render();
};

function updateFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    const kind = btn.getAttribute('data-kind');
    if (kind && hiddenKinds[kind]) btn.classList.add('hidden-kind');
    else btn.classList.remove('hidden-kind');
  });
}
(window as any).updateFilterButtons = updateFilterButtons;

export function initInteraction() {
  // handlers already bound above
}
