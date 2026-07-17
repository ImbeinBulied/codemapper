import fs from 'node:fs';
import path from 'node:path';
import { AnalysisResult, CodeGraph, GraphNode, GraphEdge, Config } from '../graph/index.js';
import { analyzeTypeScript } from './typescript.js';
import { analyzeRust } from './rust.js';
import { analyzePython } from './python.js';
import { analyzeGo } from './go.js';
import { analyzeJava } from './java.js';
import { analyzeCSharp } from './csharp.js';
import { analyzeSwift } from './swift.js';
import { analyzePhp } from './php.js';
import { loadConfig } from '../config.js';
import { parseWithTreesitter, initTreesitter, tsParserAvailable } from './treesitter.js';
import { detectCycles } from '../graph/cycles.js';
import { analyzeGraph } from '../graph/analytics.js';
import { evaluateRules } from '../graph/rules-engine.js';
import { validateRegex, readFileSafe } from './utils.js';
import { getGitChurn } from '../git.js';

const LANG_DETECTORS: [string, string[]][] = [
  ['typescript', ['.ts', '.tsx', '.js', '.jsx', '.mjs']],
  ['rust', ['.rs']],
  ['python', ['.py']],
  ['go', ['.go']],
  ['java', ['.java']],
  ['csharp', ['.cs']],
  ['swift', ['.swift']],
  ['php', ['.php']],
];

async function detectLanguages(dir: string): Promise<string[]> {
  const langs = new Set<string>();
  try {
    const entries = await fs.promises.readdir(dir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const name = entry.name;
        for (const [lang, exts] of LANG_DETECTORS) {
          if (exts.some((ext) => name.endsWith(ext)) && !name.endsWith('.d.ts')) {
            langs.add(lang);
          }
        }
      }
    }
  } catch {}
  return Array.from(langs);
}

function parseExternalDeps(rootDir: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  try {
    const pkgPath = path.join(rootDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const [name] of Object.entries(deps)) {
        const depId = `module:${name}`;
        if (!nodes.some((n) => n.id === depId)) {
          nodes.push({
            id: depId,
            label: name,
            kind: 'module',
            filePath: 'external',
            line: 1,
            col: 1,
            description: 'npm dependency',
          });
        }
      }
    }
  } catch {}

  try {
    const cargoPath = path.join(rootDir, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      const content = fs.readFileSync(cargoPath, 'utf-8');
      const depMatch = content.match(/\[dependencies\]([\s\S]*?)(?:\[|\n\n)/);
      if (depMatch) {
        for (const line of depMatch[1].split('\n')) {
          const m = line.match(/^(\w+)\s*=/);
          if (m) {
            const depId = `module:${m[1]}`;
            if (!nodes.some((n) => n.id === depId)) {
              nodes.push({
                id: depId,
                label: m[1],
                kind: 'module',
                filePath: 'external',
                line: 1,
                col: 1,
                description: 'crate dependency',
              });
            }
          }
        }
      }
    }
  } catch {}

  try {
    const goModPath = path.join(rootDir, 'go.mod');
    if (fs.existsSync(goModPath)) {
      const content = fs.readFileSync(goModPath, 'utf-8');
      for (const line of content.split('\n')) {
        const m = line.match(/^\s*(\S+)\s+v\d/);
        if (m) {
          const name = m[1].split('/').pop() || m[1];
          const depId = `module:${name}`;
          if (!nodes.some((n) => n.id === depId)) {
            nodes.push({
              id: depId,
              label: name,
              kind: 'module',
              filePath: 'external',
              line: 1,
              col: 1,
              description: 'go dependency',
            });
          }
        }
      }
    }
  } catch {}

  return { nodes, edges };
}

