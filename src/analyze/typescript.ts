import fs from 'node:fs';
import path from 'node:path';
import { GraphNode, GraphEdge, CodeGraph, Config } from '../graph/index.js';
import { readFileSafe, findLine, walkFiles } from './utils.js';

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
const SKIP_CALLS = /^(import|from|export|default|if|else|for|while|switch|case|return|throw|try|catch|finally|new|typeof|instanceof|void|delete|in|of|as|let|const|var|function|class|interface|type|enum|module|namespace|declare|abstract|public|private|protected|static|readonly|async|await|yield|constructor|get|set|this|super|true|false|null|undefined|NaN|Infinity|console|require|module|process|window|document|Math|JSON|Array|Object|String|Number|Boolean|RegExp|Date|Map|Set|Promise|Error|Symbol|BigInt|Proxy|Reflect)$/;

function isCodeFile(p: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs)$/.test(p);
}

export async function analyzeTypeScript(dir: string, rootDir: string, config?: Config): Promise<CodeGraph> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const allFiles = await walkFiles(dir, config);
  const tsFiles = allFiles.filter(isCodeFile);

  for (const filePath of tsFiles) {
    const relPath = filePath.startsWith(rootDir)
      ? filePath.slice(rootDir.length).replace(/\\/g, '/')
      : filePath;
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

    for (const match of content.matchAll(IMPORT_RE)) {
      edges.push({ source: nodeId, target: `module:${match[1]}`, kind: 'imports', label: match[1] });
    }

    for (const match of content.matchAll(CLASS_RE)) {
      localFuncs.add(match[1]);
      const lineNum = findLine(lines, match[1]);
      const classId = `class:${relPath}#${match[1]}`;
      nodes.push({ id: classId, label: match[1], kind: 'class', filePath: relPath, line: lineNum, col: 1 });
      edges.push({ source: nodeId, target: classId, kind: 'contains' });
    }

    for (const match of content.matchAll(INTERFACE_RE)) {
      localFuncs.add(match[1]);
      const lineNum = findLine(lines, match[1]);
      const ifaceId = `interface:${relPath}#${match[1]}`;
      nodes.push({ id: ifaceId, label: match[1], kind: 'interface', filePath: relPath, line: lineNum, col: 1 });
      edges.push({ source: nodeId, target: ifaceId, kind: 'contains' });
    }

    for (const match of content.matchAll(TYPE_RE)) {
      localFuncs.add(match[1]);
      const lineNum = findLine(lines, match[1]);
      const typeId = `type:${relPath}#${match[1]}`;
      nodes.push({ id: typeId, label: match[1], kind: 'type', filePath: relPath, line: lineNum, col: 1 });
      edges.push({ source: nodeId, target: typeId, kind: 'contains' });
    }

    for (const match of content.matchAll(EXPORT_FUNC_RE)) {
      localFuncs.add(match[1]);
      const lineNum = findLine(lines, match[1]);
      nodes.push({ id: `func:${relPath}#${match[1]}`, label: match[1], kind: 'function', filePath: relPath, line: lineNum, col: 1 });
      edges.push({ source: nodeId, target: `func:${relPath}#${match[1]}`, kind: 'contains' });
    }

    for (const match of content.matchAll(FUNC_RE)) {
      localFuncs.add(match[1]);
    }

    for (const match of content.matchAll(ARROW_FUNC_RE)) {
      const funcId = `func:${relPath}#${match[1]}`;
      if (!nodes.some(n => n.id === funcId)) {
        localFuncs.add(match[1]);
        const lineNum = findLine(lines, match[1]);
        nodes.push({ id: funcId, label: match[1], kind: 'function', filePath: relPath, line: lineNum, col: 1 });
        edges.push({ source: nodeId, target: funcId, kind: 'contains' });
      }
    }

    for (const match of content.matchAll(EXTENDS_RE)) {
      edges.push({ source: nodeId, target: `class:${match[1]}`, kind: 'extends', label: match[1] });
    }
    for (const match of content.matchAll(IMPLEMENTS_RE)) {
      edges.push({ source: nodeId, target: `interface:${match[1]}`, kind: 'implements', label: match[1] });
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
