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

export function toggleColorblindMode() {
  isColorblind = !isColorblind;
  if (isColorblind) {
    Object.assign(COLORS, COLORBLIND_SAFE);
  } else {
    Object.assign(COLORS, { ...DARK }); // default to dark; theme toggle re-applies
  }
}
