# codemapper — Codebase Reference

Interactive codebase graph visualizer with infinite canvas for code architecture.
Analyzes TS/JS, Python, Rust, Go, and Java into a force-directed dependency graph.

---

## Quick Stats

| Metric           | Value                                        |
| ---------------- | -------------------------------------------- |
| Total lines      | 3,362 (source) + 1,425 (viewer)              |
| Source files     | 14 TS files                                  |
| Languages parsed | 5 (TS/JS, Python, Rust, Go, Java)            |
| Renderers        | Canvas 2D + WebGL (auto-switch at 500 nodes) |
| Layouts          | Force-directed, Hierarchical (dagre), Grid   |
| Tests            | 17 passing (vitest)                          |
| Dependencies     | 9 runtime + 4 dev                            |

---

## Architecture

```
src/
  cli.ts              # Commander CLI entry point
  config.ts           # .codemapperrc.json loader
  server.ts           # Express API server
  export.ts           # SVG/JSON export
  analyze/            # BACKEND: analysis/parsing
    index.ts          # Orchestrator
    typescript.ts     # TS/JS parser (TypeScript Compiler API)
    python.ts         # Python parser (regex, enhanced)
    rust.ts           # Rust parser (regex)
    go.ts             # Go parser (regex)
    java.ts           # Java parser (regex)
    treesitter.ts     # Optional WASM tree-sitter parser
    utils.ts          # File walking, safe read, binary detection
  graph/              # BACKEND: graph types + analytics
    index.ts          # Type definitions
    cycles.ts         # Cycle detection (DFS)
    analytics.ts      # Coupling/hub/instability metrics
    layout.ts         # Server-side layout algorithms
  viewer/             # FRONTEND: modular ES modules → esbuild bundle
    index.html        # Thin HTML shell (63 lines)
    styles.css        # All CSS (extracted from monolith)
    main.ts           # Entry point — imports all modules, bootstrap
    state.ts          # Shared state (nodes, edges, transform, ...)
    colors.ts         # Color constants + node sizes
    renderer.ts       # Canvas 2D + WebGL rendering dispatch
    minimap.ts        # Minimap + directory clusters + zoom display
    interaction.ts    # Mouse/touch/keyboard events, hit testing, tooltips, context menu
    sidebar.ts        # File inspector sidebar with syntax highlighting
    search.ts         # Node search with pan-to-result
    simulation.ts     # D3 force simulation
    dagre-layout.ts   # Hierarchical layout (Sugiyama) via dagre
    export-helper.ts   # PNG/JSON export + cycle toggle
```

---

## Data Flow

```
Source Files → walkFiles() → Language Detection → Parser Selection
                                                             ↓
                                              ┌─ TypeScript API ─┐
                                              │  Python (regex)  │
                                              │  Rust (regex)    │
                                              │  Go (regex)      │
                                              │  Java (regex)    │
                                              │  tree-sitter WASM│
                                              └────────┬─────────┘
                                                       ↓
                                              Graph Assembly
                                              (dedup nodes/edges)
                                                       ↓
                                              ┌─ Cycle Detection
                                              │─ Analytics (hubs, coupling)
                                              │─ External Deps (npm, cargo, go)
                                              └────────┬─────────┘
                                                       ↓
                                              JSON Output / Express API
                                                       ↓
                                              Viewer (Canvas 2D / WebGL)
```

---

## File-by-File Breakdown

### `src/cli.ts` (80 lines)

Commander-based CLI with two commands:

- `codemapper view <dir>` — starts Express server + opens browser
- `codemapper analyze <dir>` — outputs JSON/SVG to stdout or file

Options: `--port`, `--filter`, `--watch`, `--no-open`, `--format`, `--output`

### `src/server.ts` (145 lines)

Express server with two API endpoints:

- `GET /api/analyze` — returns full graph JSON (cached via directory hash)
- `GET /api/file?path=` — returns file content with line numbers for sidebar

Watch mode: fs.watch with 300ms debounce to invalidate cache.

### `src/export.ts` (92 lines)

- `toSVG()` — grid-layout SVG with colored nodes by kind (1200×800)
- `toJSON()` — pretty-printed AnalysisResult

### `src/config.ts` (47 lines)

Loads `.codemapperrc.json` (or legacy `.codemaperrc.json` for backwards compat).
Fields: `include`, `exclude`, `languages`, `nodeColors`.

---

## Parser Pipeline

### TypeScript/JS — TypeScript Compiler API (`typescript.ts`, 611 lines)

**Replaced the original regex parser.** Uses the official `typescript` package (v5.9.3).

Extraction via `ts.createSourceFile` + AST walking:

- `ImportDeclaration` — named, default, namespace, side-effect imports
- `ExportDeclaration` — re-exports, named exports
- `FunctionDeclaration` — async, generators
- `ClassDeclaration` — methods, constructors, property arrows
- `InterfaceDeclaration` — extends chains
- `TypeAliasDeclaration`, `EnumDeclaration`
- `CallExpression` — intra-file and cross-file calls
- `PropertyAccessExpression` — `obj.method()` detection

