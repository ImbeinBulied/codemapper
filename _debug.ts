import { analyzeRust } from './src/analyze/rust.js';
import { analyzeCSharp } from './src/analyze/csharp.js';
import { analyzeSwift } from './src/analyze/swift.js';
import { analyzePhp } from './src/analyze/php.js';

const FIXTURES = './tests/fixtures/adversarial';

async function debugParser(name: string, fn: any) {
  const result = await fn(FIXTURES, FIXTURES);
  const ids = result.nodes.map((n: any) => n.id);
  const uniqueIds = new Set(ids);
  const dupes = ids.filter((id: any, i: number) => ids.indexOf(id) !== i);
  console.log(`\n=== ${name} ===`);
  console.log('Total:', ids.length, 'Unique:', uniqueIds.size, 'Dupes:', dupes.length);
  if (dupes.length) console.log('  Dupes:', dupes);
  
  const edgeKeys = result.edges.map((e: any) => `${e.source}|${e.kind}|${e.target}|${e.label || ''}`);
  const uniqueEdgeKeys = new Set(edgeKeys);
  console.log('Total edges:', edgeKeys.length, 'Unique edges:', uniqueEdgeKeys.size);
  if (edgeKeys.length !== uniqueEdgeKeys.size) {
    const edgeDupes = edgeKeys.filter((k: any, i: number) => edgeKeys.indexOf(k) !== i);
    console.log('  Edge dupes:', edgeDupes.slice(0, 10));
  }
}

await debugParser('Rust', analyzeRust);
await debugParser('CSharp', analyzeCSharp);
await debugParser('Swift', analyzeSwift);
await debugParser('PHP', analyzePhp);
