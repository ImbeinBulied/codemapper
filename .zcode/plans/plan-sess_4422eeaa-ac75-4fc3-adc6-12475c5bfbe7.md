## Plan: Declutter the viewer UI

Three pains to address: too many toolbar buttons, lost on canvas, unreadable graph. Direction: declutter & group (no feature removal).

### 1. Relabel + regroup the toolbar — `src/viewer/index.html`, `src/viewer/styles.css`

**Keep primary (used while exploring):** brand · search · stats · node-type filters · cycles · layout.

- **Relabel the 5 cryptic filter chips** to short readable words + keep icons optional:
  - `F` → `Files`, `fn` → `Funcs`, `C` → `Classes`, `I` → `Iface`, `T` → `Types`
  - Add a tiny group label "Filter:" before them so the purpose is obvious.
  - No logic change — same `data-kind`, same `window.toggleFilter`, `.hidden-kind` state still works.

**Move secondary (rarely changed) into a "⋮ More" dropdown** — one button replaces four:
- Theme 🌙, Colorblind ◐, Hotspot 🔥 (+ its 5-mode submenu), Export ▾
- Reuses existing dropdown pattern (CSS already has `#export-dropdown`, `#hotspot-menu` as models). All existing `window.*` handlers stay; only the DOM container changes.

**Net:** bar drops from ~15 controls to ~8 visible + 1 "More". No more horizontal scroll on normal screens.

### 2. Add "Fit to view" — fixes "lost on canvas" — `src/viewer/interaction.ts`, `index.html`, `styles.css`

Add `fitToView()` next to `resetZoom` (`interaction.ts:678`):
- Compute bounding box of all positioned nodes, set `transform.k` to fit (capped at 2×), center it.
- Stop the sim if running, call `updateZoomLevel()` + `render()`.
- Add a `⊟ Fit` button in the existing `#zoom-badge` (bottom-left) next to `1:1`.

This is the one button that recovers you when the graph has flown off-screen.

### 3. Declutter node labels — fixes "unreadable graph" — `src/viewer/renderer.ts:645-655`

Replace "always label at k>0.3" with zoom-tiered labeling:
- `k >= 0.8`: show all labels (current behavior at high zoom)
- `0.5 <= k < 0.8`: label only `file` + `class` nodes (the anchors you navigate by)
- `k < 0.5`: no ambient labels — rely on cluster blobs (already drawn) + hover
- **Always** label hovered/selected/focused/matched nodes regardless of zoom (unchanged).

Pure render-branch change, ~10 lines. No state or test impact.

### 4. Polish the help hint — `index.html`, `styles.css`

- Update `#help-hint` text to mention the new **Fit** button: `Scroll zoom · Drag pan · Click inspect · ⊟ fit · ? shortcuts`
- Give it a brief attention pulse on first load (CSS `@keyframes`, fades to current 0.7 opacity after ~6s). Non-blocking, purely discoverability.

### Out of scope (deliberately)
- Not touching force-sim parameters (charge/distance) — the label fix + fit-to-view already address readability without risking a different layout regression.
- Not restructuring the sidebar, minimap, legend, or pathfinder — those weren't called out as confusing.
- No backend/parser/test changes. All existing tests (`tsc`, vitest, eslint, prettier) should stay green; I'll verify with `scripts/check.sh` at the end.

### Verification
After edits: run `npx tsc --noEmit`, `npm run build`, `npx vitest run`, `npx eslint src/`, `npx prettier --check 'src/**/*.ts'`. Then restart the viewer on `tests/fixtures` and eyeball the new toolbar + label behavior in the browser.