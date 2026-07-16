/**
 * Code metrics computation — LOC, cyclomatic complexity, maintainability index.
 */

export interface CodeMetrics {
  /** Lines of code (non-blank, non-comment) */
  loc: number;
  /** Cyclomatic complexity (decision points + 1) */
  complexity: number;
  /** Maintainability index (0-171, higher = more maintainable) */
  maintainability: number;
}

export interface HotspotWeights {
  /** Weight for normalized complexity (default: 0.4) */
  complexity: number;
  /** Weight for normalized churn (default: 0.6) */
  churn: number;
}

export const DEFAULT_HOTSPOT_WEIGHTS: HotspotWeights = {
  complexity: 0.4,
  churn: 0.6,
};

/**
 * Compute code metrics from a source string.
 * Uses simplified versions of standard software metrics:
 * - LOC: non-blank, non-comment lines
 * - Cyclomatic complexity: count of decision points + 1
 * - Maintainability index: SEI modified Halstead formula
 */
export function computeMetrics(source: string): CodeMetrics {
  const lines = source.split('\n');

  // LOC: non-blank, non-comment lines
  const loc = lines.filter(
    (l) => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('/*') && !l.trim().startsWith('*'),
  ).length;

  // Cyclomatic complexity: count decision points + 1
  const decisionPoints = (
    source.match(/\b(if|else\s+if|while|for|case|&&|\|\||\?|catch|for\s*\.\.\.(?:in|of))\b/g) || []
  ).length;
  const complexity = decisionPoints + 1;

  // Maintainability index (SEI modified Halstead)
  const maintainability = Math.max(
    0,
    Math.min(171, 171 - 5.2 * Math.log(Math.max(1, loc)) - 0.23 * complexity - 16.2 * Math.log(Math.max(1, loc))),
  );

  return { loc, complexity, maintainability };
}

/**
 * Min-max normalize a single value to [0, 1] range.
 */
export function normalizeToRange(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Compute normalized "Hotspot Score" H_n for each file.
 *
 * H_n = α * C_norm + β * F_norm
 *
 * where C = cyclomatic complexity, F = churn frequency.
 * Both metrics are normalized to [0, 1] using min-max scaling.
 *
 * @param complexityMap  Map of file path → cyclomatic complexity
 * @param churnMap       Map of file path → git churn (commit count)
 * @param weights        Weights for complexity and churn (default: α=0.4, β=0.6)
 * @returns Array of { filePath, complexity, churn, score } sorted by score descending
 */
export function computeHotspotScore(
  complexityMap: Map<string, number>,
  churnMap: Map<string, number>,
  weights: HotspotWeights = DEFAULT_HOTSPOT_WEIGHTS,
): Array<{ filePath: string; complexity: number; churn: number; score: number }> {
  // Collect all file paths (union of both maps)
  const allPaths = new Set([...complexityMap.keys(), ...churnMap.keys()]);

  // Gather raw values for normalization
  const complexities = Array.from(allPaths).map((p) => complexityMap.get(p) || 0);
  const churns = Array.from(allPaths).map((p) => churnMap.get(p) || 0);

  const cMin = complexities.length > 0 ? Math.min(...complexities) : 0;
  const cMax = complexities.length > 0 ? Math.max(...complexities) : 1;
  const fMin = churns.length > 0 ? Math.min(...churns) : 0;
  const fMax = churns.length > 0 ? Math.max(...churns) : 1;

  // Compute scores
  const results = Array.from(allPaths).map((filePath) => {
    const rawComplexity = complexityMap.get(filePath) || 0;
    const rawChurn = churnMap.get(filePath) || 0;

    const cNorm = normalizeToRange(rawComplexity, cMin, cMax);
    const fNorm = normalizeToRange(rawChurn, fMin, fMax);

    const score = weights.complexity * cNorm + weights.churn * fNorm;

    return { filePath, complexity: rawComplexity, churn: rawChurn, score };
  });

  // Sort descending by score (hottest first)
  results.sort((a, b) => b.score - a.score);

  return results;
}