export async function analyzeCodebase(
  dir: string,
  filter?: string,
  deep?: boolean,
  runGit?: boolean,
): Promise<AnalysisResult> {
  const resolvedDir = path.resolve(dir);

  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Directory not found: ${resolvedDir}`);
  }

  const langs = await detectLanguages(resolvedDir);
  const config = loadConfig(resolvedDir);
  const allNodes = new Map<string, GraphNode>();
  const allEdges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  const addNodes = (graphNodes: GraphNode[]) => {
    for (const n of graphNodes) {
      if (!allNodes.has(n.id)) allNodes.set(n.id, n);
    }
  };

  const addEdges = (graphEdges: GraphEdge[]) => {
    for (const e of graphEdges) {
      const key = `${e.source}|${e.kind}|${e.target}`;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        allEdges.push(e);
      }
    }
  };

  if (langs.length === 0) {
    langs.push('typescript');
  }

  const parsers: Record<string, (dir: string, rootDir: string, config?: Config) => Promise<CodeGraph>> = {
    typescript: analyzeTypeScript,
    rust: analyzeRust,
    python: analyzePython,
    go: analyzeGo,
    java: analyzeJava,
    csharp: analyzeCSharp,
    swift: analyzeSwift,
    php: analyzePhp,
  };

  for (const lang of langs) {
    const parser = parsers[lang];
    if (!parser) continue;
    const result = await parser(resolvedDir, resolvedDir, config);
    addNodes(result.nodes);
    addEdges(result.edges);
  }

  // Optional: try tree-sitter for additional accuracy (if WASM grammars available)
  // Tree-sitter can parse languages not covered by regex parsers (C, Ruby, etc.)
  if (deep) {
    const tsResult = await parseWithTreesitter(resolvedDir, resolvedDir, config);
    if (tsResult.nodes.length > 0) {
      addNodes(tsResult.nodes);
      addEdges(tsResult.edges);
    }
  }

  const extDeps = parseExternalDeps(resolvedDir);
  addNodes(extDeps.nodes);
  addEdges(extDeps.edges);

  let graph: CodeGraph = {
    nodes: Array.from(allNodes.values()),
    edges: allEdges,
  };

  if (filter) {
    const pattern = validateRegex(filter);
    if (pattern) {
      graph = {
        nodes: graph.nodes.filter((n) => pattern.test(n.filePath)),
        edges: graph.edges.filter((e) => pattern.test(e.source) || pattern.test(e.target)),
      };
    }
  }

  const stats = {
    files: graph.nodes.filter((n) => n.kind === 'file').length,
    functions: graph.nodes.filter((n) => n.kind === 'function').length,
    classes: graph.nodes.filter((n) => n.kind === 'class' || n.kind === 'interface').length,
    imports: graph.edges.filter((e) => e.kind === 'imports').length,
  };

  const cycles = detectCycles(graph.nodes, graph.edges);

  // Build sources map for code metrics (read file contents for file nodes)
  const sources = new Map<string, string>();
  for (const n of graph.nodes) {
    if (n.kind !== 'file') continue;
    const filePath = path.join(resolvedDir, n.id.replace(/^file:/, ''));
    const { content } = readFileSafe(filePath);
    if (content) sources.set(n.id.replace(/^file:/, ''), content);
  }

  // Git metadata per file — use efficient batch git churn extraction
  const git: Record<string, { lastModified?: string; author?: string; churn?: number }> = {};
  if (runGit) {
    try {
      const gitChurn = await getGitChurn(resolvedDir);
      for (const n of graph.nodes) {
        if (n.kind !== 'file') continue;
        const relPath = n.id.replace(/^file:/, '');
        const churnData = gitChurn.files.get(relPath);
        if (churnData && churnData.count > 0) {
          git[n.id] = {
            churn: churnData.count,
            lastModified: churnData.lastModified,
          };
        }
      }
    } catch {
      // Not in a git repo — skip
    }
  }

  // Build churn data map for analytics (only if git analysis ran)
  const churnData = new Map<string, number>();
  if (runGit) {
    for (const [id, data] of Object.entries(git)) {
      if (data.churn !== undefined) {
        churnData.set(id.replace(/^file:/, ''), data.churn);
      }
    }
  }

  const analytics = analyzeGraph(graph.nodes, graph.edges, sources, churnData);

  // Evaluate dependency rules if configured
  let rulesResult = null;
  if (config.rules && config.rules.length > 0) {
    rulesResult = evaluateRules(graph.nodes, graph.edges, config.rules);
  }

  return {
    graph,
    root: resolvedDir,
    stats,
    cycles,
    analytics,
    rules: rulesResult,
    ...(Object.keys(git).length > 0 ? { git } : {}),
  };
}
