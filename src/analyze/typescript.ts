import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { GraphNode, GraphEdge, CodeGraph, Config } from '../graph/index.js';
import { readFileSafe, walkFiles } from './utils.js';

// ── Helpers ──────────────────────────────────────────────────────────

function scriptKindFromPath(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.mjs')) return ts.ScriptKind.JS;
  if (filePath.endsWith('.cjs')) return ts.ScriptKind.JS;
  if (filePath.endsWith('.ts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function posToLineCol(text: string, pos: number): { line: number; col: number } {
  let line = 1,
    col = 1;
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

const NODE_PREFIX: Record<string, string> = {
  file: 'file:',
  function: 'func:',
  class: 'class:',
  interface: 'interface:',
  type: 'type:',
};

function nodeId(relPath: string, kind: string, symbol: string): string {
  const prefix = NODE_PREFIX[kind] || `${kind}:`;
  return `${prefix}${relPath}#${symbol}`;
}

// ── Export / Import maps ─────────────────────────────────────────────

interface ExportEntry {
  node: GraphNode;
  localName: string;
  exportedName: string;
  isDefault: boolean;
}

interface ImportEntry {
  localName: string;
  sourceModule: string;
  importedName: string;
  namedAlias?: string;
}

/** Tracks a call to an imported symbol so we can resolve it cross-file later */
interface ImportedCallSite {
  localName: string;
  sourceModule: string;
  importedName: string;
}

interface FileResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  exports: Map<string, ExportEntry>;
  imports: ImportEntry[];
  /** Calls made to imported symbols (need cross-file resolution) */
  importedCalls: ImportedCallSite[];
  localFuncs: Set<string>;
  localSymbols: Map<string, GraphNode>;
}

// ── Single-file AST extractor ────────────────────────────────────────

function analyzeFile(filePath: string, relPath: string, rootDir: string): FileResult {
  const result: FileResult = {
    nodes: [],
    edges: [],
    exports: new Map(),
    imports: [],
    importedCalls: [],
    localFuncs: new Set(),
    localSymbols: new Map(),
  };

  const { content, error } = readFileSafe(filePath);
  if (!content) return result;
  const text = content;

  const fileNode: GraphNode = {
    id: `file:${relPath}`,
    label: relPath.split('/').pop() || relPath,
    kind: 'file',
    filePath: relPath,
    line: 1,
    col: 1,
    description: relPath,
  };
  result.nodes.push(fileNode);

  // Require calls (CommonJS)
  const REQUIRE_RE = /(?:const|let|var)\s+(?:\{[^}]*\}|\w+)\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  for (const m of text.matchAll(REQUIRE_RE)) {
    const mod = m[1];
    addEdge('imports', fileNode.id, `module:${mod}`, mod.split('/').pop() || mod);
  }
  // Side-effect require
  const REQUIRE_SIDE_RE = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  for (const m of text.matchAll(REQUIRE_SIDE_RE)) {
    const mod = m[1];
    if (
      !/(?:const|let|var)\s+(?:\{[^}]*\}|\w+)\s*=\s*require/.test(
        text.substring(Math.max(0, (m.index || 0) - 40), m.index || 0),
      )
    ) {
      addEdge('imports', fileNode.id, `module:${mod}`, mod.split('/').pop() || mod);
    }
  }

  const sourceFile = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, scriptKindFromPath(filePath));

  // ── Walk helpers ──

  function addNode(kind: GraphNode['kind'], name: string, node: ts.Node): GraphNode {
    const id = nodeId(relPath, kind, name);
    const pos = posToLineCol(text, node.getStart(sourceFile));
    const gn: GraphNode = {
      id,
      label: name,
      kind,
      filePath: relPath,
      line: pos.line,
      col: pos.col,
    };
    result.nodes.push(gn);
    result.edges.push({ source: fileNode.id, target: id, kind: 'contains' });
    result.localFuncs.add(name);
    result.localSymbols.set(name, gn);
    return gn;
  }

  function addEdge(kind: GraphEdge['kind'], sourceId: string, targetId: string, label?: string) {
    result.edges.push({ source: sourceId, target: targetId, kind, label });
  }

  function isExport(node: ts.Node): boolean {
    return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
  }

  function isDefaultExport(node: ts.Node): boolean {
    return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Default) !== 0;
  }

  function registerExport(name: string, gn: GraphNode, isDefault: boolean) {
    result.exports.set(isDefault ? 'default' : name, {
      node: gn,
      localName: name,
      exportedName: isDefault ? 'default' : name,
      isDefault,
    });
  }

  // ── Visitor ──

  function visit(node: ts.Node) {
    const kind = node.kind;

    // 1. Import declarations
    if (kind === ts.SyntaxKind.ImportDeclaration) {
      const imp = node as ts.ImportDeclaration;
      const modSpec = getModuleSpecifier(imp);
      if (!modSpec) {
        ts.forEachChild(node, visit);
        return;
      }

      if (imp.importClause?.name) {
        const localName = imp.importClause.name.text;
        result.imports.push({ localName, sourceModule: modSpec, importedName: 'default' });
        addEdge('imports', fileNode.id, `module:${modSpec}`, `${localName} (default)`);
      }

      if (imp.importClause?.namedBindings) {
        const nb = imp.importClause.namedBindings;
        if (ts.isNamedImports(nb)) {
          for (const el of nb.elements) {
            const importedName = el.propertyName?.text || el.name.text;
            const localName = el.name.text;
            result.imports.push({
              localName,
              sourceModule: modSpec,
              importedName,
              namedAlias: importedName !== localName ? importedName : undefined,
            });
            addEdge('imports', fileNode.id, `module:${modSpec}`, localName);
          }
        } else if (ts.isNamespaceImport(nb)) {
          const localName = nb.name.text;
          result.imports.push({ localName, sourceModule: modSpec, importedName: '*' });
          addEdge('imports', fileNode.id, `module:${modSpec}`, `${localName} (*)`);
        }
      }

      if (!imp.importClause) {
        addEdge('imports', fileNode.id, `module:${modSpec}`, modSpec);
      }
    }

    // 2. Export declarations (re-exports)
    else if (kind === ts.SyntaxKind.ExportDeclaration) {
      const exp = node as ts.ExportDeclaration;
      if (exp.moduleSpecifier) {
        const modSpec = getModuleSpecifier(exp);
        if (modSpec) {
          if (exp.exportClause && ts.isNamedExports(exp.exportClause)) {
            for (const el of exp.exportClause.elements) {
              addEdge('imports', fileNode.id, `module:${modSpec}`, el.name.text);
            }
          } else {
            addEdge('imports', fileNode.id, `module:${modSpec}`, '*');
          }
        }
      }
    }

    // 3. Function declarations
    else if (kind === ts.SyntaxKind.FunctionDeclaration) {
      const fn = node as ts.FunctionDeclaration;
      if (fn.name) {
        const gn = addNode('function', fn.name.text, fn);
        if (isDefaultExport(fn)) registerExport(fn.name.text, gn, true);
        else if (isExport(fn)) registerExport(fn.name.text, gn, false);
        if (fn.body) visitCalls(fn.body, result, fileNode.id, relPath);
      }
    }

    // 4. Class declarations
    else if (kind === ts.SyntaxKind.ClassDeclaration) {
      const cls = node as ts.ClassDeclaration;
      if (cls.name) {
        const gn = addNode('class', cls.name.text, cls);
        if (isDefaultExport(cls)) registerExport(cls.name.text, gn, true);
        else if (isExport(cls)) registerExport(cls.name.text, gn, false);

        // extends / implements
        if (cls.heritageClauses) {
          for (const hc of cls.heritageClauses) {
            const edgeKind: GraphEdge['kind'] = hc.token === ts.SyntaxKind.ExtendsKeyword ? 'extends' : 'implements';
            for (const t of hc.types) {
              const name = extractTypeName(t);
              if (name) addEdge(edgeKind, gn.id, `${edgeKind === 'extends' ? 'class' : 'interface'}:${name}`, name);
            }
          }
        }

        // Methods as contained function nodes
        for (const member of cls.members) {
          if (ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)) {
            const methodName = member.name ? getName(member.name) : 'constructor';
            const methodGn = addNode('function', `${cls.name.text}.${methodName}`, member);
            if (member.body) visitCalls(member.body, result, fileNode.id, relPath);
          } else if (ts.isPropertyDeclaration(member) && member.initializer) {
            if (ts.isArrowFunction(member.initializer) && member.name) {
              const propName = getName(member.name);
              addNode('function', `${cls.name.text}.${propName}`, member);
              if (ts.isBlock(member.initializer.body)) {
                visitCalls(member.initializer.body, result, fileNode.id, relPath);
              }
            }
          }
        }
      }
    }

    // 5. Interface declarations
    else if (kind === ts.SyntaxKind.InterfaceDeclaration) {
      const iface = node as ts.InterfaceDeclaration;
      if (iface.name) {
        const gn = addNode('interface', iface.name.text, iface);
        if (isExport(iface)) registerExport(iface.name.text, gn, false);
        if (iface.heritageClauses) {
          for (const hc of iface.heritageClauses) {
            for (const t of hc.types) {
              const name = extractTypeName(t);
              if (name) addEdge('extends', gn.id, `interface:${name}`, name);
            }
          }
        }
      }
    }

    // 6. Type alias
    else if (kind === ts.SyntaxKind.TypeAliasDeclaration) {
      const ta = node as ts.TypeAliasDeclaration;
      if (ta.name) {
        const gn = addNode('type', ta.name.text, ta);
        if (isExport(ta)) registerExport(ta.name.text, gn, false);
      }
    }

    // 7. Enum
    else if (kind === ts.SyntaxKind.EnumDeclaration) {
      const en = node as ts.EnumDeclaration;
      if (en.name) {
        const gn = addNode('type', en.name.text, en);
        gn.description = 'enum';
        if (isExport(en)) registerExport(en.name.text, gn, false);
      }
    }

    // 8. Module declaration (`declare module '...'`)
    else if (kind === ts.SyntaxKind.ModuleDeclaration) {
      const mod = node as ts.ModuleDeclaration;
      if (mod.name && ts.isStringLiteral(mod.name)) {
        addEdge('imports', fileNode.id, `module:${mod.name.text}`, mod.name.text);
      }
    }

    // 9. Export assignment: `export default expr` or `export = expr`
    else if (kind === ts.SyntaxKind.ExportAssignment) {
      // handled elsewhere (expression-level export default)
    }

    ts.forEachChild(node, visit);
  }

  function visitCalls(container: ts.Node, result: FileResult, fileId: string, relPath: string) {
    ts.forEachChild(container, function visitCallNode(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        visitCallExpression(node, result, fileId, relPath);
      }
      ts.forEachChild(node, visitCallNode);
    });
  }

  function visitCallExpression(expr: ts.CallExpression, result: FileResult, fileId: string, relPath: string) {
    const callee = expr.expression;
    let name: string | null = null;

    if (ts.isIdentifier(callee)) {
      name = callee.text;
    } else if (ts.isPropertyAccessExpression(callee)) {
      name = getName(callee.name);
    }

    if (!name) return;
    if (SKIP_CALLS.has(name)) return;

    // Intra-file call: name matches a local function
    if (result.localFuncs.has(name)) {
      addEdge('calls', fileId, nodeId(relPath, 'function', name), name);
      return;
    }

    // Cross-file call: name matches an imported symbol — record for resolution in Phase 3
    for (const imp of result.imports) {
      if (imp.localName === name) {
        addEdge('calls', fileId, `module:${imp.sourceModule}`, name);
        result.importedCalls.push({
          localName: name,
          sourceModule: imp.sourceModule,
          importedName: imp.importedName,
        });
        return;
      }
    }

    // Namespace access: e.g. `fs.readFileSync(...)` — name would be 'readFileSync'
    // For property access calls, we already extracted the method name above
    // Check if we can match the object part
    if (ts.isPropertyAccessExpression(callee)) {
      const objName = ts.isIdentifier(callee.expression) ? callee.expression.text : null;
      if (objName) {
        for (const imp of result.imports) {
          if (imp.localName === objName) {
            addEdge('calls', fileId, `module:${imp.sourceModule}`, `${objName}.${name}`);
            result.importedCalls.push({
              localName: `${objName}.${name}`,
              sourceModule: imp.sourceModule,
              importedName: imp.importedName,
            });
            return;
          }
        }
      }
    }
  }

  function getModuleSpecifier(node: ts.ImportDeclaration | ts.ExportDeclaration): string | null {
    return node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null;
  }

  function getName(nameNode: ts.PropertyName | ts.BindingName | ts.DeclarationName): string {
    if (ts.isIdentifier(nameNode)) return nameNode.text;
    if (ts.isStringLiteral(nameNode)) return nameNode.text;
    if (ts.isNumericLiteral(nameNode)) return nameNode.text;
    if (nameNode.kind === ts.SyntaxKind.ComputedPropertyName) return '[computed]';
    if (nameNode.kind === ts.SyntaxKind.ArrayBindingPattern || nameNode.kind === ts.SyntaxKind.ObjectBindingPattern)
      return '[pattern]';
    return '[unknown]';
  }

  function extractTypeName(t: ts.ExpressionWithTypeArguments): string | null {
    if (t.expression && ts.isIdentifier(t.expression)) {
      return t.expression.text;
    }
    if (ts.isPropertyAccessExpression(t.expression)) {
      return getName(t.expression.name);
    }
    return null;
  }

  // ── Walk the AST ──

  // First pass: find top-level const/let/var with arrow/function expressions
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
          if (decl.name && ts.isIdentifier(decl.name)) {
            const name = decl.name.text;
            if (!result.localFuncs.has(name)) {
              const gn = addNode('function', name, decl);
              if (isExport(node)) registerExport(name, gn, false);
              const body = ts.isArrowFunction(decl.initializer) ? decl.initializer.body : decl.initializer.body;
              if (body) {
                if (ts.isBlock(body)) visitCalls(body, result, fileNode.id, relPath);
                else visitCalls(decl.initializer, result, fileNode.id, relPath);
              }
            }
          }
        }
      }
    }
  });

  // Second pass: all top-level declarations
  ts.forEachChild(sourceFile, visit);

  // Third pass: top-level call expressions (e.g. `foo()` in module scope)
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      visitCallExpression(node.expression, result, fileNode.id, relPath);
    }
  });

  return result;
}

