/**
 * Typed message protocol between the main thread and web workers.
 *
 * Every message follows the { type, payload, id } pattern for request/response
 * correlation. Structured clone is used for data transfer (no JSON.stringify
 * needed for simple objects).
 */

// ── Message envelope ────────────────────────────────────────────────

export interface WorkerRequest<P = unknown> {
  type: string;
  payload: P;
  id: number;
}

export interface WorkerResponse<P = unknown> {
  type: string;
  payload: P;
  id: number;
  error?: string;
}

// ── Layout worker types ────────────────────────────────────────────

export type LayoutMode = 'hierarchical' | 'grid';

export interface LayoutRequestPayload {
  mode: LayoutMode;
  /** Raw node IDs in order */
  nodeIds: string[];
  /** Edge source -> target as string IDs */
  edges: { source: string; target: string; kind: string }[];
  /** Viewport dimensions */
  width: number;
  height: number;
}

export interface LayoutResult {
  /** Map from node ID -> { x, y } */
  positions: Record<string, { x: number; y: number }>;
  /** Bounding box */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

// ── Parser worker types ────────────────────────────────────────────

export interface ParserRequestPayload {
  filePath: string;
  content: string;
  language: string;
}

export interface ParserResult {
  /** Parsed AST nodes as a plain-transferable tree */
  ast: unknown;
}

// ── Message type constants ──────────────────────────────────────────

export const MessageType = {
  // Layout
  LAYOUT_COMPUTE: 'layout:compute',
  LAYOUT_RESULT: 'layout:result',
  LAYOUT_ERROR: 'layout:error',
  // Parser
  PARSE_FILE: 'parse:file',
  PARSE_RESULT: 'parse:result',
  PARSE_ERROR: 'parse:error',
} as const;

// ── Helper: create a deferred promise correlated to a message id ───

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
