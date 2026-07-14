import { GraphNode, GraphEdge, CodeGraph, Config } from '../graph/index.js';
import { readFileSafe, findLine, walkFiles } from './utils.js';

const IMPORT_RE = /^import\s+(?:(?:struct|class|enum|protocol|typealias|func|var|let)\s+)?(\w+)/gm;
const CLASS_RE = /(?:(?:public|private|internal|open|final|abstract)\s+)*class\s+(\w+)/gm;
const STRUCT_RE = /(?:(?:public|private|internal|open)\s+)*struct\s+(\w+)/gm;
const ENUM_RE = /(?:(?:public|private|internal|open)\s+)*enum\s+(\w+)/gm;
const PROTOCOL_RE = /(?:(?:public|private|internal|open)\s+)*protocol\s+(\w+)/gm;
const EXTENSION_RE = /(?:(?:public|private|internal|open)\s+)*extension\s+(\w+)/gm;
const FUNC_RE =
  /(?:(?:public|private|internal|open|static|class|mutating|nonmutating|override|convenience|required|optional|dynamic|final)\s+)*func\s+(\w+)/gm;
const TYPEALIAS_RE = /(?:(?:public|private|internal|open)\s+)*typealias\s+(\w+)/gm;
const CALL_RE = /(\w+)\s*\(/g;
const EXTENDS_RE = /:\s*([\w,\s<>]+)/g;
const SKIP_CALLS =
  /^(if|else|for|while|repeat|switch|case|default|return|throw|try|catch|defer|guard|break|continue|fallthrough|in|where|as|is|as!|as\?|let|var|static|class|func|import|struct|enum|protocol|extension|typealias|self|super|true|false|nil|Int|String|Bool|Float|Double|Array|Dictionary|Set|Optional|Character|Data|Date|URL|UUID|IndexSet|IndexPath|CGFloat|CGPoint|CGSize|CGRect|NSObject|NSArray|NSDictionary|NSString|NSError|Exception|fatalError|precondition|preconditionFailure|assert|assertionFailure|debugPrint|print|dump|debugOnly|zone|autoreleasepool|withUnsafePointer|withUnsafeBytes|withExtendedLifetime|withoutActuallyEscaping|type|sizeof|alignof|strideof|unsafeBitCast|unsafeDowncast|unsafeUnwrap|bindMemory|assumingMemoryBound|withMemoryRebound|withUnsafeMutablePointer)$/;

function isCodeFile(p: string): boolean {
  return p.endsWith('.swift');
}

export async function analyzeSwift(dir: string, rootDir: string, config?: Config): Promise<CodeGraph> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const allFiles = await walkFiles(dir, config);
  const swiftFiles = allFiles.filter(isCodeFile);

  for (const filePath of swiftFiles) {
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

    const { content } = readFileSafe(filePath);
    if (!content) continue;
    const lines = content.split('\n');
    const localFuncs = new Set<string>();

    for (const m of content.matchAll(IMPORT_RE)) {
      edges.push({ source: nodeId, target: `module:${m[1]}`, kind: 'imports', label: m[1] });
    }

    for (const m of content.matchAll(CLASS_RE)) {
      localFuncs.add(m[1]);
      nodes.push({
        id: `class:${relPath}#${m[1]}`,
        label: m[1],
        kind: 'class',
        filePath: relPath,
        line: findLine(lines, m[1]),
        col: 1,
      });
      edges.push({ source: nodeId, target: `class:${relPath}#${m[1]}`, kind: 'contains' });
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
    for (const m of content.matchAll(ENUM_RE)) {
      localFuncs.add(m[1]);
      nodes.push({
        id: `enum:${relPath}#${m[1]}`,
        label: m[1],
        kind: 'type',
        filePath: relPath,
        line: findLine(lines, m[1]),
        col: 1,
        description: 'enum',
      });
      edges.push({ source: nodeId, target: `enum:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(PROTOCOL_RE)) {
      localFuncs.add(m[1]);
      nodes.push({
        id: `protocol:${relPath}#${m[1]}`,
        label: m[1],
        kind: 'interface',
        filePath: relPath,
        line: findLine(lines, m[1]),
        col: 1,
        description: 'protocol',
      });
      edges.push({ source: nodeId, target: `protocol:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(EXTENSION_RE)) {
      nodes.push({
        id: `ext:${relPath}#${m[1]}`,
        label: `ext ${m[1]}`,
        kind: 'call',
        filePath: relPath,
        line: findLine(lines, m[1]),
        col: 1,
        description: 'extension',
      });
      edges.push({ source: nodeId, target: `ext:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(FUNC_RE)) {
      if (localFuncs.has(m[1])) continue;
      localFuncs.add(m[1]);
      nodes.push({
        id: `func:${relPath}#${m[1]}`,
        label: m[1],
        kind: 'function',
        filePath: relPath,
        line: findLine(lines, m[1]),
        col: 1,
      });
      edges.push({ source: nodeId, target: `func:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(TYPEALIAS_RE)) {
      localFuncs.add(m[1]);
      nodes.push({
        id: `typealias:${relPath}#${m[1]}`,
        label: m[1],
        kind: 'type',
        filePath: relPath,
        line: findLine(lines, m[1]),
        col: 1,
        description: 'typealias',
      });
      edges.push({ source: nodeId, target: `typealias:${relPath}#${m[1]}`, kind: 'contains' });
    }

    for (const m of content.matchAll(EXTENDS_RE)) {
      if (m[1].includes('=')) continue;
      for (const base of m[1]
        .split(',')
        .map((s) => s.trim().replace(/<.*>/, ''))
        .filter(Boolean)) {
        edges.push({ source: nodeId, target: `class:${base}`, kind: 'extends', label: base });
      }
    }

    for (const m of content.matchAll(CALL_RE)) {
      if (SKIP_CALLS.test(m[1])) continue;
      if (localFuncs.has(m[1])) {
        edges.push({ source: nodeId, target: `func:${relPath}#${m[1]}`, kind: 'calls', label: m[1] });
      }
    }
  }

  return { nodes, edges };
}