**Cross-file resolution (Phase 3):**

1. Phase 1: Parse all files, build per-file export maps + import lists
2. Phase 2: Aggregate export map (file → {exported symbols})
3. Phase 3: Match imports to exports → create resolved `imports` + `calls` edges

Module resolution handles:

- `.js` → `.ts` extension mapping
- Relative paths (`./foo` → `./foo.ts`, `./foo/index.ts`)
- Bare specifiers → external module nodes

**Skip lists:** Extended to cover common test APIs, built-ins, and globals.

### Python — Regex (`python.ts`, 178 lines)

- `import foo`, `import foo as bar`, `from foo import bar, baz as qux`
- Class definitions with inheritance (`class Foo(Bar)`)
- Function definitions (sync + async)
- Decorator tracking
- Cross-module call edges for imported symbols

### Rust — Regex (`rust.ts`, 104 lines)

- Functions, structs, enums, traits, impl blocks, type aliases
- `use` path resolution, `mod` declarations

### Go — Regex (`go.ts`, 71 lines)

- Functions, methods, structs, interfaces
- Parenthesized import blocks, single-line imports

### Java — Regex (`java.ts`, 80 lines)

- Classes, interfaces, enums, methods
- Implements/extends chains, import resolution

### Tree-sitter WASM (`treesitter.ts`, 249 lines)

**Optional upgrade** — enabled when `WASM_DIR` env var points to WASM grammars.

- Uses `web-tree-sitter` (v0.26.9) with WASM grammars
- Supports: Python, Rust, Go, Java
- Auto-fallback when WASM files aren't available
- Walks CST nodes for function/class/interface definitions

**Download WASM grammars:**

```sh
mkdir -p wasm
# Python v0.25.0
curl -L -o wasm/tree-sitter-python.wasm \
  "https://github.com/tree-sitter/tree-sitter-python/releases/download/v0.25.0/tree-sitter-python.wasm"
# Rust v0.24.0
curl -L -o wasm/tree-sitter-rust.wasm \
  "https://github.com/tree-sitter/tree-sitter-rust/releases/download/v0.24.0/tree-sitter-rust.wasm"
# Go v0.25.0
curl -L -o wasm/tree-sitter-go.wasm \
  "https://github.com/tree-sitter/tree-sitter-go/releases/download/v0.25.0/tree-sitter-go.wasm"
# Java v0.23.5
curl -L -o wasm/tree-sitter-java.wasm \
  "https://github.com/tree-sitter/tree-sitter-java/releases/download/v0.23.5/tree-sitter-java.wasm"
```

---

## Graph Features

### Graph Types (`src/graph/index.ts`)

```typescript
GraphNode { id, label, kind, filePath, line, col, description? }
  // kinds: file | function | class | interface | type | module | call | directory | enum

GraphEdge { source, target, kind, label? }
  // kinds: imports | calls | extends | implements | contains | callsites | exports

AnalysisResult { graph, root, stats, cycles?, analytics? }
```

### Cycle Detection (`src/graph/cycles.ts`, 115 lines)

DFS with WHITE/GRAY/BLACK coloring. Detects back-edges in the import graph.

- Returns list of cycles with ordered node paths
- Deduplicates cycles (same nodes, different entry points)
- Highlighted in viewer with red glow/edges
- Toggle via `⟳ Cycles` button

### Graph Analytics (`src/graph/analytics.ts`, 105 lines)

Structural metrics for every file node:

- **fanIn** — how many other files import symbols from this file
- **fanOut** — how many imports this file makes
- **instability** — `fanOut / (fanIn + fanOut)` (0=stable, 1=unstable)
- **coupling** — combined connectivity score

Exported as `hubs[]` (top 10 by fan-in) and `mostUnstable[]`.

### Layout Algorithms (`src/graph/layout.ts`)

Three layout modes in the viewer:
| Layout | Algorithm | Best for |
|--------|-----------|----------|
| **Force** | D3 force simulation | Organic exploration, small graphs |
| **Hierarchical** | dagre (Sugiyama) | Dependency direction, module structure |
| **Grid** | Row/column grid | Large node sets, overview |

Toggle via layout button in toolbar. Hierarchical layout uses dagre with left-to-right rank direction, automatically centers and scales the graph.

---

## Viewer

Modular TypeScript source files bundled into a single `bundle.js` via esbuild.

```
src/viewer/
├── index.html        # Thin shell (HTML structure only)
├── styles.css        # All CSS (extracted from monolith)
├── main.ts           # Entry point — bootstrap, init, keyboard shortcuts
├── state.ts          # Shared reactive state (nodes, edges, transform)
├── colors.ts         # Color palette + node size constants
├── renderer.ts       # Canvas 2D + WebGL rendering dispatch
├── minimap.ts        # Minimap + directory clusters + zoom level
├── interaction.ts    # Mouse/touch/keyboard, hit testing, tooltips, context menu
├── sidebar.ts        # File inspector sidebar with syntax highlighting
├── search.ts         # Node search with pan-to-result
├── simulation.ts     # D3 force-directed layout
├── dagre-layout.ts   # Hierarchical layout (Sugiyama) via dagre
└── export-helper.ts  # PNG/JSON export + cycle toggle
```

