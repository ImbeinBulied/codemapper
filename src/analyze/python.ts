import fs from 'node:fs';
import path from 'node:path';
import { GraphNode, GraphEdge, CodeGraph, Config } from '../graph/index.js';
import { readFileSafe, findLine, walkFiles } from './utils.js';

// Regex patterns — improved for better Python coverage
const IMPORT_RE = /^import\s+(.+)$/gm;
const FROM_IMPORT_RE = /^from\s+([\w.]+)\s+import\s+(.+)$/gm;
const AS_IMPORT_RE = /import\s+([\w.]+)\s+as\s+(\w+)/g;
const CLASS_RE = /^\s*(?:class\s+(\w+))/gm;
const FUNC_RE = /^\s*(?:async\s+)?def\s+(\w+)/gm;
const DECORATOR_RE = /^\s*@(\w+)/gm;
const CALL_RE = /(\w+)\s*\(/g;

// Expanded skip list covering Python stdlib and common third-party libs
const SKIP_CALLS = new Set([
  'if',
  'elif',
  'else',
  'for',
  'while',
  'with',
  'try',
  'except',
  'finally',
  'return',
  'yield',
  'raise',
  'import',
  'from',
  'class',
  'def',
  'async',
  'await',
  'lambda',
  'pass',
  'break',
  'continue',
  'del',
  'global',
  'nonlocal',
  'assert',
  'print',
  'is',
  'not',
  'and',
  'or',
  'in',
  'True',
  'False',
  'None',
  'self',
  'cls',
  'super',
  'type',
  'len',
  'range',
  'int',
  'str',
  'float',
  'list',
  'dict',
  'set',
  'tuple',
  'bool',
  'enumerate',
  'zip',
  'map',
  'filter',
  'sorted',
  'reversed',
  'any',
  'all',
  'min',
  'max',
  'sum',
  'abs',
  'round',
  'open',
  'input',
  'hasattr',
  'getattr',
  'setattr',
  'isinstance',
  'issubclass',
  'vars',
  'dir',
  'id',
  'hash',
  'repr',
  'format',
  'next',
  'iter',
  'callable',
  'abs',
  'divmod',
  'pow',
  'chr',
  'ord',
  'hex',
  'bin',
  'oct',
  'ascii',
  'Exception',
  'ValueError',
  'TypeError',
  'KeyError',
  'IndexError',
  'RuntimeError',
  'StopIteration',
  'AttributeError',
  'ImportError',
  'FileNotFoundError',
  'OSError',
  'IOError',
  'MemoryError',
  'OverflowError',
  'ZeroDivisionError',
  'AssertionError',
  'PermissionError',
  'NotImplementedError',
  'RecursionError',
  // Common test/lib functions
  'describe',
  'it',
  'test',
  'pytest',
  'unittest',
  'patch',
  'mock',
  'MagicMock',
  'Mock',
  'PropertyMock',
  'pytest_generate_tests',
  'pytest_collect_file',
  'pytest_runtest_protocol',
  'pytest_addoption',
  'setup_method',
  'setup_class',
  'setup_module',
  'teardown_method',
  'teardown_class',
  'teardown_module',
  'setUp',
  'tearDown',
  'setUpClass',
  'tearDownClass',
  'setUpModule',
  'tearDownModule',
  'request',
  'capsys',
  'caplog',
  'tmpdir',
  'tmp_path',
  'monkeypatch',
  'shared',
  'ctx',
]);

function isCodeFile(p: string): boolean {
  return p.endsWith('.py');
}

export async function analyzePython(dir: string, rootDir: string, config?: Config): Promise<CodeGraph> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const allFiles = await walkFiles(dir, config);
  const pyFiles = allFiles.filter(isCodeFile);

  // Track imports per file for cross-file resolution
  interface ImportInfo {
    localName: string;
    sourceModule: string;
    importedName: string;
  }
  const fileImports = new Map<string, ImportInfo[]>();

  for (const filePath of pyFiles) {
    const relPath = filePath.startsWith(rootDir) ? filePath.slice(rootDir.length).replace(/\\/g, '/') : filePath;
    const nodeId = `file:${relPath}`;
    const fileName = relPath.split('/').pop() || relPath;

    nodes.push({ id: nodeId, label: fileName, kind: 'file', filePath: relPath, line: 1, col: 1, description: relPath });

    const { content, error } = readFileSafe(filePath);
    if (!content) continue;
    const lines = content.split('\n');
    const localFuncs = new Set<string>();
    const imports: ImportInfo[] = [];

    // ── Collect imports ──

    // `import foo, bar` and `import foo.bar as baz`
    for (const m of content.matchAll(IMPORT_RE)) {
      const parts = m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const part of parts) {
        // Handle `import foo.bar as baz`
        const asMatch = part.match(/^([\w.]+)\s+as\s+(\w+)$/);
        if (asMatch) {
          const mod = asMatch[1];
          const localName = asMatch[2];
          const shortName = mod.split('.').pop() || mod;
          imports.push({ localName, sourceModule: mod, importedName: shortName });
          edges.push({ source: nodeId, target: `module:${mod}`, kind: 'imports', label: localName });
        } else {
          const mod = part;
          const shortName = mod.split('.').pop() || mod;
          imports.push({ localName: shortName, sourceModule: mod, importedName: '*' });
          edges.push({ source: nodeId, target: `module:${mod}`, kind: 'imports', label: shortName });
        }
      }
    }

    // `from foo import bar, baz as qux`
    for (const m of content.matchAll(FROM_IMPORT_RE)) {
      const mod = m[1];
      const names = m[2]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const name of names) {
        const asMatch = name.match(/^([\w*]+)\s+as\s+(\w+)$/);
        if (asMatch) {
          const importedName = asMatch[1];
          const localName = asMatch[2];
          imports.push({ localName, sourceModule: mod, importedName });
          edges.push({
            source: nodeId,
            target: `module:${mod}`,
            kind: 'imports',
            label: `${importedName} as ${localName}`,
          });
        } else {
          imports.push({ localName: name, sourceModule: mod, importedName: name });
          edges.push({ source: nodeId, target: `module:${mod}`, kind: 'imports', label: name });
        }
      }
    }

    // `import foo as bar` (top-level, also caught by IMPORT_RE but handle explicitly)
    for (const m of content.matchAll(AS_IMPORT_RE)) {
      const mod = m[1];
      const localName = m[2];
      imports.push({ localName, sourceModule: mod, importedName: mod.split('.').pop() || mod });
    }

    fileImports.set(filePath, imports);

    // ── Decorators ──
    for (const m of content.matchAll(DECORATOR_RE)) {
      const name = m[1];
      // Skip common decorators
      if (['property', 'staticmethod', 'classmethod', 'abstractmethod'].includes(name)) continue;
      edges.push({ source: nodeId, target: `func:${relPath}#decorated_by_${name}`, kind: 'calls', label: `@${name}` });
    }

    // ── Classes ──
    for (const m of content.matchAll(CLASS_RE)) {
      localFuncs.add(m[1]);
      const lineNum = findLine(lines, `class ${m[1]}`);
      const classId = `class:${relPath}#${m[1]}`;
      nodes.push({ id: classId, label: m[1], kind: 'class', filePath: relPath, line: lineNum, col: 1 });

      // Check for inheritance: `class Foo(Bar, Baz):`
      const classLine = lines[lineNum - 1] || '';
      const inheritMatch = classLine.match(/class\s+\w+\s*\(([^)]*)\)/);
      if (inheritMatch) {
        for (const parent of inheritMatch[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)) {
          edges.push({ source: classId, target: `class:${relPath}#${parent}`, kind: 'extends', label: parent });
        }
      }

      edges.push({ source: nodeId, target: classId, kind: 'contains' });
    }

    // ── Functions ──
    for (const m of content.matchAll(FUNC_RE)) {
      localFuncs.add(m[1]);
      const lineNum = findLine(lines, `async def ${m[1]}`) || findLine(lines, `def ${m[1]}`);
      const funcId = `func:${relPath}#${m[1]}`;
      nodes.push({ id: funcId, label: m[1], kind: 'function', filePath: relPath, line: lineNum, col: 1 });
      edges.push({ source: nodeId, target: funcId, kind: 'contains' });
    }

    // ── Function calls ──
    for (const m of content.matchAll(CALL_RE)) {
      const name = m[1];
      if (SKIP_CALLS.has(name)) continue;
      if (localFuncs.has(name)) {
        edges.push({ source: nodeId, target: `func:${relPath}#${name}`, kind: 'calls', label: name });
      } else {
        // Check if it's an imported symbol
        for (const imp of imports) {
          if (imp.localName === name) {
            edges.push({ source: nodeId, target: `module:${imp.sourceModule}`, kind: 'calls', label: name });
          }
        }
      }
    }
  }

  return { nodes, edges };
}
