#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import { startServer } from './server.js';

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
  .option('--no-open', 'Do not open browser automatically')
  .action(async (dir: string, opts: { port: string; open: boolean }) => {
    try {
      console.log(chalk.cyan(' codemapper ') + chalk.gray(' — analyzing codebase...'));
      const port = parseInt(opts.port, 10);
      const { url } = await startServer(dir, port);
      console.log(chalk.green(`  Viewer running at ${chalk.bold(url)}`));
      if (opts.open !== false) {
        await open(url);
      }
      // keep process alive
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
  .action(async (dir: string) => {
    try {
      const { analyzeCodebase } = await import('./analyze/index.js');
      const result = await analyzeCodebase(dir);
      process.stdout.write(JSON.stringify(result, null, 2));
    } catch (err: any) {
      console.error(chalk.red('Error:'), err.message);
      process.exit(1);
    }
  });

program.parse();