// ── Cross-file resolution ────────────────────────────────────────────

function resolveModule(specifier: string, importerRelPath: string, rootDir: string): string | null {
  if (!specifier.startsWith('.')) return null; // bare specifier = external
  const dir = path.dirname(path.join(rootDir, importerRelPath));
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.d.ts'];
  const base = path.resolve(path.join(dir, specifier));

  // Try exact path first (with the specifier's own extension)
  if (fs.existsSync(base)) return path.normalize(base);

  // Try replacing .js extension with .ts/.tsx (common TS pattern)
  if (base.endsWith('.js')) {
    for (const ext of ['.ts', '.tsx']) {
      const p = base.replace(/\.jsx?$/, ext);
      if (fs.existsSync(p)) return path.normalize(p);
    }
  }
  // Try appending extensions
  for (const ext of extensions) {
    const p = base + ext;
    if (fs.existsSync(p)) return path.normalize(p);
  }
  // Try index files
  for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
    const p = path.join(base, `index${ext}`);
    if (fs.existsSync(p)) return path.normalize(p);
  }
  return null;
}

// ── Main export ──────────────────────────────────────────────────────

const SKIP_CALLS = new Set([
  'import',
  'from',
  'export',
  'default',
  'if',
  'else',
  'for',
  'while',
  'switch',
  'case',
  'return',
  'throw',
  'try',
  'catch',
  'finally',
  'new',
  'typeof',
  'instanceof',
  'void',
  'delete',
  'in',
  'of',
  'as',
  'let',
  'const',
  'var',
  'function',
  'class',
  'interface',
  'type',
  'enum',
  'module',
  'namespace',
  'declare',
  'abstract',
  'public',
  'private',
  'protected',
  'static',
  'readonly',
  'async',
  'await',
  'yield',
  'constructor',
  'get',
  'set',
  'this',
  'super',
  'true',
  'false',
  'null',
  'undefined',
  'NaN',
  'Infinity',
  'console',
  'require',
  'module',
  'process',
  'window',
  'document',
  'Math',
  'JSON',
  'Array',
  'Object',
  'String',
  'Number',
  'Boolean',
  'RegExp',
  'Date',
  'Map',
  'Set',
  'Promise',
  'Error',
  'Symbol',
  'BigInt',
  'Proxy',
  'Reflect',
  'describe',
  'it',
  'test',
  'expect',
  'beforeEach',
  'afterEach',
  'beforeAll',
  'afterAll',
  'vi',
  'jest',
  'vitest',
]);

