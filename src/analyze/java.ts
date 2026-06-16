import { GraphNode, GraphEdge, CodeGraph, Config } from '../graph/index.js';
import { readFileSafe, findLine, walkFiles } from './utils.js';

const IMPORT_RE = /^import\s+(?:static\s+)?([\w.*]+);/gm;
const CLASS_RE = /(?:(?:public|protected|private|static|final|abstract|sealed)\s+)*(?:class|record)\s+(\w+)/gm;
const INTERFACE_RE = /(?:(?:public|protected|private|static|final|abstract)\s+)*interface\s+(\w+)/gm;
const ENUM_RE = /(?:(?:public|protected|private|static|final)\s+)*enum\s+(\w+)/gm;
const FUNC_RE = /(?:(?:public|protected|private|static|final|abstract|synchronized|native)\s+)*(?:[\w<>\[\],\s]+)\s+(\w+)\s*\(/g;
const CALL_RE = /(\w+)\s*\(/g;
const EXTENDS_RE = /class\s+\w+\s+extends\s+(\w+)/g;
const IMPLEMENTS_RE = /implements\s+([\w\s,<>]+?)\s*\{/g;
const SKIP_CALLS = /^(if|else|for|while|do|switch|case|default|try|catch|finally|return|throw|new|instanceof|class|interface|enum|extends|implements|import|package|public|private|protected|static|final|abstract|synchronized|native|strictfp|transient|volatile|this|super|void|true|false|null|var|val|yield|record|sealed|permits|assert|break|continue|goto|const|String|Integer|Long|Double|Float|Boolean|Object|System|Math|List|Map|Set|ArrayList|HashMap|HashSet|LinkedList|TreeMap|TreeSet|Arrays|Stream|Optional|Function|Consumer|Predicate|Supplier|Runnable|Exception|RuntimeException|Error|Throwable|IOException|Thread|Runnable|Comparator|StringBuilder|StringBuffer|Path|Paths)$/;

function isCodeFile(p: string): boolean {
  return p.endsWith('.java');
}

export async function analyzeJava(dir: string, rootDir: string, config?: Config): Promise<CodeGraph> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const allFiles = await walkFiles(dir, config);
  const javaFiles = allFiles.filter(isCodeFile);

  for (const filePath of javaFiles) {
    const relPath = filePath.startsWith(rootDir)
      ? filePath.slice(rootDir.length).replace(/\\/g, '/')
      : filePath;
    const nodeId = `file:${relPath}`;
    nodes.push({ id: nodeId, label: relPath.split('/').pop() || relPath, kind: 'file', filePath: relPath, line: 1, col: 1, description: relPath });

    const { content, error } = readFileSafe(filePath);
    if (!content) continue;
    const lines = content.split('\n');
    const localFuncs = new Set<string>();

    for (const m of content.matchAll(IMPORT_RE)) {
      const full = m[1].replace(/;\s*$/, '');
      const short = full.split('.').pop() || full;
      edges.push({ source: nodeId, target: `module:${full}`, kind: 'imports', label: short });
    }

    for (const m of content.matchAll(CLASS_RE)) {
      localFuncs.add(m[1]);
      nodes.push({ id: `class:${relPath}#${m[1]}`, label: m[1], kind: 'class', filePath: relPath, line: findLine(lines, m[1]), col: 1 });
      edges.push({ source: nodeId, target: `class:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(INTERFACE_RE)) {
      localFuncs.add(m[1]);
      nodes.push({ id: `interface:${relPath}#${m[1]}`, label: m[1], kind: 'interface', filePath: relPath, line: findLine(lines, m[1]), col: 1 });
      edges.push({ source: nodeId, target: `interface:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(ENUM_RE)) {
      localFuncs.add(m[1]);
      nodes.push({ id: `enum:${relPath}#${m[1]}`, label: m[1], kind: 'type', filePath: relPath, line: findLine(lines, m[1]), col: 1, description: 'enum' });
      edges.push({ source: nodeId, target: `enum:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(FUNC_RE)) {
      if (localFuncs.has(m[1])) continue;
      localFuncs.add(m[1]);
      nodes.push({ id: `func:${relPath}#${m[1]}`, label: m[1], kind: 'function', filePath: relPath, line: findLine(lines, m[1]), col: 1 });
      edges.push({ source: nodeId, target: `func:${relPath}#${m[1]}`, kind: 'contains' });
    }

    for (const m of content.matchAll(EXTENDS_RE)) {
      edges.push({ source: nodeId, target: `class:${m[1]}`, kind: 'extends', label: m[1] });
    }
    for (const m of content.matchAll(IMPLEMENTS_RE)) {
      for (const iface of m[1].split(',').map(s => s.trim().replace(/<.*>/, '')).filter(Boolean)) {
        edges.push({ source: nodeId, target: `interface:${iface}`, kind: 'implements', label: iface });
      }
    }

    for (const m of content.matchAll(CALL_RE)) {
      if (SKIP_CALLS.test(m[1])) continue;
      if (localFuncs.has(m[1])) edges.push({ source: nodeId, target: `func:${relPath}#${m[1]}`, kind: 'calls', label: m[1] });
    }
  }

  return { nodes, edges };
}
