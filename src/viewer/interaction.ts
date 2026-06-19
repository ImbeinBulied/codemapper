// @ts-nocheck — Viewer modules were ported from plain JS. Types will be refined later.

import {
  nodes, edges, nodeMap, transform, hoveredNode, hoveredEdge,
  selectedNode, dragNode, isDragging, isPanning, panStart,
  focusNode, searchTerm, matchedNodes, sim, simSettled,
  hiddenKinds, layoutMode, cycleNodes, showCycles, directoryClusters, setGlRunning,
  setHoveredNode, setHoveredEdge, setSelectedNode,
  setIsDragging, setIsPanning, setDragNode, setPanStart,
  setFocusNode, setSimSettled, setSim,
  ViewNode, ViewEdge,
} from './state.js';
import { COLORS, NODE_SIZE } from './colors.js';
import { render } from './renderer.js';
import { updateZoomLevel, computeDirectoryClusters } from './minimap.js';
import { selectNode, closeSidebar } from './sidebar.js';
