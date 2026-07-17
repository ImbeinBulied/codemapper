import { describe, it, expect } from 'vitest';
import { evaluateRules, Rule, RulesResult } from '../src/graph/rules-engine.js';
import { GraphNode, GraphEdge } from '../src/graph/index.js';

function makeNode(id: string, kind: GraphNode['kind'] = 'file'): GraphNode {
  return { id, label: id.split('/').pop() || id, kind, filePath: id.replace(/^file:/, ''), line: 1, col: 1 };
}

function makeEdge(source: string, target: string, kind: GraphEdge['kind'] = 'imports'): GraphEdge {
  return { source, target, kind };
}

describe('Rules Engine', () => {
  it('returns no violations for empty graph', () => {
    const result = evaluateRules([], [], []);
    expect(result.violations).toEqual([]);
    expect(result.errorCount).toBe(0);
    expect(result.warnCount).toBe(0);
    expect(result.forbiddenCount).toBe(0);
  });

  it('detects a simple rule violation', () => {
    const nodes = [
      makeNode('file:/src/app.ts'),
      makeNode('file:/src/legacy/deprecated.ts'),
    ];
    const edges = [
      makeEdge('file:/src/app.ts', 'file:/src/legacy/deprecated.ts'),
    ];
    const rules: Rule[] = [
      { from: 'src/**', to: 'src/legacy/**', severity: 'error', description: 'No legacy deps' },
    ];

    const result = evaluateRules(nodes, edges, rules);
    expect(result.violations).toHaveLength(1);
    expect(result.errorCount).toBe(1);
    expect(result.violations[0].source).toBe('src/app.ts');
    expect(result.violations[0].target).toBe('src/legacy/deprecated.ts');
  });

  it('does not flag edges that do not match patterns', () => {
    const nodes = [
      makeNode('file:/src/app.ts'),
      makeNode('file:/src/lib/utils.ts'),
    ];
    const edges = [
      makeEdge('file:/src/app.ts', 'file:/src/lib/utils.ts'),
    ];
    const rules: Rule[] = [
      { from: 'src/**', to: 'src/legacy/**', severity: 'error' },
    ];

    const result = evaluateRules(nodes, edges, rules);
    expect(result.violations).toHaveLength(0);
  });

  it('counts warnings separately from errors', () => {
    const nodes = [
      makeNode('file:/a.ts'),
      makeNode('file:/b.ts'),
      makeNode('file:/c.ts'),
    ];
    const edges = [
      makeEdge('file:/a.ts', 'file:/b.ts'),
      makeEdge('file:/a.ts', 'file:/c.ts'),
    ];
    const rules: Rule[] = [
      { from: '**', to: 'b.ts', severity: 'error' },
      { from: '**', to: 'c.ts', severity: 'warn' },
    ];

    const result = evaluateRules(nodes, edges, rules);
    expect(result.violations).toHaveLength(2);
    expect(result.errorCount).toBe(1);
    expect(result.warnCount).toBe(1);
  });

  it('counts forbidden violations', () => {
    const nodes = [
      makeNode('file:/a.ts'),
      makeNode('file:/b.ts'),
    ];
    const edges = [
      makeEdge('file:/a.ts', 'file:/b.ts'),
    ];
    const rules: Rule[] = [
      { from: '**', to: 'b.ts', severity: 'forbidden' },
    ];

    const result = evaluateRules(nodes, edges, rules);
    expect(result.forbiddenCount).toBe(1);
  });

  it('matches glob star patterns', () => {
    const nodes = [
      makeNode('file:/src/components/Button.tsx'),
      makeNode('file:/src/utils/helpers.ts'),
    ];
    const edges = [
      makeEdge('file:/src/components/Button.tsx', 'file:/src/utils/helpers.ts'),
    ];
    const rules: Rule[] = [
      { from: 'src/components/**', to: 'src/utils/**', severity: 'warn' },
    ];

    const result = evaluateRules(nodes, edges, rules);
    expect(result.violations).toHaveLength(1);
  });

  it('matches based on path after stripping file: prefix', () => {
    const nodes = [
      makeNode('file:/project/src/domain/entity.ts'),
      makeNode('file:/project/src/infrastructure/db.ts'),
    ];
    const edges = [
      makeEdge('file:/project/src/domain/entity.ts', 'file:/project/src/infrastructure/db.ts'),
    ];
    const rules: Rule[] = [
      { from: '**/domain/**', to: '**/infrastructure/**', severity: 'error' },
    ];

    const result = evaluateRules(nodes, edges, rules);
    expect(result.violations).toHaveLength(1);
  });

  it('handles multiple rules matching the same edge', () => {
    const nodes = [
      makeNode('file:/a.ts'),
      makeNode('file:/b.ts'),
    ];
    const edges = [
      makeEdge('file:/a.ts', 'file:/b.ts'),
    ];
    const rules: Rule[] = [
      { from: '**', to: 'b.ts', severity: 'error' },
      { from: 'a.ts', to: '**', severity: 'warn' },
    ];

    const result = evaluateRules(nodes, edges, rules);
    expect(result.violations).toHaveLength(2);
  });
});
