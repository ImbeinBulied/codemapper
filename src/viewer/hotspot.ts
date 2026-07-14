/**
 * Hotspot visualization — colors nodes by complexity, churn, coupling, or maintainability.
 */

import { GraphNode } from '../graph/index.js';

export type HotspotMode = 'default' | 'complexity' | 'churn' | 'coupling' | 'maintainability';

export interface HotspotData {
  nodeId: string;
  complexity?: number;
  churn?: number;
  coupling?: number;
  maintainability?: number;
  heat?: number;
}

/** Color interpolation for heatmap: green (low) → yellow (medium) → red (high) */
function heatColor(value: number, min: number, max: number): string {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  if (t < 0.5) {
    // Green to Yellow
    const r = Math.round(255 * t * 2);
    return `rgb(${r}, 200, 50)`;
  } else {
    // Yellow to Red
    const g = Math.round(200 * (1 - (t - 0.5) * 2));
    return `rgb(255, ${g}, 50)`;
  }
}

/** Get node color based on hotspot mode */
export function getNodeColor(
  node: GraphNode,
  mode: HotspotMode,
  hotspotData: Map<string, HotspotData>,
  defaultColor: string,
): string {
  if (mode === 'default') return defaultColor;

  const data = hotspotData.get(node.id);
  if (!data) return defaultColor;

  switch (mode) {
    case 'complexity':
      if (data.complexity === undefined) return defaultColor;
      return heatColor(data.complexity, 1, 20);
    case 'churn':
      if (data.churn === undefined) return defaultColor;
      return heatColor(data.churn, 0, 50);
    case 'coupling':
      if (data.coupling === undefined) return defaultColor;
      return heatColor(data.coupling, 0, 30);
    case 'maintainability':
      if (data.maintainability === undefined) return defaultColor;
      // Invert: low maintainability = red, high = green
      return heatColor(171 - data.maintainability, 0, 171);
    default:
      return defaultColor;
  }
}

/** Get heatmap legend for current mode */
export function getHeatmapLegend(
  mode: HotspotMode,
): { label: string; min: string; max: string; colors: string[] } | null {
  if (mode === 'default') return null;

  const colors = ['#32CD32', '#FFD700', '#FF4500']; // green, yellow, red

  switch (mode) {
    case 'complexity':
      return { label: 'Complexity', min: '1', max: '20+', colors };
    case 'churn':
      return { label: 'Churn (90d)', min: '0', max: '50+', colors };
    case 'coupling':
      return { label: 'Coupling', min: '0', max: '30+', colors };
    case 'maintainability':
      return { label: 'Maintainability', min: '171 (good)', max: '0 (bad)', colors: [...colors].reverse() };
    default:
      return null;
  }
}
