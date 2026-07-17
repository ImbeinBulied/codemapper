import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer } from '../src/server.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

let server: any;
let baseUrl: string;

beforeAll(async () => {
  const result = await startServer(FIXTURES, 0, {});
  server = result.server;
  baseUrl = result.url;
}, 15000);

afterAll(() => {
  server.close();
});

describe('Server API', () => {
  describe('GET /api/analyze', () => {
    it('returns valid graph structure', async () => {
      const res = await fetch(`${baseUrl}/api/analyze`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data).toHaveProperty('graph');
      expect(data).toHaveProperty('root');
      expect(data).toHaveProperty('stats');
      expect(Array.isArray(data.graph.nodes)).toBe(true);
      expect(Array.isArray(data.graph.edges)).toBe(true);
    });

    it('returns stats with required fields', async () => {
      const res = await fetch(`${baseUrl}/api/analyze`);
      const data = await res.json();
      expect(data.stats).toHaveProperty('files');
      expect(data.stats).toHaveProperty('functions');
      expect(data.stats).toHaveProperty('classes');
      expect(data.stats).toHaveProperty('imports');
      expect(typeof data.stats.files).toBe('number');
    });

    it('includes cycleCount in response', async () => {
      const res = await fetch(`${baseUrl}/api/analyze`);
      const data = await res.json();
      expect(data).toHaveProperty('cycleCount');
      expect(typeof data.cycleCount).toBe('number');
    });

    it('includes healthScore in response', async () => {
      const res = await fetch(`${baseUrl}/api/analyze`);
      const data = await res.json();
      expect(data).toHaveProperty('healthScore');
      expect(data.healthScore).toHaveProperty('score');
      expect(data.healthScore).toHaveProperty('grade');
      expect(data.healthScore).toHaveProperty('factors');
      expect(data.healthScore).toHaveProperty('negatives');
      expect(typeof data.healthScore.score).toBe('number');
      expect(data.healthScore.score).toBeGreaterThanOrEqual(0);
      expect(data.healthScore.score).toBeLessThanOrEqual(100);
    });

    it('includes violations in response', async () => {
      const res = await fetch(`${baseUrl}/api/analyze`);
      const data = await res.json();
      expect(data).toHaveProperty('violations');
      expect(Array.isArray(data.violations)).toBe(true);
    });
  });

  describe('GET /api/file', () => {
    it('returns file content for a valid path', async () => {
      const res = await fetch(`${baseUrl}/api/file?path=/ts/main.ts`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data).toHaveProperty('path');
      expect(data).toHaveProperty('lines');
      expect(Array.isArray(data.lines)).toBe(true);
      expect(data.lines.length).toBeGreaterThan(0);
    });

    it('blocks path traversal', async () => {
      const res = await fetch(`${baseUrl}/api/file?path=../../etc/passwd`);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('access denied');
    });

    it('rejects missing path parameter', async () => {
      const res = await fetch(`${baseUrl}/api/file`);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('path');
    });

    it('returns error for nonexistent file', async () => {
      const res = await fetch(`${baseUrl}/api/file?path=/nonexistent.ts`);
      expect(res.status).toBe(500);
    });
  });

  describe('Rate limiting', () => {
    it('rejects requests exceeding rate limit', async () => {
      // The rate limit is 30 requests per minute
      // Send 31 requests quickly
      const results = [];
      for (let i = 0; i < 31; i++) {
        results.push(fetch(`${baseUrl}/api/analyze`));
      }
      const responses = await Promise.all(results);
      const statuses = responses.map((r) => r.status);
      // At least one should be 429
      expect(statuses).toContain(429);
      // Clean up response bodies to prevent resource leaks
      for (const r of responses) {
        if (r.status === 429) {
          await r.json(); // consume body
        }
      }
    });
  });
});
