export interface GraphNode {
  id: string;
  label: string;
  kind: 'file' | 'function' | 'class' | 'interface' | 'type' | 'module' | 'call' | 'directory' | 'enum';
  filePath: string;
  line: number;
  col: number;
  description?: string;
}

export interface Config {
  include?: string[];
  exclude?: string[];
  languages?: string[];
  nodeColors?: Record<string, string>;
  rules?: Array<{
    from: string;
    to: string;
    severity: 'error' | 'warn' | 'forbidden';
    description?: string;
  }>;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: 'imports' | 'calls' | 'extends' | 'implements' | 'contains' | 'callsites' | 'exports';
  label?: string;
}

export interface CodeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface AnalysisResult {
  graph: CodeGraph;
  root: string;
  stats: {
    files: number;
    functions: number;
    classes: number;
    imports: number;
  };
  cycles?: CycleInfo[];
  analytics?: import('./analytics.js').AnalyticsResult;
  /** Git metadata per file (lastModified, author, churn) */
  git?: Record<string, { lastModified?: string; author?: string; churn?: number }>;
  /** Rule validation results (CI enforcement) */
  rules?: import('./rules-engine.js').RulesResult | null;
}

export interface CycleInfo {
  /** The nodes involved in the cycle (display order) */
  nodes: string[];
  /** Edge kinds that form the cycle */
  edgeKind: string;
}
