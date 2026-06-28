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

describe('GET /api/analyze', () => {
  it('returns valid JSON with graph, root, and stats', async () => {
    const res = await fetch(`${baseUrl}/api/analyze`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty('graph');
    expect(data).toHaveProperty('root');
    expect(data).toHaveProperty('stats');
    expect(data.graph).toHaveProperty('nodes');
    expect(data.graph).toHaveProperty('edges');
    expect(Array.isArray(data.graph.nodes)).toBe(true);
    expect(Array.isArray(data.graph.edges)).toBe(true);
    expect(data.stats).toHaveProperty('files');
    expect(data.stats).toHaveProperty('functions');
    expect(data.stats).toHaveProperty('classes');
    expect(data.stats).toHaveProperty('imports');
  });

  it('returns at least one file node', async () => {
    const res = await fetch(`${baseUrl}/api/analyze`);
    const data = await res.json();
    const fileNodes = data.graph.nodes.filter((n: any) => n.kind === 'file');
    expect(fileNodes.length).toBeGreaterThan(0);
  });

  it('each node has required fields', async () => {
    const res = await fetch(`${baseUrl}/api/analyze`);
    const data = await res.json();
    for (const n of data.graph.nodes) {
      expect(n).toHaveProperty('id');
      expect(n).toHaveProperty('label');
      expect(n).toHaveProperty('kind');
      expect(n).toHaveProperty('filePath');
      expect(n).toHaveProperty('line');
      expect(n).toHaveProperty('col');
    }
  });

  it('each edge has required fields', async () => {
    const res = await fetch(`${baseUrl}/api/analyze`);
    const data = await res.json();
    for (const e of data.graph.edges) {
      expect(e).toHaveProperty('source');
      expect(e).toHaveProperty('target');
      expect(e).toHaveProperty('kind');
    }
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
    expect(data.lines[0]).toHaveProperty('line');
    expect(data.lines[0]).toHaveProperty('text');
  });

  it('returns 400 for missing path', async () => {
    const res = await fetch(`${baseUrl}/api/file`);
    expect(res.status).toBe(400);
  });

  it('returns 403 for path traversal', async () => {
    const res = await fetch(`${baseUrl}/api/file?path=../../etc/passwd`);
    expect(res.status).toBe(403);
  });

  it('serves the viewer index.html for root path', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toContain('codemapper');
  });
});
