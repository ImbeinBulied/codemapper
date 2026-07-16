import { selectedNode, nodes, setSelectedNode, ViewNode } from './state.js';
import { render } from './renderer.js';
import {
  pathfinderActive,
  activePath,
  selectedSourceNode,
  selectedTargetNode,
  reachableNodes,
  nodeMap,
  nodes as allNodes,
  setSelectedSourceNode,
  setSelectedTargetNode,
  setActivePath,
  setReachableNodes,
  setPathfinderActive,
} from './state.js';

let sidebar = document.getElementById('sidebar')!;
let sidebarHeader = document.getElementById('sidebar-header')!;
let sidebarContent = document.getElementById('sidebar-content')!;

// Track legend for sidebar shift
let legend = document.getElementById('legend')!;

export function selectNode(node: ViewNode) {
  if (selectedNode === node) {
    closeSidebar();
    return;
  }
  setSelectedNode(node);
  render();

  sidebarHeader.innerHTML =
    '<span class="label">' +
    escapeHtml(node.kind) +
    '</span>' +
    '<span class="name">' +
    escapeHtml(node.label) +
    '</span>' +
    '<button class="close" onclick="closeSidebar()">✕</button>';

  sidebarContent.innerHTML = '<div style="padding:16px;color:#8b949e">Loading...</div>';
  sidebar.classList.add('open');
  legend.classList.add('shifted-right');

  fetch('/api/file?path=' + encodeURIComponent(node.filePath))
    .then((r) => r.json())
    .then((data) => {
      sidebarContent.innerHTML = data.lines
        .map((l: any, i: number) => {
          const hl = i + 1 >= node.line - 20 && i + 1 <= node.line + 20 ? ' highlight' : '';
          return (
            '<div class="line' +
            hl +
            '"><span class="line-num">' +
            l.line +
            '</span><span class="line-code">' +
            highlightSyntax(escapeHtml(l.text)) +
            '</span></div>'
          );
        })
        .join('');
      const hlLine = sidebarContent.querySelector('.line.highlight');
      if (hlLine) hlLine.scrollIntoView({ block: 'center', behavior: 'smooth' });
    })
    .catch(() => {
      sidebarContent.innerHTML = '<div style="padding:16px;color:#f85149">Failed to load file</div>';
    });
}

(window as any).closeSidebar = function () {
  closeSidebar();
};

export function closeSidebar() {
  setSelectedNode(null);
  // Clear pathfinder state when closing sidebar
  if (pathfinderActive) {
    setSelectedSourceNode(null);
    setSelectedTargetNode(null);
    setActivePath([]);
    setReachableNodes(new Set());
    setPathfinderActive(false);
  }
  sidebar.classList.remove('open');
  legend.classList.remove('shifted-right');
  render();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Display pathfinder information in the sidebar. */
export function showPathInfo() {
  if (!pathfinderActive) return;

  if (activePath.length > 0) {
    // Show shortest path info
    const hops = activePath.length - 1;
    const couplingTotal = computePathCoupling(activePath);
    let html =
      '<div class="pathfinder-panel">' +
      '<div class="pathfinder-header">' +
      '<span class="pathfinder-title">📌 Pathfinder</span>' +
      '<button class="pathfinder-clear" onclick="window.clearPathfinder()">✕</button>' +
      '</div>' +
      '<div class="pathfinder-stats">' +
      '<span class="stat"><b>' +
      hops +
      '</b> hop' +
      (hops !== 1 ? 's' : '') +
      '</span>' +
      '<span class="stat"><b>' +
      activePath.length +
      '</b> node' +
      (activePath.length !== 1 ? 's' : '') +
      '</span>';
    if (couplingTotal > 0) {
      html += '<span class="stat"><b>' + couplingTotal.toFixed(1) + '</b> coupling</span>';
    }
    html += '</div>' + '<div class="pathfinder-nodes">' + '<ol>';

    for (let i = 0; i < activePath.length; i++) {
      const nodeId = activePath[i];
      const vnode = nodeMap.get(nodeId);
      const label = vnode ? escapeHtml(vnode.label) : escapeHtml(nodeId);
      const isSrc = nodeId === selectedSourceNode;
      const isTgt = nodeId === selectedTargetNode;
      let cls = 'pathfinder-node';
      if (isSrc) cls += ' source';
      if (isTgt) cls += ' target';
      html += '<li class="' + cls + '">' + label + '</li>';
    }

    html += '</ol></div></div>';
    sidebarContent.innerHTML = html;
    sidebar.classList.add('open');
    if (legend) legend.classList.add('shifted-right');
  } else if (reachableNodes.size > 0) {
    // Show reachable nodes info
    const srcNode = selectedSourceNode ? nodeMap.get(selectedSourceNode) : null;
    const srcLabel = srcNode ? escapeHtml(srcNode.label) : escapeHtml(selectedSourceNode || '');
    let html =
      '<div class="pathfinder-panel">' +
      '<div class="pathfinder-header">' +
      '<span class="pathfinder-title">📌 Reachable from ' +
      srcLabel +
      '</span>' +
      '<button class="pathfinder-clear" onclick="window.clearPathfinder()">✕</button>' +
      '</div>' +
      '<div class="pathfinder-stats">' +
      '<span class="stat"><b>' +
      reachableNodes.size +
      '</b> reachable node' +
      (reachableNodes.size !== 1 ? 's' : '') +
      '</span>' +
      '</div>' +
      '<div class="pathfinder-nodes">' +
      '<ul>';

    const reachableList = Array.from(reachableNodes).slice(0, 200);
    for (const nodeId of reachableList) {
      const vnode = nodeMap.get(nodeId);
      const label = vnode ? escapeHtml(vnode.label) : escapeHtml(nodeId);
      html += '<li>' + label + '</li>';
    }
    if (reachableNodes.size > 200) {
      html += '<li class="pathfinder-more">… and ' + (reachableNodes.size - 200) + ' more</li>';
    }

    html += '</ul></div></div>';
    sidebarContent.innerHTML = html;
    sidebar.classList.add('open');
    if (legend) legend.classList.add('shifted-right');
  }
}

function computePathCoupling(path: string[]): number {
  let total = 0;
  for (const id of path) {
    const vnode = nodeMap.get(id);
    // If the view node has any coupling-like metadata accessible, sum it
    // Note: coupling data lives in hotspotData which is a Map<string, HotspotData>
    // We access it indirectly — for now just return path length as a basic metric
    total += 1;
  }
  return total;
}

function highlightSyntax(s: string): string {
  return s
    .replace(/(\/\/[^\n]*)/g, '<span class="token-comment">$1</span>')
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="token-comment">$1</span>')
    .replace(/(["'`])(?:(?!\1|\\).|\\.)*?\1/g, '<span class="token-string">$&</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="token-number">$1</span>')
    .replace(
      /\b(import|export|from|return|if|else|for|while|do|switch|case|default|break|continue|function|class|interface|type|enum|const|let|var|new|this|super|async|await|yield|throw|try|catch|finally|extends|implements|with|in|of|typeof|instanceof|void|delete|package|module|null|undefined|true|false)\b/g,
      '<span class="token-keyword">$1</span>',
    )
    .replace(/\b([A-Z]\w+)\b/g, '<span class="token-type">$1</span>');
}
