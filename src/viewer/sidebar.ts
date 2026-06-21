import { selectedNode, nodes, setSelectedNode, ViewNode } from './state.js';
import { render } from './renderer.js';

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
    node.kind +
    '</span>' +
    '<span class="name">' +
    node.label +
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
  sidebar.classList.remove('open');
  legend.classList.remove('shifted-right');
  render();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
