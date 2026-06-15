import fs from 'node:fs';
import { GraphNode, GraphEdge, CodeGraph } from '../graph/index.js';

const MOD_RE = /^mod\s+(\w+)/gm;
const FN_RE = /(?:pub\s+)?(?:unsafe\s+)?fn\s+(\w+)/g;
const STRUCT_RE = /(?:pub\s+)?struct\s+(\w+)/g;
const ENUM_RE = /(?:pub\s+)?enum\s+(\w+)/g;
const TRAIT_RE = /(?:pub\s+)?(?:unsafe\s+)?trait\s+(\w+)/g;
const IMPL_RE = /impl\s+(?:<\w+>\s+)?(\w+)/g;
const USE_RE = /^use\s+([^;]+);/gm;
const TYPE_RE = /(?:pub\s+)?type\s+(\w+)\s*=/g;
const CALL_RE = /(\w+)\s*\(/g;

const SKIP_DIRS = /node_modules|\.git|dist|build|target/;

export async function analyzeRust(dir: string, rootDir: string): Promise<CodeGraph> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const allFiles = await walkFiles(dir);
  const rsFiles = allFiles.filter(f => f.endsWith('.rs') && !SKIP_DIRS.test(f));

  for (const filePath of rsFiles) {
    const relPath = filePath.startsWith(rootDir)
      ? filePath.slice(rootDir.length).replace(/\\/g, '/')
      : filePath;
    const fileNodeId = `file:${relPath}`;

    nodes.push({
      id: fileNodeId,
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

      for (const match of content.matchAll(USE_RE)) {
        const target = match[1].split('::').filter(Boolean).join('::');
        edges.push({
          source: fileNodeId,
          target: `module:${target}`,
          kind: 'imports',
          label: target,
        });
      }

      for (const match of content.matchAll(MOD_RE)) {
        const name = match[1];
        edges.push({
          source: fileNodeId,
          target: `module:${name}`,
          kind: 'imports',
          label: name,
        });
      }

      for (const match of content.matchAll(FN_RE)) {
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
        edges.push({ source: fileNodeId, target: funcId, kind: 'contains' });
      }

      for (const match of content.matchAll(STRUCT_RE)) {
        const name = match[1];
        const lineNum = findLine(lines, name);
        const structId = `struct:${relPath}#${name}`;
        nodes.push({
          id: structId,
          label: name,
          kind: 'type',
          filePath: relPath,
          line: lineNum,
          col: 1,
          description: 'struct',
        });
        edges.push({ source: fileNodeId, target: structId, kind: 'contains' });
      }

      for (const match of content.matchAll(ENUM_RE)) {
        const name = match[1];
        const lineNum = findLine(lines, name);
        const enumId = `enum:${relPath}#${name}`;
        nodes.push({
          id: enumId,
          label: name,
          kind: 'type',
          filePath: relPath,
          line: lineNum,
          col: 1,
          description: 'enum',
        });
        edges.push({ source: fileNodeId, target: enumId, kind: 'contains' });
      }

      for (const match of content.matchAll(TRAIT_RE)) {
        const name = match[1];
        const lineNum = findLine(lines, name);
        const traitId = `trait:${relPath}#${name}`;
        nodes.push({
          id: traitId,
          label: name,
          kind: 'interface',
          filePath: relPath,
          line: lineNum,
          col: 1,
          description: 'trait',
        });
        edges.push({ source: fileNodeId, target: traitId, kind: 'contains' });
      }

      for (const match of content.matchAll(IMPL_RE)) {
        const target = match[1];
        const lineNum = findLine(lines, `impl`);
        if (!nodes.some(n => n.id === `impl:${relPath}#${target}`)) {
          nodes.push({
            id: `impl:${relPath}#${target}`,
            label: `impl ${target}`,
            kind: 'call',
            filePath: relPath,
            line: lineNum,
            col: 1,
          });
          edges.push({ source: fileNodeId, target: `impl:${relPath}#${target}`, kind: 'contains' });
        }
      }

    } catch {
      // skip
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
