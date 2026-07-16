/**
 * Web worker for tree-sitter WASM parsing.
 *
 * Accepts file content + language via structured clone and returns
 * parsed AST results. Tree-sitter WASM grammars are loaded on demand
 * in the worker thread, keeping the main thread responsive.
 *
 * Protocol:
 *   Request:  { type: 'parse:file', payload: ParserRequestPayload, id: number }
 *   Response: { type: 'parse:result', payload: ParserResult, id: number }
 *   Error:    { type: 'parse:error', payload: null, id: number, error: string }
 *
 * NOTE: This worker requires web-tree-sitter to be available at
 * /workers/web-tree-sitter.js. If tree-sitter is unavailable, it
 * gracefully returns empty results.
 */

/// <reference lib="webworker" />

import type { WorkerRequest, ParserRequestPayload, ParserResult } from './protocol.js';
import { MessageType } from './protocol.js';

let parserReady = false;
let ParserCtor: any = null;
let LanguageCtor: any = null;
const languageCache = new Map<string, any>();

/**
 * Lazily initialise web-tree-sitter inside the worker.
 * Loads the ESM build from the known server path via dynamic import.
 */
async function ensureParser(): Promise<boolean> {
  if (parserReady) return true;
  try {
    // web-tree-sitter is external in esbuild — loaded at runtime.
    // The file is copied to dist/viewer/workers/ by the build script.
    const url = '/workers/web-tree-sitter.js';

    // Dynamic import works in workers that are loaded as modules.
    // For classic workers we fall back to importScripts.
    let mod: any;
    try {
      mod = await import(url);
    } catch {
      // Fallback for classic workers: importScripts sets a global
      self.importScripts(url);
      mod = (self as any).TreeSitter;
    }

    ParserCtor = mod.Parser;
    LanguageCtor = mod.Language;
    await ParserCtor.init();
    parserReady = true;
    return true;
  } catch {
    // tree-sitter not available — worker returns empty results
    return false;
  }
}

/**
 * Load a WASM grammar for the given language.
 * Returns the Language object or null on failure.
 */
async function loadGrammar(language: string): Promise<any | null> {
  const cached = languageCache.get(language);
  if (cached !== undefined) return cached;

  try {
    // WASM grammars are served from /wasm/ relative to the server root
    const wasmUrl = `/wasm/tree-sitter-${language}.wasm`;
    const lang = await LanguageCtor.load(wasmUrl);
    languageCache.set(language, lang);
    return lang;
  } catch {
    languageCache.set(language, null);
    return null;
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest<ParserRequestPayload>>) => {
  const msg = event.data;

  if (msg.type !== MessageType.PARSE_FILE) {
    postMessage({
      type: MessageType.PARSE_ERROR,
      payload: null,
      id: msg.id,
      error: `Unknown type: ${msg.type}`,
    });
    return;
  }

  try {
    const result = await parseFile(msg.payload);
    postMessage({ type: MessageType.PARSE_RESULT, payload: result, id: msg.id }, { transfer: [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    postMessage({
      type: MessageType.PARSE_ERROR,
      payload: null,
      id: msg.id,
      error: message,
    });
  }
};

async function parseFile(payload: ParserRequestPayload): Promise<ParserResult> {
  const { content, language } = payload;

  if (!parserReady) {
    const ok = await ensureParser();
    if (!ok) {
      // Graceful degradation: return empty result when tree-sitter unavailable
      return { ast: null };
    }
  }

  const lang = await loadGrammar(language);
  if (!lang) {
    return { ast: null };
  }

  const parser = new ParserCtor();
  parser.setLanguage(lang);
  const tree = parser.parse(content);

  // Convert the tree-sitter CST to a plain transferable structure
  const ast = serializeTree(tree.rootNode);
  return { ast };
}

/**
 * Recursively converts a tree-sitter SyntaxNode to a plain object
 * that can be transferred via structured clone.
 */
function serializeTree(node: any): Record<string, unknown> {
  const result: Record<string, unknown> = {
    type: node.type,
    startPosition: {
      row: node.startPosition.row,
      column: node.startPosition.column,
    },
    endPosition: { row: node.endPosition.row, column: node.endPosition.column },
    startIndex: node.startIndex,
    endIndex: node.endIndex,
    text: node.text,
  };

  if (node.childCount > 0) {
    const children: unknown[] = [];
    for (let i = 0; i < node.childCount; i++) {
      children.push(serializeTree(node.child(i)));
    }
    result.children = children;
  }

  return result;
}
