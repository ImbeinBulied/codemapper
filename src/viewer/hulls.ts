/**
 * Convex hull visualization for directory groups.
 * Ported from emerge's hull rendering.
 *
 * Provides:
 *  - Monotone Chain convex hull algorithm (no external deps)
 *  - Directory-based grouping of visible nodes
 *  - Canvas 2D hull rendering with glow, labels, depth-based coloring
 */

import { setHullGroups, hullGroups, hullsEnabled, hullHoveredGroup, nodes, ViewNode, hiddenKinds } from './state.js';
import { transform } from './state.js';

// ── Geometric primitives ──────────────────────────────────────────

/** Cross product of vectors (o->a) and (o->b). Positive = counter-clockwise turn. */
function cross(o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Monotone Chain convex hull algorithm.
 * O(n log n) — sorts by x then y, builds upper + lower hulls.
 * Returns points in counter-clockwise order, first point repeated at end.
 */
export function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length <= 1) return [...points];
  if (points.length === 2) {
    // For 2 points, return the edge as a degenerate "hull"
    return [points[0], points[1]];
  }

  // Sort by x, then y
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);

  // Build lower hull
  const lower: { x: number; y: number }[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Build upper hull
  const upper: { x: number; y: number }[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // Remove last point of each (it's the same as the first of the other)
  lower.pop();
  upper.pop();

  const hull = lower.concat(upper);
  // Close the polygon by repeating the first point
  if (hull.length > 0) {
    hull.push(hull[0]);
  }
  return hull;
}

// ── Hull group types ──────────────────────────────────────────────

export interface HullGroup {
  /** Directory path (e.g. "src/viewer") */
  dir: string;
  /** Short label (last path component) */
  label: string;
  /** Directory depth (for color coding) */
  depth: number;
  /** Hull polygon points in world coordinates */
  points: { x: number; y: number }[];
  /** Computed fill color */
  color: string;
  /** Bounding box for hit testing */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Number of visible nodes in this group */
  count: number;
}

// ── Color palette ─────────────────────────────────────────────────

const HULL_COLORS = [
  '#58a6ff', // blue
  '#3fb950', // green
  '#d29922', // yellow
  '#f0883e', // orange
  '#f85149', // red
  '#bc8cff', // purple
  '#79c0ff', // light blue
  '#56d364', // light green
];

function getHullColor(depth: number): string {
  return HULL_COLORS[depth % HULL_COLORS.length];
}

// ── Group computation ─────────────────────────────────────────────

function getParentDir(filePath: string): string {
  // Extract parent directory: everything before the last /
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash <= 0) return '/';
  return filePath.substring(0, lastSlash);
}

function getDirDepth(dir: string): number {
  if (dir === '/') return 0;
  return dir.split('/').filter(Boolean).length;
}

function getDirLabel(dir: string): string {
  if (dir === '/') return 'root';
  const parts = dir.split('/').filter(Boolean);
  return parts[parts.length - 1] || dir;
}

/**
 * Compute hull groups from current node positions.
 * Groups visible file nodes by parent directory.
 * Only computes hulls for groups with >= 3 visible nodes.
 */
export function computeHullGroups(): Map<string, HullGroup> {
  // 1. Group visible file nodes by parent directory
  const dirMap = new Map<string, ViewNode[]>();
  for (const n of nodes) {
    if (n.kind !== 'file' || n.x == null || n.y == null) continue;
    if (hiddenKinds[n.kind]) continue;
    const dir = getParentDir(n.filePath);
    if (!dirMap.has(dir)) dirMap.set(dir, []);
    dirMap.get(dir)!.push(n);
  }

  const groups = new Map<string, HullGroup>();

  for (const [dir, group] of dirMap) {
    // Only compute hulls for groups with >= 3 nodes
    if (group.length < 3) continue;

    const points = group.map((n) => ({ x: n.x!, y: n.y! }));
    const hullPoints = convexHull(points);
    const depth = getDirDepth(dir);
    const color = getHullColor(depth);
    const label = getDirLabel(dir);

    // Compute bounding box
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of hullPoints) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    groups.set(dir, {
      dir,
      label,
      depth,
      points: hullPoints,
      color,
      minX,
      maxX,
      minY,
      maxY,
      count: group.length,
    });
  }

  return groups;
}

// ── Hit testing ───────────────────────────────────────────────────

/**
 * Test if a canvas-space point is inside a hull polygon.
 * Uses ray casting algorithm.
 */
function pointInHull(px: number, py: number, hull: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
    const xi = hull[i].x,
      yi = hull[i].y;
    const xj = hull[j].x,
      yj = hull[j].y;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Find which hull group contains the given world-space point.
 * Returns the group key or null.
 */
export function hitTestHulls(worldX: number, worldY: number): string | null {
  const groups = hullGroups;
  for (const [key, group] of groups) {
    // Bounding box quick reject
    if (worldX < group.minX || worldX > group.maxX || worldY < group.minY || worldY > group.maxY) continue;
    if (pointInHull(worldX, worldY, group.points)) {
      return key;
    }
  }
  return null;
}

// ── Rendering ─────────────────────────────────────────────────────

/**
 * Render hull groups onto a Canvas 2D context.
 * Called BEFORE rendering nodes so hulls appear behind.
 */
export function renderHulls(ctx: CanvasRenderingContext2D, groups: Map<string, HullGroup>, k: number) {
  if (groups.size === 0) return;

  const hoveredKey = hullHoveredGroup;

  for (const [key, group] of groups) {
    const points = group.points;
    if (points.length < 3) continue;

    const isHovered = key === hoveredKey;

    ctx.save();

    // ── Glow effect ──
    if (isHovered) {
      ctx.shadowColor = group.color;
      ctx.shadowBlur = 20;
    } else {
      ctx.shadowColor = group.color;
      ctx.shadowBlur = 8;
    }

    // ── Fill (semi-transparent) ──
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();

    const fillAlpha = isHovered ? '55' : '33';
    ctx.fillStyle = group.color + fillAlpha;
    ctx.fill();

    // ── Stroke ──
    ctx.shadowBlur = 0; // Remove shadow for crisp stroke
    ctx.strokeStyle = isHovered ? group.color : group.color + '88';
    ctx.lineWidth = isHovered ? 2.5 / k : 1.5 / k;
    ctx.setLineDash(isHovered ? [] : [4 / k, 4 / k]);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Label (only when zoom is sufficient and group has > threshold nodes) ──
    if (k > 0.25 && group.count >= 3) {
      // Compute centroid for label placement
      let cx = 0,
        cy = 0;
      for (const p of points) {
        cx += p.x;
        cy += p.y;
      }
      cx /= points.length;
      cy /= points.length;

      ctx.fillStyle = isHovered ? '#e6edf3' : '#8b949e';
      ctx.font = `${Math.max(9, Math.round(11 * k))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const labelText = group.count > 1 ? `${group.label} (${group.count})` : group.label;
      ctx.fillText(labelText, cx, cy);
    }

    ctx.restore();
  }
}
