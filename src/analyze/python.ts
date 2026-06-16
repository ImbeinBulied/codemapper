import fs from 'node:fs';
import path from 'node:path';
import { GraphNode, GraphEdge, CodeGraph, Config } from '../graph/index.js';
import { readFileSafe, findLine, walkFiles } from './utils.js';

const IMPORT_RE = /^import\s+(\w+)/gm;
const FROM_IMPORT_RE = /^from\s+([\w.]+)\s+import/gm;
const CLASS_RE = /^class\s+(\w+)/gm;
const FUNC_RE = /^(?:async\s+)?def\s+(\w+)/gm;
const CALL_RE = /(\w+)\s*\(/g;
const SKIP_CALLS = /^(if|elif|else|for|while|with|try|except|finally|return|yield|raise|import|from|class|def|async|await|lambda|pass|break|continue|del|global|nonlocal|assert|print|is|not|and|or|in|True|False|None|self|cls|super|type|len|range|int|str|float|list|dict|set|tuple|bool|enumerate|zip|map|filter|sorted|reversed|any|all|min|max|sum|abs|round|open|input|hasattr|getattr|setattr|isinstance|issubclass|vars|dir|id|hash|repr|format|next|iter|callable|abs|divmod|pow|chr|ord|hex|bin|oct|ascii|Exception|ValueError|TypeError|KeyError|IndexError|RuntimeError|StopIteration|AttributeError|ImportError|FileNotFoundError|OSError|IOError|MemoryError|OverflowError|ZeroDivisionError|AssertionError|PermissionError|NotImplementedError|RecursionError)$/;

function isCodeFile(p: string): boolean {
  return p.endsWith('.py');
}

export async function analyzePython(dir: string, rootDir: string, config?: Config): Promise<CodeGraph> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const allFiles = await walkFiles(dir, config);
  const pyFiles = allFiles.filter(isCodeFile);

  for (const filePath of pyFiles) {
    const relPath = filePath.startsWith(rootDir)
      ? filePath.slice(rootDir.length).replace(/\\/g, '/')
      : filePath;
    const nodeId = `file:${relPath}`;
    nodes.push({ id: nodeId, label: relPath.split('/').pop() || relPath, kind: 'file', filePath: relPath, line: 1, col: 1, description: relPath });

    const { content, error } = readFileSafe(filePath);
    if (!content) continue;
    const lines = content.split('\n');
    const localFuncs = new Set<string>();

    for (const m of content.matchAll(IMPORT_RE)) edges.push({ source: nodeId, target: `module:${m[1]}`, kind: 'imports', label: m[1] });
    for (const m of content.matchAll(FROM_IMPORT_RE)) {
      const mod = m[1].split('.').pop() || m[1];
      edges.push({ source: nodeId, target: `module:${m[1]}`, kind: 'imports', label: mod });
    }
    for (const m of content.matchAll(CLASS_RE)) {
      localFuncs.add(m[1]);
      nodes.push({ id: `class:${relPath}#${m[1]}`, label: m[1], kind: 'class', filePath: relPath, line: findLine(lines, m[1]), col: 1 });
      edges.push({ source: nodeId, target: `class:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(FUNC_RE)) {
      localFuncs.add(m[1]);
      nodes.push({ id: `func:${relPath}#${m[1]}`, label: m[1], kind: 'function', filePath: relPath, line: findLine(lines, m[1]), col: 1 });
      edges.push({ source: nodeId, target: `func:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(CALL_RE)) {
      if (SKIP_CALLS.test(m[1])) continue;
      if (localFuncs.has(m[1])) edges.push({ source: nodeId, target: `func:${relPath}#${m[1]}`, kind: 'calls', label: m[1] });
    }
  }

  return { nodes, edges };
}
