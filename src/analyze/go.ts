import fs from 'node:fs';
import path from 'node:path';
import { GraphNode, GraphEdge, CodeGraph, Config } from '../graph/index.js';
import { readFileSafe, findLine, walkFiles } from './utils.js';

const PACKAGE_RE = /^package\s+(\w+)/gm;
const IMPORT_RE = /import\s+(?:\(\s*([\s\S]*?)\s*\)|"([^"]+)")/g;
const IMPORT_LINE_RE = /"([^"]+)"/g;
const FUNC_RE = /^func\s+(?:\([^)]*\)\s+)?(\w+)/gm;
const STRUCT_RE = /^type\s+(\w+)\s+struct/gm;
const INTERFACE_RE = /^type\s+(\w+)\s+interface/gm;
const TYPE_RE = /^type\s+(\w+)\s+/gm;
const CALL_RE = /(\w+)\s*\(/g;
const SKIP_CALLS =
  /^(if|else|for|range|switch|case|default|select|go|defer|return|break|continue|fallthrough|chan|const|func|import|package|var|type|struct|interface|map|make|new|len|cap|append|copy|delete|close|panic|recover|print|println|error|true|false|nil|iota|any|comparable|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|uintptr|float32|float64|complex64|complex128|bool|byte|rune|string|fmt|log|os|io|strings|strconv|errors|context|sync|math|sort|time|net|http|json|testing)$/;

function isCodeFile(p: string): boolean {
  return p.endsWith('.go');
}

export async function analyzeGo(dir: string, rootDir: string, config?: Config): Promise<CodeGraph> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const allFiles = await walkFiles(dir, config);
  const goFiles = allFiles.filter(isCodeFile);

  for (const filePath of goFiles) {
    const relPath = filePath.startsWith(rootDir) ? filePath.slice(rootDir.length).replace(/\\/g, '/') : filePath;
    const nodeId = `file:${relPath}`;
    nodes.push({
      id: nodeId,
      label: relPath.split('/').pop() || relPath,
      kind: 'file',
      filePath: relPath,
      line: 1,
      col: 1,
      description: relPath,
    });

    const { content, error } = readFileSafe(filePath);
    if (!content) continue;
    const lines = content.split('\n');
    const localFuncs = new Set<string>();

    for (const m of content.matchAll(IMPORT_RE)) {
      const block = m[1] || m[2];
      if (m[1]) {
        for (const im of block.matchAll(IMPORT_LINE_RE)) {
          edges.push({
            source: nodeId,
            target: `module:${im[1]}`,
            kind: 'imports',
            label: im[1].split('/').pop() || im[1],
          });
        }
      } else {
        edges.push({ source: nodeId, target: `module:${m[2]}`, kind: 'imports', label: m[2].split('/').pop() || m[2] });
      }
    }

    for (const m of content.matchAll(STRUCT_RE)) {
      localFuncs.add(m[1]);
      nodes.push({
        id: `struct:${relPath}#${m[1]}`,
        label: m[1],
        kind: 'type',
        filePath: relPath,
        line: findLine(lines, m[1]),
        col: 1,
        description: 'struct',
      });
      edges.push({ source: nodeId, target: `struct:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(INTERFACE_RE)) {
      localFuncs.add(m[1]);
      nodes.push({
        id: `interface:${relPath}#${m[1]}`,
        label: m[1],
        kind: 'interface',
        filePath: relPath,
        line: findLine(lines, m[1]),
        col: 1,
      });
      edges.push({ source: nodeId, target: `interface:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(FUNC_RE)) {
      localFuncs.add(m[1]);
      nodes.push({
        id: `func:${relPath}#${m[1]}`,
        label: m[1],
        kind: 'function',
        filePath: relPath,
        line: findLine(lines, 'func ' + m[1]),
        col: 1,
      });
      edges.push({ source: nodeId, target: `func:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(CALL_RE)) {
      if (SKIP_CALLS.test(m[1])) continue;
      if (localFuncs.has(m[1]))
        edges.push({ source: nodeId, target: `func:${relPath}#${m[1]}`, kind: 'calls', label: m[1] });
    }
  }

  return { nodes, edges };
}
