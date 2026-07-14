import {
  nodes,
  searchTerm,
  matchedNodes,
  hiddenKinds,
  transform,
  setSearchTerm,
  setMatchedNodes,
  ViewNode,
} from './state.js';
import { render } from './renderer.js';
import { selectNode } from './sidebar.js';
import { LODLevel, currentLOD } from './state.js';

const searchInput = document.getElementById('search-input') as HTMLInputElement;
const searchCount = document.getElementById('search-count')!;
const container = document.getElementById('canvas-container')!;

export function initSearch() {
  searchInput.addEventListener('input', (e: Event) => doSearch((e.target as HTMLInputElement).value));
  searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && matchedNodes.length > 0) selectNode(matchedNodes[0]);
    if (e.key === 'Escape') {
      searchInput.blur();
      searchInput.value = '';
      doSearch('');
    }
    e.stopPropagation();
  });
}

function doSearch(term: string) {
  setSearchTerm(term.toLowerCase().trim());
  setMatchedNodes([]);
  if (!searchTerm) {
    searchCount.textContent = '';
    searchCount.className = '';
    render();
    return;
  }
  // Search across ALL nodes regardless of LOD level (search finds nodes even if not rendered)
  const visible = nodes.filter((n) => !hiddenKinds[n.kind]);
  const matches = visible.filter(
    (n) => n.label.toLowerCase().includes(searchTerm) || n.filePath.toLowerCase().includes(searchTerm),
  );
  setMatchedNodes(matches);
  searchCount.textContent = matches.length ? String(matches.length) : '0';
  searchCount.className = matches.length ? 'has-results' : '';

  if (matches.length === 1) {
    panToNode(matches[0]);
  } else if (matches.length > 1) {
    const xs: number[] = [],
      ys: number[] = [];
    for (const n of matches) {
      if (n.x != null) xs.push(n.x);
      if (n.y != null) ys.push(n.y);
    }
    if (xs.length && ys.length) {
      const minX = Math.min(...xs),
        maxX = Math.max(...xs);
      const minY = Math.min(...ys),
        maxY = Math.max(...ys);
      const gcx = (minX + maxX) / 2,
        gcy = (minY + maxY) / 2;
      const pad = 150;
      const sx = container.clientWidth / (maxX - minX + pad * 2);
      const sy = container.clientHeight / (maxY - minY + pad * 2);
      const k = Math.min(sx, sy, 2);
      transform.k = Math.max(k, 0.1);
      transform.x = container.clientWidth / 2 - gcx * transform.k;
      transform.y = container.clientHeight / 2 - gcy * transform.k;
      updateZoomLevel();
    }
  }
  render();
}

function panToNode(node: ViewNode) {
  if (!node.x || !node.y) return;
  const targetK = Math.min(1.5, 1200 / Math.max(container.clientWidth, container.clientHeight));
  transform.k = targetK;
  transform.x = container.clientWidth / 2 - node.x * transform.k;
  transform.y = container.clientHeight / 2 - node.y * transform.k;
  updateZoomLevel();
  render();
}

function updateZoomLevel() {
  const el = document.getElementById('zoom-level');
  if (el) el.textContent = Math.round(transform.k * 100) + '%';
}
