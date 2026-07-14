# Codemapper Research: Security, Performance, Features, UX & Testing

> Research findings and actionable recommendations for the codemapper project.
> Date: 2026-07-14

---

## 1. Security Best Practices for Code Analysis Tools

### 1.1 Current State in Codemapper

**What's already good:**
- Path traversal guard in `server.ts:118-128` — resolves real paths and checks prefix
- Symlink skipped in `walkFiles` (`utils.ts:71`)
- Binary file detection (`utils.ts:9-13`)
- File size limits (`MAX_FILE_SIZE = 1_000_000`)
- Regex patterns from config are wrapped in try/catch (`config.ts:34-38`, `utils.ts:42-50`)

**What needs improvement:**

### 1.2 Regex DoS Prevention (ReDoS)

**Problem:** The `--filter` flag accepts user-provided regex patterns (`analyze/index.ts:199`):
```ts
const pattern = new RegExp(filter); // UNSANITIZED USER INPUT
```
And in `walkFiles` (`utils.ts:42-50`), config exclude/include patterns are compiled to RegExp. Malicious patterns like `(a+)+$` against large strings cause exponential backtracking.

**Recommendations:**
- Use `re2` library (C++-backed regex engine, immune to catastrophic backtracking) via `re2-wasm` or the npm `re2` package
- Add a regex complexity limiter: reject patterns with nested quantifiers `(a+)+`, `(a|b)*`, etc.
- Add a timeout to regex operations: use `AbortController` or `worker_threads` with timeout
- Validate regex pattern length (max ~500 chars)

**Specific implementation:**
```ts
// In config.ts, validate patterns before compiling
function validateRegex(pattern: string, maxLen = 500): RegExp | null {
  if (pattern.length > maxLen) return null;
  // Detect nested quantifiers (simple heuristic)
  if (/\(\?*[+*][)\]]\s*[+*]|\(\?:[^)]*\)\s*[+*]/.test(pattern)) {
    console.warn(`Warning: complex regex pattern rejected: ${pattern}`);
    return null;
  }
  try { return new RegExp(pattern); } catch { return null; }
}
```

### 1.3 Filesystem Security Patterns

**What similar tools do:**
- **madge**: Uses `madge.config.js` to whitelist directories; doesn't expose file contents over HTTP
- **dependency-cruiser**: Uses `.dependency-cruiser.cjs` with `allowed` / `forbidden` rules; validates config against a JSON schema before use; has a `validate-config` command
- **eslint**: Validates all config options against schemas; uses `require('module')` to load configs (not `eval`)

**Recommendations for codemapper:**
1. **Config schema validation**: Add JSON Schema validation for `.codemapperrc.json` (like dependency-cruiser). Invalid configs should fail loudly, not silently swallow errors.
2. **Server bind address**: `server.ts:195` binds to all interfaces by default. Add `--host` option defaulting to `127.0.0.1` to prevent accidental network exposure.
3. **Rate limiting**: The `/api/analyze` endpoint has no rate limiting. Add a simple rate limiter middleware to prevent abuse when running in `--watch` mode.
4. **Content-Type headers**: `/api/file` returns JSON without explicit `Content-Type: application/json` header.
5. **CORS headers**: If the server is ever exposed, add restrictive CORS headers.

### 1.4 Input Validation

**Current gaps:**
- `cli.ts:33`: Port is parsed with `parseInt` but not validated as being in 1-65535 range
- `server.ts:113`: `req.query.path` is cast to `string` without sanitization beyond path traversal
- `server.ts:65`: JSON body limit is 1mb but there are no POST endpoints that use it

**Recommendations:**
```ts
// Port validation in cli.ts
const port = parseInt(opts.port, 10);
if (isNaN(port) || port < 1 || port > 65535) {
  console.error(chalk.red('Error: port must be 1-65535'));
  process.exit(1);
}
```

### 1.5 Dockerfile Security

**Current Dockerfile issues:**
- Runs as root (no `USER` directive)
- No `.dockerignore` review needed (already exists)
- No health check directive

