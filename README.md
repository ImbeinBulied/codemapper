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
- **Force-directed layout** — interactive drag, zoom, pan (canvas-based)
- **Node filtering** — toggle visibility of files, functions, classes, interfaces, types
- **Search** — `Ctrl+K` or `/` to search by name or file path
- **Code sidebar** — click any node to see the surrounding source code with syntax highlighting
- **Right-click context menu** — copy path, show dependents, filter by kind
- **Edge labels** — import paths and call names shown on hover
- **Directory clusters** — bounding boxes group files by parent directory
- **Export** — PNG snapshot or full graph JSON
- **External dependencies** — npm, Cargo, and Go modules auto-detected from manifest files
- **Touch support** — pinch-to-zoom, drag, and tap on mobile
- **Keyboard shortcuts** — arrow keys pan, `+/-` zoom, `Esc` close sidebar

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
  --no-open               Do not open browser automatically

Options for analyze:
  -f, --filter <pattern>  Filter files by regex pattern
  -o, --output <file>     Write output to file instead of stdout
  --format <format>       Output format: json (default) or svg
```

## Viewer Controls

| Keys | Action |
|------|--------|
| `/` or `Ctrl+K` | Focus search |
| Arrow keys | Pan |
| `+` / `-` | Zoom in / out |
| `Ctrl+0` | Reset zoom |
| `Esc` | Close sidebar / context menu |
| Left-click node | Inspect file |
| Right-click node | Context menu |
| Drag empty space | Pan |
| Drag node | Reposition |
| Scroll | Zoom |

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

| Language | Extensions | Nodes |
|----------|-----------|-------|
| TypeScript / JS | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` | files, functions, classes, interfaces, type aliases, arrow functions, extends/implements, call edges |
| Rust | `.rs` | files, functions, structs, enums, traits, impl blocks, type aliases, call edges |
| Python | `.py` | files, functions, classes, imports, call edges |
| Go | `.go` | files, functions, structs, interfaces, imports, call edges |
| Java | `.java` | files, methods, classes, interfaces, enums, extends/implements, imports, call edges |

## Development

```sh
git clone <repo>
cd codemapper
npm install
npm run dev       # run with tsx (no build needed)
npm run build     # compile TypeScript + bundle viewer
npm test          # run test suite
npm run test:watch
```

## How It Works

1. **File walking** — recursively scans the target directory (every 20 files yields to event loop)
2. **Language detection** — auto-detects languages by file extension
3. **Regex parsing** — lightweight per-file analysis extracts imports, functions, classes, types, and calls
4. **Graph assembly** — merges language results, deduplicates nodes/edges, builds stats
5. **Viewer** — Express server serves the analysis API and a canvas-based D3 force-directed graph UI
6. **Caching** — directory hash (size + mtime) avoids re-analysis on unchanged codebases
