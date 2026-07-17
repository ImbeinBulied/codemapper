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
  pathfinderActive,
  selectedSourceNode,
  selectedTargetNode,
  activePath,
  setPathfinderActive,
  setSelectedSourceNode,
  setSelectedTargetNode,
  setActivePath,
  setReachableNodes,
  blastRadiusActive,
  blastRadiusSource,
  blastRadiusAffected,
  blastRadiusMaxDepth,
  setBlastRadiusActive,
  setBlastRadiusSource,
  setBlastRadiusAffected,
  setBlastRadiusMaxDepth,
} from './state.js';
import { COLORS, NODE_SIZE } from './colors.js';
import { render } from './renderer.js';
import { getClusterBlobs } from './renderer.js';
import { updateZoomLevel, computeDirectoryClusters } from './minimap.js';
import { selectNode, closeSidebar } from './sidebar.js';
import { showPathInfo } from './sidebar.js';
import {
  LODLevel,
  currentLOD,
  hullsEnabled,
  hullGroups,
  hullHoveredGroup,
  setHullHoveredGroup,
  toggleHulls,
} from './state.js';
import { heatmapOverlayEnabled, hotspotMode, hotspotData } from './state.js';
import { getNodeWeight } from './hotspot.js';
import { hitTestHulls } from './hulls.js';
import { findPath, findReachable, findDependencies, findDependents } from '../graph/pathfinder.js';

declare const d3: any;

const container = document.getElementById('canvas-container')!;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const tooltip = document.getElementById('tooltip')!;
const contextMenu = document.getElementById('context-menu')!;
const ariaStatus = document.getElementById('aria-status');

// Keyboard navigation state
let keyboardFocusIndex = -1;
let keyboardDialogOpen = false;

// Quadtree for O(log n) hit testing
let quadtree: any = null;
let quadtreeDirty = true;

export function invalidateQuadtree() {
  quadtreeDirty = true;
}

function buildQuadtree() {
  const visibleNodes = nodes.filter(
    (n) => n.x != null && n.y != null && n.kind !== 'directory' && !hiddenKinds[n.kind],
  );
  quadtree = d3
    .quadtree()
    .x((d: any) => d.x)
    .y((d: any) => d.y)
    .addAll(visibleNodes);
  quadtreeDirty = false;
}

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
  // At CLUSTER level, check cluster blobs first
  if (currentLOD === LODLevel.CLUSTER) {
    const blobs = getClusterBlobs();
    for (const blob of blobs) {
      const r = Math.sqrt(blob.fileCount) * 8;
      const dx = cx - blob.cx,
        dy = cy - blob.cy;
      if (dx * dx + dy * dy <= r * r) {
        // Find first file node in this blob's directory for selection
        const dirPrefix = blob.dir;
        const matchingNode = nodes.find((n) => n.kind === 'file' && n.x != null && n.filePath.startsWith(dirPrefix));
        if (matchingNode) return matchingNode;
        return null;
      }
    }
  }
  if (quadtreeDirty || !quadtree) buildQuadtree();
  if (!quadtree) return null;

  // Use quadtree.find() for O(log n) nearest-neighbor lookup
  const searchRadius = 30; // max hit distance
  const found = quadtree.find(cx, cy, searchRadius);
  if (found) return found as ViewNode;
  return null;
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

  // Shift+Click on a node: set source/target for pathfinder
  if (e.shiftKey && hit) {
    e.preventDefault();
    if (!selectedSourceNode) {
      setSelectedSourceNode(hit.id);
      setSelectedTargetNode(null);
      setActivePath([]);
      setReachableNodes(new Set());
      if (!pathfinderActive) setPathfinderActive(true);
      render();
      return;
    }
    // Second Shift+Click sets target and computes path
    if (hit.id !== selectedSourceNode) {
      setSelectedTargetNode(hit.id);
      computePath(selectedSourceNode, hit.id);
    } else {
      // Clicked same node again — clear source
      setSelectedSourceNode(null);
      setSelectedTargetNode(null);
      setActivePath([]);
      setReachableNodes(new Set());
      setPathfinderActive(false);
      render();
    }
    return;
  }

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

container.addEventListener('mousemove', ((e: MouseEvent) => {
  // Store event data, process on next frame via rAF
  pendingMouseEvent = e;
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(processMouseMove);
  }
}) as any);

let pendingMouseEvent: MouseEvent | null = null;
let rafPending = false;

