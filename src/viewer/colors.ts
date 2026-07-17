export interface ColorSet {
  file: string;
  function: string;
  class: string;
  interface: string;
  type: string;
  module: string;
  call: string;
  directory: string;
  edge_imports: string;
  edge_calls: string;
  edge_extends: string;
  edge_implements: string;
  edge_contains: string;
  edge_exports: string;
  cycle: string;
  cycle_edge: string;
  bg: string;
  [key: string]: string;
}

const DARK: ColorSet = {
  file: '#484f58',
  function: '#d2a8ff',
  class: '#58a6ff',
  interface: '#79c0ff',
  type: '#3fb950',
  module: '#8b949e',
  call: '#f0883e',
  directory: '#21262d',
  edge_imports: '#8b949e',
  edge_calls: '#f0883e',
  edge_extends: '#58a6ff',
  edge_implements: '#79c0ff',
  edge_contains: '#30363d',
  edge_exports: '#3fb950',
  cycle: '#f85149',
  cycle_edge: '#f85149',
  bg: '#0d1117',
};

const LIGHT: ColorSet = {
  file: '#d0d7de',
  function: '#8250df',
  class: '#0550ae',
  interface: '#0969da',
  type: '#116329',
  module: '#656d76',
  call: '#bd5618',
  directory: '#eaeef2',
  edge_imports: '#656d76',
  edge_calls: '#bd5618',
  edge_extends: '#0550ae',
  edge_implements: '#0969da',
  edge_contains: '#d0d7de',
  edge_exports: '#116329',
  cycle: '#cf222e',
  cycle_edge: '#cf222e',
  bg: '#ffffff',
};

export let COLORS: ColorSet = { ...DARK };
export let NODE_SIZE: Record<string, number> = {
  file: 32,
  function: 48,
  class: 56,
  interface: 52,
  type: 44,
  module: 28,
  call: 36,
  directory: 0,
};

export function setTheme(theme: 'dark' | 'light') {
  Object.assign(COLORS, theme === 'light' ? LIGHT : DARK);
}

// Colorblind-safe palette (IBM Design / Paul Tol inspired)
export const COLORBLIND_SAFE: ColorSet = {
  file: '#E8C547',
  function: '#4B90D9',
  class: '#E87D47',
  interface: '#7B5EB5',
  type: '#47B5A0',
  module: '#8B8B8B',
  call: '#D94B4B',
  directory: '#555555',
  edge_imports: '#8B8B8B',
  edge_calls: '#D94B4B',
  edge_extends: '#4B90D9',
  edge_implements: '#7B5EB5',
  edge_contains: '#555555',
  edge_exports: '#47B5A0',
  cycle: '#ff4444',
  cycle_edge: '#ff4444',
  bg: '#0d1117',
};

export let isColorblind = false;

export function setColorblind(v: boolean) {
  isColorblind = v;
}

/**
 * Heatmap color gradient arrays (Magma and Viridis inspired).
 * 256-entry lookup tables for canvas-based heatmap rendering.
 * Generated from the stop-based palettes in hotspot.ts.
 */
export const HEATMAP_GRADIENT_MAGMA: [number, number, number][] = buildMagmaGradient(256);
export const HEATMAP_GRADIENT_VIRIDIS: [number, number, number][] = buildViridisGradient(256);

function buildMagmaGradient(size: number): [number, number, number][] {
  const stops: [number, number, number, number][] = [
    [0.0, 0.0, 0.0, 0.0],
    [0.07, 0.0, 0.0, 0.18],
    [0.2, 0.2, 0.0, 0.35],
    [0.35, 0.35, 0.16, 0.3],
    [0.5, 0.5, 0.4, 0.16],
    [0.65, 0.65, 0.65, 0.04],
    [0.8, 0.8, 0.9, 0.22],
    [0.9, 0.9, 0.98, 0.55],
    [1.0, 1.0, 1.0, 0.98],
  ];
  return buildGradientLUT(stops, size);
}

function buildViridisGradient(size: number): [number, number, number][] {
  const stops: [number, number, number, number][] = [
    [0.0, 0.27, 0.0, 0.33],
    [0.2, 0.2, 0.12, 0.49],
    [0.4, 0.13, 0.28, 0.53],
    [0.5, 0.08, 0.43, 0.5],
    [0.6, 0.13, 0.56, 0.41],
    [0.7, 0.36, 0.67, 0.24],
    [0.8, 0.64, 0.74, 0.08],
    [0.9, 0.88, 0.77, 0.14],
    [1.0, 1.0, 0.98, 0.6],
  ];
  return buildGradientLUT(stops, size);
}

function buildGradientLUT(stops: [number, number, number, number][], size: number): [number, number, number][] {
  const lut: [number, number, number][] = [];
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    // Find the two stops that bracket t
    let lo = 0;
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) {
        lo = s;
        break;
      }
    }
    if (t >= stops[stops.length - 1][0]) lo = stops.length - 2;
    const [t0, r0, g0, b0] = stops[lo];
    const [t1, r1, g1, b1] = stops[lo + 1];
    const frac = (t - t0) / (t1 - t0 || 1);
    lut.push([Math.round(r0 + (r1 - r0) * frac), Math.round(g0 + (g1 - g0) * frac), Math.round(b0 + (b1 - b0) * frac)]);
  }
  return lut;
}

export function toggleColorblindMode() {
  isColorblind = !isColorblind;
  if (isColorblind) {
    Object.assign(COLORS, COLORBLIND_SAFE);
  } else {
    Object.assign(COLORS, { ...DARK }); // default to dark; theme toggle re-applies
  }
}
