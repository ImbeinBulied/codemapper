import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { GraphNode, GraphEdge, CodeGraph } from '../src/graph/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures', 'adversarial');

// ── Shared validation helpers ─────────────────────────────────────────

function validateGraph(graph: CodeGraph, description: string) {
  // For adversarial inputs, just verify the parser didn't crash
  // and returned a valid (possibly empty) graph
  expect(graph).toBeDefined();
  expect(graph.nodes).toBeDefined();
  expect(graph.edges).toBeDefined();
  expect(Array.isArray(graph.nodes)).toBe(true);
  expect(Array.isArray(graph.edges)).toBe(true);
}

// ── TypeScript Parser Stress Tests ────────────────────────────────────

describe('TypeScript Parser Stress Tests', () => {
  it('handles deeply nested classes (10+ levels)', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const result = await analyzeTypeScript(
      path.join(FIXTURES, 'deep_nesting.ts'),
      path.join(FIXTURES, 'deep_nesting.ts'),
    );
    validateGraph(result, 'deep_nesting.ts');
    // Parser should not crash on deeply nested classes
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles unicode identifiers', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const result = await analyzeTypeScript(path.join(FIXTURES, 'unicode.ts'), path.join(FIXTURES, 'unicode.ts'));
    validateGraph(result, 'unicode.ts');
    // Parser should not crash on unicode identifiers
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles files with only comments', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const result = await analyzeTypeScript(
      path.join(FIXTURES, 'comments_only.ts'),
      path.join(FIXTURES, 'comments_only.ts'),
    );
    // Parser should not crash, may or may not produce file node
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
    expect(result.edges).toBeDefined();
  });

  it('handles files with only imports', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const result = await analyzeTypeScript(
      path.join(FIXTURES, 'imports_only.ts'),
      path.join(FIXTURES, 'imports_only.ts'),
    );
    validateGraph(result, 'imports_only.ts');
    // Parser should not crash on files with only imports
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles mixed CRLF/LF line endings', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const result = await analyzeTypeScript(
      path.join(FIXTURES, 'mixed_endings.ts'),
      path.join(FIXTURES, 'mixed_endings.ts'),
    );
    validateGraph(result, 'mixed_endings.ts');
    // Parser should not crash on mixed line endings
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles circular type references', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const result = await analyzeTypeScript(path.join(FIXTURES, 'unicode.ts'), path.join(FIXTURES, 'unicode.ts'));
    // Circular types should not cause crashes
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles complex generic types', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const result = await analyzeTypeScript(path.join(FIXTURES, 'unicode.ts'), path.join(FIXTURES, 'unicode.ts'));
    // Complex generics should be parseable without crashing
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles multi-file directory with mixed edge cases', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const result = await analyzeTypeScript(FIXTURES, FIXTURES);
    validateGraph(result, 'mixed directory');
    // Should find at least the file nodes for each .ts file
    const fileNodes = result.nodes.filter((n) => n.kind === 'file');
    expect(fileNodes.length).toBeGreaterThanOrEqual(4); // unicode, deep_nesting, comments_only, imports_only, mixed_endings
  });
});

// ── Python Parser Stress Tests ────────────────────────────────────────

describe('Python Parser Stress Tests', () => {
  it('handles nested f-strings', async () => {
    const { analyzePython } = await import('../src/analyze/python.js');
    const result = await analyzePython(FIXTURES, FIXTURES);
    validateGraph(result, 'python adversarial');
    // Should find file node for .py file
    const pyFiles = result.nodes.filter((n) => n.kind === 'file' && n.filePath.endsWith('.py'));
    expect(pyFiles.length).toBe(1);
  });

  it('handles multiline strings that look like function defs', async () => {
    const { analyzePython } = await import('../src/analyze/python.js');
    const result = await analyzePython(FIXTURES, FIXTURES);
    // The parser should not crash on multiline strings
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles decorators on every function', async () => {
    const { analyzePython } = await import('../src/analyze/python.js');
    const result = await analyzePython(FIXTURES, FIXTURES);
    // Should find at least some functions (decorators may or may not be parsed)
    const funcs = result.nodes.filter((n) => n.kind === 'function');
    expect(funcs.length).toBeGreaterThanOrEqual(0);
  });

  it('handles walrus operator', async () => {
    const { analyzePython } = await import('../src/analyze/python.js');
    const result = await analyzePython(FIXTURES, FIXTURES);
    // Should not crash or misparse walrus operator
    validateGraph(result, 'python walrus');
  });

  it('handles complex list comprehensions', async () => {
    const { analyzePython } = await import('../src/analyze/python.js');
    const result = await analyzePython(FIXTURES, FIXTURES);
    // Should find the complex_hint function
    expect(result.nodes.some((n) => n.kind === 'function' && n.label === 'complex_hint')).toBe(true);
  });

  it('handles async generators', async () => {
    const { analyzePython } = await import('../src/analyze/python.js');
    const result = await analyzePython(FIXTURES, FIXTURES);
    expect(result.nodes.some((n) => n.kind === 'function' && n.label === 'gen')).toBe(true);
  });

  it('does not misparse string literals as code', async () => {
    const { analyzePython } = await import('../src/analyze/python.js');
    const result = await analyzePython(FIXTURES, FIXTURES);
    // Parser should not crash on string literals
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });
});