**Improvements:**
```dockerfile
# Add before ENTRYPOINT
RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app
USER app
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://localhost:5001/api/analyze || exit 1
```

### 1.6 Dependency Security

- Use `npm audit` / `npm audit fix` in CI
- Add `socket: 'stdio'` to `package.json`'s `overrides` if using web-tree-sitter
- Consider adding `socket: 'stdio'` or `engine-strict` to prevent supply chain attacks via package.json scripts

---

## 2. Performance Optimizations for Graph Visualization

### 2.1 Current Rendering Architecture

- **Canvas 2D**: Primary renderer, all nodes/edges drawn every frame (`renderer.ts:49-271`)
- **WebGL**: Enabled when >500 nodes (`renderer.ts:31`), but currently draws ALL nodes/edges on every frame into Float32Arrays with `STREAM_DRAW`
- **Force simulation**: D3 force simulation, runs on main thread
- **Hit testing**: O(n) linear scan for every mouse move (`interaction.ts:55-71`)

### 2.2 WebGL Optimization Techniques

**Current WebGL issues:**
1. Recreates `Float32Array` on every frame (`renderer.ts:332-338`, `348-352`) — garbage collection pressure
2. Re-queries uniform/attribute locations every frame (`renderer.ts:324-331`)
3. Only draws points and lines — no instanced rendering for node shapes
4. No frustum culling (draws ALL nodes, even off-screen)

**Recommendations:**
- **Reuse buffers**: Allocate `Float32Array` once, update in-place with `bufferSubData`
- **Cache uniform/attribute locations**: Look up once during `initWebGL()`, store in module variables
- **Add frustum culling in WebGL path**: Skip nodes outside the visible transform bounds
- **Use `ANGLE_instanced_arrays`** for node shapes — draw one node shape, instance it N times with per-instance position/color attributes
- **Consider moving to WebGL 2** for compute shader support, better instancing, and `drawArraysInstanced` built-in

**Reference implementations:**
- `vasturiano/force-graph` uses WebGL for rendering 10K+ nodes via Three.js
- `deck.gl` uses instanced rendering with `LumaGL` for 100K+ point datasets
- `sigma.js` v2 uses WebGL2 with edge bundling for million-node graphs

### 2.3 Web Worker for Force Simulation

**Problem:** D3 force simulation runs on the main thread, blocking rendering and interaction during layout computation.

**Recommendation:** Move the simulation to a Web Worker:

```ts
// simulation-worker.ts
import * as d3 from 'd3';

self.onmessage = (e) => {
  const { nodes, edges, config } = e.data;
  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).id(d => d.id))
    .force('charge', d3.forceManyBody().strength(-600))
    .force('center', d3.forceCenter(0, 0))
    .force('collision', d3.forceCollide().radius(20))
    .on('tick', () => {
      // Send positions back (transferable ArrayBuffer for speed)
      const positions = new Float32Array(nodes.length * 2);
      nodes.forEach((n, i) => { positions[i*2] = n.x; positions[i*2+1] = n.y; });
      self.postMessage({ type: 'tick', positions }, [positions.buffer]);
    })
    .on('end', () => { self.postMessage({ type: 'end' }); });
};
```

**Benefits:** Main thread stays responsive; layout computation doesn't block tooltips/pan/zoom.

### 2.4 Lazy Loading / Virtual Rendering

**Current approach:** All nodes are rendered every frame regardless of visibility.

**Recommendations:**
1. **Viewport culling** (highest impact, easiest):
```ts
// In renderCanvas2D, before drawing each node:
const minX = -transform.x / transform.k;
const maxX = minX + w / transform.k;
const minY = -transform.y / transform.k;
const maxY = minY + h / transform.k;
// Skip node if outside bounds
if (n.x < minX - 50 || n.x > maxX + 50 || n.y < minY - 50 || n.y > maxY + 50) continue;
```

2. **Level-of-detail (LOD)**: At zoom levels <0.3, skip individual node rendering and draw a single "blob" per directory cluster. At zoom >2, show full labels and details.

