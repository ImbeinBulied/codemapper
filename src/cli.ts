#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
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
  .option('-f, --filter <pattern>', 'Filter files by regex pattern')
  .option('-w, --watch', 'Watch for file changes and auto-refresh')
  .option('-d, --deep', 'Use tree-sitter AST parsing (slower, more accurate)')
  .option('--no-open', 'Do not open browser automatically')
  .action(async (dir: string, opts: { port: string; open: boolean; filter?: string; watch?: boolean; deep?: boolean }) => {
    try {
      console.log(chalk.cyan(' codemapper ') + chalk.gray(' — analyzing codebase...'));
      const port = parseInt(opts.port, 10);
      const { url } = await startServer(dir, port, { filter: opts.filter, watch: opts.watch, deep: opts.deep });
      console.log(chalk.green(`  Viewer running at ${chalk.bold(url)}`));
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
  });

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

program.parse();