function isCodeFile(p: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs)$/.test(p) && !p.endsWith('.d.ts') && !p.endsWith('.min.js');
}

export async function analyzeTypeScript(dir: string, rootDir: string, config?: Config): Promise<CodeGraph> {
  const allFiles = await walkFiles(dir, config);
  const tsFiles = allFiles.filter(isCodeFile);

  const fileResults = new Map<string, FileResult>();
  const allNodes: GraphNode[] = [];
  const allEdges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  function dedupEdge(e: GraphEdge) {
    const key = `${e.source}|${e.kind}|${e.target}|${e.label || ''}`;
    if (!seenEdges.has(key)) {
      seenEdges.add(key);
      allEdges.push(e);
    }
  }

  // Phase 1: Parse all files
  for (const filePath of tsFiles) {
    const relPath = filePath.startsWith(rootDir) ? filePath.slice(rootDir.length).replace(/\\/g, '/') : filePath;

    const result = analyzeFile(filePath, relPath, rootDir);
    fileResults.set(filePath, result);

    for (const n of result.nodes) allNodes.push(n);
    for (const e of result.edges) dedupEdge(e);
  }

  // Phase 2: Build export map for cross-file resolution
  const exportMap = new Map<string, Map<string, { filePath: string; node: GraphNode; exportedName: string }>>();
  for (const [filePath, result] of fileResults) {
    const relPath = filePath.startsWith(rootDir) ? filePath.slice(rootDir.length).replace(/\\/g, '/') : filePath;
    const fileExports = new Map<string, { filePath: string; node: GraphNode; exportedName: string }>();
    for (const [name, entry] of result.exports) {
      fileExports.set(name, { filePath: relPath, node: entry.node, exportedName: entry.exportedName });
    }
    exportMap.set(filePath, fileExports);
  }

  // Phase 3: Resolve cross-file imports → resolved edges + call edges
  for (const [filePath, result] of fileResults) {
    const relPath = filePath.startsWith(rootDir) ? filePath.slice(rootDir.length).replace(/\\/g, '/') : filePath;

    for (const imp of result.imports) {
      const resolvedPath = resolveModule(imp.sourceModule, relPath, rootDir);
      if (resolvedPath && exportMap.has(resolvedPath)) {
        const targetExports = exportMap.get(resolvedPath)!;

        let targetExport =
          imp.importedName === '*' ? targetExports.values().next().value : targetExports.get(imp.importedName);

        if (!targetExport && imp.namedAlias) {
          targetExport = targetExports.get(imp.namedAlias);
        }

        if (targetExport) {
          dedupEdge({
            source: `file:${relPath}`,
            target: targetExport.node.id,
            kind: 'imports',
            label: imp.localName,
          });
        }
      }
    }

    // Resolve imported calls → cross-file call edges
    for (const call of result.importedCalls) {
      const resolvedPath = resolveModule(call.sourceModule, relPath, rootDir);
      if (resolvedPath && exportMap.has(resolvedPath)) {
        const targetExports = exportMap.get(resolvedPath)!;

        // Try to find the matching exported function
        // For `import { foo }` and `foo()`, look for export named 'foo'
        const targetExport =
          call.importedName === '*' ? targetExports.values().next().value : targetExports.get(call.importedName);

        if (targetExport && targetExport.node.kind === 'function') {
          dedupEdge({
            source: `file:${relPath}`,
            target: targetExport.node.id,
            kind: 'calls',
            label: call.localName,
          });
        }
      }
    }
  }

  return { nodes: allNodes, edges: allEdges };
}
