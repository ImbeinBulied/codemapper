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
}

const DARK: ColorSet = {
  file: '#30363d',
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
  file: 16,
  function: 24,
  class: 28,
  interface: 26,
  type: 22,
  module: 14,
  call: 18,
  directory: 0,
};

export function setTheme(theme: 'dark' | 'light') {
  Object.assign(COLORS, theme === 'light' ? LIGHT : DARK);
}
