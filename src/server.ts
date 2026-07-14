import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
import { analyzeCodebase } from './analyze/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ServerOptions {
  filter?: string;
  watch?: boolean;
  deep?: boolean;
  host?: string;
}

interface CacheEntry {
  hash: string;
  result: any;
}

function hashDir(dir: string): string {
  const hash = crypto.createHash('md5');
  try {
    const walk = (d: string) => {
      const entries = fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const fp = path.join(d, entry.name);
        if (entry.isDirectory()) {
          if (/node_modules|\.git|dist|build|target/.test(entry.name)) continue;
          hash.update(entry.name + '/');
          walk(fp);
        } else {
          const stat = fs.statSync(fp);
          hash.update(entry.name + ':' + stat.size + ':' + stat.mtimeMs);
        }
      }
    };
    walk(dir);
  } catch {}
  return hash.digest('hex');
}

export async function startServer(
  workspaceDir: string,
  port: number,
  options: ServerOptions = {},
): Promise<{ server: any; url: string }> {
  const app = express();
  const resolvedDir = path.resolve(workspaceDir);
  const host = options.host || '127.0.0.1';

  const viewerPath = path.join(__dirname, 'viewer', 'index.html');
  const distViewerPath = path.join(__dirname, '..', 'viewer', 'index.html');
  const srcViewerPath = path.join(__dirname, '..', 'src', 'viewer', 'index.html');

  let htmlPath = '';
  for (const p of [viewerPath, distViewerPath, srcViewerPath]) {
    if (fs.existsSync(p)) {
      htmlPath = p;
      break;
    }
  }

  app.use(express.json({ limit: '1mb' }));

  // Rate limiting: simple in-memory counter for /api/analyze
  const rateLimits = new Map<string, { count: number; resetAt: number }>();
  const RATE_LIMIT_MAX = 30; // requests
  const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

  function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = rateLimits.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
      rateLimits.set(ip, entry);
    }
    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) {
      res.status(429).json({ error: 'rate limit exceeded, try again later' });
      return;
    }
    next();
  }

  let cache: CacheEntry | null = null;
  let analyzeLock: Promise<any> | null = null;
  let wsClients: Set<WebSocket> = new Set();

  const broadcast = (msg: object) => {
    const data = JSON.stringify(msg);
    for (const ws of wsClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  };

  const getCachedResult = async () => {
    const currentHash = hashDir(resolvedDir);
    if (cache && cache.hash === currentHash) {
      return cache.result;
    }
    // Coalesce concurrent requests — only one analysis runs at a time
    if (!analyzeLock) {
      analyzeLock = analyzeCodebase(resolvedDir, options.filter, options.deep)
        .then((result) => {
          cache = { hash: currentHash, result };
          return result;
        })
        .finally(() => {
          analyzeLock = null;
        });
    }
    return analyzeLock;
  };

  app.get('/api/analyze', rateLimit, async (_req, res) => {
    try {
      const result = await getCachedResult();
      // Include cycle count in the response
      res.json({
        ...result,
        cycleCount: result.cycles?.length || 0,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/file', async (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        res.status(400).json({ error: 'path query param required' });
        return;
      }
      const fullPath = path.resolve(path.join(resolvedDir, filePath));
      // Path traversal guard: check resolved string before realpath
      if (!fullPath.startsWith(resolvedDir)) {
        res.status(403).json({ error: 'access denied' });
        return;
      }
      // Realpath resolves symlinks; skip if file doesn't exist
      const resolved = fs.existsSync(fullPath) ? fs.realpathSync(fullPath) : fullPath;
      if (!resolved.startsWith(resolvedDir)) {
        res.status(403).json({ error: 'access denied' });
        return;
      }
      const raw = fs.readFileSync(resolved);
      if (raw.includes(0)) {
        res.status(400).json({ error: 'binary file' });
        return;
      }
      const content = raw.toString('utf-8');
      const lines = content.split('\n').map((l: string, i: number) => ({
        line: i + 1,
        text: l,
      }));
      res.json({ path: filePath, lines });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  if (options.watch) {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        cache = null;
        broadcast({ type: 'refresh' });
      }, 300);
    };
    try {
      fs.watch(resolvedDir, { recursive: true }, (_event, filename) => {
        if (filename && !/node_modules|\.git/.test(filename)) {
          invalidate();
        }
      });
    } catch {
      console.warn('  Could not watch directory for changes');
    }
  }

  app.use(express.static(path.dirname(htmlPath)));

  const viewerDir = path.dirname(htmlPath);
  app.get('/styles.css', (_req, res) => {
    const p = path.join(viewerDir, 'styles.css');
    if (fs.existsSync(p)) res.sendFile(p);
    else res.status(404).end();
  });
  app.get('/bundle.js', (_req, res) => {
    const p = path.join(viewerDir, 'bundle.js');
    if (fs.existsSync(p)) res.sendFile(p);
    else res.status(404).end();
  });

  app.get('*', (_req, res) => {
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(500).send('Viewer not found. Build the project first.');
    }
  });

  return new Promise((resolve) => {
    const httpServer = http.createServer(app);
    const wss = new WebSocketServer({ server: httpServer });
    wss.on('connection', (ws) => {
      wsClients.add(ws);
      ws.on('close', () => wsClients.delete(ws));
      ws.on('error', () => wsClients.delete(ws));
    });
    httpServer.listen(port, host, () => {
      const addr = httpServer.address();
      const displayHost = typeof addr === 'string' ? addr : `http://${host}:${addr?.port || port}`;
      resolve({ server: httpServer, url: displayHost as string });
    });
  });
}