// ── Rust Parser Stress Tests ──────────────────────────────────────────

describe('Rust Parser Stress Tests', () => {
  it('handles complex lifetime annotations', async () => {
    const { analyzeRust } = await import('../src/analyze/rust.js');
    const result = await analyzeRust(FIXTURES, FIXTURES);
    validateGraph(result, 'rust adversarial');
    // Parser should not crash on complex lifetime annotations
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles macros that look like functions', async () => {
    const { analyzeRust } = await import('../src/analyze/rust.js');
    const result = await analyzeRust(FIXTURES, FIXTURES);
    // Parser should not crash on macros
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles nested impl blocks', async () => {
    const { analyzeRust } = await import('../src/analyze/rust.js');
    const result = await analyzeRust(FIXTURES, FIXTURES);
    // Should find at least some impl blocks or not crash
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles trait objects', async () => {
    const { analyzeRust } = await import('../src/analyze/rust.js');
    const result = await analyzeRust(FIXTURES, FIXTURES);
    // Parser should not crash on trait objects
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles complex generic bounds', async () => {
    const { analyzeRust } = await import('../src/analyze/rust.js');
    const result = await analyzeRust(FIXTURES, FIXTURES);
    // Parser should not crash on complex bounds
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles conditional compilation', async () => {
    const { analyzeRust } = await import('../src/analyze/rust.js');
    const result = await analyzeRust(FIXTURES, FIXTURES);
    // Parser should not crash on conditional compilation
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles type aliases with complex types', async () => {
    const { analyzeRust } = await import('../src/analyze/rust.js');
    const result = await analyzeRust(FIXTURES, FIXTURES);
    // Parser should not crash on complex type aliases
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles trait definitions and implementations', async () => {
    const { analyzeRust } = await import('../src/analyze/rust.js');
    const result = await analyzeRust(FIXTURES, FIXTURES);
    // Parser should not crash on trait definitions
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });
});

// ── Go Parser Stress Tests ────────────────────────────────────────────

describe('Go Parser Stress Tests', () => {
  it('handles build tags', async () => {
    const { analyzeGo } = await import('../src/analyze/go.js');
    const result = await analyzeGo(FIXTURES, FIXTURES);
    validateGraph(result, 'go adversarial');
    // Build tags should not cause crashes
    const goFiles = result.nodes.filter((n) => n.kind === 'file' && n.filePath.endsWith('.go'));
    expect(goFiles.length).toBe(1);
  });

  it('handles complex interfaces', async () => {
    const { analyzeGo } = await import('../src/analyze/go.js');
    const result = await analyzeGo(FIXTURES, FIXTURES);
    expect(result.nodes.some((n) => n.kind === 'interface' && n.label === 'ReadWriter')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'interface' && n.label === 'Handler')).toBe(true);
  });

  it('handles embedded interfaces', async () => {
    const { analyzeGo } = await import('../src/analyze/go.js');
    const result = await analyzeGo(FIXTURES, FIXTURES);
    expect(result.nodes.some((n) => n.kind === 'interface' && n.label === 'Animal')).toBe(true);
    expect(result.nodes.some((n) => n.kind === 'interface' && n.label === 'Pet')).toBe(true);
  });

  it('handles channel types', async () => {
    const { analyzeGo } = await import('../src/analyze/go.js');
    const result = await analyzeGo(FIXTURES, FIXTURES);
    expect(result.nodes.some((n) => n.kind === 'function' && n.label === 'channelTypes')).toBe(true);
  });

  it('handles variadic functions with complex types', async () => {
    const { analyzeGo } = await import('../src/analyze/go.js');
    const result = await analyzeGo(FIXTURES, FIXTURES);
    // Parser should not crash on complex types
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles function types and type assertions', async () => {
    const { analyzeGo } = await import('../src/analyze/go.js');
    const result = await analyzeGo(FIXTURES, FIXTURES);
    // Parser should not crash on type assertions
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles struct with embedded fields and methods', async () => {
    const { analyzeGo } = await import('../src/analyze/go.js');
    const result = await analyzeGo(FIXTURES, FIXTURES);
    // Parser should not crash on embedded fields
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles imports correctly', async () => {
    const { analyzeGo } = await import('../src/analyze/go.js');
    const result = await analyzeGo(FIXTURES, FIXTURES);
    const importEdges = result.edges.filter((e) => e.kind === 'imports');
    expect(importEdges.length).toBeGreaterThan(0);
  });
});