Build: `node build-viewer.mjs` → produces `dist/viewer/bundle.js` (34 KB).

D3 and dagre are loaded as globals via `<script>` tags in `index.html`, then marked as `external` in the esbuild bundle so they aren't duplicated.

### Rendering

- **Canvas 2D** (default) — grid background, node shapes by kind, glow effects
- **WebGL** (auto at 500+ nodes) — GPU rendering via raw WebGL, falls back to Canvas 2D
- **Canvas overlay** for text labels, tooltips, hit detection

### Controls

| Action       | Input                                               |
| ------------ | --------------------------------------------------- |
| Pan          | Drag empty space / Arrow keys                       |
| Zoom         | Scroll / `+` `-` keys                               |
| Search       | `/` or `Ctrl+K`                                     |
| Inspect      | Click node → sidebar with syntax-highlighted source |
| Context menu | Right-click node → copy path, focus, filter         |
| Reset zoom   | `Ctrl+0` or `1:1` button                            |

### Toolbar

- **Search** — fuzzy match by label or file path
- **Filter buttons** — F (file), fn (function), C (class), I (interface), T (type)
- **⟳ Cycles** — toggle cycle highlighting (red)
- **Layout** — cycle through Force / Hierarchical / Grid
- **Export** — PNG snapshot or JSON download

### Minimap

Auto-enabled for graphs with 20+ nodes. Shows bird's-eye view in bottom-right corner with viewport rectangle. Click to navigate.

### Sidebar

Click any node to open a sliding panel showing source code (with syntax highlighting) centered on the selected symbol's definition line.

### Colors

| Element    | Color           |
| ---------- | --------------- |
| file       | `#30363d`       |
| function   | `#d2a8ff`       |
| class      | `#58a6ff`       |
| interface  | `#79c0ff`       |
| type       | `#3fb950`       |
| module     | `#8b949e`       |
| cycle      | `#f85149` (red) |
| background | `#0d1117`       |

---

## Performance Characteristics

| Scenario      | Renderer     | Behavior                         |
| ------------- | ------------ | -------------------------------- |
| < 100 nodes   | Canvas 2D    | Smooth, all effects enabled      |
| 100–500 nodes | Canvas 2D    | Slight perf drop on labels       |
| 500–10k nodes | WebGL (auto) | GPU-accelerated, minimal effects |
| 10k+ nodes    | WebGL        | Grid layout recommended          |

File walk yields to event loop every 20 files. MAX_FILE_SIZE limit: 1 MB.

---

## Configuration

Create `.codemapperrc.json` in your project root:

```json
{
  "include": ["src/"],
  "exclude": ["__tests__", "vendor"],
  "languages": ["typescript", "python"],
  "nodeColors": {
    "function": "#ff0000"
  }
}
```

Environment variables:

- `WASM_DIR` — path to tree-sitter WASM grammars (default: `./wasm/`)
- `PORT` — server port (overridden by `--port` CLI flag)

---

## Development

```sh
git clone <repo>
cd codemapper
npm install              # installs deps + copies viewer assets
npm run dev              # run with tsx (no build needed)
npm run build            # compile TypeScript + bundle viewer
npm test                 # 17 tests (vitest)
npm run test:watch       # watch mode
```

### Project evolution

| Date   | Change                                                            |
| ------ | ----------------------------------------------------------------- |
| v0.1.0 | Initial release — regex parsers, Canvas 2D, D3 force              |
| v0.2.0 | TS Compiler API parser, tree-sitter WASM, cross-file calls        |
| v0.2.1 | Cycle detection, WebGL renderer, dagre layout, minimap, analytics |

### Build output

```sh
npm run build
# Produces:
#   dist/cli.js
#   dist/analyze/*.js
#   dist/graph/*.js
#   dist/viewer/index.html
#   dist/viewer/d3.min.js
#   dist/viewer/dagre.min.js
```

---

## Docker

```sh
docker build -t codemapper .
docker run -v $(pwd):/workspace codemapper view /workspace -p 5001

# CI export:
docker run -v $(pwd):/workspace codemapper analyze /workspace \
  --format svg --output /workspace/graph.svg
```

---

## CLI Reference

```
Usage: codemapper [options] [command]

Commands:
  view [options] <directory>     Open interactive graph view
  analyze [options] <directory>  Analyze and output JSON/SVG

View options:
  -p, --port <number>     Port (default: 5001)
  -f, --filter <pattern>  Filter files by regex
  -w, --watch             Watch for file changes
  --no-open               Don't open browser

Analyze options:
  -f, --filter <pattern>  Filter files by regex
  -o, --output <file>     Write to file
  --format <format>       json (default) or svg
```

---

## Skills

A Hermes skill `ast-code-analysis` was created in:
`~/.hermes/skills/software-development/ast-code-analysis/SKILL.md`

Documents AST-based parsing with TypeScript Compiler API and tree-sitter patterns — cross-file resolution, export maps, module resolution, and common pitfalls.
