# codemapper

Interactive codebase graph visualizer — infinite canvas for code architecture.

Analyze your codebase and explore its structure as an interactive force-directed graph in the browser.

> **Full reference:** [`CODEMAP.md`](./CODEMAP.md) — architecture, parser pipeline, viewer controls, performance, development guide.

## Install

```sh
npm install -g codemapper
```

Or run without installing:

```sh
npx codemapper view .
```

## Quick Start

```sh
# Interactive graph view (opens browser)
codemapper view ./my-project

# With custom port + file filter
codemapper view ./my-project --port 8080 --filter '\.ts$'

# Analyze and output JSON
codemapper analyze ./my-project

# Export SVG for CI / documentation
codemapper analyze ./my-project --format svg --output graph.svg
```

## Features

- **Multi-language** — TypeScript, JavaScript, Rust, Python, Go, Java
- **Two analysis modes** — fast regex (default) or AST-level tree-sitter (`--deep`)
- **Three layout modes** — Force-directed (D3), Hierarchical (dagre), Grid — toggle with layout button
- **GPU-accelerated** — WebGL auto-enables at 500+ nodes for smooth rendering
- **Minimap** — overview + viewport indicator for large codebases (auto-shown at 20+ nodes)
- **Cycle detection** — circular dependencies highlighted in red
- **Node filtering** — toggle visibility of files, functions, classes, interfaces, types
- **Search** — `Ctrl+K` or `/` to search by name or file path
- **Code sidebar** — click any node to see the surrounding source code with syntax highlighting
- **Right-click context menu** — copy path, show dependents, filter by kind
- **Edge labels** — import paths and call names shown on hover
- **Directory clusters** — bounding boxes group files by parent directory
- **Export** — PNG snapshot, JSON graph data
- **External dependencies** — npm, Cargo, and Go modules auto-detected from manifest files
- **Touch support** — pinch-to-zoom, drag, and tap on mobile
- **Keyboard shortcuts** — arrow keys pan, `+/-` zoom, `Esc` close sidebar, layout toggle
- **Watch mode** — `--watch` refreshes analysis on file changes

## Configuration

Create `.codemaperrc.json` in your project root:

```json
{
  "include": ["src/"],
  "exclude": ["__tests__", "vendor"]
}
```

- `include` — only analyze files matching these regex patterns
- `exclude` — skip files matching these regex patterns

## CLI

```
Usage: codemapper [options] [command]

Commands:
  view [options] <directory>     Open interactive graph view
  analyze [options] <directory>  Analyze and output JSON/SVG to stdout or file

Options for view:
  -p, --port <number>     Port to serve on (default: "5001")
  -f, --filter <pattern>  Filter files by regex pattern
  -w, --watch             Watch for file changes and auto-refresh
  -d, --deep              Use tree-sitter AST parsing (slower, more accurate)
  --no-open               Do not open browser automatically

Options for analyze:
  -f, --filter <pattern>  Filter files by regex pattern
  -o, --output <file>     Write output to file instead of stdout
  --format <format>       Output format: json (default) or svg
  -d, --deep              Use tree-sitter AST parsing (slower, more accurate)
```

## Viewer Controls

| Keys / Action              | Action                                                            |
| -------------------------- | ----------------------------------------------------------------- |
| `/` or `Ctrl+K`            | Focus search                                                      |
| Arrow keys                 | Pan                                                               |
| `+` / `-`                  | Zoom in / out                                                     |
| `Ctrl+0`                   | Reset zoom                                                        |
| `Esc`                      | Close sidebar / context menu                                      |
| Left-click node            | Inspect file                                                      |
| Right-click node           | Context menu (copy path, show dependents, filter by kind)         |
| Drag empty space           | Pan                                                               |
| Drag node                  | Reposition                                                        |
| Scroll                     | Zoom                                                              |
| Layout button              | Cycle between Force → Hierarchical → Grid                         |
| Cycle button               | Toggle cycle dependency highlighting                              |
| F / fn / C / I / T buttons | Toggle visibility of files, functions, classes, interfaces, types |

## Docker

```sh
docker build -t codemapper .
docker run -v $(pwd):/workspace codemapper view /workspace -p 5001
```

For CI / SVG export:

```sh
docker run -v $(pwd):/workspace codemapper analyze /workspace --format svg --output /workspace/graph.svg
```

## Supported Languages

| Language        | Extensions                           | Nodes                                                                                                | Deep (`--deep`) |
| --------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------- |
| TypeScript / JS | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` | files, functions, classes, interfaces, type aliases, arrow functions, extends/implements, call edges | — (regex only)  |
| Rust            | `.rs`                                | files, functions, structs, enums, traits, impl blocks, type aliases, call edges                      | tree-sitter AST |
| Python          | `.py`                                | files, functions, classes, imports, call edges                                                       | tree-sitter AST |
| Go              | `.go`                                | files, functions, structs, interfaces, imports, call edges                                           | tree-sitter AST |
| Java            | `.java`                              | files, methods, classes, interfaces, enums, extends/implements, imports, call edges                  | tree-sitter AST |

## Development

```sh
git clone <repo>
cd codemapper
npm install
npm run dev       # run with tsx (no build needed)
npm run build     # compile TypeScript + bundle viewer (esbuild)
npm test          # run test suite (vitest, 17+ tests)
npm run test:watch
```

### Project structure

```
src/
  cli.ts, config.ts, server.ts, export.ts   # CLI + API
  analyze/                                   # Language parsers (5 languages)
  graph/                                     # Graph types + analytics
  viewer/                                    # Frontend (modular TS)
    main.ts, state.ts, renderer.ts           # Core viewer modules
    simulation.ts, interaction.ts            # D3 layout + input handling
    sidebar.ts, search.ts                    # UI panels
    minimap.ts, dagre-layout.ts              # Minimap + alternative layouts
    export-helper.ts, colors.ts              # Export + theme
    index.html, styles.css                   # HTML shell + styles
    dagre.min.js                              # Vendored dagre (hierarchical layout)
build-viewer.mjs                              # esbuild bundler for viewer
```

## How It Works

1. **File walking** — recursively scans the target directory (every 20 files yields to event loop)
2. **Language detection** — auto-detects languages by file extension
3. **Parsing** — fast regex (default) or tree-sitter AST (`--deep`) for deeper analysis (Python, Rust, Go, Java)
4. **Graph assembly** — merges language results, deduplicates nodes/edges, builds stats
5. **Cycle detection + analytics** — DFS cycle detection, fan-in/fan-out metrics
6. **Viewer** — Express server serves a modular TypeScript viewer (esbuild-bundled) with Canvas 2D + WebGL rendering, D3 force layout, dagre hierarchical layout, minimap, and cycle detection
7. **Caching** — directory hash (size + mtime) avoids re-analysis on unchanged codebases
