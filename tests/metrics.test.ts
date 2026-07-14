import { describe, it, expect } from 'vitest';
import { computeMetrics } from '../src/graph/metrics.js';

describe('Code Metrics', () => {
  describe('LOC calculation', () => {
    it('counts non-blank, non-comment lines', () => {
      const source = `// This is a comment
function hello() {
  return true;
}

/* block comment */
const x = 1;
`;
      const metrics = computeMetrics(source);
      // 4 non-blank, non-comment lines: function hello(), return true;, }, const x = 1;
      expect(metrics.loc).toBe(4);
    });

    it('counts all lines when no comments or blanks', () => {
      const source = `line1
line2
line3`;
      const metrics = computeMetrics(source);
      expect(metrics.loc).toBe(3);
    });

    it('returns 0 for blank file', () => {
      const metrics = computeMetrics('');
      expect(metrics.loc).toBe(0);
    });

    it('ignores blank lines', () => {
      const source = `

function hello() {


`;
      const metrics = computeMetrics(source);
      expect(metrics.loc).toBe(1);
    });
  });

  describe('cyclomatic complexity', () => {
    it('starts at 1 for simple code', () => {
      const source = 'function foo() { return 1; }';
      const metrics = computeMetrics(source);
      expect(metrics.complexity).toBe(1);
    });

    it('increments for if statements', () => {
      const source = `function foo(x) {
  if (x > 0) {
    return 1;
  }
  return 0;
}`;
      const metrics = computeMetrics(source);
      expect(metrics.complexity).toBe(2); // base 1 + 1 if
    });

    it('increments for while/for/case', () => {
      const source = `function foo(items) {
  for (let i = 0; i < items.length; i++) {
    while (items[i]) {
      switch (items[i].type) {
        case 'a':
          break;
        case 'b':
          break;
      }
    }
  }
}`;
      const metrics = computeMetrics(source);
      // 1 base + 1 for + 1 while + 1 case + 1 case = 5
      expect(metrics.complexity).toBeGreaterThanOrEqual(4);
    });

    it('increments for logical operators', () => {
      const source = `function foo(a, b) {
  if (a) {
    return true;
  } else if (b) {
    return false;
  }
}`;
      const metrics = computeMetrics(source);
      // 1 base + 1 if + 1 else if = 3
      expect(metrics.complexity).toBeGreaterThanOrEqual(3);
    });

    it('increments for catch blocks', () => {
      const source = `function foo() {
  try {
    risky();
  } catch (e) {
    handle();
  }
}`;
      const metrics = computeMetrics(source);
      expect(metrics.complexity).toBeGreaterThanOrEqual(2);
    });
  });

  describe('maintainability index', () => {
    it('is within 0-171 range', () => {
      const source = 'function foo() { return 1; }';
      const metrics = computeMetrics(source);
      expect(metrics.maintainability).toBeGreaterThanOrEqual(0);
      expect(metrics.maintainability).toBeLessThanOrEqual(171);
    });

    it('decreases with more complexity', () => {
      const simple = 'function foo() { return 1; }';
      const complex = `function foo(x) {
  if (x > 0) {
    for (let i = 0; i < x; i++) {
      while (x > i) {
        switch (x) {
          case 1: break;
          case 2: break;
          case 3: break;
        }
      }
    }
  }
}`;
      const simpleMetrics = computeMetrics(simple);
      const complexMetrics = computeMetrics(complex);
      expect(complexMetrics.maintainability).toBeLessThan(simpleMetrics.maintainability);
    });

    it('is at least 0 for very complex code', () => {
      const lines = Array.from(
        { length: 100 },
        (_, i) => `if (x${i}) { while (y${i}) { for (let i${i} = 0; i${i} < 10; i${i}++) { case ${i}: break; } } }`,
      ).join('\n');
      const metrics = computeMetrics(lines);
      expect(metrics.maintainability).toBeGreaterThanOrEqual(0);
    });
  });

  describe('edge cases', () => {
    it('handles empty file', () => {
      const metrics = computeMetrics('');
      expect(metrics.loc).toBe(0);
      expect(metrics.complexity).toBe(1);
      expect(metrics.maintainability).toBeGreaterThanOrEqual(0);
    });

    it('handles single line', () => {
      const metrics = computeMetrics('const x = 1;');
      expect(metrics.loc).toBe(1);
      expect(metrics.complexity).toBe(1);
    });

    it('handles very complex file', () => {
      const source = Array.from({ length: 50 }, (_, i) => `if (${i}) {}`).join('\n');
      const metrics = computeMetrics(source);
      expect(metrics.loc).toBe(50);
      expect(metrics.complexity).toBe(51); // 50 ifs + 1 base
    });
  });
});
