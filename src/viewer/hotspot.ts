/**
 * Hotspot visualization — colors nodes by complexity, churn, coupling, maintainability,
 * or combined hotspot score with non-linear color scales (Magma / Viridis).
 */

import { GraphNode } from '../graph/index.js';

export type HotspotMode = 'default' | 'complexity' | 'churn' | 'coupling' | 'maintainability' | 'hotspot';

export interface HotspotData {
  nodeId: string;
  complexity?: number;
  churn?: number;
  coupling?: number;
  maintainability?: number;
  /** Combined hotspot score (0-1, higher = hotter) */
  heat?: number;
}

// ── Non‑linear color scales ──────────────────────────────────────────

/**
 * Magma-inspired color scale (perceptually uniform, hot = bright).
 * Maps t in [0, 1] → CSS color string.
 * Approximation of matplotlib's magma colormap using key control points.
 */
const MAGMA_PALETTE: [number, number, number][] = [
  [0.0, 0.0, 0.0], // #000000  — cold (low complexity/churn)
  [0.07, 0.0, 0.18], // #12002E
  [0.2, 0.0, 0.35], // #330059
  [0.35, 0.16, 0.3], // #29004D
  [0.5, 0.4, 0.16], // #662900
  [0.65, 0.65, 0.04], // #A65F00
  [0.8, 0.9, 0.22], // #E63800
  [0.9, 0.98, 0.55], // #FA8C00
  [1.0, 1.0, 0.98], // #FFFBF0  — hot (high complexity/churn)
];

/**
 * Viridis-inspired color scale (perceptually uniform, colorblind-safe).
 * Maps t in [0, 1] → CSS color string.
 */
const VIRIDIS_PALETTE: [number, number, number][] = [
  [0.27, 0.0, 0.33], // #440154  — cold
  [0.2, 0.12, 0.49], // #3B1F70
  [0.13, 0.28, 0.53], // #214C84
  [0.08, 0.43, 0.5], // #146D8C
  [0.13, 0.56, 0.41], // #21916A
  [0.36, 0.67, 0.24], // #5CAB30
  [0.64, 0.74, 0.08], // #A3BC14
  [0.88, 0.77, 0.14], // #E0C420
  [1.0, 0.98, 0.6], // #FFFBA0  — hot
];

/**
 * Interpolate between two RGB colors.
 */
function lerpColor(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * Sample a color palette at normalised position t ∈ [0, 1].
 * Uses piecewise linear interpolation between key stops.
 */
function samplePalette(t: number, palette: [number, number, number][]): string {
  const clamped = Math.max(0, Math.min(1, t));
  const stops = palette.length - 1;
  const idx = clamped * stops;
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, stops);
  const frac = idx - lo;
  const [r, g, b] = lerpColor(palette[lo], palette[hi], frac);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Apply a non‑linear curve to emphasise the upper end of the scale.
 * This makes high‑volatility nodes stand out more.
 */
function nonLinearMap(t: number, exponent = 1.5): number {
  return Math.pow(t, exponent);
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

/**
 * Magma-scale color for a normalised value t ∈ [0, 1].
 * Applies non‑linear mapping to emphasise high‑volatility nodes.
 */
export function magmaColor(t: number): string {
  return samplePalette(nonLinearMap(t, 1.5), MAGMA_PALETTE);
}

/**
 * Viridis-scale color for a normalised value t ∈ [0, 1].
 * Applies non‑linear mapping to emphasise high‑volatility nodes.
 */
export function viridisColor(t: number): string {
  return samplePalette(nonLinearMap(t, 1.5), VIRIDIS_PALETTE);
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
    case 'hotspot':
      if (data.heat === undefined) return defaultColor;
      // Use non-linear Magma scale for hotspot combined score
      return magmaColor(data.heat);
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
  // Magma palette swatches for hotspot mode
  const magmaSwatches = [magmaColor(0), magmaColor(0.25), magmaColor(0.5), magmaColor(0.75), magmaColor(1)];

  switch (mode) {
    case 'complexity':
      return { label: 'Complexity', min: '1', max: '20+', colors };
    case 'churn':
      return { label: 'Churn (90d)', min: '0', max: '50+', colors };
    case 'hotspot':
      return {
        label: 'Hotspot Score',
        min: '0 (cold)',
        max: '1 (hot)',
        colors: magmaSwatches,
      };
    case 'coupling':
      return { label: 'Coupling', min: '0', max: '30+', colors };
    case 'maintainability':
      return { label: 'Maintainability', min: '171 (good)', max: '0 (bad)', colors: [...colors].reverse() };
    default:
      return null;
  }
}

/** Get min/max range for hotspot mode */
export function getHotspotRange(mode: HotspotMode): { min: number; max: number } {
  switch (mode) {
    case 'complexity':
      return { min: 1, max: 20 };
    case 'churn':
      return { min: 0, max: 50 };
    case 'hotspot':
      return { min: 0, max: 1 };
    case 'coupling':
      return { min: 0, max: 30 };
    case 'maintainability':
      return { min: 0, max: 171 };
    default:
      return { min: 0, max: 1 };
  }
}
