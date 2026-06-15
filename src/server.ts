import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analyzeCodebase } from './analyze/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startServer(workspaceDir: string, port: number): Promise<{ server: any; url: string }> {
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

  app.get('/api/analyze', async (_req, res) => {
    try {
      const result = await analyzeCodebase(resolvedDir);
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
      const fullPath = path.join(resolvedDir, filePath);
      if (!fullPath.startsWith(resolvedDir)) {
        res.status(403).json({ error: 'access denied' });
        return;
      }
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n').map((l: string, i: number) => ({
        line: i + 1,
        text: l,
      }));
      res.json({ path: filePath, lines });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

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
