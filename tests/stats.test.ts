import { describe, it, expect } from 'vitest';
import { computeStatsFromData } from '../src/viewer/stats.js';
import type { ProjectStats, GraphProperties, GitStatsData } from '../src/viewer/state.js';

describe('Stats Dashboard', () => {
  function makeMockData(overrides: any = {}): any {
    return {
      graph: {
        nodes: [
          { id: 'file:/src/index.ts', label: 'index.ts', kind: 'file', filePath: '/src/index.ts', line: 1, col: 1 },
          { id: 'file:/src/app.ts', label: 'app.ts', kind: 'file', filePath: '/src/app.ts', line: 1, col: 1 },
          { id: 'file:/src/utils.ts', label: 'utils.ts', kind: 'file', filePath: '/src/utils.ts', line: 1, col: 1 },
          { id: 'file:/src/helper.py', label: 'helper.py', kind: 'file', filePath: '/src/helper.py', line: 1, col: 1 },
          { id: 'func:/src/app.ts#main', label: 'main', kind: 'function', filePath: '/src/app.ts', line: 10, col: 1 },
          { id: 'class:/src/app.ts#App', label: 'App', kind: 'class', filePath: '/src/app.ts', line: 5, col: 1 },
          { id: 'module:lodash', label: 'lodash', kind: 'module', filePath: 'external', line: 1, col: 1 },
          { id: 'module:react', label: 'react', kind: 'module', filePath: 'external', line: 1, col: 1 },
          { id: 'module:express', label: 'express', kind: 'module', filePath: 'external', line: 1, col: 1 },
        ],
        edges: [
          { source: 'file:/src/index.ts', target: 'file:/src/app.ts', kind: 'imports' },
          { source: 'file:/src/index.ts', target: 'file:/src/utils.ts', kind: 'imports' },
          { source: 'file:/src/app.ts', target: 'file:/src/utils.ts', kind: 'imports' },
          { source: 'file:/src/app.ts', target: 'module:lodash', kind: 'imports' },
        ],
      },
      stats: {
        files: 4,
        functions: 1,
        classes: 1,
        imports: 4,
      },
      analytics: {
        metrics: [
          [
            'file:/src/index.ts',
            {
              fanIn: 0,
              fanOut: 2,
              instability: 1,
              coupling: 2,
              loc: 50,
              complexity: 3,
              maintainability: 80,
              churn: 5,
              heat: 0.4,
            },
          ],
          [
            'file:/src/app.ts',
            {
              fanIn: 1,
              fanOut: 2,
              instability: 0.666,
              coupling: 3,
              loc: 120,
              complexity: 8,
              maintainability: 65,
              churn: 12,
              heat: 0.7,
            },
          ],
          [
            'file:/src/utils.ts',
            {
              fanIn: 2,
              fanOut: 0,
              instability: 0,
              coupling: 2,
              loc: 80,
              complexity: 2,
              maintainability: 90,
              churn: 3,
              heat: 0.2,
            },
          ],
          [
            'file:/src/helper.py',
            {
              fanIn: 0,
              fanOut: 0,
              instability: 0,
              coupling: 0,
              loc: 30,
              complexity: 1,
              maintainability: 95,
              churn: 0,
              heat: 0.0,
            },
          ],
        ],
        hubs: [
          { id: 'file:/src/utils.ts', label: 'utils.ts', fanIn: 2 },
          { id: 'file:/src/app.ts', label: 'app.ts', fanIn: 1 },
        ],
        avgCoupling: 1.75,
      },
      cycles: [{ nodes: ['file:/src/a.ts', 'file:/src/b.ts'], edgeKind: 'imports' }],
      cycleCount: 1,
      git: {
        'file:/src/index.ts': { lastModified: '2024-01-15T10:00:00Z', author: 'alice', churn: 5 },
        'file:/src/app.ts': { lastModified: '2024-06-20T10:00:00Z', author: 'bob', churn: 12 },
        'file:/src/utils.ts': { lastModified: '2024-03-10T10:00:00Z', author: 'alice', churn: 3 },
        'file:/src/helper.py': { lastModified: '2024-05-01T10:00:00Z', author: 'bob', churn: 0 },
      },
      ...overrides,
    };
  }

  describe('computeStatsFromData', () => {
    it('computes project stats correctly', () => {
      const data = makeMockData();
      const result = computeStatsFromData(data);

      expect(result.projectStats).toBeDefined();

      // Language detection from file extensions
      expect(result.projectStats.languages.length).toBeGreaterThanOrEqual(1);
      // 3 .ts files, 1 .py file
      const tsLang = result.projectStats.languages.find((l) => l.name === 'typescript');
      expect(tsLang).toBeDefined();
      expect(tsLang!.count).toBe(3);
      expect(tsLang!.percentage).toBe(75);

      const pyLang = result.projectStats.languages.find((l) => l.name === 'python');
      expect(pyLang).toBeDefined();
      expect(pyLang!.count).toBe(1);
      expect(pyLang!.percentage).toBe(25);

      expect(result.projectStats.fileCount).toBe(4);
      expect(result.projectStats.functionCount).toBe(1);
      expect(result.projectStats.classCount).toBe(1);
      expect(result.projectStats.importCount).toBe(4);
      expect(result.projectStats.totalLoc).toBe(50 + 120 + 80 + 30); // 280
      expect(result.projectStats.dependencyCount).toBe(3); // lodash, react, express
    });

    it('computes graph properties correctly', () => {
      const data = makeMockData();
      const result = computeStatsFromData(data);

      expect(result.graphProperties).toBeDefined();
      expect(result.graphProperties.nodeCount).toBe(9);
      expect(result.graphProperties.edgeCount).toBe(4);
      expect(result.graphProperties.cycleCount).toBe(1);
      // density = edges / (nodes * (nodes-1)) = 4 / (9*8) = 4/72 = 0.0555...
      expect(result.graphProperties.density).toBeCloseTo(0.0556, 3);

      // Avg fan-in = (0 + 1 + 2 + 0) / 4 = 0.75
      expect(result.graphProperties.avgFanIn).toBeCloseTo(0.75, 2);

      // Avg fan-out = (2 + 2 + 0 + 0) / 4 = 1.0
      expect(result.graphProperties.avgFanOut).toBeCloseTo(1.0, 2);
    });

    it('computes instability distribution', () => {
      const data = makeMockData();
      const result = computeStatsFromData(data);

      // Instability values: 1, 0.666, 0, 0
      // Low (< 0.33): utils(0), helper(0) = 2
      // Medium (0.33-0.66): app(0.666...wait, actually 0.666 > 0.66 so it's high)
      // Actually 0.666 >= 0.66 so: app = high
      // Let me re-check: 0.666 > 0.66, so that's high
      // Low (< 0.33): utils(0), helper(0) = 2
      // Medium (0.33-0.66): none = 0
      // High (>=0.66): index(1), app(0.666) = 2
      expect(result.graphProperties.instabilityDistribution.low).toBe(2);
      expect(result.graphProperties.instabilityDistribution.medium).toBe(0);
      expect(result.graphProperties.instabilityDistribution.high).toBe(2);
    });

    it('computes git stats when git data is present', () => {
      const data = makeMockData();
      const result = computeStatsFromData(data);

      expect(result.gitStats).toBeDefined();
      expect(result.gitStats!.totalCommits).toBe(12); // max churn
      expect(result.gitStats!.timeRange).toBe('2024-01-15 – 2024-06-20');

      // Top churned files sorted by churn desc
      expect(result.gitStats!.topChurnedFiles.length).toBeGreaterThanOrEqual(3);
      expect(result.gitStats!.topChurnedFiles[0].path).toBe('/src/app.ts');
      expect(result.gitStats!.topChurnedFiles[0].churn).toBe(12);
      expect(result.gitStats!.topChurnedFiles[1].path).toBe('/src/index.ts');
      expect(result.gitStats!.topChurnedFiles[1].churn).toBe(5);
    });

    it('returns null git stats when no git data', () => {
      const data = makeMockData({ git: {} });
      const result = computeStatsFromData(data);
      expect(result.gitStats).toBeNull();
    });

    it('handles empty graph gracefully', () => {
      const data = {
        graph: { nodes: [], edges: [] },
        stats: { files: 0, functions: 0, classes: 0, imports: 0 },
        cycles: [],
        cycleCount: 0,
      };
      const result = computeStatsFromData(data);

      expect(result.projectStats.fileCount).toBe(0);
      expect(result.projectStats.languages).toEqual([]);
      expect(result.projectStats.totalLoc).toBe(0);
      expect(result.projectStats.dependencyCount).toBe(0);

      expect(result.graphProperties.nodeCount).toBe(0);
      expect(result.graphProperties.edgeCount).toBe(0);
      expect(result.graphProperties.density).toBe(0);
      expect(result.graphProperties.avgFanIn).toBe(0);

      expect(result.gitStats).toBeNull();
    });

    it('computes hot files sorted by heat score', () => {
      const data = makeMockData();
      const result = computeStatsFromData(data);

      expect(result.gitStats).toBeDefined();
      expect(result.gitStats!.hotFiles.length).toBeGreaterThanOrEqual(3);
      // Sorted by heat desc
      expect(result.gitStats!.hotFiles[0].path).toBe('/src/app.ts');
      expect(result.gitStats!.hotFiles[0].score).toBe(0.7);
      expect(result.gitStats!.hotFiles[1].path).toBe('/src/index.ts');
      expect(result.gitStats!.hotFiles[1].score).toBe(0.4);
    });
  });
});