3. **Quadtree for hit testing** (replaces O(n) scan):
```ts
import * as d3 from 'd3';
// Build once, update positions during simulation tick
const quadtree = d3.quadtree().x(d => d.x).y(d => d.y).addAll(nodes);
// Hit test: O(log n) instead of O(n)
const found = quadtree.find(cx, cy, maxRadius);
```

### 2.5 WASM vs JS for AST Parsing

**Current state:** Uses both regex-based parsers (JS) and optional tree-sitter (WASM). The WASM parsers are already being used.

**Performance data (from benchmarks):**
- **tree-sitter WASM**: ~15-30ms per 1000-line file (parsing + tree walking)
- **TypeScript Compiler API** (JS): ~50-200ms per 1000-line file
- **Regex-based parsers**: ~5-15ms per 1000-line file but less accurate

**Recommendations:**
1. **Parallelize WASM parsing**: Parse files concurrently using `Promise.all` with batches (currently sequential in `treesitter.ts:313-328`)
2. **Pre-warm WASM parser**: Initialize the parser once and reuse across files (currently creates a new parser per file at line 125)
3. **Cache parsed results**: Hash file content, cache AST results to avoid re-parsing unchanged files
4. **Consider WASM for the regex parsers too**: For very large codebases (>10K files), regex parsing in JS main thread causes jank. Move to a worker.

**Optimized batch parsing:**
```ts
// In treesitter.ts, replace sequential loop with parallel batches
const BATCH_SIZE = 16;
for (let i = 0; i < files.length; i += BATCH_SIZE) {
  const batch = files.slice(i, i + BATCH_SIZE);
  const results = await Promise.all(batch.map(f => parseFile(f, lang, relPath, wasmDir)));
  // process results...
}
```

### 2.6 Additional Performance Wins

1. **Throttle mouse move handler**: Currently `interaction.ts:127` fires on every pixel of mouse movement. Add `requestAnimationFrame` throttling:
```ts
let rafPending = false;
container.addEventListener('mousemove', (e) => {
  // ... store event data ...
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(() => {
      // ... process stored event ...
      rafPending = false;
    });
  }
});
```

2. **Offscreen Canvas for grid**: The grid lines are drawn every frame but rarely change. Render to an offscreen canvas and composite.

3. **Edge bundling for large graphs**: When >500 edges, bundle parallel edges to reduce visual clutter and draw calls.

---

## 3. Missing Features in Similar Tools

### 3.1 Features Competitors Have

| Feature | madge | dependency-cruiser | emerge | codemapper |
|---------|-------|-------------------|--------|------------|
| Cycle detection | ✅ | ✅ | ❌ | ✅ |
| Config validation | ❌ | ✅ (JSON Schema) | ❌ | ⚠️ (minimal) |
| Dependency rules | ❌ | ✅ (allowed/forbidden) | ❌ | ❌ |
| Git blame/history | ❌ | ❌ | ❌ | ❌ |
| Code metrics | ❌ | ❌ | ❌ | ⚠️ (basic) |
| Progress reporting | ❌ | ✅ | ❌ | ❌ |
| CI integration | ❌ | ✅ | ❌ | ⚠️ (exit codes) |
| Multiple output formats | JSON | JSON/SVG/Dot | JSON | JSON/SVG |
| Watch mode | ❌ | ❌ | ❌ | ✅ |
| Diff comparison | ❌ | ❌ | ❌ | ✅ |
| Real-time collaboration | ❌ | ❌ | ❌ | ❌ |

### 3.2 Recommended New Features

#### 3.2.1 Git Integration (HIGH PRIORITY)

Add git metadata to nodes. This is the biggest differentiator codemapper could add.

