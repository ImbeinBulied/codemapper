/**
 * Shared state for the codemapper viewer.
 * Every module imports from here to access nodes, edges, transform, etc.
 */

export interface ViewNode {
  id: string;
  label: string;
  kind: string;
  filePath: string;
  line: number;
  col: number;
  description?: string;
  x: number | null;
  y: number | null;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
}

export interface ViewEdge {
  source: string | ViewNode;
  target: string | ViewNode;
  kind: string;
  label?: string;
}

export let nodes: ViewNode[] = [];
export let edges: ViewEdge[] = [];
export let nodeMap = new Map<string, ViewNode>();
export let graphData: any = null;

export let transform = { x: 0, y: 0, k: 1 };
export let hoveredNode: ViewNode | null = null;
export let hoveredEdge: ViewEdge | null = null;
export let selectedNode: ViewNode | null = null;
export let focusNode: ViewNode | null = null;
export let dragNode: ViewNode | null = null;
export let isPanning = false;
export let isDragging = false;
export let panStart = { x: 0, y: 0 };
export let simSettled = false;
export let searchTerm = '';
export let matchedNodes: ViewNode[] = [];
export let hiddenKinds: Record<string, boolean> = { module: true, call: true };
export let cycleNodes = new Set<string>();
export let showCycles = true;
export let layoutMode: 'force' | 'hierarchical' | 'grid' = 'force';
export let showMinimap = false;
export let glRunning = false;
export const WEBGL_THRESHOLD = 500;
export let directoryClusters: any[] = [];
export let edgeLabels = false;
export let sim: any = null;

// Setters for modules to update state
export function setNodes(n: ViewNode[]) { nodes = n; }
export function setEdges(e: ViewEdge[]) { edges = e; }
export function setNodeMap(m: Map<string, ViewNode>) { nodeMap = m; }
export function setGraphData(d: any) { graphData = d; }
export function setTransform(t: typeof transform) { transform = t; }
export function setHoveredNode(n: ViewNode | null) { hoveredNode = n; }
export function setHoveredEdge(e: ViewEdge | null) { hoveredEdge = e; }
export function setSelectedNode(n: ViewNode | null) { selectedNode = n; }
export function setFocusNode(n: ViewNode | null) { focusNode = n; }
export function setDragNode(n: ViewNode | null) { dragNode = n; }
export function setIsPanning(v: boolean) { isPanning = v; }
export function setIsDragging(v: boolean) { isDragging = v; }
export function setPanStart(p: typeof panStart) { panStart = p; }
export function setSimSettled(v: boolean) { simSettled = v; }
export function setSearchTerm(t: string) { searchTerm = t; }
export function setMatchedNodes(n: ViewNode[]) { matchedNodes = n; }
export function setHiddenKinds(k: Record<string, boolean>) { hiddenKinds = k; }
export function setCycleNodes(s: Set<string>) { cycleNodes = s; }
export function setShowCycles(v: boolean) { showCycles = v; }
export function setLayoutMode(m: typeof layoutMode) { layoutMode = m; }
export function setShowMinimap(v: boolean) { showMinimap = v; }
export function setGlRunning(v: boolean) { glRunning = v; }
export function setDirectoryClusters(d: any[]) { directoryClusters = d; }
export function setSim(s: any) { sim = s; }
