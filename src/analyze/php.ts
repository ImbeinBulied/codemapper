import { GraphNode, GraphEdge, CodeGraph, Config } from '../graph/index.js';
import { readFileSafe, findLine, walkFiles } from './utils.js';

const USE_RE = /^use\s+([\w\\\\]+)/gm;
const FUNC_RE = /^function\s+(\w+)/gm;
const CLASS_RE = /^class\s+(\w+)/gm;
const INTERFACE_RE = /^interface\s+(\w+)/gm;
const TRAIT_RE = /^trait\s+(\w+)/gm;
const ENUM_RE = /^enum\s+(\w+)/gm;
const METHOD_RE = /(?:public|private|protected|static|abstract|final)\s+function\s+(\w+)/g;
const ARROW_FUNC_RE = /(?:public|private|protected|static)\s+function\s+(\w+)/g;
const EXTENDS_RE = /class\s+\w+\s+extends\s+(\w+)/g;
const IMPLEMENTS_RE = /(?:class\s+\w+\s+extends\s+\w+\s+)?implements\s+([\w,\s]+)/g;
const CALL_RE = /\$?\w+\s*\(/g;
const SKIP_CALLS = /^(if|else|elseif|for|foreach|while|do|switch|case|default|return|throw|try|catch|finally|new|clone|die|exit|echo|print|array|isset|empty|unset|defined|function|class|interface|trait|enum|extends|implements|use|namespace|require|include|require_once|include_once|global|static|self|parent|this|true|false|null|array|string|int|float|bool|object|mixed|void|never|iterable|callable|count|strlen|in_array|explode|implode|substr|strpos|str_replace|preg_match|preg_replace|json_encode|json_decode|file_get_contents|file_put_contents|fopen|fwrite|fread|fclose|mkdir|rmdir|unlink|copy|rename|is_dir|is_file|file_exists|method_exists|property_exists|class_exists|interface_exists|trait_exists|enum_exists|defined|define|trigger_error|error_log|set_error_handler|set_exception_handler|register_shutdown_function|spl_autoload_register|var_dump|var_export|print_r|debug_backtrace|debug_print_backtrace|get_class|get_parent_class|get_called_class|get_class_methods|get_class_vars|get_object_vars|method_exists|property_exists)$/;

function isCodeFile(p: string): boolean {
  return p.endsWith('.php');
}

export async function analyzePhp(dir: string, rootDir: string, config?: Config): Promise<CodeGraph> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const allFiles = await walkFiles(dir, config);
  const phpFiles = allFiles.filter(isCodeFile);

  for (const filePath of phpFiles) {
    const relPath = filePath.startsWith(rootDir)
      ? filePath.slice(rootDir.length).replace(/\\/g, '/')
      : filePath;
    const nodeId = `file:${relPath}`;
    nodes.push({ id: nodeId, label: relPath.split('/').pop() || relPath, kind: 'file', filePath: relPath, line: 1, col: 1, description: relPath });

    const { content } = readFileSafe(filePath);
    if (!content) continue;
    const lines = content.split('\n');
    const localFuncs = new Set<string>();

    for (const m of content.matchAll(USE_RE)) {
      const name = m[1].split('\\\\').pop() || m[1].split('\\').pop() || m[1];
      edges.push({ source: nodeId, target: `module:${m[1].replace(/\\\\/g, '::')}`, kind: 'imports', label: name });
    }

    for (const m of content.matchAll(CLASS_RE)) {
      localFuncs.add(m[1]);
      nodes.push({ id: `class:${relPath}#${m[1]}`, label: m[1], kind: 'class', filePath: relPath, line: findLine(lines, m[1]), col: 1 });
      edges.push({ source: nodeId, target: `class:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(INTERFACE_RE)) {
      localFuncs.add(m[1]);
      nodes.push({ id: `interface:${relPath}#${m[1]}`, label: m[1], kind: 'interface', filePath: relPath, line: findLine(lines, m[1]), col: 1 });
      edges.push({ source: nodeId, target: `interface:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(TRAIT_RE)) {
      localFuncs.add(m[1]);
      nodes.push({ id: `trait:${relPath}#${m[1]}`, label: m[1], kind: 'type', filePath: relPath, line: findLine(lines, m[1]), col: 1, description: 'trait' });
      edges.push({ source: nodeId, target: `trait:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(ENUM_RE)) {
      localFuncs.add(m[1]);
      nodes.push({ id: `enum:${relPath}#${m[1]}`, label: m[1], kind: 'type', filePath: relPath, line: findLine(lines, m[1]), col: 1, description: 'enum' });
      edges.push({ source: nodeId, target: `enum:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(METHOD_RE)) {
      if (localFuncs.has(m[1])) continue;
      localFuncs.add(m[1]);
      nodes.push({ id: `func:${relPath}#${m[1]}`, label: m[1], kind: 'function', filePath: relPath, line: findLine(lines, m[1]), col: 1 });
      edges.push({ source: nodeId, target: `func:${relPath}#${m[1]}`, kind: 'contains' });
    }
    for (const m of content.matchAll(FUNC_RE)) {
      if (localFuncs.has(m[1])) continue;
      localFuncs.add(m[1]);
      nodes.push({ id: `func:${relPath}#${m[1]}`, label: m[1], kind: 'function', filePath: relPath, line: findLine(lines, m[1]), col: 1 });
      edges.push({ source: nodeId, target: `func:${relPath}#${m[1]}`, kind: 'contains' });
    }

    for (const m of content.matchAll(EXTENDS_RE)) {
      edges.push({ source: nodeId, target: `class:${m[1]}`, kind: 'extends', label: m[1] });
    }
    for (const m of content.matchAll(IMPLEMENTS_RE)) {
      for (const iface of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
        edges.push({ source: nodeId, target: `interface:${iface}`, kind: 'implements', label: iface });
      }
    }

    for (const m of content.matchAll(CALL_RE)) {
      const name = m[0].replace('(', '').trim();
      if (!name.startsWith('$') && !SKIP_CALLS.test(name) && localFuncs.has(name)) {
        edges.push({ source: nodeId, target: `func:${relPath}#${name}`, kind: 'calls', label: name });
      }
    }
  }

  return { nodes, edges };
}
