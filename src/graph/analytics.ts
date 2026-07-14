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
  /** Git churn — number of commits in last 90 days */
  churn: number;
  /** Normalized heat score (0-1, higher = hotter) */
  heat: number;
}

/** Weights for composite heat score calculation */
export interface HeatWeights {
  /** Weight for complexity component (default: 0.4) */
  complexity: number;
  /** Weight for churn component (default: 0.3) */
  churn: number;
  /** Weight for coupling component (default: 0.2) */
  coupling: number;
  /** Weight for maintainability component (default: 0.1, inverted) */
  maintainability: number;
}

const DEFAULT_HEAT_WEIGHTS: HeatWeights = {
  complexity: 0.4,
  churn: 0.3,
  coupling: 0.2,
  maintainability: 0.1,
};

export interface AnalyticsResult {
  metrics: Map<string, NodeMetrics>;
  /** Top N nodes ranked by fan-in (most depended-upon) */
  hubs: Array<{ id: string; label: string; fanIn: number }>;
  /** Top N nodes ranked by instability */
  mostUnstable: Array<{ id: string; label: string; instability: number }>;
  /** Average coupling across all file nodes */
  avgCoupling: number;
  /** Heat weights used for composite score */
  heatWeights: HeatWeights;
  /** Min-max ranges for normalization */
  heatRanges: {
    complexity: { min: number; max: number };
    churn: { min: number; max: number };
    coupling: { min: number; max: number };
    maintainability: { min: number; max: number };
  };
}

/** Min-max normalize a value to [0, 1] */
function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/** Compute composite heat score from normalized components */
function computeHeatScore(
  complexityNorm: number,
  churnNorm: number,
  couplingNorm: number,
  maintainabilityNorm: number,
  weights: HeatWeights,
): number {
  // Maintainability is inverted: low maintainability = high heat
  const maintHeat = 1 - maintainabilityNorm;
  return (
    weights.complexity * complexityNorm +
    weights.churn * churnNorm +
    weights.coupling * couplingNorm +
    weights.maintainability * maintHeat
  );
}

export function analyzeGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  sources?: Map<string, string>,
  churnData?: Map<string, number>,
  heatWeights: HeatWeights = DEFAULT_HEAT_WEIGHTS,
): AnalyticsResult {
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
      churn: 0,
      heat: 0,
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
    // Get churn data if available
    if (churnData) {
      const filePath = n.id.replace(/^file:/, '');
      m.churn = churnData.get(filePath) || 0;
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

  // Compute heat score ranges for normalization
  const complexities = Array.from(metrics.values()).map((m) => m.complexity);
  const churndata = Array.from(metrics.values()).map((m) => m.churn);
  const couplingsArr = Array.from(metrics.values()).map((m) => m.coupling);
  const maintainabilities = Array.from(metrics.values()).map((m) => m.maintainability);

  const heatRanges = {
    complexity: { min: Math.min(...complexities), max: Math.max(...complexities) },
    churn: { min: Math.min(...churndata), max: Math.max(...churndata) },
    coupling: { min: Math.min(...couplingsArr), max: Math.max(...couplingsArr) },
    maintainability: { min: Math.min(...maintainabilities), max: Math.max(...maintainabilities) },
  };

  // Compute normalized heat scores for each node
  for (const [id, m] of metrics) {
    const cNorm = normalize(m.complexity, heatRanges.complexity.min, heatRanges.complexity.max);
    const chNorm = normalize(m.churn, heatRanges.churn.min, heatRanges.churn.max);
    const coNorm = normalize(m.coupling, heatRanges.coupling.min, heatRanges.coupling.max);
    const mNorm = normalize(m.maintainability, heatRanges.maintainability.min, heatRanges.maintainability.max);
    m.heat = computeHeatScore(cNorm, chNorm, coNorm, mNorm, heatWeights);
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

  return { metrics, hubs, mostUnstable, avgCoupling, heatWeights, heatRanges };
}
