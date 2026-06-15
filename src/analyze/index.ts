import fs from 'node:fs';
import path from 'node:path';
import { AnalysisResult, CodeGraph, GraphNode, GraphEdge } from '../graph/index.js';
import { analyzeTypeScript } from './typescript.js';
import { analyzeRust } from './rust.js';

async function detectLanguages(dir: string): Promise<string[]> {
  const langs = new Set<string>();
  try {
    const entries = await fs.promises.readdir(dir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const name = entry.name;
        if (name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.js') || name.endsWith('.jsx')) {
          if (!name.endsWith('.d.ts')) langs.add('typescript');
        } else if (name.endsWith('.rs')) {
          langs.add('rust');
        }
      }
    }
  } catch { }
  return Array.from(langs);
}

export async function analyzeCodebase(dir: string): Promise<AnalysisResult> {
  const resolvedDir = path.resolve(dir);

  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Directory not found: ${resolvedDir}`);
  }

  const langs = await detectLanguages(resolvedDir);
  const allNodes = new Map<string, GraphNode>();
  const allEdges: GraphEdge[] = [];
  const edgeKey = (e: GraphEdge) => `${e.source}|${e.kind}|${e.target}`;
  const seenEdges = new Set<string>();

  const addNodes = (nodes: GraphNode[]) => {
    for (const n of nodes) {
      if (!allNodes.has(n.id)) allNodes.set(n.id, n);
    }
  };

  const addEdges = (edges: GraphEdge[]) => {
    for (const e of edges) {
      const key = edgeKey(e);
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        allEdges.push(e);
      }
    }
  };

  if (langs.length === 0) {
    langs.push('typescript');
  }

  for (const lang of langs) {
    let result: CodeGraph;
    switch (lang) {
      case 'rust':
        result = await analyzeRust(resolvedDir, resolvedDir);
        break;
      case 'typescript':
      default:
        result = await analyzeTypeScript(resolvedDir, resolvedDir);
        break;
    }
    addNodes(result.nodes);
    addEdges(result.edges);
  }

  const graph: CodeGraph = {
    nodes: Array.from(allNodes.values()),
    edges: allEdges,
  };

  const stats = {
    files: graph.nodes.filter(n => n.kind === 'file').length,
    functions: graph.nodes.filter(n => n.kind === 'function').length,
    classes: graph.nodes.filter(n => n.kind === 'class' || n.kind === 'interface').length,
    imports: graph.edges.filter(e => e.kind === 'imports').length,
  };

  return { graph, root: resolvedDir, stats };
}
