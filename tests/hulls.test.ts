import { describe, it, expect } from 'vitest';
import { convexHull } from '../src/viewer/hulls.js';

// ── Helpers ───────────────────────────────────────────────────────

function pt(x: number, y: number) {
  return { x, y };
}

function sortPoints(pts: { x: number; y: number }[]): string {
  return [...pts]
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((p) => `${p.x},${p.y}`)
    .join(';');
}

function hullKey(pts: { x: number; y: number }[]): string {
  return sortPoints(pts);
}

// ── Tests ─────────────────────────────────────────────────────────

describe('convexHull — Monotone Chain algorithm', () => {
  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      const result = convexHull([]);
      expect(result).toEqual([]);
    });

    it('returns single point for single point', () => {
      const result = convexHull([pt(0, 0)]);
      expect(result).toEqual([pt(0, 0)]);
    });

    it('returns two points for two points (degenerate hull)', () => {
      const result = convexHull([pt(0, 0), pt(1, 0)]);
      expect(result).toEqual([pt(0, 0), pt(1, 0)]);
    });

    it('handles duplicate points', () => {
      const result = convexHull([pt(0, 0), pt(1, 0), pt(0, 0)]);
      // Duplicate is included in sort, cross product handles it
      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    it('handles collinear points', () => {
      const result = convexHull([pt(0, 0), pt(1, 0), pt(2, 0), pt(3, 0)]);
      // All collinear — algorithm returns the extremes (with closure)
      expect(result.length).toBe(3); // [0,0], [3,0], [0,0]
      expect(result[0]).toEqual(pt(0, 0));
      expect(result[1]).toEqual(pt(3, 0));
      expect(result[2]).toEqual(result[0]); // closure
    });
  });

  describe('basic shapes', () => {
    it('computes hull of a triangle (3 points)', () => {
      const result = convexHull([pt(0, 0), pt(1, 0), pt(0.5, 1)]);
      // Last point is closure (first point repeated)
      expect(result.length).toBe(4); // 3 hull points + closure
      expect(result[result.length - 1]).toEqual(result[0]);
      // All input points should be on the hull
      const key = hullKey(result.slice(0, -1));
      expect(key).toContain('0,0');
      expect(key).toContain('1,0');
      expect(key).toContain('0.5,1');
    });

    it('computes hull of a square (4 points)', () => {
      const points = [pt(0, 0), pt(1, 0), pt(1, 1), pt(0, 1)];
      const result = convexHull(points);
      // 4 hull points + closure
      expect(result.length).toBe(5);
      expect(result[result.length - 1]).toEqual(result[0]);
      // All original points should be on hull
      for (const p of points) {
        expect(result.slice(0, -1)).toContainEqual(p);
      }
    });

    it('computes hull of a rectangle (axis-aligned)', () => {
      const points = [pt(0, 0), pt(3, 0), pt(3, 2), pt(0, 2)];
      const result = convexHull(points);
      expect(result.length).toBe(5);
      expect(result[0]).toEqual(pt(0, 0));
      expect(result[1]).toEqual(pt(3, 0));
      expect(result[2]).toEqual(pt(3, 2));
      expect(result[3]).toEqual(pt(0, 2));
      expect(result[4]).toEqual(result[0]);
    });

    it('computes hull of a pentagon', () => {
      const points = [pt(0, 0), pt(2, 0), pt(3, 1), pt(1, 3), pt(-1, 1)];
      const result = convexHull(points);
      // All 5 points should be on the hull
      expect(result.length).toBe(6); // 5 + closure
      expect(result[result.length - 1]).toEqual(result[0]);
      // Hull should be in counter-clockwise order
      // For this shape all points are extreme
      for (const p of points) {
        expect(result.slice(0, -1)).toContainEqual(p);
      }
    });
  });

  describe('interior points', () => {
    it('excludes interior point from hull', () => {
      // Square with interior point
      const points = [pt(0, 0), pt(2, 0), pt(2, 2), pt(0, 2), pt(1, 1)];
      const result = convexHull(points);
      // Hull should be the 4 corners
      expect(result.length).toBe(5);
      // Interior point (1,1) should NOT be in hull
      for (const p of result) {
        expect(p).not.toEqual(pt(1, 1));
      }
      // All corners should be in hull
      expect(result.slice(0, -1)).toContainEqual(pt(0, 0));
      expect(result.slice(0, -1)).toContainEqual(pt(2, 0));
      expect(result.slice(0, -1)).toContainEqual(pt(2, 2));
      expect(result.slice(0, -1)).toContainEqual(pt(0, 2));
    });

    it('handles many points with some interior', () => {
      const points = [pt(0, 0), pt(5, 0), pt(5, 5), pt(0, 5), pt(1, 1), pt(2, 2), pt(3, 3), pt(4, 4)];
      const result = convexHull(points);
      // Hull should be the 4 corners
      expect(result.length).toBe(5);
      // Interior points should NOT be in hull
      const hullSet = new Set(result.map((p) => `${p.x},${p.y}`));
      expect(hullSet.has('1,1')).toBe(false);
      expect(hullSet.has('2,2')).toBe(false);
      expect(hullSet.has('3,3')).toBe(false);
      expect(hullSet.has('4,4')).toBe(false);
    });
  });

  describe('points with negative coordinates', () => {
    it('handles points in all quadrants', () => {
      const points = [pt(-2, -2), pt(2, -2), pt(2, 2), pt(-2, 2), pt(0, 0)];
      const result = convexHull(points);
      expect(result.length).toBe(5);
      expect(result.slice(0, -1)).toContainEqual(pt(-2, -2));
      expect(result.slice(0, -1)).toContainEqual(pt(2, -2));
      expect(result.slice(0, -1)).toContainEqual(pt(2, 2));
      expect(result.slice(0, -1)).toContainEqual(pt(-2, 2));
    });

    it('handles all negative coordinates', () => {
      const points = [pt(-5, -5), pt(-1, -5), pt(-1, -1), pt(-5, -1)];
      const result = convexHull(points);
      expect(result.length).toBe(5);
    });
  });

  describe('hull closure', () => {
    it('closes the polygon (first point == last point)', () => {
      const points = [pt(0, 0), pt(2, 0), pt(1, 2)];
      const result = convexHull(points);
      expect(result[result.length - 1]).toEqual(result[0]);
    });

    it('returns counter-clockwise order for simple triangle', () => {
      const result = convexHull([pt(0, 0), pt(1, 0), pt(0.5, 1)]);
      // Remove closure to check order
      const ring = result.slice(0, -1);
      // Should be CCW: cross product of adjacent edges should be positive
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const c = ring[(i + 2) % ring.length];
        const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        // All turns should be non-negative (CCW or collinear)
        expect(cross).toBeGreaterThanOrEqual(-1e-10);
      }
    });
  });
});