function processMouseMove() {
  rafPending = false;
  const e = pendingMouseEvent;
  if (!e) return;
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
    }
    render();
  }

  // ── Hull hover detection (only when no node/edge hit) ──
  if (hullsEnabled && hullGroups.size > 0 && !hit && !edgeHit) {
    const hullKey = hitTestHulls(p.x, p.y);
    if (hullKey !== hullHoveredGroup) {
      setHullHoveredGroup(hullKey);
      container.style.cursor = hullKey ? 'pointer' : 'default';
      render();
    }
  } else if (hullHoveredGroup !== null) {
    // Clear hull hover when a node/edge is hit
    setHullHoveredGroup(null);
    render();
  }

  if (isPanning && !hit) {
    transform.x = e.clientX - panStart.x;
    transform.y = e.clientY - panStart.y;
    render();
  }
}

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
    '<button class="cm-item" data-action="trace-deps" data-idx="' +
    nodeIdx +
    '">Trace dependencies</button>' +
    '<button class="cm-item" data-action="trace-dependents" data-idx="' +
    nodeIdx +
    '">Trace dependents</button>' +
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
    '</button>' +
    '<div class="cm-sep"></div>' +
    '<button class="cm-item" data-action="blast-radius" data-idx="' +
    nodeIdx +
    '">Show blast radius</button>' +
    '<button class="cm-item" data-action="clear-blast-radius">Clear blast radius</button>';
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
    } else if (action === 'trace-deps') {
      const node = nodes[parseInt(btn.dataset.idx || '0')];
      if (node) computeReachability(node.id, 'dependencies');
    } else if (action === 'trace-dependents') {
      const node = nodes[parseInt(btn.dataset.idx || '0')];
      if (node) computeReachability(node.id, 'dependents');
    } else if (action === 'show-deps') {
      setFocusNode(nodes[parseInt(btn.dataset.idx || '0')] || null);
    } else if (action === 'focus-kind') {
      focusKind(btn.dataset.kind || '');
    } else if (action === 'hide-kind') {
      hideKind(btn.dataset.kind || '');
    } else if (action === 'blast-radius') {
      const node = nodes[parseInt(btn.dataset.idx || '0')];
      if (node) {
        // Fetch blast radius from API
        fetch(`/api/blast-radius?node=${encodeURIComponent(node.id)}&depth=${blastRadiusMaxDepth}`)
          .then((r) => r.json())
          .then((data) => {
            const affected = new Map<string, number>(Object.entries(data.affected).map(([k, v]) => [k, v as number]));
            setBlastRadiusActive(true);
            setBlastRadiusSource(node.id);
            setBlastRadiusAffected(affected);
            setBlastRadiusMaxDepth(data.depth);
            render();
          })
          .catch(() => {});
      }
    } else if (action === 'clear-blast-radius') {
      setBlastRadiusActive(false);
      setBlastRadiusSource(null);
      setBlastRadiusAffected(new Map());
      render();
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
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressTriggered = false;

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
        // Long-press detection for context menu
        longPressTriggered = false;
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
          longPressTriggered = true;
          setIsDragging(false);
          setDragNode(null);
          // Show context menu at touch position
          setContextMenuNode(hit);
          const nodeIdx = nodes.indexOf(hit);
          contextMenu.innerHTML =
            '<button class="cm-item" data-action="copy-path" data-path="' +
            escapeAttr(hit.filePath) +
            '">Copy path</button>' +
            '<div class="cm-sep"></div>' +
            '<button class="cm-item" data-action="trace-deps" data-idx="' +
            nodeIdx +
            '">Trace dependencies</button>' +
            '<button class="cm-item" data-action="trace-dependents" data-idx="' +
            nodeIdx +
            '">Trace dependents</button>' +
            '<div class="cm-sep"></div>' +
            '<button class="cm-item" data-action="show-deps" data-idx="' +
            nodeIdx +
            '">Show dependents</button>' +
            '<div class="cm-sep"></div>' +
            '<button class="cm-item" data-action="blast-radius" data-idx="' +
            nodeIdx +
            '">Show blast radius</button>' +
            '<button class="cm-item" data-action="clear-blast-radius">Clear blast radius</button>';
          contextMenu.style.left = t.clientX + 'px';
          contextMenu.style.top = t.clientY + 'px';
          contextMenu.classList.add('show');
          // Haptic feedback if available
          if (navigator.vibrate) navigator.vibrate(50);
        }, 500);
      } else {
        setIsPanning(true);
        touchPanStart = { x: t.clientX - transform.x, y: t.clientY - transform.y };
      }
    } else if (e.touches.length === 2) {
      setIsPanning(false);
      setIsDragging(false);
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
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
      // Cancel long-press if finger moves
      if (longPressTimer && !longPressTriggered) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
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
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
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

// ── Pathfinder helpers ───────────────────────────────────────────

/** Convert view-level nodes/edges to graph-level format for pathfinder. */
function toGraphNodes(): import('../graph/index.js').GraphNode[] {
  return nodes.map((n) => ({
    id: n.id,
    label: n.label,
    kind: n.kind as any,
    filePath: n.filePath,
    line: n.line,
    col: n.col,
  }));
}

function toGraphEdges(): import('../graph/index.js').GraphEdge[] {
  return edges.map((e) => ({
    source: (e.source as any).id ?? e.source,
    target: (e.target as any).id ?? e.target,
    kind: e.kind as any,
  }));
}

/** Compute BFS shortest path and update state. */
export function computePath(sourceId: string, targetId: string) {
  const graphNodes = toGraphNodes();
  const graphEdges = toGraphEdges();
  const result = findPath(graphNodes, graphEdges, sourceId, targetId);
  if (result.found) {
    setActivePath(result.path);
    setReachableNodes(new Set());
  } else {
    setActivePath([]);
    setReachableNodes(new Set());
  }
  showPathInfo();
  render();
}

/** Compute reachable nodes (dependencies or dependents) and update state. */
export function computeReachability(nodeId: string, mode: 'dependencies' | 'dependents', depth: number = 3) {
  const graphNodes = toGraphNodes();
  const graphEdges = toGraphEdges();
  const reachable =
    mode === 'dependents'
      ? findDependents(graphNodes, graphEdges, nodeId, depth)
      : findDependencies(graphNodes, graphEdges, nodeId, depth);
  setSelectedSourceNode(nodeId);
  setSelectedTargetNode(null);
  setActivePath([]);
  setReachableNodes(reachable);
  if (!pathfinderActive) setPathfinderActive(true);
  showPathInfo();
  render();
}

/** Clear pathfinder state. */
export function clearPathfinder() {
  setSelectedSourceNode(null);
  setSelectedTargetNode(null);
  setActivePath([]);
  setReachableNodes(new Set());
  setPathfinderActive(false);
  render();
}

(window as any).clearPathfinder = clearPathfinder;
(window as any).resetZoom = () => {
  if (sim) sim.stop();
  setSimSettled(true);
  transform.x = 0;
  transform.y = 0;
  transform.k = 1;
  updateZoomLevel();
  render();
};

/**
 * Fit all positioned nodes within the viewport, with padding.
 * Recovers the graph when it has been panned/zoomed out of view.
 * Zoom is capped so small graphs don't blow up to useless magnification.
 */
(window as any).fitToView = () => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    seen = 0;
  for (const n of nodes) {
    if (n.x == null || n.y == null) continue;
    if (hiddenKinds[n.kind]) continue;
    const r = (NODE_SIZE[n.kind] || 20) * 0.5;
    if (n.x - r < minX) minX = n.x - r;
    if (n.x + r > maxX) maxX = n.x + r;
    if (n.y - r < minY) minY = n.y - r;
    if (n.y + r > maxY) maxY = n.y + r;
    seen++;
  }
  if (seen === 0) return;
  const container = document.getElementById('canvas-container');
  if (!container) return;
  const w = container.clientWidth,
    h = container.clientHeight;
  const bboxW = Math.max(1, maxX - minX),
    bboxH = Math.max(1, maxY - minY);
  const PAD = 60; // screen-px padding around the fitted graph
  const k = Math.min(2, (w - PAD * 2) / bboxW, (h - PAD * 2) / bboxH);
  transform.k = k > 0 ? k : 1;
  transform.x = w / 2 - transform.k * (minX + bboxW / 2);
  transform.y = h / 2 - transform.k * (minY + bboxH / 2);
  invalidateQuadtree();
  if (sim) sim.stop();
  setSimSettled(true);
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

// ── Keyboard navigation ────────────────────────────────────────────

function getVisibleNodes(): ViewNode[] {
  return nodes.filter((n) => n.x != null && n.y != null && n.kind !== 'directory' && !hiddenKinds[n.kind]);
}

function announceStatus(msg: string) {
  if (ariaStatus) ariaStatus.textContent = msg;
}

function updateAriaPressed(buttonId: string, pressed: boolean) {
  const btn = document.getElementById(buttonId);
  if (btn) btn.setAttribute('aria-pressed', String(pressed));
}

function showKeyboardShortcutsDialog() {
  if (keyboardDialogOpen) return;
  keyboardDialogOpen = true;
  const existing = document.getElementById('kb-dialog');
  if (existing) existing.remove();

  const dialog = document.createElement('div');
  dialog.id = 'kb-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-label', 'Keyboard shortcuts');
  dialog.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:50;display:flex;align-items:center;justify-content:center" id="kb-overlay">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 24px;max-width:380px;width:90%;font-size:13px;color:var(--text)">
        <h2 style="margin:0 0 12px;font-size:16px">Keyboard Shortcuts</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:4px 0"><kbd>/</kbd></td><td>Focus search</td></tr>
          <tr><td style="padding:4px 0"><kbd>Tab</kbd></td><td>Cycle through nodes</td></tr>
          <tr><td style="padding:4px 0"><kbd>Shift+Tab</kbd></td><td>Cycle nodes backward</td></tr>
          <tr><td style="padding:4px 0"><kbd>Enter</kbd></td><td>Select focused node</td></tr>
          <tr><td style="padding:4px 0"><kbd>Escape</kbd></td><td>Close sidebar / deselect</td></tr>
          <tr><td style="padding:4px 0"><kbd>?</kbd></td><td>Show this dialog</td></tr>
          <tr><td style="padding:4px 0"><kbd>Scroll</kbd></td><td>Zoom in/out</td></tr>
          <tr><td style="padding:4px 0"><kbd>Drag</kbd></td><td>Pan canvas</td></tr>
          <tr><td style="padding:4px 0"><kbd>Click</kbd></td><td>Inspect node</td></tr>
          <tr><td style="padding:4px 0"><kbd>Right-click</kbd></td><td>Context menu</td></tr>
        </table>
        <button id="kb-close" style="margin-top:14px;width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--surface-hover);color:var(--text);cursor:pointer;font-size:12px">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  const closeDialog = () => {
    keyboardDialogOpen = false;
    dialog.remove();
  };
  document.getElementById('kb-close')?.addEventListener('click', closeDialog);
  document.getElementById('kb-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDialog();
  });
  document.addEventListener('keydown', function kbHandler(e: KeyboardEvent) {
    if (e.key === 'Escape' || e.key === '?') {
      closeDialog();
      document.removeEventListener('keydown', kbHandler);
    }
  });
  announceStatus('Keyboard shortcuts dialog opened');
}

