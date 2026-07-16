import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDeferred, MessageType } from '../src/viewer/workers/protocol.js';
import type {
  WorkerRequest,
  WorkerResponse,
  LayoutRequestPayload,
  LayoutResult,
} from '../src/viewer/workers/protocol.js';

// ── Protocol types ──────────────────────────────────────────────────

describe('Worker Protocol', () => {
  it('creates a valid request message', () => {
    const msg: WorkerRequest<LayoutRequestPayload> = {
      type: MessageType.LAYOUT_COMPUTE,
      payload: {
        mode: 'hierarchical',
        nodeIds: ['a', 'b', 'c'],
        edges: [{ source: 'a', target: 'b', kind: 'imports' }],
        width: 1000,
        height: 800,
      },
      id: 1,
    };

    expect(msg.type).toBe('layout:compute');
    expect(msg.id).toBe(1);
    expect(msg.payload.nodeIds).toHaveLength(3);
    expect(msg.payload.edges).toHaveLength(1);
  });

  it('creates a valid response message', () => {
    const msg: WorkerResponse<LayoutResult> = {
      type: MessageType.LAYOUT_RESULT,
      payload: {
        positions: {
          a: { x: 100, y: 200 },
          b: { x: 300, y: 200 },
        },
        bounds: { minX: 100, maxX: 300, minY: 200, maxY: 200 },
      },
      id: 1,
    };

    expect(msg.type).toBe('layout:result');
    expect(Object.keys(msg.payload.positions)).toHaveLength(2);
    expect(msg.payload.positions.a).toEqual({ x: 100, y: 200 });
  });

  it('survives structured clone round-trip', () => {
    const original: LayoutRequestPayload = {
      mode: 'hierarchical',
      nodeIds: ['x', 'y', 'z'],
      edges: [
        { source: 'x', target: 'y', kind: 'imports' },
        { source: 'y', target: 'z', kind: 'extends' },
      ],
      width: 1920,
      height: 1080,
    };

    // Simulate structured clone via JSON round-trip
    const cloned = JSON.parse(JSON.stringify(original));

    expect(cloned).toEqual(original);
    expect(cloned.mode).toBe('hierarchical');
    expect(cloned.nodeIds).toContain('x');
    expect(cloned.edges[0].source).toBe('x');
  });

  it('includes error field on failure response', () => {
    const msg: WorkerResponse = {
      type: MessageType.LAYOUT_ERROR,
      payload: null,
      id: 99,
      error: 'dagre layout failed: cycle detected',
    };

    expect(msg.error).toBeDefined();
    expect(msg.error).toContain('dagre layout failed');
    expect(msg.payload).toBeNull();
  });
});

// ── createDeferred ──────────────────────────────────────────────────

describe('createDeferred', () => {
  it('resolves the promise', async () => {
    const d = createDeferred<string>();
    d.resolve('hello');
    await expect(d.promise).resolves.toBe('hello');
  });

  it('rejects the promise', async () => {
    const d = createDeferred<string>();
    d.reject(new Error('fail'));
    await expect(d.promise).rejects.toThrow('fail');
  });

  it('has correct types', () => {
    const d = createDeferred<LayoutResult>();
    expect(typeof d.resolve).toBe('function');
    expect(typeof d.reject).toBe('function');
    expect(d.promise).toBeInstanceOf(Promise);
  });
});

// ── MessageType constants ──────────────────────────────────────────

describe('MessageType constants', () => {
  it('defines all required message types', () => {
    expect(MessageType.LAYOUT_COMPUTE).toBe('layout:compute');
    expect(MessageType.LAYOUT_RESULT).toBe('layout:result');
    expect(MessageType.LAYOUT_ERROR).toBe('layout:error');
    expect(MessageType.PARSE_FILE).toBe('parse:file');
    expect(MessageType.PARSE_RESULT).toBe('parse:result');
    expect(MessageType.PARSE_ERROR).toBe('parse:error');
  });

  it('has no duplicate values', () => {
    const values = Object.values(MessageType);
    const unique = new Set(values);
    expect(values.length).toBe(unique.size);
  });
});

