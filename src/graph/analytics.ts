/**
 * Graph analytics — computes structural metrics about the codebase.
 *
 * Metrics:
 * - Hub score: nodes with the most incoming dependencies (most imported)
 * - Coupling: how many other modules each module depends on (fan-out)
 * - Cohesion: how many other modules depend on this one (fan-in)
 * - Instability: ratio of fan-out / (fan-in + fan-out)
 */

import { GraphNode, GraphEdge } from './index.js';
import { computeMetrics, CodeMetrics } from './metrics.js';

export interface NodeMetrics {
  /** How many nodes import from this node (incoming edges) */
  fanIn: number;
  /** How many nodes this node imports from (outgoing edges) */
  fanOut: number;
  /** Instability = fanOut / (fanIn + fanOut). 0 = stable, 1 = unstable */
  instability: number;
  /** Absolute coupling score */
  coupling: number;
  /** Lines of code (non-blank, non-comment) */
  loc: number;
  /** Cyclomatic complexity (decision points + 1) */
  complexity: number;
  /** Maintainability index (0-171, higher = more maintainable) */
  maintainability: number;
}

export interface AnalyticsResult {
  metrics: Map<string, NodeMetrics>;
  /** Top N nodes ranked by fan-in (most depended-upon) */
  hubs: Array<{ id: string; label: string; fanIn: number }>;
  /** Top N nodes ranked by instability */
  mostUnstable: Array<{ id: string; label: string; instability: number }>;
  /** Average coupling across all file nodes */
  avgCoupling: number;
}

export function analyzeGraph(nodes: GraphNode[], edges: GraphEdge[], sources?: Map<string, string>): AnalyticsResult {
  const metrics = new Map<string, NodeMetrics>();
  const fileNodes = nodes.filter((n) => n.kind === 'file');
  const fileIds = new Set(fileNodes.map((n) => n.id));

  // Initialize metrics for file nodes (with default code metrics)
  for (const n of fileNodes) {
    const m: NodeMetrics = {
      fanIn: 0,
      fanOut: 0,
      instability: 0,
      coupling: 0,
      loc: 0,
      complexity: 0,
      maintainability: 0,
    };
    // Compute code metrics from source if available
    if (sources) {
      // File node IDs are like "file:/src/foo.ts", extract the path
      const filePath = n.id.replace(/^file:/, '');
      const source = sources.get(filePath);
      if (source) {
        const codeMetrics = computeMetrics(source);
        m.loc = codeMetrics.loc;
        m.complexity = codeMetrics.complexity;
        m.maintainability = codeMetrics.maintainability;
      }
    }
    metrics.set(n.id, m);
  }

  // Count import edges — source is always a file, target can be anything
  // Build a map from file path → file node ID for fast fan-in lookup
  const pathToFileId = new Map<string, string>();
  for (const f of fileNodes) {
    // file node IDs are like "file:/src/foo.ts"
    const filePath = f.id.replace(/^file:/, '');
    pathToFileId.set(filePath, f.id);
  }

  for (const e of edges) {
    if (e.kind !== 'imports') continue;
    const src = metrics.get(e.source);
    if (src) src.fanOut++;

    // Fan-in: extract file path from target ID
    // Target IDs are like "func:/src/foo.ts#bar" or "class:/src/foo.ts#Bar"
    const targetPath = e.target
      .replace(/^(func|class|interface|type|module|file|struct|trait|enum|typealias|protocol|ext|var|const):/, '')
      .split('#')[0];
    if (targetPath) {
      const tgtId = pathToFileId.get(targetPath);
      if (tgtId) {
        const tgt = metrics.get(tgtId);
        if (tgt) tgt.fanIn++;
      }
    }
  }

  // Also count call edges as coupling
  let callCoupling = 0;
  for (const e of edges) {
    if (e.kind !== 'calls') continue;
    const src = metrics.get(e.source);
    if (src) {
      src.coupling += 1;
      callCoupling++;
    }
  }

  // Compute derived metrics
  for (const [id, m] of metrics) {
    const total = m.fanIn + m.fanOut;
    m.instability = total === 0 ? 0 : m.fanOut / total;
    m.coupling = total + m.coupling; // fanIn + fanOut + call-based coupling
  }

  // Rank hubs (most fan-in)
  const hubs = Array.from(metrics.entries())
    .map(([id, m]) => ({ id, label: id.split('/').pop() || id, fanIn: m.fanIn }))
    .sort((a, b) => b.fanIn - a.fanIn)
    .slice(0, 10)
    .filter((h) => h.fanIn > 0);

  // Rank most unstable
  const mostUnstable = Array.from(metrics.entries())
    .map(([id, m]) => ({ id, label: id.split('/').pop() || id, instability: m.instability }))
    .sort((a, b) => b.instability - a.instability)
    .slice(0, 10)
    .filter((u) => u.instability > 0 && u.instability < 1); // skip 0 and 1

  // Average coupling
  const couplings = Array.from(metrics.values()).map((m) => m.coupling);
  const avgCoupling = couplings.length > 0 ? couplings.reduce((a, b) => a + b, 0) / couplings.length : 0;

  return { metrics, hubs, mostUnstable, avgCoupling };
}