function onCanvasKeydown(e: KeyboardEvent) {
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const isSearchFocused = document.activeElement === searchInput;

  // ? to show keyboard shortcuts (only when not typing in search)
  if (e.key === '?' && !isSearchFocused && !keyboardDialogOpen) {
    e.preventDefault();
    showKeyboardShortcutsDialog();
    return;
  }

  // / to focus search
  if (e.key === '/' && !isSearchFocused && !keyboardDialogOpen) {
    e.preventDefault();
    searchInput?.focus();
    return;
  }

  // Tab / Shift+Tab to cycle nodes (only when canvas or body is focused)
  if (e.key === 'Tab' && !isSearchFocused && !keyboardDialogOpen) {
    e.preventDefault();
    const visible = getVisibleNodes();
    if (visible.length === 0) return;

    if (e.shiftKey) {
      keyboardFocusIndex = keyboardFocusIndex <= 0 ? visible.length - 1 : keyboardFocusIndex - 1;
    } else {
      keyboardFocusIndex = keyboardFocusIndex >= visible.length - 1 ? 0 : keyboardFocusIndex + 1;
    }

    const node = visible[keyboardFocusIndex];
    setFocusNode(node);
    // Pan to keep focused node in view
    if (node.x != null && node.y != null) {
      const vw = container.clientWidth;
      const vh = container.clientHeight;
      const sx = node.x * transform.k + transform.x;
      const sy = node.y * transform.k + transform.y;
      const margin = 100;
      if (sx < margin) transform.x += margin - sx;
      if (sx > vw - margin) transform.x -= sx - (vw - margin);
      if (sy < margin) transform.y += margin - sy;
      if (sy > vh - margin) transform.y -= sy - (vh - margin);
    }
    render();
    announceStatus(`Focused node ${keyboardFocusIndex + 1} of ${visible.length}: ${node.label} (${node.kind})`);
    return;
  }

  // Enter to select focused node
  if (e.key === 'Enter' && !isSearchFocused && !keyboardDialogOpen) {
    const focused = focusNode;
    if (focused) {
      e.preventDefault();
      selectNode(focused);
      announceStatus(`Selected ${focused.label}`);
    }
    return;
  }

  // Escape to close sidebar / deselect
  if (e.key === 'Escape' && !isSearchFocused && !keyboardDialogOpen) {
    e.preventDefault();
    keyboardFocusIndex = -1;
    setFocusNode(null);
    closeSidebar();
    contextMenu.classList.remove('show');
    render();
    announceStatus('Deselected');
    return;
  }
}

export function initInteraction() {
  // Keyboard navigation on canvas
  canvas.addEventListener('keydown', onCanvasKeydown);
  // Also listen on document for global shortcuts
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === '?' && document.activeElement !== document.getElementById('search-input') && !keyboardDialogOpen) {
      showKeyboardShortcutsDialog();
    }
  });
}