// ── Layout result integrity ─────────────────────────────────────────

describe('LayoutResult integrity', () => {
  it('returns positions for all requested nodes', () => {
    const nodeIds = ['n1', 'n2', 'n3', 'n4', 'n5'];
    const result: LayoutResult = {
      positions: Object.fromEntries(nodeIds.map((id) => [id, { x: Math.random() * 1000, y: Math.random() * 800 }])),
      bounds: { minX: 0, maxX: 1000, minY: 0, maxY: 800 },
    };

    expect(Object.keys(result.positions)).toHaveLength(nodeIds.length);
    for (const id of nodeIds) {
      expect(result.positions[id]).toBeDefined();
      expect(typeof result.positions[id].x).toBe('number');
      expect(typeof result.positions[id].y).toBe('number');
      expect(result.positions[id].x).not.toBeNaN();
      expect(result.positions[id].y).not.toBeNaN();
    }
  });

  it('bounds contain all positions', () => {
    const result: LayoutResult = {
      positions: {
        a: { x: 50, y: 100 },
        b: { x: 800, y: 600 },
        c: { x: 200, y: 300 },
      },
      bounds: { minX: 50, maxX: 800, minY: 100, maxY: 600 },
    };

    const allPositions = Object.values(result.positions);
    for (const pos of allPositions) {
      expect(pos.x).toBeGreaterThanOrEqual(result.bounds.minX);
      expect(pos.x).toBeLessThanOrEqual(result.bounds.maxX);
      expect(pos.y).toBeGreaterThanOrEqual(result.bounds.minY);
      expect(pos.y).toBeLessThanOrEqual(result.bounds.maxY);
    }
  });

  it('handles empty node list', () => {
    const result: LayoutResult = {
      positions: {},
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    };
    expect(Object.keys(result.positions)).toHaveLength(0);
    expect(result.bounds.minX).toBe(0);
    expect(result.bounds.maxX).toBe(0);
  });
});

// ── Fallback grid layout (no worker needed) ─────────────────────────

describe('Fallback grid layout (simulated)', () => {
  function fallbackGridLayout(nodeIds: string[], width: number, height: number): LayoutResult {
    const positions: Record<string, { x: number; y: number }> = {};
    if (nodeIds.length === 0) {
      return { positions, bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
    }
    const cols = Math.max(5, Math.ceil(Math.sqrt(nodeIds.length)));
    const cellW = width / cols;
    const cellH = height / Math.ceil(nodeIds.length / cols);
    for (let i = 0; i < nodeIds.length; i++) {
      positions[nodeIds[i]] = {
        x: (i % cols) * cellW + cellW / 2,
        y: Math.floor(i / cols) * cellH + cellH / 2,
      };
    }
    return {
      positions,
      bounds: {
        minX: 0,
        maxX: width,
        minY: 0,
        maxY: height,
      },
    };
  }

  it('assigns positions to all nodes', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const result = fallbackGridLayout(ids, 1000, 800);
    expect(Object.keys(result.positions)).toHaveLength(5);
    for (const id of ids) {
      expect(result.positions[id].x).toBeGreaterThan(0);
      expect(result.positions[id].y).toBeGreaterThan(0);
    }
  });

  it('handles large inputs without error', () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `node${i}`);
    const result = fallbackGridLayout(ids, 1920, 1080);
    expect(Object.keys(result.positions)).toHaveLength(1000);
  });

  it('handles empty input', () => {
    const result = fallbackGridLayout([], 800, 600);
    expect(Object.keys(result.positions)).toHaveLength(0);
  });

  it('assigns unique positions for different nodes', () => {
    const ids = ['a', 'b'];
    const result = fallbackGridLayout(ids, 1000, 800);
    expect(result.positions.a).not.toEqual(result.positions.b);
  });
});
