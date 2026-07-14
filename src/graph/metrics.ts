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