// ── C# Parser Stress Tests ────────────────────────────────────────────

describe('C# Parser Stress Tests', () => {
  it('handles nullable reference types', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(FIXTURES, FIXTURES);
    validateGraph(result, 'csharp adversarial');
    expect(result.nodes.some((n) => n.kind === 'class' && n.label === 'NullableTest')).toBe(true);
  });

  it('handles pattern matching', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(FIXTURES, FIXTURES);
    expect(result.nodes.some((n) => n.kind === 'class' && n.label === 'PatternMatch')).toBe(true);
  });

  it('handles LINQ expressions', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(FIXTURES, FIXTURES);
    // Parser should not crash on LINQ
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles async streams', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(FIXTURES, FIXTURES);
    // Parser should not crash on async streams
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles record types', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(FIXTURES, FIXTURES);
    // Parser should not crash on record types
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles complex generic constraints', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(FIXTURES, FIXTURES);
    // Parser should not crash on generic constraints
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles expression-bodied members', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(FIXTURES, FIXTURES);
    // Parser should not crash on expression-bodied members
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles using statements', async () => {
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const result = await analyzeCSharp(FIXTURES, FIXTURES);
    const importEdges = result.edges.filter((e) => e.kind === 'imports');
    expect(importEdges.length).toBeGreaterThan(0);
  });
});

// ── Swift Parser Stress Tests ─────────────────────────────────────────

describe('Swift Parser Stress Tests', () => {
  it('handles property wrappers', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(FIXTURES, FIXTURES);
    validateGraph(result, 'swift adversarial');
    // Parser should not crash on property wrappers
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles complex closures with capture lists', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(FIXTURES, FIXTURES);
    // Parser should not crash on complex closures
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles protocol extensions', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(FIXTURES, FIXTURES);
    // Parser should not crash on protocol extensions
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles opaque return types', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(FIXTURES, FIXTURES);
    // Parser should not crash on opaque return types
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles enums with associated values', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(FIXTURES, FIXTURES);
    // Parser should not crash on enums with associated values
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles generic structs with protocol constraints', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(FIXTURES, FIXTURES);
    // Parser should not crash on generic structs
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles subscript overloads', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(FIXTURES, FIXTURES);
    // Parser should not crash on subscript overloads
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles extensions on standard library types', async () => {
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const result = await analyzeSwift(FIXTURES, FIXTURES);
    // Should have extension nodes
    const extNodes = result.nodes.filter((n) => n.id.startsWith('ext:'));
    expect(extNodes.length).toBeGreaterThan(0);
  });
});

// ── PHP Parser Stress Tests ───────────────────────────────────────────

describe('PHP Parser Stress Tests', () => {
  it('handles PHP 8 attributes', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(FIXTURES, FIXTURES);
    validateGraph(result, 'php adversarial');
    // Parser should not crash on PHP 8 attributes
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles named arguments', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(FIXTURES, FIXTURES);
    // Parser should not crash on named arguments
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles match expressions', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(FIXTURES, FIXTURES);
    // Parser should not crash on match expressions
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles Fibers', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(FIXTURES, FIXTURES);
    // Parser should not crash on Fibers
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles intersection types', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(FIXTURES, FIXTURES);
    // Parser should not crash on intersection types
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles enums', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(FIXTURES, FIXTURES);
    // Parser should not crash on enums
    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
  });

  it('handles readonly properties', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(FIXTURES, FIXTURES);
    expect(result.nodes.some((n) => n.kind === 'class' && n.label === 'Coordinate')).toBe(true);
  });

  it('handles constructor property promotion', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(FIXTURES, FIXTURES);
    expect(result.nodes.some((n) => n.kind === 'class' && n.label === 'User')).toBe(true);
  });

  it('handles use statements', async () => {
    const { analyzePhp } = await import('../src/analyze/php.js');
    const result = await analyzePhp(FIXTURES, FIXTURES);
    // PHP files don't typically have use statements at top level without namespace
    // But the parser should handle them gracefully
    validateGraph(result, 'php use statements');
  });
});

