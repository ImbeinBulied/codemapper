/**
 * Rule-based dependency validation engine.
 * Evaluates glob patterns against dependency graph edges.
 */

import { GraphNode, GraphEdge } from './index.js';

export interface Rule {
  /** Glob pattern for source files */
  from: string;
  /** Glob pattern for target files */
  to: string;
  /** Severity level */
  severity: 'error' | 'warn' | 'forbidden';
  /** Optional description */
  description?: string;
}

export interface RuleViolation {
  rule: Rule;
  from: string;
  to: string;
  source: string;
  target: string;
}

export interface RulesResult {
  violations: RuleViolation[];
  errorCount: number;
  warnCount: number;
  forbiddenCount: number;
}

/**
 * Simple glob matcher (avoids minimatch dependency).
 * Supports *, **, and ? glob wildcards.
 */
function matchGlob(pattern: string, value: string): boolean {
  // Convert glob to regex
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '<<GLOBSTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<GLOBSTAR>>/g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${regex}$`).test(value);
}

/**
 * Evaluate rules against a dependency graph.
 */
export function evaluateRules(nodes: GraphNode[], edges: GraphEdge[], rules: Rule[]): RulesResult {
  const violations: RuleViolation[] = [];

  for (const edge of edges) {
    const sourcePath =
      typeof edge.source === 'string'
        ? edge.source.replace(/^file:/, '').replace(/^\//, '')
        : ((edge.source as any).filePath ?? '');
    const targetPath =
      typeof edge.target === 'string'
        ? edge.target.replace(/^file:/, '').replace(/^\//, '')
        : ((edge.target as any).filePath ?? '');

    for (const rule of rules) {
      if (matchGlob(rule.from, sourcePath) && matchGlob(rule.to, targetPath)) {
        violations.push({
          rule,
          from: rule.from,
          to: rule.to,
          source: sourcePath,
          target: targetPath,
        });
      }
    }
  }

  return {
    violations,
    errorCount: violations.filter((v) => v.rule.severity === 'error').length,
    warnCount: violations.filter((v) => v.rule.severity === 'warn').length,
    forbiddenCount: violations.filter((v) => v.rule.severity === 'forbidden').length,
  };
}
