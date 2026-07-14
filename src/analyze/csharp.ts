import { GraphNode, GraphEdge, CodeGraph, Config } from '../graph/index.js';
import { readFileSafe, findLine, walkFiles } from './utils.js';

const USING_RE = /^using\s+([\w.]+);/gm;
const NS_RE = /^namespace\s+([\w.]+)/gm;
const CLASS_RE = /(?:(?:public|private|protected|internal|static|abstract|sealed|partial|readonly)\s+)*class\s+(\w+)/gm;
const STRUCT_RE = /(?:(?:public|private|protected|internal|static|readonly|partial)\s+)*struct\s+(\w+)/gm;
const INTERFACE_RE = /(?:(?:public|private|protected|internal|static|partial)\s+)*interface\s+(\w+)/gm;
const ENUM_RE = /(?:(?:public|private|protected|internal)\s+)*enum\s+(\w+)/gm;
const FUNC_RE =
  /(?:(?:public|private|protected|internal|static|virtual|override|abstract|sealed|async|unsafe|extern|partial)\s+)*(?:[\w<>[\],?]+)\s+(\w+)\s*\(/g;
const CALL_RE = /(\w+)\s*\(/g;
const EXTENDS_RE = /:\s*([\w,\s<>]+)/g;
const SKIP_CALLS =
  /^(if|else|for|foreach|while|do|switch|case|default|try|catch|finally|return|throw|new|typeof|nameof|sizeof|default|is|as|in|out|ref|var|let|const|this|base|true|false|null|async|await|yield|break|continue|goto|using|namespace|class|struct|interface|enum|record|delegate|event|partial|readonly|sealed|abstract|virtual|override|static|unsafe|fixed|stackalloc|checked|unchecked|lock|where|select|from|group|orderby|join|let|into|on|equals|int|string|bool|float|double|decimal|char|byte|sbyte|short|ushort|long|ulong|uint|object|void|var|dynamic|nint|nuint|Task|Task<T>|ValueTask|IEnumerable|IQueryable|ICollection|IList|IDictionary|ISet|IIndexed|IComparable|IComparer|IEquatable|IEnumerator|IDisposable|Async|Awaitable|Console|Math|String|List|Dictionary|HashSet|Queue|Stack|Array|Enumerable|Queryable|JsonSerializer|HttpClient|File|Path|Directory|Encoding|Regex|Task|Thread|Monitor|Timer|Process|DateTime|TimeSpan|Guid|Uri|Version|Exception|InvalidOperationException|ArgumentNullException|ArgumentOutOfRangeException|ArgumentException|NotSupportedException|NotImplementedException|NullReferenceException|IndexOutOfRangeException|KeyNotFoundException|FormatException|OverflowException)$/;

function isCodeFile(p: string): boolean {
  return p.endsWith('.cs');
}

export async function analyzeCSharp(dir: string, rootDir: string, config?: Config): Promise<CodeGraph> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const allFiles = await walkFiles(dir, config);
  const csFiles = allFiles.filter(isCodeFile);

  for (const filePath of csFiles) {
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

    for (const m of content.matchAll(USING_RE)) {
      const short = m[1].split('.').pop() || m[1];
      edges.push({ source: nodeId, target: `module:${m[1]}`, kind: 'imports', label: short });
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

    for (const m of content.matchAll(EXTENDS_RE)) {
      for (const base of m[1]
        .split(',')
        .map((s) => s.trim().replace(/<.*>/, '').replace(/\?/, ''))
        .filter(Boolean)) {
        if (!base.includes(' ') && !base.includes('=')) {
          edges.push({ source: nodeId, target: `class:${base}`, kind: 'extends', label: base });
        }
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
