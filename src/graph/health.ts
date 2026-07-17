/**
 * Health score computation for codebase architecture.
 * Returns a 0-100 score based on multiple factors:
 * - Cycle density (% of files in circular dependencies)
 * - Instability ratio (% of files with high instability)
 * - Hotspot ratio (% of files with high heat score)
 * - Coupling excess (% of files with fan-out > 10)
 */

import { GraphNode, GraphEdge } from './index.js';

export interface HealthScore {
  /** Overall score 0-100 */
  score: number;
  /** Letter grade A-F */
  grade: string;
  /** Individual factor scores (0-100 each) */
  factors: {
    cycleDensity: number;
    instabilityRatio: number;
    hotspotRatio: number;
    couplingExcess: number;
  };
  /** Descriptions of what's hurting the score */
  negatives: Array<{ factor: string; description: string; impact: number }>;
}

/**
 * Compute health score from graph analysis.
 */
export function computeHealthScore(
  nodes: GraphNode[],
  edges: GraphEdge[],
  analytics?: {
    metrics?: Map<string, any>;
    cycleNodes?: Set<string>;
  },
): HealthScore {
  const fileNodes = nodes.filter((n) => n.kind === 'file');
  const totalFiles = fileNodes.length || 1;

  // Factor 1: Cycle density (% of files in cycles)
  const cycleCount = analytics?.cycleNodes?.size ?? 0;
  const cycleDensity = Math.min(100, (cycleCount / totalFiles) * 100 * 2);

  // Factor 2: Instability ratio (% of files with high instability)
  let highInstabilityCount = 0;
  if (analytics?.metrics) {
    for (const [, m] of analytics.metrics) {
      if (m.instability > 0.7) highInstabilityCount++;
    }
  }
  const instabilityRatio = Math.min(100, (highInstabilityCount / totalFiles) * 100 * 2);

  // Factor 3: Hotspot ratio (% of files with high heat score)
  let hotspotCount = 0;
  if (analytics?.metrics) {
    for (const [, m] of analytics.metrics) {
      if (m.heat > 0.7) hotspotCount++;
    }
  }
  const hotspotRatio = Math.min(100, (hotspotCount / totalFiles) * 100 * 2);

  // Factor 4: Coupling excess (% of files with fan-out > 10)
  let highCouplingCount = 0;
  if (analytics?.metrics) {
    for (const [, m] of analytics.metrics) {
      if (m.fanOut > 10) highCouplingCount++;
    }
  }
  const couplingExcess = Math.min(100, (highCouplingCount / totalFiles) * 100 * 2);

  // Weighted score (lower is better for each factor)
  const weights = { cycleDensity: 0.3, instabilityRatio: 0.25, hotspotRatio: 0.25, couplingExcess: 0.2 };
  const weightedPenalty =
    weights.cycleDensity * cycleDensity +
    weights.instabilityRatio * instabilityRatio +
    weights.hotspotRatio * hotspotRatio +
    weights.couplingExcess * couplingExcess;

  const score = Math.round(Math.max(0, Math.min(100, 100 - weightedPenalty)));

  // Generate negatives
  const negatives: HealthScore['negatives'] = [];
  if (cycleDensity > 10) {
    negatives.push({
      factor: 'Cycles',
      description: `${cycleCount} files in circular dependencies`,
      impact: Math.round(weights.cycleDensity * cycleDensity),
    });
  }
  if (instabilityRatio > 10) {
    negatives.push({
      factor: 'Instability',
      description: `${highInstabilityCount} files with high instability (>0.7)`,
      impact: Math.round(weights.instabilityRatio * instabilityRatio),
    });
  }
  if (hotspotRatio > 10) {
    negatives.push({
      factor: 'Hotspots',
      description: `${hotspotCount} files with high churn/complexity`,
      impact: Math.round(weights.hotspotRatio * hotspotRatio),
    });
  }
  if (couplingExcess > 10) {
    negatives.push({
      factor: 'Coupling',
      description: `${highCouplingCount} files with >10 outgoing dependencies`,
      impact: Math.round(weights.couplingExcess * couplingExcess),
    });
  }
  negatives.sort((a, b) => b.impact - a.impact);

  // Grade
  let grade = 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 50) grade = 'D';

  return {
    score,
    grade,
    factors: { cycleDensity, instabilityRatio, hotspotRatio, couplingExcess },
    negatives,
  };
}
