import { AnalysisResult } from './graph/index.js';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function toSVG(result: AnalysisResult): string {
  const { graph, stats } = result;
  const { nodes, edges } = graph;

  const width = 1200;
  const height = 800;
  const margin = 50;

  const layoutNodes = nodes.map((n, i) => {
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = margin + col * ((width - margin * 2) / cols);
    const y = margin + row * ((height - margin * 2) / Math.ceil(nodes.length / cols));
    return { ...n, x, y };
  });

  const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));

  const colorMap: Record<string, string> = {
    file: '#30363d',
    function: '#d2a8ff',
    class: '#58a6ff',
    interface: '#79c0ff',
    type: '#3fb950',
    module: '#8b949e',
    call: '#f0883e',
  };

  const shape: Record<string, string> = {
    file: 'circle',
    function: 'diamond',
    class: 'rect',
    interface: 'hexagon',
    type: 'hexagon',
    module: 'circle',
    call: 'circle',
  };

  const edgeColorMap: Record<string, string> = {
    imports: '#8b949e',
    calls: '#f0883e',
    extends: '#58a6ff',
    implements: '#79c0ff',
    contains: '#30363d',
    exports: '#3fb950',
  };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0d1117"/>
  <defs>
    <filter id="glow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <text x="${margin}" y="${margin - 10}" fill="#58a6ff" font-family="system-ui" font-size="16" font-weight="700">codemapper</text>
  <text x="${width - margin}" y="${margin - 10}" fill="#8b949e" font-family="system-ui" font-size="12" text-anchor="end">${stats.files} files · ${stats.functions} funcs · ${stats.classes} types · ${stats.imports} imports</text>`;

  for (const e of edges) {
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src || !tgt) continue;
    const color = edgeColorMap[e.kind] || '#8b949e';
    svg += `\n  <line x1="${src.x}" y1="${src.y}" x2="${tgt.x}" y2="${tgt.y}" stroke="${color}" stroke-width="1" opacity="0.4"/>`;
  }

  for (const n of layoutNodes) {
    if (n.kind === 'directory') continue;
    const color = colorMap[n.kind] || '#8b949e';
    const cx = n.x,
      cy = n.y;
    const r = 6;

    if (n.kind === 'file') {
      svg += `\n  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.8"/>`;
    } else if (n.kind === 'function') {
      const points = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
      svg += `\n  <polygon points="${points}" fill="${color}" opacity="0.8"/>`;
    } else if (n.kind === 'class') {
      svg += `\n  <rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" rx="2" fill="${color}" opacity="0.8"/>`;
    } else if (n.kind === 'interface' || n.kind === 'type') {
      const pts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
      }
      svg += `\n  <polygon points="${pts.join(' ')}" fill="${color}" opacity="0.8"/>`;
    } else {
      svg += `\n  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.8"/>`;
    }

    svg += `\n  <text x="${cx}" y="${cy + r + 11}" fill="#8b949e" font-family="system-ui" font-size="10" text-anchor="middle">${escapeXml(n.label.length > 20 ? n.label.slice(0, 18) + '..' : n.label)}</text>`;
  }

  svg += '\n</svg>';
  return svg;
}

export function toJSON(result: AnalysisResult): string {
  return JSON.stringify(result, null, 2);
}
