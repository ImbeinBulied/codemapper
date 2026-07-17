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
  projectStats,
  graphProperties,
  gitStats,
  setProjectStats,
  setGraphProperties,
  setGitStats,
} from './state.js';
import { computeStatsFromData, getLangColor } from './stats.js';

let sidebar = document.getElementById('sidebar')!;
let sidebarHeader = document.getElementById('sidebar-header')!;
let sidebarContent = document.getElementById('sidebar-content')!;
let sidebarStats = document.getElementById('sidebar-stats')!;

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
    total += 1;
  }
  return total;
}

function highlightSyntax(s: string): string {
  return s
    .replace(/(\/\/[^\n]*)/g, '<span class="token-comment">$1</span>')
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="token-comment">$1</span>')
    .replace(/(["'`])(?:(?!\1|\\.).|\\.)*?\1/g, '<span class="token-string">$&</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="token-number">$1</span>')
    .replace(
      /\b(import|export|from|return|if|else|for|while|do|switch|case|default|break|continue|function|class|interface|type|enum|const|let|var|new|this|super|async|await|yield|throw|try|catch|finally|extends|implements|with|in|of|typeof|instanceof|void|delete|package|module|null|undefined|true|false)\b/g,
      '<span class="token-keyword">$1</span>',
    )
    .replace(/\b([A-Z]\w+)\b/g, '<span class="token-type">$1</span>');
}

// ── Stats Dashboard ─────────────────────────────────────────────

/**
 * Render the stats dashboard panels into #sidebar-stats.
 */
export function renderStatsDashboard(data?: any) {
  if (data) {
    const computed = computeStatsFromData(data);
    setProjectStats(computed.projectStats);
    setGraphProperties(computed.graphProperties);
    setGitStats(computed.gitStats);
  }

  if (!projectStats && !graphProperties && !gitStats) {
    sidebarStats.classList.remove('has-data');
    sidebarStats.innerHTML = '';
    return;
  }

  sidebarStats.classList.add('has-data');

  let html = '';

  // ── Project Stats panel ──
  if (projectStats) {
    html += renderPanel('project-stats', '📊 Project Stats', () => {
      let content = '';
      if (projectStats) {
        // Language badges
        if (projectStats.languages.length > 0) {
          content += '<div class="lang-list">';
          for (const lang of projectStats.languages) {
            content +=
              '<span class="lang-badge">' +
              '<span class="lang-dot" style="background:' +
              getLangColor(lang.name) +
              '"></span>' +
              '<span class="lang-name">' +
              escapeHtml(lang.name) +
              '</span>' +
              '<span class="lang-count">' +
              lang.count +
              ' (' +
              lang.percentage +
              '%)</span>' +
              '</span>';
          }
          content += '</div>';
        }

        content +=
          '<div class="stat-card"><span class="stat-label">Files</span><span class="stat-value">' +
          projectStats.fileCount +
          '</span></div>' +
          '<div class="stat-card"><span class="stat-label">Functions</span><span class="stat-value">' +
          projectStats.functionCount +
          '</span></div>' +
          '<div class="stat-card"><span class="stat-label">Classes / Interfaces</span><span class="stat-value">' +
          projectStats.classCount +
          '</span></div>' +
          '<div class="stat-card"><span class="stat-label">Imports</span><span class="stat-value">' +
          projectStats.importCount +
          '</span></div>' +
          '<div class="stat-card"><span class="stat-label">Total LOC</span><span class="stat-value">' +
          projectStats.totalLoc.toLocaleString() +
          '</span></div>' +
          '<div class="stat-card"><span class="stat-label">Dependencies</span><span class="stat-value">' +
          projectStats.dependencyCount +
          '</span></div>';
      }
      return content;
    });
  }

  // ── Graph Properties panel ──
  if (graphProperties) {
    html += renderPanel('graph-props', '📈 Graph Properties', () => {
      let content = '';
      if (graphProperties) {
        content +=
          '<div class="stat-card"><span class="stat-label">Nodes</span><span class="stat-value">' +
          graphProperties.nodeCount.toLocaleString() +
          '</span></div>' +
          '<div class="stat-card"><span class="stat-label">Edges</span><span class="stat-value">' +
          graphProperties.edgeCount.toLocaleString() +
          '</span></div>' +
          '<div class="stat-card"><span class="stat-label">Cycles</span><span class="stat-value">' +
          graphProperties.cycleCount +
          '</span></div>' +
          '<div class="stat-card"><span class="stat-label">Density</span><span class="stat-value"><span class="density-badge">' +
          (graphProperties.density * 100).toFixed(4) +
          '%</span></span></div>' +
          '<div class="stat-card"><span class="stat-label">Avg Fan-In</span><span class="stat-value">' +
          graphProperties.avgFanIn.toFixed(2) +
          '</span></div>' +
          '<div class="stat-card"><span class="stat-label">Avg Fan-Out</span><span class="stat-value">' +
          graphProperties.avgFanOut.toFixed(2) +
          '</span></div>' +
          '<div class="stat-card"><span class="stat-label">Avg Instability</span><span class="stat-value">' +
          (graphProperties.avgInstability * 100).toFixed(1) +
          '%</span></div>';

        // Instability distribution bar
        const { low, medium, high } = graphProperties.instabilityDistribution;
        const total = low + medium + high || 1;
        content +=
          '<div class="stats-section-label">Instability Distribution</div>' +
          '<div class="instability-bar">' +
          '<div class="bar-segment low" style="flex:' +
          low +
          '" title="Low: ' +
          low +
          ' (' +
          Math.round((low / total) * 100) +
          '%)"></div>' +
          '<div class="bar-segment medium" style="flex:' +
          medium +
          '" title="Medium: ' +
          medium +
          ' (' +
          Math.round((medium / total) * 100) +
          '%)"></div>' +
          '<div class="bar-segment high" style="flex:' +
          high +
          '" title="High: ' +
          high +
          ' (' +
          Math.round((high / total) * 100) +
          '%)"></div>' +
          '</div>' +
          '<div style="display:flex;gap:12px;margin-top:4px;font-size:10px;color:var(--muted);font-family:system-ui">' +
          '<span>🟢 Low ' +
          Math.round((low / total) * 100) +
          '%</span>' +
          '<span>🟡 Med ' +
          Math.round((medium / total) * 100) +
          '%</span>' +
          '<span>🔴 High ' +
          Math.round((high / total) * 100) +
          '%</span>' +
          '</div>';
      }
      return content;
    });
  }

  // ── Git Stats panel ──
  if (gitStats) {
    html += renderPanel('git-stats', '🔀 Git Stats', () => {
      let content = '';
      if (gitStats) {
        content +=
          '<div class="stat-card"><span class="stat-label">Total Commits</span><span class="stat-value">' +
          gitStats.totalCommits.toLocaleString() +
          '</span></div>' +
          '<div class="stat-card"><span class="stat-label">Time Range</span><span class="stat-value">' +
          escapeHtml(gitStats.timeRange) +
          '</span></div>';

        // Top churned files
        if (gitStats.topChurnedFiles.length > 0) {
          content += '<div class="stats-section-label">Top Churned Files</div>' + '<ul class="churn-list">';
          for (const f of gitStats.topChurnedFiles) {
            content +=
              '<li>' +
              '<span class="churn-file">' +
              escapeHtml(f.path) +
              '</span>' +
              '<span class="churn-count">' +
              f.churn +
              ' commits</span>' +
              '</li>';
          }
          content += '</ul>';
        }

        // Hot files (highest hotspot score)
        if (gitStats.hotFiles.length > 0) {
          content += '<div class="stats-section-label">Hot Files</div>' + '<ul class="churn-list">';
          for (const f of gitStats.hotFiles) {
            const scorePct = (f.score * 100).toFixed(0);
            content +=
              '<li>' +
              '<span class="churn-file">' +
              escapeHtml(f.path) +
              '</span>' +
              '<span class="hot-score">' +
              scorePct +
              '%</span>' +
              '</li>';
          }
          content += '</ul>';
        }
      }
      return content;
    });
  }

  sidebarStats.innerHTML = html;

  // Attach accordion toggle handlers
  sidebarStats.querySelectorAll('.stats-accordion-header').forEach((header) => {
    header.addEventListener('click', () => {
      const targetId = (header as HTMLElement).dataset.target;
      if (!targetId) return;
      const body = document.getElementById(targetId);
      if (!body) return;
      const isCollapsed = body.classList.contains('collapsed');
      body.classList.toggle('collapsed', !isCollapsed);
      header.classList.toggle('collapsed', !isCollapsed);
    });
  });
}

/**
 * Render an accordion panel.
 */
function renderPanel(id: string, title: string, bodyFn: () => string): string {
  const bodyId = id + '-body';
  return (
    '<div class="stats-panel">' +
    '<button class="stats-accordion-header" data-target="' +
    bodyId +
    '" aria-expanded="true">' +
    '<span>' +
    title +
    '</span>' +
    '<span class="stats-toggle">▼</span>' +
    '</button>' +
    '<div id="' +
    bodyId +
    '" class="stats-accordion-body">' +
    bodyFn() +
    '</div>' +
    '</div>'
  );
}
