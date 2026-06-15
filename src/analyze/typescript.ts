import fs from 'node:fs';
import { GraphNode, GraphEdge, CodeGraph } from '../graph/index.js';

const IMPORT_RE = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*,?\s*)*\s*from\s+['"]([^'"]+)['"]/g;
const EXPORT_FUNC_RE = /export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/g;
const FUNC_RE = /(?:async\s+)?function\s+(\w+)/g;
const CLASS_RE = /(?:export\s+)?(?:default\s+)?class\s+(\w+)/g;
const INTERFACE_RE = /(?:export\s+)?(?:default\s+)?interface\s+(\w+)/g;
const TYPE_RE = /(?:export\s+)?type\s+(\w+)\s*=/g;
const ARROW_FUNC_RE = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>/g;
const CALL_RE = /(\w+)\s*\(/g;
const EXTENDS_RE = /class\s+\w+\s+extends\s+(\w+)/g;
const IMPLEMENTS_RE = /class\s+\w+\s+implements\s+(\w+)/g;

const SKIP_DIRS = /node_modules|\.git|dist|build|target/;

function isCodeFile(path: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs)$/.test(path) && !SKIP_DIRS.test(path);
}

export async function analyzeTypeScript(dir: string, rootDir: string): Promise<CodeGraph> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const allFiles = await walkFiles(dir);
  const tsFiles = allFiles.filter(isCodeFile);

  const fileNodeMap = new Map<string, string>();

  for (const filePath of tsFiles) {
    const relPath = filePath.startsWith(rootDir)
      ? filePath.slice(rootDir.length).replace(/\\/g, '/')
      : filePath;
    const nodeId = `file:${relPath}`;
    fileNodeMap.set(filePath, nodeId);

    nodes.push({
      id: nodeId,
      label: relPath.split('/').pop() || relPath,
      kind: 'file',
      filePath: relPath,
      line: 1,
      col: 1,
      description: relPath,
    });

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // imports
      for (const match of content.matchAll(IMPORT_RE)) {
        const target = match[1];
        edges.push({
          source: nodeId,
          target: `module:${target}`,
          kind: 'imports',
          label: target,
        });
      }

      // classes
      for (const match of content.matchAll(CLASS_RE)) {
        const name = match[1];
        const lineNum = findLine(lines, name);
        const classId = `class:${relPath}#${name}`;
        nodes.push({
          id: classId,
          label: name,
          kind: 'class',
          filePath: relPath,
          line: lineNum,
          col: 1,
        });
        edges.push({ source: nodeId, target: classId, kind: 'contains' });
      }

      // interfaces
      for (const match of content.matchAll(INTERFACE_RE)) {
        const name = match[1];
        const lineNum = findLine(lines, name);
        const ifaceId = `interface:${relPath}#${name}`;
        nodes.push({
          id: ifaceId,
          label: name,
          kind: 'interface',
          filePath: relPath,
          line: lineNum,
          col: 1,
        });
        edges.push({ source: nodeId, target: ifaceId, kind: 'contains' });
      }

      // type aliases
      for (const match of content.matchAll(TYPE_RE)) {
        const name = match[1];
        const lineNum = findLine(lines, name);
        const typeId = `type:${relPath}#${name}`;
        nodes.push({
          id: typeId,
          label: name,
          kind: 'type',
          filePath: relPath,
          line: lineNum,
          col: 1,
        });
        edges.push({ source: nodeId, target: typeId, kind: 'contains' });
      }

      // exported functions
      for (const match of content.matchAll(EXPORT_FUNC_RE)) {
        const name = match[1];
        const lineNum = findLine(lines, name);
        const funcId = `func:${relPath}#${name}`;
        nodes.push({
          id: funcId,
          label: name,
          kind: 'function',
          filePath: relPath,
          line: lineNum,
          col: 1,
        });
        edges.push({ source: nodeId, target: funcId, kind: 'contains' });
      }

      // arrow functions
      for (const match of content.matchAll(ARROW_FUNC_RE)) {
        const name = match[1];
        const lineNum = findLine(lines, name);
        const funcId = `func:${relPath}#${name}`;
        if (!nodes.some(n => n.id === funcId)) {
          nodes.push({
            id: funcId,
            label: name,
            kind: 'function',
            filePath: relPath,
            line: lineNum,
            col: 1,
          });
          edges.push({ source: nodeId, target: funcId, kind: 'contains' });
        }
      }

      // extends / implements
      for (const match of content.matchAll(EXTENDS_RE)) {
        const target = match[1];
        edges.push({ source: nodeId, target: `class:${target}`, kind: 'extends', label: target });
      }
      for (const match of content.matchAll(IMPLEMENTS_RE)) {
        const target = match[1];
        edges.push({ source: nodeId, target: `interface:${target}`, kind: 'implements', label: target });
      }

    } catch {
      // skip unreadable files
    }
  }

  return { nodes, edges };
}

function findLine(lines: string[], name: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(name)) return i + 1;
  }
  return 1;
}

async function walkFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = `${dir}/${entry.name}`;
      if (entry.name.startsWith('.') || SKIP_DIRS.test(entry.name)) continue;
      if (entry.isDirectory()) {
        results.push(...await walkFiles(fullPath));
      } else {
        results.push(fullPath);
      }
    }
  } catch { }
  return results;
}
