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
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Types ────────────────────────────────────────────────────────────

interface TreesitterConfig {
  wasmDir?: string;
}

interface ParseResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

type LanguageId = 'python' | 'rust' | 'go' | 'java' | 'c' | 'cpp' | 'ruby' | 'kotlin';

interface LangDef {
  extensions: string[];
}

const LANGUAGES: Record<LanguageId, LangDef> = {
  python: { extensions: ['.py'] },
  rust: { extensions: ['.rs'] },
  go: { extensions: ['.go'] },
  java: { extensions: ['.java'] },
  c: { extensions: ['.c', '.h'] },
  cpp: { extensions: ['.cc', '.cpp', '.cxx', '.hpp', '.hxx'] },
  ruby: { extensions: ['.rb'] },
  kotlin: { extensions: ['.kt', '.kts'] },
};

// ── State ────────────────────────────────────────────────────────────

let initialized = false;
let available = false;
let ParserCtor: any = null;
let LanguageCtor: any = null;
// Shared parser instance — reused across all files (setLanguage per file)
let sharedParser: any = null;

// ── Initialization ───────────────────────────────────────────────────

async function init(wasmDir?: string): Promise<boolean> {
  if (initialized) return available;
  initialized = true;

  try {
    const mod = await import('web-tree-sitter');
    ParserCtor = mod.Parser;
    LanguageCtor = mod.Language;
    await ParserCtor.init();
    sharedParser = new ParserCtor();

    const dir = wasmDir || process.env.WASM_DIR || defaultWasmDir();
    const fs = await import('node:fs');
    if (fs.existsSync(dir)) {
      available = fs.readdirSync(dir).some((f: string) => f.endsWith('.wasm'));
      if (!available) console.warn('tree-sitter: no .wasm files found in', dir);
    } else {
      console.warn('tree-sitter: WASM directory not found:', dir);
    }
  } catch {
    available = false;
  }
  return available;
}

function defaultWasmDir(): string {
  // Production: WASM files are at <install>/wasm/ relative to the CLI
  // Development: <project>/wasm/
  const prod = path.resolve(__dirname, '..', 'wasm');
  if (fs.existsSync(prod)) return prod;
  const dev = path.resolve(process.cwd(), 'wasm');
  if (fs.existsSync(dev)) return dev;
  return './wasm';
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

async function parseFile(filePath: string, lang: LanguageId, relPath: string, Lang: any): Promise<ParseResult | null> {
  if (!Lang || !sharedParser) return null;

  const { content } = readFileSafe(filePath);
  if (!content) return null;

  sharedParser.setLanguage(Lang);
  const tree = sharedParser.parse(content);
  const root = tree.rootNode;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const fileId = `file:${relPath}`;

  nodes.push({
    id: fileId,
    label: relPath.split('/').pop() || relPath,
    kind: 'file',
    filePath: relPath,
    line: 1,
    col: 1,
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
      case 'c':
      case 'cpp': {
        if (type === 'function_definition') {
          const n = node.childForFieldName('declarator');
          if (n) addNode('function', n.text, pos);
        } else if (type === 'struct_specifier') {
          const n = node.childForFieldName('name');
          if (n) addNode('type', n.text, pos);
        } else if (type === 'enum_specifier') {
          const n = node.childForFieldName('name');
          if (n) addNode('type', n.text, pos);
        } else if (type === 'class_specifier' && lang === 'cpp') {
          const n = node.childForFieldName('name');
          if (n) addNode('class', n.text, pos);
        } else if (type === 'call_expression') {
          const fn = node.childForFieldName('function');
          if (fn && fn.type === 'identifier' && localNames.has(fn.text)) {
            edges.push({ source: fileId, target: `func:${relPath}#${fn.text}`, kind: 'calls', label: fn.text });
          }
        }
        break;
      }
      case 'ruby': {
        if (type === 'method') {
          const n = node.childForFieldName('name');
          if (n) addNode('function', n.text, pos);
        } else if (type === 'class') {
          const n = node.childForFieldName('name');
          if (n) addNode('class', n.text, pos);
        } else if (type === 'module') {
          const n = node.childForFieldName('name');
          if (n) addNode('module', n.text, pos);
        } else if (type === 'call') {
          const fn = node.childForFieldName('method');
          if (fn && fn.type === 'identifier' && localNames.has(fn.text)) {
            edges.push({ source: fileId, target: `func:${relPath}#${fn.text}`, kind: 'calls', label: fn.text });
          }
        }
        break;
      }
      case 'kotlin': {
        if (type === 'function_declaration') {
          const n = node.childForFieldName('name');
          if (n) addNode('function', n.text, pos);
        } else if (type === 'class_declaration') {
          const n = node.childForFieldName('name');
          if (n) addNode('class', n.text, pos);
        } else if (type === 'interface_declaration') {
          const n = node.childForFieldName('name');
          if (n) addNode('interface', n.text, pos);
        } else if (type === 'object_declaration') {
          const n = node.childForFieldName('name');
          if (n) addNode('class', n.text, pos);
        } else if (type === 'call_expression') {
          const fn = node.childForFieldName('callee');
          if (fn && fn.type === 'identifier' && localNames.has(fn.text)) {
            edges.push({ source: fileId, target: `func:${relPath}#${fn.text}`, kind: 'calls', label: fn.text });
          }
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
  const BATCH_SIZE = 16;

  for (const [langId, langDef] of Object.entries(LANGUAGES)) {
    const files = allFiles.filter((f) => langDef.extensions.some((ext) => f.endsWith(ext)));
    if (files.length === 0) continue;

    // Pre-load language WASM once per language
    const Lang = await loadWasm(langId as LanguageId, wasmDir);
    if (!Lang) continue;

    // Process files in batches of BATCH_SIZE for parallel parsing
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((filePath) => {
          const relPath = filePath.startsWith(rootDir)
            ? filePath.slice(rootDir.length).replace(/\\\\/g, '/')
            : filePath;
          return parseFile(filePath, langId as LanguageId, relPath, Lang);
        }),
      );
      for (const result of results) {
        if (result) {
          for (const n of result.nodes) allNodes.push(n);
          for (const e of result.edges) {
            const key = `${e.source}|${e.kind}|${e.target}`;
            if (!seenEdges.has(key)) {
              seenEdges.add(key);
              allEdges.push(e);
            }
          }
        }
      }
    }
  }

  return { nodes: allNodes, edges: allEdges };
}

export { init as initTreesitter, available as tsParserAvailable };
