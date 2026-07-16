/**
 * Worker manager — typed async wrapper around Worker postMessage/onmessage.
 *
 * Provides a deferred-based API so callers can `await worker.send(type, payload)`
 * instead of manually handling message correlation.
 */

import {
  WorkerRequest,
  WorkerResponse,
  createDeferred,
  Deferred,
  MessageType,
  LayoutRequestPayload,
  LayoutResult,
  ParserRequestPayload,
  ParserResult,
} from './workers/protocol.js';

// ── Pending request bookkeeping ─────────────────────────────────────

let nextMsgId = 1;
const pending = new Map<number, Deferred<unknown>>();

// ── Worker handle ───────────────────────────────────────────────────

export class WorkerHandle {
  private worker: Worker | null;

  constructor(worker: Worker) {
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      const deferred = pending.get(msg.id);
      if (deferred) {
        pending.delete(msg.id);
        if (msg.error) {
          deferred.reject(new Error(msg.error));
        } else {
          deferred.resolve(msg.payload);
        }
      }
    };
    worker.onerror = (event: ErrorEvent) => {
      console.error('[Worker] Uncaught error:', event.message);
    };
  }

  /**
   * Send a typed request and await the response.
   */
  send<T = unknown>(type: string, payload?: unknown): Promise<T> {
    const id = nextMsgId++;
    const deferred = createDeferred<T>();
    pending.set(id, deferred as Deferred<unknown>);
    const msg: WorkerRequest = { type, payload: payload ?? null, id };
    this.worker?.postMessage(msg);
    return deferred.promise;
  }

  /**
   * Terminate the worker and reject all pending requests.
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    // Reject all outstanding promises
    for (const [id, deferred] of pending) {
      deferred.reject(new Error('Worker terminated'));
      pending.delete(id);
    }
  }

  get isAlive(): boolean {
    return this.worker !== null;
  }
}

// ── Convenience factories ───────────────────────────────────────────

let layoutWorkerHandle: WorkerHandle | null = null;
let parserWorkerHandle: WorkerHandle | null = null;

export function getLayoutWorker(): WorkerHandle | null {
  return layoutWorkerHandle;
}

export function getParserWorker(): WorkerHandle | null {
  return parserWorkerHandle;
}

/**
 * Create the layout worker, loading dagre into the worker bundle.
 * Returns null if Worker is unavailable.
 */
export function createLayoutWorker(): WorkerHandle | null {
  if (layoutWorkerHandle?.isAlive) return layoutWorkerHandle;
  try {
    const worker = new Worker('/workers/layout.worker.js');
    layoutWorkerHandle = new WorkerHandle(worker);
    return layoutWorkerHandle;
  } catch {
    console.warn('Layout worker not available — falling back to main-thread layout');
    return null;
  }
}

/**
 * Create the parser worker.
 * Returns null if Worker is unavailable.
 */
export function createParserWorker(): WorkerHandle | null {
  if (parserWorkerHandle?.isAlive) return parserWorkerHandle;
  try {
    const worker = new Worker('/workers/parser.worker.js');
    parserWorkerHandle = new WorkerHandle(worker);
    return parserWorkerHandle;
  } catch {
    console.warn('Parser worker not available');
    return null;
  }
}

/**
 * Compute hierarchical layout via the worker.
 * Falls back to a basic grid layout if worker unavailable.
 */
export async function computeLayoutWithWorker(payload: LayoutRequestPayload): Promise<LayoutResult> {
  const handle = getLayoutWorker();
  if (!handle) {
    return fallbackGridLayout(payload);
  }
  try {
    const result = await handle.send<LayoutResult>(MessageType.LAYOUT_COMPUTE, payload);
    return result;
  } catch (err) {
    console.warn('Layout worker failed, using fallback:', err);
    return fallbackGridLayout(payload);
  }
}

/**
 * Parse a file via the parser worker.
 * Returns null if worker unavailable or parsing fails.
 */
export async function parseFileWithWorker(payload: ParserRequestPayload): Promise<ParserResult | null> {
  const handle = getParserWorker();
  if (!handle) return null;
  try {
    return await handle.send<ParserResult>(MessageType.PARSE_FILE, payload);
  } catch {
    return null;
  }
}

/**
 * Fallback: simple grid layout when worker is unavailable.
 */
function fallbackGridLayout(payload: LayoutRequestPayload): LayoutResult {
  const { nodeIds, width, height } = payload;
  const positions: Record<string, { x: number; y: number }> = {};
  if (nodeIds.length === 0) {
    return { positions, bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
  }
  const cols = Math.max(5, Math.ceil(Math.sqrt(nodeIds.length)));
  const cellW = width / cols;
  const cellH = height / Math.ceil(nodeIds.length / cols);
  for (let i = 0; i < nodeIds.length; i++) {
    positions[nodeIds[i]] = {
      x: (i % cols) * cellW + cellW / 2,
      y: Math.floor(i / cols) * cellH + cellH / 2,
    };
  }
  return {
    positions,
    bounds: {
      minX: 0,
      maxX: width,
      minY: 0,
      maxY: height,
    },
  };
}

/**
 * Terminate all workers and clean up.
 */
export function terminateAllWorkers(): void {
  if (layoutWorkerHandle) {
    layoutWorkerHandle.terminate();
    layoutWorkerHandle = null;
  }
  if (parserWorkerHandle) {
    parserWorkerHandle.terminate();
    parserWorkerHandle = null;
  }
}
