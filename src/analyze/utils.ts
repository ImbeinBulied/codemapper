import fs from 'node:fs';
import path from 'node:path';
import { Config } from '../graph/index.js';

export const SKIP_DIRS =
  /node_modules|\.git|dist|build|target|__pycache__|\.venv|venv|vendor|\.mypy_cache|\.pytest_cache|\.gradle|\.idea|coverage|wasm/;
export const MAX_FILE_SIZE = 1_000_000;

export function isBinary(content: string): boolean {
  for (let i = 0; i < Math.min(content.length, 4096); i++) {
    if (content.charCodeAt(i) === 0) return true;
  }
  return false;
}

export function readFileSafe(filePath: string): { content: string | null; error?: string } {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      return { content: null, error: 'file too large (' + Math.round(stat.size / 1024) + 'KB)' };
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    if (isBinary(content)) {
      return { content: null, error: 'binary file' };
    }
    return { content };
  } catch (e: any) {
    return { content: null, error: e?.message || 'read error' };
  }
}

export function findLine(lines: string[], name: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(name)) return i + 1;
  }
  return 1;
}

export async function walkFiles(dir: string, config?: Config): Promise<string[]> {
  const results: string[] = [];
  const excludePatterns = config?.exclude?.map((p) => new RegExp(p)) || [];
  const includePatterns = config?.include?.map((p) => new RegExp(p)) || [];
  const hasInclude = includePatterns.length > 0;
  let batch = 0;

  async function walk(dir: string): Promise<void> {
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.name.startsWith('.') || SKIP_DIRS.test(entry.name)) continue;
        if (excludePatterns.some((r) => r.test(fullPath))) continue;
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else {
          if (hasInclude && !includePatterns.some((r) => r.test(fullPath))) continue;
          results.push(fullPath);
          batch++;
          if (batch % 20 === 0) {
            await new Promise((resolve) => setImmediate(resolve));
          }
        }
      }
    } catch (e: any) {
      console.warn('walkFiles error reading', dir, ':', e?.message || e);
    }
  }

  await walk(dir);
  return results;
}