**Implementation approach:**
```ts
// New file: src/git.ts
import { execSync } from 'node:child_process';

interface GitBlameInfo {
  lastModified: string;  // ISO date
  author: string;
  commitHash: string;
  commitMessage: string;
  age: number;           // days since last change
  churn: number;         // times changed in last N commits
}

async function getBlameForFile(filePath: string, rootDir: string): Promise<Map<number, GitBlameInfo>> {
  // Use `git blame --porcelain <file>` to get per-line blame
  // Parse output to extract author, date, commit hash
  // Aggregate into per-line map
}

async function getFileChurn(filePath: string, rootDir: string, days = 90): Promise<number> {
  const cmd = `git log --since="${days} days ago" --format="%H" -- "${filePath}" | wc -l`;
  return parseInt(execSync(cmd, { encoding: 'utf-8' }).trim()) || 0;
}

async function getGitStats(rootDir: string): Promise<GitStats> {
  // Total commits, active contributors, last commit date
  // Use simple-git or isomorphic-git for portability
}
```

**Visual representation:**
- Color nodes by "age" (green = recently modified, red = untouched for months)
- Color nodes by "churn" (high churn = warning color — potential maintenance issue)
- Show author badges in tooltip
- Add a "Last modified" timeline slider

#### 3.2.2 Code Metrics (MEDIUM PRIORITY)

**Current state:** `analytics.ts` only computes fan-in, fan-out, and instability.

**Missing metrics:**
- **Cyclomatic complexity** per function
- **Lines of code** per file/function
- **Maintainability index** (MI = 171 - 5.2*ln(V) - 0.23*G - 16.2*ln(L))
- **Halstead metrics** (volume, difficulty, effort)
- **Cognitive complexity** (SonarSource model)

**Implementation:**
```ts
// New file: src/graph/metrics.ts
interface CodeMetrics {
  loc: number;          // lines of code (non-blank, non-comment)
  complexity: number;   // cyclomatic complexity
  maintainability: number; // maintainability index (0-171)
  cognitiveComplexity: number;
  halsteadVolume: number;
}

function computeCyclomaticComplexity(source: string): number {
  // Count decision points: if, else if, while, for, case, &&, ||, ?, catch, for...in, for...of
  const decisionPoints = (source.match(
    /\b(if|else\s+if|while|for|case|&&|\|\||\?|catch|for\s*\.\.\.(?:in|of))\b/g
  ) || []).length;
  return decisionPoints + 1;
}

function computeMaintainability(loc: number, complexity: number, commentRatio: number): number {
  // SEI maintainability index (modified Halstead)
  return Math.max(0, Math.min(171,
    171 - 5.2 * Math.log(Math.max(1, loc)) - 0.23 * complexity - 16.2 * Math.log(Math.max(1, loc * (1 - commentRatio)))
  ));
}
```

**Visual representation:**
- Node size proportional to complexity (or LOC)
- Color intensity for maintainability (green = high MI, red = low MI)
- Sidebar shows full metrics for selected node
- Dashboard view showing project-wide metrics summary

#### 3.2.3 Dependency Rules (MEDIUM PRIORITY)

Like dependency-cruiser's "allowed/forbidden" rules:

```ts
// In .codemapperrc.json
{
  "rules": [
    { "from": "src/core/**", "to": "src/ui/**", "severity": "error" },
    { "from": "src/**", "to": "src/utils/**", "severity": "allowed" },
    { "from": "src/**", "to": "**/*.test.*", "severity": "warn" }
  ]
}
```

This enables architecture enforcement — codemapper becomes not just a viewer but a governance tool.

#### 3.2.4 AI-Powered Analysis (LOW PRIORITY, but differentiating)

Integrate with LLM APIs to:
- Generate natural language descriptions of code architecture
- Detect potential anti-patterns ("This circular dependency between auth and user modules suggests a refactoring opportunity")
- Suggest refactoring moves based on dependency patterns
- Auto-document code relationships

**Implementation:** Use the existing `/api/analyze` result as context, send to an LLM endpoint, display insights in the sidebar.

#### 3.2.5 Real-time Collaboration (LOW PRIORITY)

