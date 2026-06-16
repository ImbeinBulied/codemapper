import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { analyzeCodebase } from './analyze/index.js';
import { loadConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ServerOptions {
  filter?: string;
  watch?: boolean;
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
  } catch { }
  return hash.digest('hex');
}

export async function startServer(workspaceDir: string, port: number, options: ServerOptions = {}): Promise<{ server: any; url: string }> {
  const app = express();
  const resolvedDir = path.resolve(workspaceDir);

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

  app.use(express.json());

  let cache: CacheEntry | null = null;

  const getCachedResult = async () => {
    const currentHash = hashDir(resolvedDir);
    if (cache && cache.hash === currentHash) {
      return cache.result;
    }
    const result = await analyzeCodebase(resolvedDir, options.filter);
    cache = { hash: currentHash, result };
    return result;
  };

  app.get('/api/analyze', async (_req, res) => {
    try {
      const result = await getCachedResult();
      res.json(result);
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
      const resolved = fs.realpathSync(fullPath);
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
      debounceTimer = setTimeout(() => { cache = null; }, 300);
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

  app.get('*', (_req, res) => {
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      res.status(500).send('Viewer not found. Build the project first.');
    }
  });

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      const addr = server.address();
      const host = typeof addr === 'string' ? addr : `http://localhost:${addr?.port || port}`;
      resolve({ server, url: host as string });
    });
  });
}
