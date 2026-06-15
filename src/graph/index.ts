export interface GraphNode {
  id: string;
  label: string;
  kind: 'file' | 'function' | 'class' | 'interface' | 'type' | 'module' | 'call';
  filePath: string;
  line: number;
  col: number;
  description?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: 'imports' | 'calls' | 'extends' | 'implements' | 'contains' | 'callsites';
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