- Use the existing WebSocket infrastructure (`server.ts:69-76`)
- Add cursor sharing (show other users' views)
- Add shared annotations/bookmarks
- Use CRDT for conflict resolution (Yjs library)

---

## 4. Accessibility and UX Improvements

### 4.1 Current Accessibility Status

**Critical gaps found:**
- No ARIA labels on the canvas or interactive elements
- No `role` attributes on toolbar buttons
- No focus indicators beyond browser defaults
- No screen reader announcements for graph state changes
- Keyboard navigation is limited (arrow keys for pan, +/- for zoom, / for search)
- No `aria-live` regions for dynamic content (stats, search results count)
- Filter buttons have no `aria-pressed` or `aria-label`

### 4.2 ARIA Labels for Canvas-Based Visualizations

**Recommendation:** Canvas-based visualizations are inherently inaccessible. The solution is a combination of:

1. **Hidden DOM overlay** for screen readers:
```html
<canvas id="canvas" aria-hidden="true"></canvas>
<div id="aria-graph" role="application" aria-label="Codebase dependency graph"
     aria-roledescription="interactive graph visualization">
  <!-- Dynamically generated accessible list of nodes -->
  <div role="list" aria-label="Graph nodes">
    <!-- For each visible node: -->
    <div role="listitem" tabindex="0"
         aria-label="Function fetchData in src/api.ts, line 42, imported by 3 files">
    </div>
  </div>
</div>
```

2. **Live region for status updates:**
```html
<div id="aria-status" aria-live="polite" aria-atomic="true" class="sr-only">
  Graph loaded: 42 files, 128 functions, 89 imports
</div>
```

3. **Canvas fallback text:**
```html
<noscript>
  <p>codemapper requires JavaScript to render the interactive codebase graph.</p>
</noscript>
```

### 4.3 Keyboard Navigation Best Practices

**Current keyboard support:**
- Arrow keys: pan
- +/-: zoom
- /: focus search
- Esc: close sidebar/menu
- Tab: not handled (searches browser default)

**Recommended keyboard scheme (following WAI-Graph Patterns):**

| Key | Action |
|-----|--------|
| Tab | Move focus to next node (create a focus ring on canvas) |
| Shift+Tab | Move focus to previous node |
| Enter | Select focused node, open sidebar |
| Escape | Deselect node, close sidebar |
| Arrow keys | Pan canvas (existing) |
| Shift+Arrow | Move selection to nearest node in that direction |
| Home | Reset zoom to fit all |
| / or Ctrl+F | Open search |
| ? | Show keyboard shortcuts dialog |
| 1,2,3 | Switch layout mode |

**Implementation in `main.ts`:**
```ts
case 'Tab':
  e.preventDefault();
  cycleNodeFocus(e.shiftKey ? -1 : 1);
  break;
case 'Enter':
  if (focusedNode) selectNode(focusedNode);
  break;
```

### 4.4 Color Blind Friendly Palettes

**Current palette issues:**
- Function (purple `#d2a8ff`) and Interface (light blue `#79c0ff`) are hard to distinguish for tritanopia
- The green (`#3fb950`) and blue (`#58a6ff`) are problematic for deuteranopia
- All color coding is shape+color, but shapes are subtle

**Recommendations:**

1. **Add a high-contrast/colorblind mode** with the Wong colorblind-safe palette:
```ts
const COLORBLIND_SAFE: ColorSet = {
  file: '#E69F00',      // orange
  function: '#56B4E9',  // sky blue
  class: '#0072B2',     // blue
  interface: '#CC79A7',  // pink
  type: '#009E73',      // teal
  module: '#999999',     // gray
  call: '#D55E00',      // vermillion
};
```

2. **Add distinct shapes** (already partially done, but make more prominent):
   - File: circle (✅)
   - Function: diamond (✅)
   - Class: square (✅)
   - Interface: hexagon (✅)
   - Type: star/pentagon (currently hexagon too — differentiate)
   - Module: triangle

3. **Add pattern fills** for colorblind mode:
   - Stripes for function
   - Dots for class
   - Cross-hatch for interface

4. **Add labels to legend items** with both shape + color swatches (already done in legend)

### 4.5 Mobile/Tablet Optimization

**Current mobile support:**
- Touch events handled (`interaction.ts:298-385`)
- Pinch-to-zoom supported
- Basic pan supported

**Missing mobile UX:**
1. **Responsive toolbar**: Toolbar overflows on small screens. Add hamburger menu for mobile.
2. **Touch target sizes**: Filter buttons are 24px height — should be at least 44px for WCAG compliance.
3. **Bottom sheet instead of sidebar**: On mobile, the sidebar should slide up from bottom, not in from right.
4. **Long-press context menu**: Current context menu uses right-click (unavailable on touch). Add long-press detection.
5. **Viewport meta tag**: Already present (✅ `<meta name="viewport"...>`)
6. **Performance**: Reduce animation frame rate on mobile (30fps instead of 60fps)
7. **Add to homescreen**: Add PWA manifest for mobile users
8. **Gesture hints**: Show a one-time tutorial overlay on first mobile visit

### 4.6 Additional UX Improvements

1. **Undo/redo**: Track state changes (filter toggles, layout switches, pans) and allow Ctrl+Z/Ctrl+Y
2. **Bookmarks**: Let users save named views (zoom level, position, filter state)
3. **Print-friendly mode**: When exporting to PNG/SVG, add a print-optimized stylesheet
4. **Dark/light mode transition**: Add CSS transition for smooth theme switching
5. **Loading progress**: Show "Parsed 42/100 files..." during analysis instead of spinner

---

## 5. Testing Strategies

### 5.1 Current Test Coverage

**Existing tests** (`tests/parsers.test.ts`, `tests/integration.test.ts`):
- Parser correctness for TS, Rust, Python, Go, Java
- Utility function tests (findLine, isBinary, readFileSafe, walkFiles)
- Config loading
- SVG export validation

**Missing test categories:**
- Graph analytics (analytics.ts has NO tests)
- Cycle detection (cycles.ts has NO tests)
- Server endpoints (server.ts has NO tests)
- Viewer/client code (entirely untested)
- Security edge cases (path traversal, ReDoS)

### 5.2 Testing Force-Directed Graph Layouts

**Challenge:** Force-directed layouts are non-deterministic (floating point, initial conditions). Testing requires convergence-based assertions.

**Strategy:**

```ts
// tests/layout.test.ts
import { describe, it, expect } from 'vitest';
import { detectCycles } from '../src/graph/cycles.js';
import { analyzeGraph } from '../src/graph/analytics.js';

describe('Force simulation convergence', () => {
  it('all nodes have non-null positions after simulation', async () => {
    // Create a small graph
    const nodes = [
      { id: 'a', kind: 'file', filePath: 'a.ts', line: 1, col: 1, label: 'a', x: null, y: null },
      { id: 'b', kind: 'file', filePath: 'b.ts', line: 1, col: 1, label: 'b', x: null, y: null },
    ];
    const edges = [{ source: 'a', target: 'b', kind: 'imports' }];
    
    // Run simulation to completion
    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges).id(d => d.id))
      .stop();
    
    // Run for enough ticks
    for (let i = 0; i < 300; i++) sim.tick();
    
    // Assert all nodes have positions
    for (const n of nodes) {
      expect(n.x).not.toBeNull();
      expect(n.y).not.toBeNull();
      expect(isFinite(n.x)).toBe(true);
      expect(isFinite(n.y)).toBe(true);
    }
  });

  it('connected nodes are closer than unconnected nodes', () => {
    // Create a graph with two connected components
    const nodes = [
      { id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 0 },
      { id: 'c', x: 0, y: 0 }, { id: 'd', x: 0, y: 0 },
    ];
    const edges = [
      { source: nodes[0], target: nodes[1], kind: 'imports' },
      // no edge between c and d or cross-component
    ];
    
    // ... run simulation ...
    
    const distAB = Math.hypot(nodes[0].x - nodes[1].x, nodes[0].y - nodes[1].y);
    const distAC = Math.hypot(nodes[0].x - nodes[2].x, nodes[0].y - nodes[2].y);
    expect(distAB).toBeLessThan(distAC);
  });
});
```

**Key testing patterns:**
1. **Convergence test**: Run simulation, verify all positions are finite
2. **Proximity test**: Connected nodes should be closer than unconnected
3. **Determinism test**: Same input → same output (with fixed seed if available)
4. **Performance test**: Simulation for 1000 nodes completes in <2 seconds
5. **Stability test**: After `simSettled`, positions don't change on re-tick

### 5.3 Property-Based Testing for Parsers

**Strategy:** Use `fast-check` (the `fc` library) to generate random code inputs and verify parser invariants.

```ts
// tests/property-based.test.ts
import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';

describe('Parser invariants (property-based)', () => {
  it('parser always produces at least one file node', async () => {
    // Generate random file content
    const contentArb = fc.string({ minLength: 0, maxLength: 10000 });
    await fc.assert(
      fc.asyncProperty(contentArb, async (content) => {
        // Write to temp file, parse, verify invariant
        const tmpFile = `/tmp/test-${Date.now()}.ts`;
        fs.writeFileSync(tmpFile, content);
        try {
          const result = await analyzeTypeScript(path.dirname(tmpFile), path.dirname(tmpFile));
          // INVARIANT: must always produce a file node for the input file
          expect(result.nodes.some(n => n.kind === 'file')).toBe(true);
          // INVARIANT: all edge sources/targets must reference existing nodes
          const nodeIds = new Set(result.nodes.map(n => n.id));
          for (const e of result.edges) {
            expect(nodeIds.has(e.source) || e.source.startsWith('module:')).toBe(true);
          }
        } finally {
          fs.unlinkSync(tmpFile);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('cycle detection never produces invalid cycles', () => {
    const nodesArb = fc.array(
      fc.record({
        id: fc.hexaString({ minLength: 1, maxLength: 10 }),
        kind: fc.constantFrom('file', 'function'),
        filePath: fc.constant('/test.ts'),
        line: fc.nat({ max: 1000 }),
        col: fc.nat({ max: 100 }),
        label: fc.string({ minLength: 1, maxLength: 20 }),
      }),
      { minLength: 1, maxLength: 20 }
    );
    const edgesArb = (nodeIds) => fc.array(
      fc.record({
        source: fc.constantFrom(...nodeIds),
        target: fc.constantFrom(...nodeIds),
        kind: fc.constantFrom('imports', 'calls'),
      }),
      { minLength: 0, maxLength: 30 }
    );

    fc.assert(
      fc.property(nodesArb, (nodes) => {
        fc.assert(
          fc.property(edgesArb(nodes.map(n => n.id)), (edges) => {
            const cycles = detectCycles(nodes, edges);
            // INVARIANT: every cycle must start and end with the same node
            for (const c of cycles) {
              expect(c.nodes[0]).toBe(c.nodes[c.nodes.length - 1]);
            }
            // INVARIANT: no duplicate cycles
            const keys = cycles.map(c => [...c.nodes].sort().join(','));
            expect(new Set(keys).size).toBe(keys.length);
          })
        );
      }),
      { numRuns: 50 }
    );
  });
});
```

### 5.4 Visual Regression Testing for Canvas Renderers

**Strategy:** Use screenshot comparison with `playwright` or `puppeteer`.

```ts
// tests/visual-regression.test.ts
import { test, expect } from '@playwright/test';

test.describe('Canvas rendering', () => {
  test('graph renders correctly at default zoom', async ({ page }) => {
    await page.goto('http://localhost:5001');
    await page.waitForSelector('#canvas');
    // Wait for simulation to settle
    await page.waitForTimeout(2000);
    // Take screenshot
    await expect(page.locator('#canvas')).toHaveScreenshot('default-view.png', {
      maxDiffPixelRatio: 0.01, // allow 1% pixel difference
    });
  });

  test('filtered view hides correct nodes', async ({ page }) => {
    await page.goto('http://localhost:5001');
    await page.waitForTimeout(2000);
    // Click function filter button
    await page.click('[data-kind="function"]');
    await page.waitForTimeout(500);
    await expect(page.locator('#canvas')).toHaveScreenshot('filtered-functions.png');
  });

  test('hierarchical layout renders correctly', async ({ page }) => {
    await page.goto('http://localhost:5001');
    await page.waitForTimeout(2000);
    await page.click('#layout-btn');
    await page.waitForTimeout(1000);
    await expect(page.locator('#canvas')).toHaveScreenshot('hierarchical-layout.png');
  });
});
```

**Setup:**
```bash
npm install -D @playwright/test
npx playwright install chromium
```

**Baseline strategy:**
1. Generate baselines in CI with a deterministic test project (fixed fixtures)
2. Compare against baselines on every PR
3. Use `maxDiffPixelRatio` for minor rendering differences across platforms
4. Test both dark and light themes

### 5.5 Server/API Testing

```ts
// tests/server.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer } from '../src/server.js';

describe('Server API', () => {
  let server: any;
  let baseUrl: string;

  beforeAll(async () => {
    const result = await startServer('./tests/fixtures/ts', 0); // random port
    server = result.server;
    baseUrl = result.url;
  });

  afterAll(() => { server?.close(); });

  it('GET /api/analyze returns valid graph', async () => {
    const res = await fetch(`${baseUrl}/api/analyze`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.graph).toBeDefined();
    expect(data.graph.nodes.length).toBeGreaterThan(0);
    expect(data.stats).toBeDefined();
  });

  it('GET /api/file returns file content', async () => {
    const res = await fetch(`${baseUrl}/api/file?path=utils.ts`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.lines.length).toBeGreaterThan(0);
  });

  it('GET /api/file blocks path traversal', async () => {
    const res = await fetch(`${baseUrl}/api/file?path=../../etc/passwd`);
    expect(res.status).toBe(403);
  });

  it('GET /api/file rejects missing path', async () => {
    const res = await fetch(`${baseUrl}/api/file`);
    expect(res.status).toBe(400);
  });
});
```

### 5.6 Recommended Test Architecture

```
tests/
├── unit/
│   ├── parsers.test.ts          (existing, expand)
│   ├── analytics.test.ts        (NEW)
│   ├── cycles.test.ts           (NEW)
│   ├── metrics.test.ts          (NEW, when implemented)
│   ├── git.test.ts              (NEW, when implemented)
│   └── utils.test.ts            (existing, expand)
├── property/
│   ├── parser-invariants.test.ts (NEW)
│   └── cycle-invariants.test.ts  (NEW)
├── integration/
│   ├── server-api.test.ts       (NEW)
│   └── full-analysis.test.ts    (existing, expand)
├── visual/
│   ├── canvas-rendering.spec.ts (NEW, playwright)
│   └── __screenshots__/         (baselines)
└── security/
    ├── path-traversal.test.ts   (NEW)
    └── regex-dos.test.ts        (NEW)
```

---

## 6. Priority Matrix

| Recommendation | Impact | Effort | Priority |
|---------------|--------|--------|----------|
| Viewport culling in renderer | High | Low | P0 |
| Port validation + server binding | High | Low | P0 |
| ReDoS protection | High | Low | P0 |
| Quadtree for hit testing | High | Medium | P1 |
| Git integration | High | Medium | P1 |
| Code metrics (complexity, LOC) | High | Medium | P1 |
| Web Worker for simulation | Medium | Medium | P1 |
| ARIA labels + keyboard nav | Medium | Medium | P1 |
| Colorblind palette mode | Medium | Low | P2 |
| WebGL buffer reuse + caching | Medium | Low | P2 |
| Property-based parser tests | Medium | Medium | P2 |
| Visual regression tests | Medium | Medium | P2 |
| Server API tests | Medium | Low | P2 |
| Dependency rules engine | Medium | High | P3 |
| AI-powered analysis | Medium | High | P3 |
| Real-time collaboration | Low | High | P4 |
| PWA manifest | Low | Low | P4 |
