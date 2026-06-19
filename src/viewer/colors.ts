export const COLORS: Record<string, string> = {
  file: '#30363d', function: '#d2a8ff', class: '#58a6ff',
  interface: '#79c0ff', type: '#3fb950', module: '#8b949e',
  call: '#f0883e', directory: '#21262d',
  edge_imports: '#8b949e', edge_calls: '#f0883e',
  edge_extends: '#58a6ff', edge_implements: '#79c0ff',
  edge_contains: '#30363d', edge_exports: '#3fb950',
  cycle: '#f85149', cycle_edge: '#f85149',
  bg: '#0d1117',
};

export const NODE_SIZE: Record<string, number> = {
  file: 16, function: 24, class: 28, interface: 26,
  type: 22, module: 14, call: 18, directory: 0,
};
