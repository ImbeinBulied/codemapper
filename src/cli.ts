#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './server.js';
import { analyzeCodebase } from './analyze/index.js';
import { toSVG, toJSON } from './export.js';

const program = new Command();

program
  .name('codemapper')
  .description('Interactive codebase graph visualizer — infinite canvas for code architecture')
  .version('0.1.0');

program
  .command('view')
  .description('Open an interactive graph view of a codebase')
  .argument('<directory>', 'Path to the codebase directory')
  .option('-p, --port <number>', 'Port to serve on', '5001')
  .option('-H, --host <host>', 'Host to bind to', '127.0.0.1')
  .option('-f, --filter <pattern>', 'Filter files by regex pattern')
  .option('-w, --watch', 'Watch for file changes and auto-refresh')
  .option('-d, --deep', 'Use tree-sitter AST parsing (slower, more accurate)')
  .option('--no-open', 'Do not open browser automatically')
  .action(
    async (
      dir: string,
      opts: { port: string; host: string; open: boolean; filter?: string; watch?: boolean; deep?: boolean },
    ) => {
      try {
        console.log(chalk.cyan(' codemapper ') + chalk.gray(' — analyzing codebase...'));
        const port = parseInt(opts.port, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          console.error(chalk.red('Error:'), `Invalid port ${opts.port}. Must be between 1 and 65535.`);
          process.exit(1);
        }
        const { url } = await startServer(dir, port, {
          filter: opts.filter,
          watch: opts.watch,
          deep: opts.deep,
          host: opts.host,
        });
        console.log(chalk.green(`  Viewer running at ${chalk.bold(url)}`));
        if (opts.open !== false) {
          await open(url);
        }
        if (opts.watch) {
          console.log(chalk.gray('  Watching for changes...'));
        }
        await new Promise(() => {});
      } catch (err: any) {
        console.error(chalk.red('Error:'), err.message);
        process.exit(1);
      }
    },
  );

program
  .command('analyze')
  .description('Analyze a codebase and output graph JSON to stdout')
  .argument('<directory>', 'Path to the codebase directory')
  .option('-f, --filter <pattern>', 'Filter files by regex pattern')
  .option('-o, --output <file>', 'Write output to file instead of stdout')
  .option('--format <format>', 'Output format: json or svg', 'json')
  .option('-d, --deep', 'Use tree-sitter AST parsing (slower, more accurate)')
  .action(async (dir: string, opts: { filter?: string; output?: string; format: string; deep?: boolean }) => {
    try {
      const result = await analyzeCodebase(dir, opts.filter, opts.deep);
      const fmt = opts.format.toLowerCase();
      if (fmt === 'svg') {
        const svg = toSVG(result);
        if (opts.output) {
          const fs = await import('node:fs');
          fs.writeFileSync(opts.output, svg, 'utf-8');
          console.log(chalk.green(`  Wrote SVG to ${chalk.bold(opts.output)}`));
        } else {
          process.stdout.write(svg);
        }
      } else {
        const json = toJSON(result);
        if (opts.output) {
          const fs = await import('node:fs');
          fs.writeFileSync(opts.output, json, 'utf-8');
          console.log(chalk.green(`  Wrote JSON to ${chalk.bold(opts.output)}`));
        } else {
          process.stdout.write(json + '\n');
        }
      }
    } catch (err: any) {
      console.error(chalk.red('Error:'), err.message);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Scaffold a .codemaperrc.json config file')
  .argument('[directory]', 'Project directory', '.')
  .action(async (dir: string) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> => new Promise((r) => rl.question(q, r));

    try {
      console.log(chalk.cyan(' codemapper ') + chalk.gray(' — scaffold config\n'));

      const include = (await ask('  Include pattern (e.g. src/ — leave empty for all): ')).trim();
      const exclude = (await ask('  Exclude pattern (e.g. __tests__|vendor): ')).trim();
      const langs = (await ask('  Languages (comma-separated, empty for auto-detect): ')).trim();

      const config: Record<string, any> = {};
      if (include) config.include = [include];
      if (exclude)
        config.exclude = exclude
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean);
      if (langs)
        config.languages = langs
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

      const configPath = path.resolve(dir, '.codemaperrc.json');
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      console.log(chalk.green(`  Wrote ${chalk.bold(configPath)}`));
    } catch (err: any) {
      console.error(chalk.red('Error:'), err.message);
    }
    rl.close();
  });

program
  .command('diff')
  .description('Compare two analysis snapshots')
  .argument('<before>', 'First JSON file (before)')
  .argument('<after>', 'Second JSON file (after)')
  .option('--json', 'Output as JSON')
  .action((before: string, after: string, opts: { json?: boolean }) => {
    try {
      const a = JSON.parse(fs.readFileSync(before, 'utf-8'));
      const b = JSON.parse(fs.readFileSync(after, 'utf-8'));

      const aNodes = new Map(a.graph.nodes.map((n: any) => [n.id, n]));
      const bNodes = new Map(b.graph.nodes.map((n: any) => [n.id, n]));
      const aEdges = new Set(a.graph.edges.map((e: any) => `${e.source}|${e.kind}|${e.target}`));
      const bEdges = new Set(b.graph.edges.map((e: any) => `${e.source}|${e.kind}|${e.target}`));

      const added = b.graph.nodes.filter((n: any) => !aNodes.has(n.id));
      const removed = a.graph.nodes.filter((n: any) => !bNodes.has(n.id));
      const addedEdges = b.graph.edges.filter((e: any) => !aEdges.has(`${e.source}|${e.kind}|${e.target}`));
      const removedEdges = a.graph.edges.filter((e: any) => !bEdges.has(`${e.source}|${e.kind}|${e.target}`));

      const summary = {
        before: { files: a.stats.files, functions: a.stats.functions, imports: a.stats.imports },
        after: { files: b.stats.files, functions: b.stats.functions, imports: b.stats.imports },
        added: { nodes: added.length, edges: addedEdges.length },
        removed: { nodes: removed.length, edges: removedEdges.length },
        newFiles: added.filter((n: any) => n.kind === 'file').map((n: any) => n.filePath),
        removedFiles: removed.filter((n: any) => n.kind === 'file').map((n: any) => n.filePath),
      };

      if (opts.json) {
        process.stdout.write(JSON.stringify(summary, null, 2));
      } else {
        const s = summary;
        console.log(chalk.cyan('\n codemapper diff\n'));
        console.log(
          `  Files:      ${s.before.files} → ${s.after.files} (${chalk.green('+' + (s.after.files - s.before.files))})`,
        );
        console.log(`  Functions:  ${s.before.functions} → ${s.after.functions}`);
        console.log(`  Imports:    ${s.before.imports} → ${s.after.imports}`);
        console.log(`  Added:      ${chalk.green(s.added.nodes + ' nodes, ' + s.added.edges + ' edges')}`);
        console.log(`  Removed:    ${chalk.red(s.removed.nodes + ' nodes, ' + s.removed.edges + ' edges')}`);
        if (s.newFiles.length > 0) console.log(`\n  New files:\n    ${s.newFiles.join('\n    ')}`);
        if (s.removedFiles.length > 0) console.log(`\n  Removed files:\n    ${s.removedFiles.join('\n    ')}`);
        console.log();
      }
    } catch (err: any) {
      console.error(chalk.red('Error:'), err.message);
      process.exit(1);
    }
  });

program.parse();
