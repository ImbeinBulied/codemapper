/**
 * Optional tree-sitter based parser for multi-language AST analysis.
 *
 * Uses web-tree-sitter (WASM) for parsing. Enabled when WASM grammar files
 * are available at runtime. Falls back gracefully if not.
 *
 * To enable:
 *   1. npm install web-tree-sitter
 *   2. Download WASM grammars to a directory (e.g., ./wasm/):
 *      - tree-sitter-python.wasm
 *      - tree-sitter-rust.wasm
 *      - tree-sitter-go.wasm
 *      - tree-sitter-java.wasm
 *   3. Set WASM_DIR env or pass in config
 *
 * WASM grammars can be obtained from:
 *   - https://github.com/tree-sitter/tree-sitter-{lang}/releases
 *   - Building with: npx tree-sitter build --wasm path/to/grammar.js
 */

import { GraphNode, GraphEdge, Config } from '../graph/index.js';
import { readFileSafe, walkFiles } from './utils.js';

// ── Types ────────────────────────────────────────────────────────────

interface TreesitterConfig {
  wasmDir?: string;
}

interface ParseResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

type LanguageId = 'python' | 'rust' | 'go' | 'java';

interface LangDef {
  extensions: string[];
}

const LANGUAGES: Record<LanguageId, LangDef> = {
  python: { extensions: ['.py'] },
  rust: { extensions: ['.rs'] },
  go: { extensions: ['.go'] },
  java: { extensions: ['.java'] },
};

// ── State ────────────────────────────────────────────────────────────

let initialized = false;
let available = false;
let ParserCtor: any = null;
let LanguageCtor: any = null;

// ── Initialization ───────────────────────────────────────────────────

async function init(wasmDir?: string): Promise<boolean> {
  if (initialized) return available;
  initialized = true;

  try {
    const mod = await import('web-tree-sitter');
    ParserCtor = mod.Parser;
    LanguageCtor = mod.Language;
    await ParserCtor.init();

    // Verify at least one WASM grammar exists
    const dir = wasmDir || process.env.WASM_DIR || './wasm';
    const fs = await import('node:fs');
    if (fs.existsSync(dir)) {
      available = fs.readdirSync(dir).some((f: string) => f.endsWith('.wasm'));
    }
  } catch {
    available = false;
  }
  return available;
}

async function loadWasm(lang: LanguageId, wasmDir?: string): Promise<any> {
  const dir = wasmDir || process.env.WASM_DIR || './wasm';
  const path = await import('node:path');
  const wasmPath = path.join(dir, `tree-sitter-${lang}.wasm`);
  try {
    return await LanguageCtor.load(wasmPath);
  } catch {
    return null;
  }
}

// ── File parser ──────────────────────────────────────────────────────

async function parseFile(
  filePath: string,
  lang: LanguageId,
  relPath: string,
  wasmDir?: string,
): Promise<ParseResult | null> {
  const Lang = await loadWasm(lang, wasmDir);
  if (!Lang) return null;

  const { content } = readFileSafe(filePath);
  if (!content) return null;

  const parser = new ParserCtor();
  parser.setLanguage(Lang);
  const tree = parser.parse(content);
  const root = tree.rootNode;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const fileId = `file:${relPath}`;

  nodes.push({
    id: fileId,
    label: relPath.split('/').pop() || relPath,
    kind: 'file',
    filePath: relPath,
    line: 1, col: 1,
    description: relPath,
  });

  const localNames = new Set<string>();

  function addNode(kind: GraphNode['kind'], name: string, pos: { row: number; column: number }) {
    const kindPrefix = kind === 'function' ? 'func' : kind;
    const id = `${kindPrefix}:${relPath}#${name}`;
    nodes.push({ id, label: name, kind, filePath: relPath, line: pos.row + 1, col: pos.column + 1 });
    edges.push({ source: fileId, target: id, kind: 'contains' });
    localNames.add(name);
    return id;
  }

  function walk(node: any) {
    const type = node.type;
    const pos = node.startPosition;

    switch (lang) {
      case 'python': {
        if (type === 'function_definition') {
          const n = node.childForFieldName('name');
          if (n) addNode('function', n.text, pos);
        } else if (type === 'class_definition') {
          const n = node.childForFieldName('name');
          if (n) addNode('class', n.text, pos);
        } else if (type === 'call') {
          const fn = node.childForFieldName('function');
          if (fn && fn.type === 'identifier' && localNames.has(fn.text)) {
            edges.push({ source: fileId, target: `func:${relPath}#${fn.text}`, kind: 'calls', label: fn.text });
          }
        }
        break;
      }
      case 'rust': {
        if (type === 'function_item') {
          const n = node.childForFieldName('name');
          if (n) addNode('function', n.text, pos);
        } else if (type === 'struct_item') {
          const n = node.childForFieldName('name');
          if (n) addNode('type', n.text, pos);
        } else if (type === 'enum_item') {
          const n = node.childForFieldName('name');
          if (n) addNode('type', n.text, pos);
        } else if (type === 'trait_item') {
          const n = node.childForFieldName('name');
          if (n) addNode('interface', n.text, pos);
        }
        break;
      }
      case 'go': {
        if (type === 'function_declaration') {
          const n = node.childForFieldName('name');
          if (n) addNode('function', n.text, pos);
        } else if (type === 'method_declaration') {
          const n = node.childForFieldName('name');
          if (n) addNode('function', n.text, pos);
        } else if (type === 'type_spec') {
          const n = node.childForFieldName('name');
          if (n && node.parent?.type === 'type_declaration') {
            addNode('type', n.text, pos);
          }
        }
        break;
      }
      case 'java': {
        if (type === 'class_declaration') {
          const n = node.childForFieldName('name');
          if (n) addNode('class', n.text, pos);
        } else if (type === 'interface_declaration') {
          const n = node.childForFieldName('name');
          if (n) addNode('interface', n.text, pos);
        } else if (type === 'method_declaration') {
          const n = node.childForFieldName('name');
          if (n) addNode('function', n.text, pos);
        } else if (type === 'record_declaration') {
          const n = node.childForFieldName('name');
          if (n) addNode('class', n.text, pos);
        }
        break;
      }
    }

    for (let i = 0; i < node.childCount; i++) walk(node.child(i));
  }

  walk(root);
  return { nodes, edges };
}

// ── Batch API ────────────────────────────────────────────────────────

export async function parseWithTreesitter(
  dir: string,
  rootDir: string,
  config?: Config & TreesitterConfig,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const wasmDir = config?.wasmDir || process.env.WASM_DIR;

  if (!(await init(wasmDir))) {
    return { nodes: [], edges: [] };
  }

  const allFiles = await walkFiles(dir, config);
  const allNodes: GraphNode[] = [];
  const allEdges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  for (const [langId, langDef] of Object.entries(LANGUAGES)) {
    const files = allFiles.filter(f => langDef.extensions.some(ext => f.endsWith(ext)));

    for (const filePath of files) {
      const relPath = filePath.startsWith(rootDir)
        ? filePath.slice(rootDir.length).replace(/\\/g, '/')
        : filePath;

      const result = await parseFile(filePath, langId as LanguageId, relPath, wasmDir);
      if (result) {
        for (const n of result.nodes) allNodes.push(n);
        for (const e of result.edges) {
          const key = `${e.source}|${e.kind}|${e.target}`;
          if (!seenEdges.has(key)) { seenEdges.add(key); allEdges.push(e); }
        }
      }
    }
  }

  return { nodes: allNodes, edges: allEdges };
}

export { init as initTreesitter, available as tsParserAvailable };
