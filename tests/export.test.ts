import { describe, it, expect } from 'vitest';
import { toJSON, toSVG } from '../src/export.js';
import { AnalysisResult, GraphNode, GraphEdge } from '../src/graph/index.js';

function makeResult(nodes: GraphNode[], edges: GraphEdge[] = []): AnalysisResult {
  return {
    graph: { nodes, edges },
    root: '/test',
    stats: {
      files: nodes.filter((n) => n.kind === 'file').length,
      functions: nodes.filter((n) => n.kind === 'function').length,
      classes: nodes.filter((n) => n.kind === 'class').length,
      imports: edges.filter((e) => e.kind === 'imports').length,
    },
  };
}

describe('Export', () => {
  describe('toJSON', () => {
    it('produces valid JSON', () => {
      const result = makeResult([
        { id: 'file:/test.ts', label: 'test.ts', kind: 'file', filePath: '/test.ts', line: 1, col: 1 },
      ]);
      const json = toJSON(result);
      const parsed = JSON.parse(json);
      expect(parsed.graph).toBeDefined();
      expect(parsed.root).toBe('/test');
      expect(parsed.stats).toBeDefined();
    });

    it('preserves graph structure', () => {
      const nodes: GraphNode[] = [
        { id: 'file:/a.ts', label: 'a.ts', kind: 'file', filePath: '/a.ts', line: 1, col: 1 },
        { id: 'func:/a.ts#foo', label: 'foo', kind: 'function', filePath: '/a.ts', line: 2, col: 1 },
      ];
      const edges: GraphEdge[] = [{ source: 'file:/a.ts', target: 'func:/a.ts#foo', kind: 'contains' }];
      const result = makeResult(nodes, edges);
      const json = toJSON(result);
      const parsed = JSON.parse(json);
      expect(parsed.graph.nodes).toHaveLength(2);
      expect(parsed.graph.edges).toHaveLength(1);
    });
  });

  describe('toSVG', () => {
    it('produces valid SVG structure', () => {
      const result = makeResult([
        { id: 'file:/test.ts', label: 'test.ts', kind: 'file', filePath: '/test.ts', line: 1, col: 1 },
      ]);
      const svg = toSVG(result);
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it('includes node labels', () => {
      const result = makeResult([
        { id: 'file:/test.ts', label: 'test.ts', kind: 'file', filePath: '/test.ts', line: 1, col: 1 },
      ]);
      const svg = toSVG(result);
      expect(svg).toContain('test.ts');
    });

    it('includes different shapes for different node kinds', () => {
      const result = makeResult([
        { id: 'file:/test.ts', label: 'test.ts', kind: 'file', filePath: '/test.ts', line: 1, col: 1 },
        { id: 'func:/test.ts#foo', label: 'foo', kind: 'function', filePath: '/test.ts', line: 2, col: 1 },
        { id: 'class:/test.ts#Bar', label: 'Bar', kind: 'class', filePath: '/test.ts', line: 3, col: 1 },
        { id: 'interface:/test.ts#Baz', label: 'Baz', kind: 'interface', filePath: '/test.ts', line: 4, col: 1 },
      ]);
      const svg = toSVG(result);
      // circle for file, polygon for function, rect for class, polygon for interface
      expect(svg).toContain('<circle');
      expect(svg).toContain('<polygon');
      expect(svg).toContain('<rect');
    });

    it('draws edges between connected nodes', () => {
      const nodes: GraphNode[] = [
        { id: 'file:/a.ts', label: 'a.ts', kind: 'file', filePath: '/a.ts', line: 1, col: 1 },
        { id: 'file:/b.ts', label: 'b.ts', kind: 'file', filePath: '/b.ts', line: 1, col: 1 },
      ];
      const edges: GraphEdge[] = [{ source: 'file:/a.ts', target: 'file:/b.ts', kind: 'imports' }];
      const result = makeResult(nodes, edges);
      const svg = toSVG(result);
      expect(svg).toContain('<line');
    });

    it('handles empty graph', () => {
      const result = makeResult([]);
      const svg = toSVG(result);
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });

    it('escapes special characters in labels', () => {
      const result = makeResult([
        {
          id: 'file:/test.ts',
          label: '<script>alert("xss")</script>',
          kind: 'file',
          filePath: '/test.ts',
          line: 1,
          col: 1,
        },
      ]);
      const svg = toSVG(result);
      expect(svg).not.toContain('<script>');
      expect(svg).toContain('&lt;script&gt;');
    });

    it('truncates long labels', () => {
      const result = makeResult([
        { id: 'file:/test.ts', label: 'a'.repeat(50), kind: 'file', filePath: '/test.ts', line: 1, col: 1 },
      ]);
      const svg = toSVG(result);
      // Label should be truncated with '..'
      expect(svg).toContain('..');
    });
  });
});