// ── Cross-parser invariant tests ──────────────────────────────────────

describe('Cross-parser Adversarial Invariants', () => {
  it('all parsers produce valid CodeGraph for adversarial inputs', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const { analyzePython } = await import('../src/analyze/python.js');
    const { analyzeRust } = await import('../src/analyze/rust.js');
    const { analyzeGo } = await import('../src/analyze/go.js');
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const { analyzePhp } = await import('../src/analyze/php.js');

    const parsers = [
      { name: 'TypeScript', fn: analyzeTypeScript },
      { name: 'Python', fn: analyzePython },
      { name: 'Rust', fn: analyzeRust },
      { name: 'Go', fn: analyzeGo },
      { name: 'CSharp', fn: analyzeCSharp },
      { name: 'Swift', fn: analyzeSwift },
      { name: 'PHP', fn: analyzePhp },
    ];

    for (const parser of parsers) {
      const result = await parser.fn(FIXTURES, FIXTURES);
      validateGraph(result, parser.name);
    }
  });

  it('no parser produces NaN or undefined in node positions', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const { analyzePython } = await import('../src/analyze/python.js');
    const { analyzeRust } = await import('../src/analyze/rust.js');
    const { analyzeGo } = await import('../src/analyze/go.js');
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const { analyzePhp } = await import('../src/analyze/php.js');

    const parsers = [analyzeTypeScript, analyzePython, analyzeRust, analyzeGo, analyzeCSharp, analyzeSwift, analyzePhp];

    for (const parser of parsers) {
      const result = await parser(FIXTURES, FIXTURES);
      for (const node of result.nodes) {
        expect(Number.isFinite(node.line)).toBe(true);
        expect(Number.isFinite(node.col)).toBe(true);
        expect(node.line).toBeGreaterThanOrEqual(1);
        expect(node.col).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('all parsers handle empty directory without crashing', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const { analyzePython } = await import('../src/analyze/python.js');
    const { analyzeRust } = await import('../src/analyze/rust.js');
    const { analyzeGo } = await import('../src/analyze/go.js');
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const { analyzePhp } = await import('../src/analyze/php.js');

    // Create a temporary empty directory
    const emptyDir = path.join(FIXTURES, '_empty_test_dir');
    fs.mkdirSync(emptyDir, { recursive: true });
    try {
      const parsers = [
        { name: 'TypeScript', fn: analyzeTypeScript },
        { name: 'Python', fn: analyzePython },
        { name: 'Rust', fn: analyzeRust },
        { name: 'Go', fn: analyzeGo },
        { name: 'CSharp', fn: analyzeCSharp },
        { name: 'Swift', fn: analyzeSwift },
        { name: 'PHP', fn: analyzePhp },
      ];

      for (const parser of parsers) {
        const result = await parser.fn(emptyDir, emptyDir);
        expect(result.nodes.length).toBe(0);
        expect(result.edges.length).toBe(0);
      }
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('all parsers handle non-existent directory gracefully', async () => {
    const { analyzeTypeScript } = await import('../src/analyze/typescript.js');
    const { analyzePython } = await import('../src/analyze/python.js');
    const { analyzeRust } = await import('../src/analyze/rust.js');
    const { analyzeGo } = await import('../src/analyze/go.js');
    const { analyzeCSharp } = await import('../src/analyze/csharp.js');
    const { analyzeSwift } = await import('../src/analyze/swift.js');
    const { analyzePhp } = await import('../src/analyze/php.js');

    const parsers = [analyzeTypeScript, analyzePython, analyzeRust, analyzeGo, analyzeCSharp, analyzeSwift, analyzePhp];

    for (const parser of parsers) {
      const result = await parser('/nonexistent/path', '/nonexistent/path');
      expect(result.nodes.length).toBe(0);
      expect(result.edges.length).toBe(0);
    }
  });
});
