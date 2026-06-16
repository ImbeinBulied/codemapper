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
}
