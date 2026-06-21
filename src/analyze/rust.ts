import fs from 'node:fs';
import path from 'node:path';
import { GraphNode, GraphEdge, CodeGraph, Config } from '../graph/index.js';
import { readFileSafe, findLine, walkFiles } from './utils.js';

const MOD_RE = /^mod\s+(\w+)/gm;
const FN_RE = /(?:pub\s+)?(?:unsafe\s+)?fn\s+(\w+)/g;
const STRUCT_RE = /(?:pub\s+)?struct\s+(\w+)/g;
const ENUM_RE = /(?:pub\s+)?enum\s+(\w+)/g;
const TRAIT_RE = /(?:pub\s+)?(?:unsafe\s+)?trait\s+(\w+)/g;
const IMPL_RE = /impl\s+(?:<\w+>\s+)?(\w+)/g;
const USE_RE = /^use\s+([^;]+);/gm;
const TYPE_RE = /(?:pub\s+)?type\s+(\w+)\s*=/g;
const CALL_RE = /(\w+)\s*\(/g;
const SKIP_CALLS =
  /^(if|else|for|while|loop|match|return|throw|try|catch|finally|new|typeof|instanceof|fn|let|const|var|pub|use|mod|struct|enum|trait|impl|type|async|await|move|ref|Self|self|true|false|println|eprintln|format|vec|assert|debug|todo|unimplemented|unreachable|dbg|cfg|derive|allow|warn|deny|forbid|test|bench|cold|inline|noinline|must_use|allow_unused|deprecated)$/;

function isCodeFile(p: string): boolean {
  return p.endsWith('.rs');
}

export async function analyzeRust(dir: string, rootDir: string, config?: Config): Promise<CodeGraph> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const allFiles = await walkFiles(dir, config);
  const rsFiles = allFiles.filter(isCodeFile);

  for (const filePath of rsFiles) {
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

    for (const match of content.matchAll(USE_RE)) {
      const target = match[1].split('::').filter(Boolean).join('::');
      edges.push({ source: nodeId, target: `module:${target}`, kind: 'imports', label: target });
    }
    for (const match of content.matchAll(MOD_RE)) {
      edges.push({ source: nodeId, target: `module:${match[1]}`, kind: 'imports', label: match[1] });
    }

    for (const match of content.matchAll(FN_RE)) {
      localFuncs.add(match[1]);
      const lineNum = findLine(lines, match[1]);
      nodes.push({
        id: `func:${relPath}#${match[1]}`,
        label: match[1],
        kind: 'function',
        filePath: relPath,
        line: lineNum,
        col: 1,
      });
      edges.push({ source: nodeId, target: `func:${relPath}#${match[1]}`, kind: 'contains' });
    }

    for (const match of content.matchAll(STRUCT_RE)) {
      localFuncs.add(match[1]);
      const lineNum = findLine(lines, match[1]);
      nodes.push({
        id: `struct:${relPath}#${match[1]}`,
        label: match[1],
        kind: 'type',
        filePath: relPath,
        line: lineNum,
        col: 1,
        description: 'struct',
      });
      edges.push({ source: nodeId, target: `struct:${relPath}#${match[1]}`, kind: 'contains' });
    }

    for (const match of content.matchAll(ENUM_RE)) {
      localFuncs.add(match[1]);
      const lineNum = findLine(lines, match[1]);
      nodes.push({
        id: `enum:${relPath}#${match[1]}`,
        label: match[1],
        kind: 'type',
        filePath: relPath,
        line: lineNum,
        col: 1,
        description: 'enum',
      });
      edges.push({ source: nodeId, target: `enum:${relPath}#${match[1]}`, kind: 'contains' });
    }

    for (const match of content.matchAll(TRAIT_RE)) {
      localFuncs.add(match[1]);
      const lineNum = findLine(lines, match[1]);
      nodes.push({
        id: `trait:${relPath}#${match[1]}`,
        label: match[1],
        kind: 'interface',
        filePath: relPath,
        line: lineNum,
        col: 1,
        description: 'trait',
      });
      edges.push({ source: nodeId, target: `trait:${relPath}#${match[1]}`, kind: 'contains' });
    }

    for (const match of content.matchAll(IMPL_RE)) {
      const target = match[1];
      if (!nodes.some((n) => n.id === `impl:${relPath}#${target}`)) {
        nodes.push({
          id: `impl:${relPath}#${target}`,
          label: `impl ${target}`,
          kind: 'call',
          filePath: relPath,
          line: findLine(lines, 'impl'),
          col: 1,
        });
        edges.push({ source: nodeId, target: `impl:${relPath}#${target}`, kind: 'contains' });
      }
    }

    for (const match of content.matchAll(TYPE_RE)) {
      localFuncs.add(match[1]);
      const lineNum = findLine(lines, match[1]);
      nodes.push({
        id: `typealias:${relPath}#${match[1]}`,
        label: match[1],
        kind: 'type',
        filePath: relPath,
        line: lineNum,
        col: 1,
        description: 'type alias',
      });
      edges.push({ source: nodeId, target: `typealias:${relPath}#${match[1]}`, kind: 'contains' });
    }

    for (const match of content.matchAll(CALL_RE)) {
      const name = match[1];
      if (SKIP_CALLS.test(name)) continue;
      if (localFuncs.has(name)) {
        edges.push({ source: nodeId, target: `func:${relPath}#${name}`, kind: 'calls', label: name });
      }
    }
  }

  return { nodes, edges };
}
