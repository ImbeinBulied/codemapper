# Codemapper — Full System Verification

> Comprehensive check: code quality, tests, build, runtime, security, features.
> Feed this to OpenCode orchestrator for parallel subagent-driven verification.

---

## Overview

Project: `~/Desktop/codemap/codemapper`
Stack: TypeScript, Express, D3, dagre, Canvas 2D + WebGL, esbuild, vitest
Current count: 278 tests in 18 files, ~6,000+ source lines

### Agent Setup

- **Orchestrator** (read-only) — routes to 3 parallel subagents below
- **Agent 1: Backend & Build** — CLI, server, parsers, tests, security
- **Agent 2: Viewer & Rendering** — Canvas 2D/WebGL, LOD, workers, pathfinder, hotspot
- **Agent 3: Infrastructure & Data** — Git integration, analytics, config, Docker

All agents run from project root: `~/Desktop/codemap/codemapper`

---

## Phase 1: Build Verification

> Run these checks FIRST before anything else. If build fails, abort and report.

### 1.1 TypeScript Compilation
```bash
cd ~/Desktop/codemap/codemapper && npx tsc --noEmit 2>&1
```
**Pass criteria:** No errors (pre-existing errors in node_modules/* are OK).
**Fail:** Any error in `src/` or `tests/` files.

### 1.2 Viewer Bundle (esbuild)
```bash
cd ~/Desktop/codemap/codemapper && node build-viewer.mjs 2>&1
```
**Pass criteria:** Prints "Viewer bundle built: dist/viewer/bundle.js"
**Check:** `ls -la dist/viewer/bundle.js dist/viewer/workers/layout.worker.js dist/viewer/workers/parser.worker.js`

### 1.3 Full Build
```bash
cd ~/Desktop/codemap/codemapper && npm run build 2>&1
```
**Pass criteria:** tsc + esbuild viewer + asset copy all succeed, exit code 0.

---

## Phase 2: Test Suite

### 2.1 Run All Tests
```bash
cd ~/Desktop/codemap/codemapper && npx vitest run 2>&1
```
**Pass criteria:** 18 test files, 278 tests, 0 failures.
**Check last line:** "Tests 278 passed (278)"

### 2.2 Specific Test Areas
If Phase 2.1 fails, run each test file individually and report which fails:

```bash
npx vitest run tests/security.test.ts        # 25 tests — security headers, rate limit, traversal, ReDoS
npx vitest run tests/pathfinder.test.ts      # 23 tests — BFS, Dijkstra, cycles, edge cases
npx vitest run tests/worker-protocol.test.ts # 16 tests — worker protocol, message types
npx vitest run tests/git.test.ts             # git churn, path injection, hotspot scoring
npx vitest run tests/hotspot.test.ts         # if exists — hotspot visualization
npx vitest run tests/server-api.test.ts      # 8 tests — API endpoints, rate limit
npx vitest run tests/integration.test.ts     # 8 tests — full integration
npx vitest run tests/export.test.ts          # SVG/JSON export
npx vitest run tests/parser-stress.test.ts   # adversarial parser stress tests
npx vitest run tests/layout.test.ts          # if exists — layout algorithms
npx vitest run tests/analytics.test.ts       # if exists — graph analytics
```

---

## Phase 3: Code Quality

### 3.1 Format Check
```bash
cd ~/Desktop/codemap/codemapper && npx prettier --check 'src/' 'tests/' 2>&1
```
**Pass criteria:** "All matched files use Prettier code style!"

### 3.2 ESLint
```bash
cd ~/Desktop/codemap/codemapper && npx eslint 'src/' 'tests/' 2>&1
```
**Pass criteria:** No errors. Warnings allowed but report them.

### 3.3 Pattern Scan (Code Smells)
```bash
# Type safety issues
rg '(as any|// @ts-(ignore|expect))' src/ --no-heading -n | head -20

# Debug artifacts
rg '(console\.log|console\.debug|FIXME|TODO|HACK|XXX|debugger)' src/ --no-heading -n | head -20

# Test quality
rg '(\.only\(|\.skip\(|fit\(|xit\()' tests/ --no-heading -n | head -10

# Empty catch blocks
rg 'catch\s*\{[^}]*\}' src/ --no-heading -n | head -10
```

### 3.4 Type Coverage (Optional)
```bash
cd ~/Desktop/codemap/codemapper && npx tsc --noEmit --strict 2>&1 | head -20
```
**Note:** Might fail on strict mode — that's OK. Report how many errors.
If passing, the project is already type-safe.

---

## Phase 4: Runtime Verification

### 4.1 Start Server
```bash
cd ~/Desktop/codemap/codemapper && timeout 15 node dist/cli.js view ~/Desktop/codemap/codemapper --port 5002 --no-open 2>&1
```
**Pass criteria:** Server starts, prints "Viewer running at http://127.0.0.1:5002"

### 4.2 Hit API Endpoints
In a separate terminal (or background the server):

```bash
# Analyze (main endpoint)
curl -s http://127.0.0.1:5002/api/analyze | head -c 500
# Expected: valid JSON with graph, stats, cycles

# File content
curl -s 'http://127.0.0.1:5002/api/file?path=README.md' | head -c 200
# Expected: valid JSON with path + lines array

# Security: path traversal
curl -s 'http://127.0.0.1:5002/api/file?path=../../etc/passwd'
# Expected: 403

# Security: rate limit
for i in $(seq 1 35); do curl -s -o /dev/null -w "%{http_code} " http://127.0.0.1:5002/api/analyze; done
# Expected: first 30 = 200, last 5 = 429

# Security headers
curl -sI http://127.0.0.1:5002/ | grep -iE 'content-security-policy|x-content-type-options|strict-transport-security'
# Expected: all headers present
```

### 4.3 Build Viewer Static
```bash
ls -la dist/viewer/index.html dist/viewer/bundle.js dist/viewer/styles.css dist/viewer/d3.min.js
```
**Pass criteria:** All files exist and are non-zero size.

### 4.4 CLI Analyze Command
```bash
cd ~/Desktop/codemap/codemapper && timeout 10 node dist/cli.js analyze . --format json --output /tmp/codemap-test.json 2>&1 && head -c 300 /tmp/codemap-test.json
```
**Pass criteria:** Valid JSON output written to /tmp/codemap-test.json

---

## Phase 5: Feature Verification

### 5.1 Web Workers
- [ ] `src/viewer/workers/protocol.ts` exists with `WorkerRequest`/`WorkerResponse` types
- [ ] `src/viewer/workers/layout.worker.ts` bundles dagre independently
- [ ] `src/viewer/workers/parser.worker.ts` loads tree-sitter WASM
- [ ] `src/viewer/worker-manager.ts` has `terminateAllWorkers()` for cleanup
- [ ] `build-viewer.mjs` has esbuild entries for both workers
- [ ] `index.html` no longer loads `dagre.min.js` as global script

### 5.2 Git Churn & Hotspot
- [ ] `src/git.ts` uses `child_process.execFile` (NOT `exec`)
- [ ] `src/git.ts` has path traversal guard
- [ ] `src/graph/metrics.ts` computes `H_n = α * C_norm + β * F_norm`
- [ ] `src/viewer/hotspot.ts` has non-linear color scale (Magma/Viridis)
- [ ] CLI `--git` flag exists for analysis
- [ ] Tests at `tests/git.test.ts` verify against mock git repo

### 5.3 Pathfinder
- [ ] `src/graph/pathfinder.ts` has BFS and Dijkstra
- [ ] State vars: `selectedSourceNode`, `selectedTargetNode`, `pathfinderActive`, `activePath`, `reachableNodes`
- [ ] Shift+Click interaction for source/target
- [ ] Path highlighting at 1.0 opacity, all others at 0.15
- [ ] Animated particles along active path edges
- [ ] Right-click context menu options: "Trace dependencies", "Trace dependents"
- [ ] Keyboard shortcut: P to toggle pathfinder
- [ ] Sidebar shows path length, node list, coupling score
- [ ] 23 tests in `tests/pathfinder.test.ts` all pass

### 5.4 LOD Rendering
- [ ] Three LOD levels: CLUSTER, MODULE, DETAILED
- [ ] LOD indicator in status bar
- [ ] Cluster blobs at zoom < 0.2
- [ ] Module-level at zoom 0.2-0.5

### 5.5 Security
- [ ] Helmet middleware installed and active
- [ ] CSP header present
- [ ] Rate limiting: 30 req/min on /api/analyze
- [ ] Path traversal guard on /api/file (double-checked: string prefix + realpath)
- [ ] ReDoS protection via `validateRegex()`
- [ ] Binary file detection
- [ ] File size limit (1MB)
- [ ] WebSocket origin validation
- [ ] Docker: non-root user, healthcheck
- [ ] 25 security tests pass

---

## Phase 6: CI & Infrastructure

### 6.1 GitHub Actions
- [ ] `.github/workflows/` exists
- [ ] CI workflow runs vitest
- [ ] CodeQL workflow runs

### 6.2 Docker
```bash
cd ~/Desktop/codemap/codemapper && docker build -t codemapper-test . 2>&1 | tail -5
```
**Note:** Docker may use network. Skip if Docker daemon unavailable.

### 6.3 Package.json Audit
```bash
cd ~/Desktop/codemap/codemapper && npm audit 2>&1
```
**Pass criteria:** 0 vulnerabilities. Report any findings.

---

## Reporting Format

After all checks, produce a structured report:

```markdown
# Codemapper — Full System Verification Report

## Status: ✅ PASS / ❌ FAIL / ⚠️ WARNINGS

### Build: [✅/❌]
- tsc --noEmit: [PASS/FAIL]
- esbuild viewer: [PASS/FAIL]
- npm run build: [PASS/FAIL]

### Tests: [X/Y pass]
| Test File | Result |
|-----------|--------|
| security.test.ts | ✅ (25/25) |

### Code Quality: [✅/❌]
- Prettier: [PASS/FAIL]
- ESLint: [PASS/FAIL]
- as any casts: [COUNT]

### Runtime: [✅/❌]
- Server starts: [PASS/FAIL]
- /api/analyze: [PASS/FAIL]
- /api/file: [PASS/FAIL]
- Security headers: [PASS/FAIL]
- Rate limiting: [PASS/FAIL]

### Features: [N/M verified]
- Web Workers: [X/6]
- Git Churn: [X/6]
- Pathfinder: [X/9]
- LOD: [X/3]
- Security: [X/10]

### Verdict: [ALL GOOD / MINOR ISSUES / BLOCKING]
[List any failures here]
```

---

## Fix Order (if issues found)

1. **Build failures** — fix first, nothing else can be verified
2. **Test failures** — fix next, trace each failing test
3. **Runtime failures** — server start, API endpoints
4. **Code quality** — format, lint, type issues
5. **Feature gaps** — missing implementations
6. **Security** — header missing, traversal bypass, etc.

---

## Deliverable

At the end, the orchestrator should produce:
1. The verification report (above format)
2. A `OPENCODE-VERIFIED.md` status file written to project root
3. If failures found, a `FIX-PROMPT.md` with per-issue fix instructions
4. If all pass, a single-line commit: `chore: full system verification — all checks passed`
