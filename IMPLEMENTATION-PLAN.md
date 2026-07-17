# Codemapper Implementation Plan

> **Version:** 1.0  
> **Date:** 2026-07-17  
> **Status:** Draft — living document  
> **Objective:** Roadmap for taking codemapper from a capable code-graph viewer to a market-leading codebase intelligence platform.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tier Strategy & Rationale](#2-tier-strategy--rationale)
3. [Tier 1: Game Changers](#3-tier-1-game-changers)
4. [Tier 2: High Adoption Drivers](#4-tier-2-high-adoption-drivers)
5. [Tier 3: Competitive Parity](#5-tier-3-competitive-parity)
6. [Tier 4: Differentiation](#6-tier-4-differentiation)
7. [Timeline Estimate](#7-timeline-estimate)
8. [Quick Wins](#8-quick-wins)
9. [Risk Register](#9-risk-register)
10. [Appendix: Competitor Landscape](#10-appendix-competitor-landscape)

---

## 1. Project Overview

### 1.1 What Codemapper Is

Codemapper is an interactive codebase graph visualizer that analyzes source code into a force-directed dependency graph rendered in the browser (Canvas 2D + WebGL). It runs locally via CLI (`codemapper view ./project`), supports 5 languages (TypeScript/JS, Python, Rust, Go, Java), and offers three layout modes (force, hierarchical, grid), cycle detection, minimap, file inspector sidebar, and SVG/JSON export.

### 1.2 Current State

| Dimension | Status |
|---|---|
| Languages parsed | 5 (TS/JS via TS Compiler API; Python, Rust, Go, Java via regex + optional tree-sitter WASM) |
| Renderers | Canvas 2D + WebGL (auto-switch at 500 nodes) |
| Layouts | Force-directed (D3), Hierarchical (dagre), Grid |
| Tests | ~17 passing (vitest) |
| CLI commands | `view`, `analyze` |
| Export formats | JSON, SVG |
| Git integration | Partial — git churn module exists in `src/git.ts` |
| Code metrics | Basic — LOC, cyclomatic complexity, maintainability index in `src/graph/metrics.ts` |
| Analytics | Fan-in, fan-out, instability, heat score in `src/graph/analytics.ts` |

### 1.3 Competitive Position

Codemapper currently competes with:
- **dependency-cruiser** (stable, feature-rich, CI-friendly, SVG/HTML output, rules engine)
- **madge** (simple cycle detection, CLI-focused)
- **sourcegraph** / **emerge** (cloud-based, PR integration, AI features)
- **sourcetrail** (discontinued but set UX bar)
- **CodeSee** (acquired, had visual code maps)

**Key gaps identified in research:**
- No CI integration / governance rules (dependency-cruiser has allowed/forbidden rules)
- No dead code analysis (madge has orphans detection)
- No PR impact analysis
- No dependency explanation (pathfinder exists as MVP)
- Limited export (HTML missing)
- No VS Code extension
- No AI-powered insights
- Health scoring / quality gates absent
- Tree-sitter integration is optional/WASM-only, not default depth

### 1.4 Design Principles

1. **CLI-first, editor-adjacent** — codemapper runs where developers live: terminal and VS Code
2. **Incremental value** — every feature ships independently; no megafeatures
3. **Performance is a feature** — sub-second analysis for <10K file codebases
4. **Privacy by default** — everything runs locally; AI features opt-in with local LLM support
5. **Composable output** — every command emits machine-readable JSON for CI pipelining

---

## 2. Tier Strategy & Rationale

Features are organized into four tiers based on competitive differentiation and user adoption impact:

| Tier | Theme | # Features | Target Impact |
|---|---|---|---|
| **Tier 1** | Game Changers | 4 | Create novel capabilities competitors cannot easily replicate |
| **Tier 2** | High Adoption Drivers | 5 | Solve daily pain points that drive user retention |
| **Tier 3** | Competitive Parity | 5 | Match features users expect from established tools |
| **Tier 4** | Differentiation | 6 | Long-term moat through ecosystem and AI |

---

## 3. Tier 1: Game Changers

Features that create defensible competitive advantage. These are the "why codemapper?" capabilities.

---

### 3.1 Blast Radius Analysis

**Description:** When a user selects a file or function, highlight all nodes that would be affected by a change — both direct dependents (reverse imports) and transitive dependents (dependents of dependents). Show depth levels and a "blast radius score" (% of graph affected).

**Why it matters:**
- No existing static analysis tool visualizes transitive blast radius in an interactive graph
- dependency-cruiser only shows immediate dependents (in SVG output)
- emerge shows PR impact but not file-level blast radius
- This is the #1 question developers ask before refactoring: "what will break?"

**Implementation approach:**

```
Files to modify:
  src/graph/pathfinder.ts     — Add blastRadius() function (BFS/DFS from a node)
  src/server.ts               — Add GET /api/blast-radius?node=<id>&depth=<n>
  src/viewer/state.ts         — Add blastRadiusNodes, blastRadiusDepth state
  src/viewer/interaction.ts   — Add "Show blast radius" to context menu
  src/viewer/renderer.ts      — Highlight affected nodes with depth color gradient
  src/viewer/main.ts          — Wire up keyboard shortcut and toolbar button
  src/viewer/sidebar.ts       — Show blast radius summary in file inspector
  src/viewer/styles.css        — Add blast radius visual styles

Files to add:
  src/viewer/blast-radius.ts  — Client-side blast radius rendering + controls
```

**Algorithm:**
```
blastRadius(nodeId, depth = 3):
  1. Find all edges where target is nodeId (reverse imports + calls)
  2. For each such edge, mark source node at depth 1
  3. Recurse for each source node up to max depth
  4. Return list of { nodeId, depth, path }
```

**Estimated effort:** Medium (3–5 days)

**Dependencies:** None (pathfinder.ts already has BFS logic)

**Success criteria:**
- Right-click any node → "Show blast radius" → highlights transitive dependents
- Color gradient from red (depth 1) → orange → yellow → default (depth 3+)
- Tooltip on hover shows "Affected by change in X via Y → Z"
- Sidebar panel shows count: "42 nodes affected (12 directly, 30 transitively)"
- API returns `{ nodeId, depth, path }` for each affected node

---

### 3.2 CI Enforcement Rules

**Description:** Define dependency rules in `.codemapperrc.json` that are evaluated during `codemapper analyze`. Rules can forbid, warn, or allow dependency patterns. Exit code reflects violations, enabling CI gating. Integrates with the existing `--format json` output.

**Why it matters:**
- dependency-cruiser has this as its flagship feature — it's the #1 reason teams use it
- Architecture governance is a $0-to-paid conversion lever for developer tools
- No other graph visualizer combines interactive visualization + CI enforcement

**Implementation approach:**

```
Files to modify:
  src/config.ts               — Add rules validation + JSON schema
  src/analyze/index.ts        — Add rule evaluation after graph assembly
  src/cli.ts                  — Add --strict flag, exit code logic
  src/export.ts               — Include violations in JSON output, add --max-warnings
  src/server.ts               — Include violations in /api/analyze response

Files to add:
  src/graph/rules-engine.ts   — Rule matching engine
  tests/rules-engine.test.ts  — Tests for rule evaluation
```

**Config format:**
```json
{
  "rules": [
    { "from": "src/core/**", "to": "src/ui/**", "severity": "error" },
    { "from": "src/**", "to": "**/*.test.*", "severity": "warn" },
    { "from": "src/**", "to": "vendor/**", "severity": "forbidden" }
  ]
}
```

**Estimated effort:** High (5–8 days)

**Dependencies:** None (new module)

**Success criteria:**
- Rules engine evaluates glob patterns against dependency graph
- Violations appear in JSON output with `rule`, `severity`, `from`, `to`, `source`, `target`
- `codemapper analyze --strict` exits with code 1 on any error-severity violation
- `codemapper analyze --max-warnings <n>` exits with code 1 if warnings exceed threshold
- Viewer sidebar shows "3 rule violations" with clickable items
- Rules are validated against JSON schema on load

---

### 3.3 Health Score Dashboard

**Description:** A composite health score (0–100) for the codebase, computed from:
- **Cycle density** (% of files in cycles)
- **Instability distribution** (% of files with instability > 0.5)
- **Hotspot density** (% of files in top 20% of heat score)
- **Coupling excess** (% of files with fan-out > 20)
- **Unused exports** (% of exported symbols with 0 imports)

Display as a radar/spider chart in the viewer sidebar. Score degrades over time — track in `codemapper analyze --history` for trendlines.

**Why it matters:**
- No competitor provides a single-pane health score for codebase architecture
- Turns codemapper from a viewer into a **quality gate**
- Enables CI gates: "deploy only if health score > 70"

**Implementation approach:**

```
Files to modify:
  src/graph/analytics.ts       — Add computeHealthScore() function
  src/graph/index.ts           — Add HealthScore to types
  src/server.ts                — Include health score in /api/analyze
  src/viewer/state.ts          — Add healthScore state
  src/viewer/sidebar.ts        — Add health dashboard panel

Files to add:
  src/graph/health.ts          — Health score computation
  src/viewer/health-chart.ts   — Radar chart rendering (Canvas 2D)
  tests/health.test.ts         — Health score tests
  tests/fixtures/healthy/      — Test fixtures for score comparison
```

**Estimated effort:** Medium (4–6 days)

**Dependencies:** Tier 2 — Dead Code Analysis (for unused exports metric)

**Score formula:**
```
healthScore = 100 - (
  w1 * cycleDensity +
  w2 * instabilityRatio +
  w3 * hotspotRatio +
  w4 * couplingExcess +
  w5 * unusedExportRatio
) * 100
```

**Success criteria:**
- Viewer sidebar shows "Health: 74/100" with color (green > 80, yellow > 50, red < 50)
- Radar chart with 5 axes, interactive tooltips
- Top 3 negatives listed: "1. 12 files in cycles (-8 pts), 2. 8 files high coupling (-5 pts)..."
- `codemapper analyze --health` outputs JSON with score + breakdown
- History tracking: `~/.codemapper/history.json` stores scores for trendline

---

### 3.4 Tree-Sitter as Default Parser (Depth Upgrade)

**Description:** Upgrade tree-sitter from an optional `--deep` flag to the default parser for all supported languages. The regex-based parsers become the fallback. Ship WASM binaries for all languages with the npm package. Add tree-sitter grammars for PHP, C#, Swift, Ruby, and C/C++.

**Why it matters:**
- dependency-cruiser uses regex-based parsing and misses many relationships
- tree-sitter gives us **syntax-accurate** ASTs — better call graphs, type resolution, and metrics
- Enables future features: variable-level analysis, rename refactoring, etc.
- Shipping with the package eliminates the current friction of downloading WASM files

**Implementation approach:**

```
Files to modify:
  src/analyze/treesitter.ts   — Make primary, add 5 new language grammars
  src/analyze/index.ts        — Flip default: tree-sitter first, regex fallback
  src/analyze/typescript.ts   — Keep as fallback for TS/JS (tree-sitter TS is less mature)
  src/analyze/python.ts       — Keep as fallback
  src/analyze/rust.ts         — Keep as fallback
  src/analyze/go.ts           — Keep as fallback
  src/analyze/java.ts         — Keep as fallback
  src/cli.ts                  — Change --deep to --fast (opts into regex)
  src/config.ts               — Add parser: "auto" | "tree-sitter" | "regex"
  build-viewer.mjs            — Include WASM files in bundle

Files to add:
  wasm/tree-sitter-php.wasm         — PHP grammar
  wasm/tree-sitter-c-sharp.wasm     — C# grammar
  wasm/tree-sitter-swift.wasm       — Swift grammar
  wasm/tree-sitter-ruby.wasm        — Ruby grammar
  wasm/tree-sitter-c.wasm           — C grammar
  wasm/tree-sitter-cpp.wasm         — C++ grammar
  src/analyze/php.ts                — PHP regex fallback (existing in tests)
  src/analyze/csharp.ts             — C# regex fallback (existing in tests)
  src/analyze/swift.ts              — Swift regex fallback (existing in tests)
  tests/treesitter-depth.test.ts    — Comparison tests: regex vs tree-sitter
```

**Languages coverage after upgrade:**

| Language | Primary Parser | Fallback |
|---|---|---|
| TypeScript/JS | TypeScript Compiler API (stays) | tree-sitter |
| Python | tree-sitter | Regex |
| Rust | tree-sitter | Regex |
| Go | tree-sitter | Regex |
| Java | tree-sitter | Regex |
| PHP | tree-sitter | Regex |
| C# | tree-sitter | Regex |
| Swift | tree-sitter | Regex |
| Ruby | tree-sitter | Regex |
| C/C++ | tree-sitter | N/A |

**Estimated effort:** High (8–12 days)

**Dependencies:** None (tree-sitter infrastructure already exists)

**Success criteria:**
- `codemapper view .` uses tree-sitter by default (no `--deep` needed)
- 10 languages supported (up from 5)
- WASM grammars ship with the npm package (total ~8 MB)
- `--fast` flag uses regex parsers
- Parser comparison tests show tree-sitter captures 30%+ more edges than regex on average
- No regression in analysis time > 2x for codebases < 10K files

---

## 4. Tier 2: High Adoption Drivers

Features that directly impact daily developer workflow and drive word-of-mouth adoption.

---

### 4.1 Dead Code Detection

**Description:** Identify unused exports, unreachable functions, and orphan files. Show dead nodes with reduced opacity and a strikethrough label. Aggregate into a "Dead Code" panel in the sidebar with estimated deletion savings (LOC).

**Why it matters:**
- madge has `--orphan` detection — a widely used feature
- No tool visualizes dead code interactively
- Dead code removal is a universal developer satisfaction win
- Quantifiable metric: "You could delete 1,247 lines of dead code"

**Implementation approach:**

```
Files to modify:
  src/graph/analytics.ts      — Add detectDeadCode() function
  src/graph/index.ts          — Add DeadCodeReport type
  src/server.ts               — Include dead code in /api/analyze
  src/viewer/state.ts         — Add deadCodeIds set, showDeadCode toggle
  src/viewer/renderer.ts      — Render dead nodes with dimmed opacity
  src/viewer/interaction.ts   — Add "Hide dead code" toggle
  src/viewer/sidebar.ts       — Add dead code summary panel

Files to add:
  tests/dead-code.test.ts     — Dead code detection tests
```

**Detection algorithm:**
```
deadCode(graph):
  1. Collect all exported symbols (export maps already exist)
  2. Find exports with 0 incoming import edges
  3. Find file nodes with 0 incoming edges (orphan files)
  4. Find file nodes with 0 outgoing edges AND 0 incoming edges (isolated)
  5. Mark functions with no call edges AND not exported
```

**Estimated effort:** Medium (3–5 days)

**Dependencies:** None (edges + export maps already exist)

**Success criteria:**
- Dead nodes rendered at 30% opacity with strikethrough labels
- Sidebar shows "42 dead symbols across 12 files (~1,247 LOC could be removed)"
- Toggle "Show Dead Code" hides/shows dead nodes
- Left-click dead node shows "This export is never imported" in sidebar
- Export JSON includes `deadCode` section with file paths, symbols, LOC

---

### 4.2 Git Churn Visualization

**Description:** Already partially implemented (`src/git.ts`, `src/graph/analytics.ts`). Complete the integration: color nodes by churn frequency (blue = stable, red = churning), add a timeline slider to filter by recency, show churn sparklines in the sidebar, and add a "hotspot" layer combining churn + complexity.

**Why it matters:**
- emerge (acquired by Sentry) had git blame integration as its core differentiator
- No open-source code graph tool visualizes churn
- Churn + complexity = bug prediction (the "hotspot" pattern from "Your Code as a Crime Scene")

**Implementation approach:**

```
Files to modify:
  src/git.ts                  — Add getGitChurnForNodes() batch function (improve perf)
  src/analyze/index.ts        — Wire git data into analysis pipeline (--git flag)
  src/server.ts               — Pass git data in /api/analyze response
  src/viewer/state.ts         — Add churnMode, churnRange, timelinePosition
  src/viewer/colors.ts        — Add churn color scale (blue → white → red)
  src/viewer/renderer.ts      — Apply churn colors when churn mode active
  src/viewer/interaction.ts   — Add churn/timeline controls
  src/viewer/sidebar.ts       — Show churn sparkline for selected file
  src/cli.ts                  — Enable --git flag for view command

Files to add:
  src/viewer/timeline.ts      — Timeline slider component
  tests/git-integration.test.ts — End-to-end git churn tests
```

**Estimated effort:** Medium (4–6 days)

**Dependencies:** None (git.ts, analytics.ts already exist)

**Success criteria:**
- `codemapper view . --git` colors nodes by churn (6-month window by default)
- Timeline slider filters churn data to last N days (7, 30, 90, 180, 365)
- Hovering a node shows "Modified 12 times in 90 days | Last change: 3 days ago"
- Sidebar shows commit frequency sparkline (last 25 commits)
- Hotspot mode (combine churn + complexity) highlights risk areas
- Performance: < 2s overhead for a 5K-file repo

---

### 4.3 Code Ownership & Bus Factor

**Description:** Use git blame to compute per-file ownership (author with most lines/commits) and bus factor (minimum number of developers who could be hit by a bus before the project is unrecoverable). Show owner badges on nodes and a bus factor gauge in the sidebar.

**Why it matters:**
- Bus factor is a well-known concept but no tool visualizes it on the dependency graph
- Key insight for engineering managers and onboarding
- Differentiator: git blame data + graph = ownership clarity

**Implementation approach:**

```
Files to modify:
  src/git.ts                  — Add getOwnership() function
  src/analyze/index.ts        — Pass ownership data alongside churn
  src/server.ts               — Include ownership in /api/analyze response
  src/viewer/state.ts         — Add ownershipMode, ownerColors
  src/viewer/colors.ts        — Add owner-based color palette
  src/viewer/renderer.ts      — Color nodes by primary owner when ownership mode active
  src/viewer/sidebar.ts       — Show "Primary owner: @alice (73% of commits)"
  src/viewer/interaction.ts   — Add ownership mode toggle

Files to add:
  tests/ownership.test.ts     — Ownership computation tests
```

**Estimated effort:** Medium (3–5 days)

**Dependencies:** Tier 2 — Git Churn (shares git blame infrastructure)

**Success criteria:**
- Nodes colored by primary author (auto-assigned distinct colors)
- Sidebar shows owner stats: "Primary: @alice (34 commits, 73%), Secondary: @bob (8 commits)"
- Bus factor displayed for the project: "Bus factor: 3 (losing 3 people would block 80% of code)"
- Ownership mode toggle in toolbar
- Legend shows developer → color mapping

---

### 4.4 Fan-In / Fan-Out Hotspot Mode

**Description:** Currently computed in `analytics.ts` but not visually surfaced as a first-class mode. Add dedicated fan-in and fan-out visualization modes: node size proportional to fan-in (most imported = largest), color intensity for fan-out (high = "promiscuous" = warning). Add a "dependency diet" view showing only nodes with fan-in > threshold.

**Why it matters:**
- Core structural metric understood by all senior developers
- dependency-cruiser shows numeric values but no visual encoding
- Visual size encoding is the fastest way to identify "core" vs "leaf" modules

**Implementation approach:**

```
Files to modify:
  src/viewer/state.ts         — Add fanMode: 'fan-in' | 'fan-out' | 'off'
  src/viewer/renderer.ts      — Scale node radii by fan-in/fan-out values
  src/viewer/colors.ts        — Add fan-in/fan-out color scales
  src/viewer/interaction.ts   — Add fan mode shortcuts (already has 1-5 for hotspot)
  src/viewer/sidebar.ts       — Show top 10 fan-in/fan-out rankings
  src/viewer/main.ts          — Add keyboard shortcuts (6=fan-in, 7=fan-out)

Files to add:
  tests/fan-visual.test.ts    — Test fan size encoding correctness
```

**Estimated effort:** Low (2–3 days)

**Dependencies:** None (analytics.ts already computes fan-in/fan-out)

**Success criteria:**
- Press `6` → nodes scale by fan-in (core util modules become largest)
- Press `7` → nodes scale by fan-out (UI controllers become largest)
- Sidebar shows "Top 10 Most Imported" and "Top 10 Most Importing" lists
- Tooltip shows "utils.ts: fan-in=42 (imported by 42 files), fan-out=3"
- Filters: "Show nodes with fan-in > 10" isolates core modules

---

### 4.5 HTML Export with Interactive Widget

**Description:** Export a self-contained HTML file containing an embedded interactive graph (via a minimal Canvas 2D renderer inlined in the HTML). The HTML export includes search, filter toggles, zoom/pan, and the sidebar inspector — all in a single file with no external dependencies.

**Why it matters:**
- dependency-cruiser outputs static SVGs — not interactive
- HTML export enables: attaching graphs to PRs, sharing with non-technical stakeholders, embedding in documentation sites, offline review
- No competitor offers a single-file interactive HTML export

**Implementation approach:**

```
Files to modify:
  src/export.ts               — Add toHTML() export function
  src/cli.ts                  — Add --format html option to analyze command
  src/viewer/index.html       — Use as template for HTML export (strip server deps)
  build-viewer.mjs            — Produce a standalone viewer bundle for embedding

Files to add:
  tests/export-html.test.ts   — HTML export validation tests
  src/viewer/embed.ts         — Minimal viewer that works standalone (no WebSocket, no server API)
```

**Architecture:**
```
toHTML(result):
  1. Serialize graph data as JSON inside <script> tag
  2. Inline a minimal D3-free layout engine (grid-based, deterministic)
  3. Inline Canvas 2D renderer (stripped-down, ~15 KB minified)
  4. Inline CSS styles
  5. Output single .html file (typically 100-200 KB)
```

**Estimated effort:** High (5–8 days)

**Dependencies:** None (export.ts exists)

**Success criteria:**
- `codemapper analyze . --format html -o graph.html` produces a working interactive graph
- HTML file opens in any modern browser (no server, no HTTP)
- Supports: pan, zoom, node click → sidebar, search, kind filters, layout toggle
- File size < 250 KB for a 1,000-node graph
- No external network requests

---

## 5. Tier 3: Competitive Parity

Features that match what established competitors offer. Necessary to prevent "why not use X?" objections.

---

### 5.1 Multiple Layout Algorithms (Enhanced)

**Description:** Three layouts exist (force, hierarchical, grid) but lack polish. Add:
- **Radial/circular layout** for cycle visualization
- **Sugiyama improvements** (dagre already used, but add layer spacing, edge routing)
- **Sankey-style layout** for data-flow oriented codebases
- Layout persistence: remember per-codebase layout preference
- Layout transition animations (force-directed → hierarchical with tween)

**Why it matters:**
- dependency-cruiser outputs multiple SVG layout views
- Users expect layout variety for different analysis tasks
- Radial layout specifically helps understand circular dependencies

**Implementation approach:**

```
Files to modify:
  src/graph/layout.ts         — Add radial layout algorithm
  src/viewer/state.ts         — Add 'radial' to layoutMode union
  src/viewer/dagre-layout.ts  — Improve edge routing, add spacing options
  src/viewer/renderer.ts      — Add layout transition tweening
  src/viewer/interaction.ts   — Update layout cycle button
  src/viewer/main.ts          — Add keyboard shortcut for radial

Files to add:
  src/viewer/radial-layout.ts — Radial/circular layout implementation
  tests/layout-regression.test.ts — Layout determinism tests
```

**Estimated effort:** Medium (4–6 days)

**Dependencies:** None (layout.ts exists)

**Success criteria:**
- 4 layout modes: force, hierarchical, grid, radial
- Radial layout places cycle-participating nodes on a circle, others outside
- Layout transitions animate (300ms ease)
- Layout preference saved per project in `.codemapperrc.json`
- Hierarchical layout shows edge routing (curved paths) instead of straight lines

---

### 5.2 Collapsible Directory Clusters

**Description:** Directory clusters exist already (bounding boxes group files by parent directory). Add: collapse/expand clusters (click to hide children), nested directory nesting (>1 level), cluster-level metrics (total LOC, total imports/exports), and a tree-view sidebar as an alternative navigation method.

**Why it matters:**
- sourcetrail had this as a core UX pattern
- Large codebases (>500 files) become unreadable without collapsing
- CodeSee had directory folding as a key differentiator

**Implementation approach:**

```
Files to modify:
  src/viewer/minimap.ts       — Add collapsible cluster support
  src/viewer/state.ts         — Add collapsedClusters: Set<string>
  src/viewer/renderer.ts      — Skip rendering children of collapsed clusters
  src/viewer/interaction.ts   — Add double-click to toggle collapse
  src/viewer/sidebar.ts       — Add tree view panel

Files to add:
  src/viewer/tree-view.ts     — Sidebar directory tree
```

**Estimated effort:** Medium (4–6 days)

**Dependencies:** None (minimap.ts already computes clusters)

**Success criteria:**
- Double-click a directory cluster → children hide, cluster shows "+12 files hidden"
- Nested directories: `src/components/ui/` shows as nested collapsible clusters
- Tree view sidebar: click tree node → pan camera to that cluster
- Cluster header shows: "utils/ (8 files, 3,420 LOC, 42 imports)"
- Collapsed state persisted in URL hash

---

### 5.3 10+ Language Support (Full Depth)

**Description:** Extend language coverage from 5 to 12+ languages. The tree-sitter upgrade (Tier 1) adds PHP, C#, Swift, Ruby, C, C++. Add proper non-tree-sitter support for remaining languages using regex: Dart, Kotlin, Scala, Elixir, Lua.

**Why it matters:**
- dependency-cruiser supports 30+ languages via regex
- CodeSee supported 15+ languages
- Each new language unlocks a user segment

**Implementation approach:**

```
Files to add:
  src/analyze/dart.ts         — Dart parser (regex)
  src/analyze/kotlin.ts       — Kotlin parser (regex)
  src/analyze/scala.ts        — Scala parser (regex)
  src/analyze/elixir.ts       — Elixir parser (regex)
  src/analyze/lua.ts          — Lua parser (regex)

Files to modify:
  src/analyze/index.ts        — Register new languages
  src/analyze/utils.ts        — Add extension → language mapping
  README.md                    — Update supported languages table
  tests/parsers.test.ts       — Add parser tests

Files to add:
  tests/fixtures/dart/        — Dart test fixtures
  tests/fixtures/kotlin/      — Kotlin test fixtures
  tests/fixtures/scala/       — Scala test fixtures
  tests/fixtures/elixir/      — Elixir test fixtures
  tests/fixtures/lua/         — Lua test fixtures
```

**Estimated effort:** Medium (4–6 days)

**Dependencies:** Tier 1 — Tree-Sitter as Default (adds 6 languages); this tier adds 5 more

**Success criteria:**
- 12+ languages supported (TS/JS, Python, Rust, Go, Java, PHP, C#, Swift, Ruby, C/C++, Dart, Kotlin, Scala, Elixir, Lua)
- Each language parser has unit tests with fixtures
- Language auto-detection by extension works for all new languages
- All languages support at least: file nodes, function nodes, class nodes, import edges

---

### 5.4 Dependency Explanation (Pathfinder Enhancement)

**Description:** The pathfinder feature exists in MVP form (`src/viewer/pathfinder.ts`, `src/graph/pathfinder.ts`). Enhance it: show shortest path between any two nodes with edge labels explaining *why* the dependency exists, intermediate nodes clickable to refine the path, and a "Why does X depend on Y?" context menu entry.

**Why it matters:**
- dependency-cruiser has `--explain` that shows dependency paths in text
- sourcetrail showed dependency chains interactively
- This is the #2 question after "what will break?": "why does this depend on that?"

**Implementation approach:**

```
Files to modify:
  src/graph/pathfinder.ts     — Add path explanation (edge annotations)
  src/viewer/pathfinder.ts    — (already exists as hotspot.ts?) — Enhance UI
  src/viewer/interaction.ts   — Add "Why depends?" to context menu
  src/viewer/sidebar.ts       — Show path explanation panel
  src/viewer/state.ts         — Add pathExplanation state
  src/viewer/renderer.ts      — Highlight path with directional arrows

Files to add:
  tests/pathfinder.test.ts    — Path explanation tests
```

**Estimated effort:** Medium (3–5 days)

**Dependencies:** None (pathfinder.ts exists)

**Success criteria:**
- Right-click node A → "Why does B depend on A?" → Shows chain: B → C → D → A
- Each edge labeled with import/call reason: "B imports createUser from C → C imports db from D → D imports config from A"
- Path shown with directional arrows on the graph
- Click any intermediate node to "drill into" that sub-path
- Minimum-weight path algorithm (prefer fewer hops, prefer imports over calls)

---

### 5.5 Watch Mode (Production Polish)

**Description:** Watch mode exists (`--watch` flag) but uses `fs.watch` which has platform-specific issues (Linux `inotify` limits, macOS `fsevents` latency). Upgrade to:
- Chokidar (battle-tested file watcher) for cross-platform reliability
- Debounce with progress indicator in viewer ("Re-analyzing... 42/100 files")
- In-place graph updates (animate nodes in/out instead of full re-render)
- Respect `.gitignore` patterns during watch

**Why it matters:**
- emerge had real-time graph updates as a flagship feature
- dependency-cruiser has no watch mode — this is a competitive advantage
- Reliability issues in watch mode hurt credibility

**Implementation approach:**

```
Files to modify:
  src/server.ts               — Replace fs.watch with chokidar
  src/analyze/index.ts        — Add incremental analysis support
  src/viewer/main.ts          — Animate graph diff on refresh
  src/viewer/state.ts         — Add graphDiff state
  src/viewer/renderer.ts      — Add node enter/exit animations
  package.json                — Add chokidar dependency

Files to add:
  tests/watch-mode.test.ts    — Watch mode integration tests
```

**Estimated effort:** Medium (3–5 days)

**Dependencies:** None (watch mode exists, needs upgrade)

**Success criteria:**
- Watch mode works reliably on Linux, macOS, and Windows
- Progress percentage shown during re-analysis
- Added nodes animate in (scale 0 → 1), removed nodes fade out
- `.gitignore` patterns respected (no changes in `node_modules` trigger re-analysis)
- File watcher handles 10K+ file projects without hitting OS limits

---

## 6. Tier 4: Differentiation

Long-term moat-building features that create ecosystem lock-in and open new use cases.

---

### 6.1 VS Code Extension

**Description:** A VS Code extension that embeds the codemapper graph in a webview panel. Features: open graph for current workspace, click node → open file at line, sync editor selection with graph node highlight, and commands for "Show dependencies of current file" and "Show dependents of current file".

**Why it matters:**
- sourcetrail had a VS Code extension that was widely praised
- emerge started as a VS Code extension
- VS Code is where developers spend 90% of their time — codemapper must be there
- Creates distribution channel (VS Code Marketplace)

**Implementation approach:**

```
Files to add:
  vscode-ext/
    package.json              — Extension manifest
    src/extension.ts          — Extension entry point
    src/graph-panel.ts        — Webview panel manager
    src/commands.ts           — Command registration
    src/sync.ts               — Editor ↔ graph sync
    media/
      main.js                 — Webview script (reuse viewer)
      style.css               — Webview styles
    tsconfig.json

Files to modify:
  src/viewer/main.ts          — Detect VS Code webview mode, disable server-specific features
  src/server.ts               — Support VS Code's custom protocol
```

**Estimated effort:** High (6–10 days)

**Dependencies:** None (standalone extension)

**Success criteria:**
- `Cmd+Shift+P → Codemapper: Show Graph` opens graph panel for current workspace
- Click node in graph → VS Code opens file at correct line
- Select file in editor → corresponding node highlights in graph
- `Codemapper: Dependencies of Current File` and `Codemapper: Dependents of Current File` commands
- Extension uses local `codemapper` binary (or bundled version)
- Published on VS Code Marketplace

---

### 6.2 Monaco Editor Preview

**Description:** Embed a Monaco Editor (the VS Code editor component) inside the viewer sidebar for the file inspector. Replace the current `<pre>` syntax-highlighted view with a full editor featuring: line numbers, syntax highlighting via Monaco (same as VS Code), minimap, and hover tooltips showing dependency info.

**Why it matters:**
- Current sidebar uses basic `<pre>` with manual syntax highlighting — limited and inconsistent
- Monaco gives us VS Code-quality code rendering in the browser
- Enables future features: inline linting, hover for dependency info, click-to-navigate

**Implementation approach:**

```
Files to modify:
  src/viewer/sidebar.ts       — Replace <pre> with Monaco Editor
  src/viewer/index.html       — Add Monaco script tag (CDN or bundled)
  src/viewer/styles.css        — Monaco integration styles

Files to add:
  src/viewer/monaco-setup.ts  — Monaco initialization + codemapper theme
  src/viewer/monaco-hover.ts  — Custom hover provider for dependency info
```

**Estimated effort:** Medium (4–6 days)

**Dependencies:** Tier 4 — VS Code Extension (shared Monaco knowledge)

**Success criteria:**
- Sidebar shows file with full Monaco editor (syntax highlighting, line numbers, minimap)
- Hovering over an import shows "Imported by 3 files" tooltip
- Ctrl+Click on import → navigates to the imported file
- Editor uses codemapper's dark/light theme
- Monaco loads from CDN (no bundling) with fallback to `<pre>` view

---

### 6.3 Complexity & Code Health Metrics (Deep)

**Description:** Extend `src/graph/metrics.ts` with advanced metrics:
- **Cognitive complexity** (SonarSource model — nested control flow depth, not linear)
- **Halstead complexity** (volume, difficulty, effort, bugs estimate)
- **Chidamber-Kemerer metrics** for OO code (DIT, NOC, CBO, LCOM)
- **Dependency freshness** (age of npm/pip/cargo dependencies)
- **Test-to-code ratio** (lines of test / lines of production code)

Surface as a "Deep Metrics" panel in the sidebar with configurable thresholds.

**Why it matters:**
- No competitor visualizes code metrics on a graph
- Cognitive complexity is a stronger predictor of bugs than cyclomatic complexity
- Makes codemapper useful for code review, not just exploration

**Implementation approach:**

```
Files to modify:
  src/graph/metrics.ts        — Add cognitive complexity, Halstead, CK metrics
  src/graph/analytics.ts      — Integrate new metrics
  src/viewer/sidebar.ts       — Add deep metrics panel
  src/viewer/state.ts         — Add deepMetrics data
  src/viewer/renderer.ts      — Color nodes by cognitive complexity

Files to add:
  src/graph/cognitive.ts      — Cognitive complexity computation
  tests/cognitive.test.ts     — Cognitive complexity tests
  tests/metrics-depth.test.ts — Advanced metrics tests
```

**Estimated effort:** High (6–8 days)

**Dependencies:** Tier 1 — Tree-Sitter as Default (AST needed for cognitive complexity)

**Success criteria:**
- Cognitive complexity shown per function in sidebar
- Halstead volume, difficulty, effort shown per file
- OO metrics: DIT (depth of inheritance), NOC (number of children), CBO (coupling between objects)
- Dependency freshness: "lodash v4.17.21 (2 years old, 1 major version behind)"
- Test-to-code ratio: "src/util.ts: 3:1 test-to-code ratio (120 test lines, 40 code lines)"
- Configurable thresholds: "warn if cognitive complexity > 15"

---

### 6.4 PR Impact Analysis

**Description:** Given a branch name or commit range, analyze the diff and show:
- Files changed highlighted on the graph
- Blast radius of the changes (what else is affected)
- Risk score: (files changed × avg complexity × blast radius) / codebase health
- Comparison view: "Before" vs "After" health score
- Auto-generated summary: "This PR touches 5 files in the auth module with a blast radius of 12 files. Risk score: medium."

**Why it matters:**
- emerge's core feature was PR impact visualization
- No CLI tool offers PR impact analysis
- CI integration: `codemapper analyze --diff main...HEAD` for PR gates

**Implementation approach:**

```
Files to modify:
  src/cli.ts                  — Add --diff <range> option to analyze command
  src/analyze/index.ts        — Support diff-based analysis
  src/git.ts                  — Add getDiffFiles(), getDiffBlastRadius()
  src/server.ts               — Add /api/diff endpoint for viewer
  src/viewer/state.ts         — Add diffMode, changedFiles, blastRadius

Files to add:
  src/graph/diff.ts           — Diff analysis logic
  src/viewer/diff-view.ts     — Diff overlay rendering
  tests/diff.test.ts          — Diff analysis tests
```

**Estimated effort:** High (6–9 days)

**Dependencies:** Tier 1 — Blast Radius Analysis; Tier 2 — Git Churn

**Success criteria:**
- `codemapper analyze --diff main...HEAD` shows changed files in JSON/SVG output
- Changed files highlighted in yellow on the graph in viewer mode
- Blast radius of diff shown as overlay (files that would be affected)
- Risk score: low/medium/high with reasoning
- "Before vs After" health score comparison
- Works with GitHub CLI: `gh pr view --json headRefName | codemapper analyze --diff main...`

---

### 6.5 AI Dependency Explanation

**Description:** Integrate with local LLMs (via Ollama, llama.cpp) or cloud APIs (OpenAI, Anthropic) to generate natural-language explanations of:
- Why a circular dependency exists and how to fix it
- What a module does (summarize from its exports and dependencies)
- Refactoring suggestions: "These 3 utility files share 80% of exports; consider merging"
- Architecture documentation from the graph: "The auth module depends on db and session, but not on ui — this confirms clean separation."

**Why it matters:**
- No competitor offers AI-powered architecture explanations
- Turns codemapper from a "viewer" into an "architectural advisor"
- AI features drive press coverage and social sharing

**Implementation approach:**

```
Files to modify:
  src/analyze/index.ts        — Add AI analysis pass (opt-in)
  src/cli.ts                  — Add --ai flag, --ai-provider option
  src/config.ts               — Add ai: { provider, model, apiKey } config
  src/viewer/sidebar.ts       — Add AI insights panel
  src/viewer/state.ts         — Add aiInsights data

Files to add:
  src/graph/ai.ts             — AI integration (prompt construction, API calls)
  src/graph/prompts.ts         — Prompt templates for different analysis types
  tests/ai.test.ts            — AI integration tests (mock API)
```

**Privacy design:**
- Default: no AI (explicit `--ai` flag required)
- Local-first: auto-detect Ollama, fall back to OpenAI/Anthropic
- Send only structural data (node names, edge types), not file contents
- "Explain this graph" prompt can be fully offloaded to local LLM

**Estimated effort:** High (6–10 days)

**Dependencies:** Tier 1 — Health Score (gives AI something to analyze); Tier 3 — Dependency Explanation (adds context)

**Success criteria:**
- `codemapper analyze --ai` outputs natural-language architecture summary
- Viewer sidebar shows "AI Insights" panel with explanations
- "Explain this cycle" button on cycle-highlighted nodes
- Works with Ollama out of the box (no API key needed)
- Configurable model/provider in `.codemapperrc.json`
- All AI operations stream results (SSE in viewer, streaming stdout in CLI)

---

### 6.6 Saved Layouts & Shareable URLs

**Description:** Persist complete view state (zoom, pan, filters, layout mode, hidden kinds, collapsed clusters, selected node, hotspot mode) as:
- **Named layouts**: save/load named views with keyboard shortcuts
- **Shareable URLs**: encoded state in URL hash (already partially implemented in `url-state.ts`)
- **Local storage**: auto-save last view per project
- **Export/import**: share layouts as JSON files via team config

**Why it matters:**
- Developers spend time re-finding the same views
- sourcetrail had "bookmarks" as a praised feature
- Shareable URLs enable collaboration: "Here's the dependency view for the auth module"
- Low effort, high perceived value

**Implementation approach:**

```
Files to modify:
  src/viewer/url-state.ts     — Extend encoding to cover all state (filters, collapsed, etc.)
  src/viewer/state.ts         — Add savedLayouts: Map<string, ViewState>
  src/viewer/interaction.ts   — Add layout save/load UI
  src/viewer/main.ts          — Add shortcut: Ctrl+S = save, Ctrl+L = load

Files to add:
  tests/url-state.test.ts     — URL state round-trip tests
```

**State to encode:**
```typescript
interface ViewState {
  layout: 'force' | 'hierarchical' | 'grid' | 'radial';
  zoom: number;
  panX: number;
  panY: number;
  hiddenKinds: string[];
  collapsedClusters: string[];
  selectedNodeId: string | null;
  hotspotMode: string;
  theme: 'dark' | 'light';
  colorblind: boolean;
  showCycles: boolean;
  showDeadCode: boolean;
}
```

**Estimated effort:** Low (2–3 days)

**Dependencies:** None (url-state.ts exists)

**Success criteria:**
- URL hash encodes full view state (copy/paste to share)
- Ctrl+S → "Save layout as..." → named layout stored in localStorage
- Ctrl+L → list of saved layouts → click to restore
- Layouts persist across sessions
- Export layout → JSON file; Import from JSON file
- URL state works across machines (same git repo, same relative paths)

---

## 7. Timeline Estimate

### 7.1 Phased Delivery

| Phase | Tiers | Features | Estimated Duration | Team Size |
|---|---|---|---|---|
| **Phase 1: Foundation** | Tier 1 (partial) + Quick Wins & Tier 2 (partial) | Blast Radius, Dead Code, Fan-in/out, Quick Wins | 4–6 weeks | 1–2 devs |
| **Phase 2: Core Value** | Tier 1 + Tier 2 | Tree-sitter default, CI Rules, Git Churn, Code Ownership, HTML Export | 6–8 weeks | 1–2 devs |
| **Phase 3: Parity** | Tier 3 | Multiple Layouts, Collapsible Clusters, 10+ Languages, Pathfinder, Watch Mode | 4–6 weeks | 1–2 devs |
| **Phase 4: Moat** | Tier 4 + Health Score | Health Score Dashboard, VS Code Extension, Monaco Preview, Complexity Metrics, Saved Layouts | 6–10 weeks | 2–3 devs |
| **Phase 5: AI & PR** | Tier 4 (remaining) | PR Impact Analysis, AI Explanation | 4–6 weeks | 1–2 devs |

**Total estimated timeline: 24–36 weeks (6–9 months)**

### 7.2 Effort Summary

| Feature | Tier | Effort | Phase |
|---|---|---|---|
| Blast Radius Analysis | 1 | Medium (3–5d) | 1 |
| CI Enforcement Rules | 1 | High (5–8d) | 2 |
| Health Score Dashboard | 1 | Medium (4–6d) | 4 |
| Tree-Sitter as Default | 1 | High (8–12d) | 2 |
| Dead Code Detection | 2 | Medium (3–5d) | 1 |
| Git Churn Visualization | 2 | Medium (4–6d) | 2 |
| Code Ownership & Bus Factor | 2 | Medium (3–5d) | 2 |
| Fan-In/Fan-Out Hotspot | 2 | Low (2–3d) | 1 |
| HTML Export | 2 | High (5–8d) | 2 |
| Multiple Layout Algorithms | 3 | Medium (4–6d) | 3 |
| Collapsible Clusters | 3 | Medium (4–6d) | 3 |
| 10+ Languages | 3 | Medium (4–6d) | 3 |
| Dependency Explanation | 3 | Medium (3–5d) | 3 |
| Watch Mode Polish | 3 | Medium (3–5d) | 3 |
| VS Code Extension | 4 | High (6–10d) | 4 |
| Monaco Editor Preview | 4 | Medium (4–6d) | 4 |
| Complexity Metrics (Deep) | 4 | High (6–8d) | 4 |
| PR Impact Analysis | 4 | High (6–9d) | 5 |
| AI Explanation | 4 | High (6–10d) | 5 |
| Saved Layouts & URLs | 4 | Low (2–3d) | 4 |

---

## 8. Quick Wins

Features implementable in < 1 day that deliver immediate value.

| # | Feature | Effort | Description | File Changes |
|---|---|---|---|---|
| 1 | **Port validation** | 30 min | Validate `--port` is 1–65535 | `src/cli.ts` |
| 2 | **Default host 127.0.0.1** | 15 min | Bind to localhost by default (security) | `src/server.ts` |
| 3 | **Content-Type headers** | 15 min | Set `Content-Type: application/json` on API responses | `src/server.ts` |
| 4 | **ReDoS protection** | 2 hours | Validate regex patterns, reject nested quantifiers | `src/config.ts` |
| 5 | **Config JSON Schema validation** | 3 hours | Validate `.codemapperrc.json` against schema on load | `src/config.ts` |
| 6 | **Docker non-root user** | 30 min | Add `USER` directive and `HEALTHCHECK` | `Dockerfile` |
| 7 | **Progress reporting** | 4 hours | Show "Parsed 42/100 files..." during analysis | `src/analyze/index.ts`, `src/cli.ts` |
| 8 | **Viewport culling** | 3 hours | Skip drawing nodes outside visible bounds in Canvas 2D | `src/viewer/renderer.ts` |
| 9 | **RAFrame throttling for mousemove** | 1 hour | Throttle interaction handler with `requestAnimationFrame` | `src/viewer/interaction.ts` |
| 10 | **Colorblind-safe palette** | 4 hours | Add toggleable colorblind mode (Wong palette) | `src/viewer/colors.ts`, `main.ts` |
| 11 | **Quadtree hit testing** | 4 hours | Replace O(n) linear scan with d3.quadtree for mouse events | `src/viewer/interaction.ts` |
| 12 | **WebGL buffer reuse** | 3 hours | Cache Float32Arrays, use `bufferSubData` instead of recreate | `src/viewer/renderer.ts` |
| 13 | **Keyboard shortcuts** | 2 hours | Add `?` for help dialog, `Home` for reset zoom, Tab for focus cycling | `src/viewer/main.ts` |
| 14 | **Touch long-press context menu** | 3 hours | Add long-press detection for mobile context menu | `src/viewer/interaction.ts` |
| 15 | **npm audit in CI** | 1 hour | Add `npm audit` step to CI workflow | `.github/workflows/ci.yml` |

**Total quick-win effort: ~1.5 days** — all 15 items can be completed in less than 2 focused days.

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tree-sitter WASM size bloats npm package | Medium | Medium | Publish grammars as optional `@codemapper/grammars-*` packages |
| VS Code extension review delays | Medium | Low | Follow marketplace guidelines strictly; automated packaging |
| AI API costs for cloud providers | Low | Medium | Local LLM as default (Ollama); user-provided keys for cloud |
| Watch mode reliability on macOS | Low | Medium | Use chokidar (battle-tested); extensive platform testing |
| Browser compatibility for HTML export | Low | Medium | Test on Chrome, Firefox, Safari, Edge; polyfill Canvas 2D as needed |
| Dead code detection false positives | Medium | Medium | Dynamic imports and re-exports are hard to statically analyze; document limitations |
| PR impact analysis scope creep | Medium | Medium | Ship v1 with basic diff file highlighting; add blast radius in v2 |

---

## 10. Appendix: Competitor Landscape

### 10.1 Feature Comparison Matrix

| Feature | Codemapper (Current) | Codemapper (Target) | dependency-cruiser | madge | emerge | CodeSee |
|---|---|---|---|---|---|---|
| Interactive graph | ✅ | ✅ | ❌ (SVG) | ❌ (text) | ✅ | ✅ |
| Cycle detection | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| CI integration | ⚠️ (exit codes) | ✅ (rules engine) | ✅ | ❌ | ❌ | ❌ |
| Dead code | ❌ | ✅ | ❌ | ✅ (orphans) | ❌ | ❌ |
| Git churn/blame | ⚠️ (partial) | ✅ | ❌ | ❌ | ✅ | ❌ |
| Code metrics | ⚠️ (basic) | ✅ (deep) | ❌ | ❌ | ❌ | ❌ |
| AI explanation | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| PR impact | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| VS Code extension | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Watch mode | ✅ | ✅ (polished) | ❌ | ❌ | ❌ | ❌ |
| HTML export | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 10+ languages | ⚠️ (5) | ✅ (12+) | ✅ (30+) | ✅ (5+) | ✅ (15+) | ✅ (15+) |
| Multiple layouts | ✅ (3) | ✅ (4 + transitions) | ❌ | ❌ | ❌ | ❌ |
| Collapsible clusters | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |

### 10.2 Key References

- **dependency-cruiser**: the gold standard for dependency governance. Primary competitor for CI use cases.
- **madge**: simple, focused, great for quick cycle + orphan detection.
- **emerge** (acquired by Sentry): set the bar for PR impact and git integration.
- **sourcetrail** (discontinued): set the bar for UX, collapsible trees, and interactive exploration.
- **CodeSee** (acquired/defunct): proved there's demand for visual code maps.

---

*This is a living document. Update as features are completed, priorities shift, or competitive landscape changes.*

*Last updated: 2026-07-17*
