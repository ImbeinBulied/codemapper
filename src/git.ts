/**
 * Git integration — churn metrics, blame info, and path validation.
 *
 * All git commands use execFile (not exec) to prevent shell injection.
 * All file paths are validated to be strictly inside the project root.
 */

import { execFile } from 'node:child_process';
import path from 'node:path';

export interface GitBlameInfo {
  lastModified: string;
  author: string;
  commitHash: string;
  /** Days since last change */
  age: number;
}

export interface FileChurn {
  /** Number of commits touching this file in the analysis period */
  count: number;
  /** ISO-8601 date of most recent commit touching this file */
  lastModified: string;
}

export interface GitChurnResult {
  /** Per-file churn information, keyed by absolute file path */
  files: Map<string, FileChurn>;
  /** Total number of commits in the analysis period */
  totalCommits: number;
}

/**
 * Validate that a file path is strictly inside a project root.
 * Resolves both paths and checks the resolved path starts with the resolved root.
 * Throws if the path escapes outside the root.
 */
export function validateGitPath(filePath: string, rootDir: string): string {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedPath = path.resolve(rootDir, filePath);

  if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
    throw new Error(`Path traversal detected: "${filePath}" resolves outside project root "${resolvedRoot}"`);
  }

  return resolvedPath;
}

/**
 * Run a git command safely using execFile.
 * Returns stdout as a string, or throws on error.
 */
function runGit(args: string[], cwd: string, maxBuffer = 5 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'git',
      args,
      {
        cwd,
        maxBuffer,
        timeout: 15000,
      },
      (err, stdout) => {
        if (err) {
          // Include stderr for debugging but don't leak in error message
          reject(new Error(`git ${args[0]} failed: ${err.message}`));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/**
 * Get churn data for all files in the repository.
 *
 * Runs `git log --format=format: --name-only --since="6 months ago"` to gather
 * all files touched by each commit, then counts per-file occurrences and
 * queries the last-modified date.
 *
 * @param rootDir Absolute path to the git repository root
 * @param since   Git date specification (default: "6 months ago")
 */
export async function getGitChurn(rootDir: string, since = '6 months ago'): Promise<GitChurnResult> {
  // Validate rootDir to prevent issues
  const resolvedRoot = path.resolve(rootDir);

  // Gather all files touched in commits within the time window
  const logOutput = await runGit(
    ['log', '--format=format:', '--name-only', `--since=${since}`],
    resolvedRoot,
    10 * 1024 * 1024,
  );

  // Parse output: each commit is separated by blank lines; filenames are listed one per line
  const fileCounts = new Map<string, number>();
  const lines = logOutput.split('\n');

  let commitCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      // Blank line separates commits — but also use entries themselves
      continue;
    }
    // Skip lines that look like commit header (format=format: ensures they're blank)
    // Count unique commits
    if (fileCounts.size === 0 || !fileCounts.has(trimmed)) {
      commitCount++;
    }
    fileCounts.set(trimmed, (fileCounts.get(trimmed) || 0) + 1);
  }

  // Dedup: because blank-line-separated commits can have repeated filenames within a commit,
  // we should count unique commits per file, not total occurrences.
  // Actually the --name-only output per commit has each file listed once per commit.
  // Let's re-parse more carefully: each block of non-empty lines between empty lines = one commit.
  const commitFiles: string[][] = [];
  let currentCommit: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      if (currentCommit.length > 0) {
        commitFiles.push([...new Set(currentCommit)]);
        currentCommit = [];
      }
      continue;
    }
    currentCommit.push(trimmed);
  }
  if (currentCommit.length > 0) {
    commitFiles.push([...new Set(currentCommit)]);
  }

  // Count unique commits per file
  const uniqueCommitCounts = new Map<string, number>();
  for (const files of commitFiles) {
    for (const f of files) {
      uniqueCommitCounts.set(f, (uniqueCommitCounts.get(f) || 0) + 1);
    }
  }

  // Get last-modified date for each unique file
  const churnFiles = new Map<string, FileChurn>();
  const uniqueFiles = Array.from(uniqueCommitCounts.keys());

  // Batch query last-modified dates in parallel (but limit concurrency)
  const batchSize = 20;
  for (let i = 0; i < uniqueFiles.length; i += batchSize) {
    const batch = uniqueFiles.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (filePath) => {
        try {
          const dateOutput = await runGit(['log', '-1', '--format=%ci', '--', filePath], resolvedRoot);
          const lastModified = dateOutput.trim().split('\n')[0] || new Date(0).toISOString();
          return { filePath, lastModified };
        } catch {
          return { filePath, lastModified: new Date(0).toISOString() };
        }
      }),
    );
    for (const r of results) {
      churnFiles.set(r.filePath, {
        count: uniqueCommitCounts.get(r.filePath) || 0,
        lastModified: r.lastModified,
      });
    }
  }

  return {
    files: churnFiles,
    totalCommits: commitFiles.length,
  };
}

/**
 * Get the number of commits touching a file in the last N days.
 * Uses execFile for safety.
 */
export async function getFileChurn(filePath: string, rootDir: string, days = 90): Promise<number> {
  try {
    validateGitPath(filePath, rootDir);
    const relPath = path.relative(rootDir, path.resolve(rootDir, filePath));
    const output = await runGit(['log', '--oneline', `--since="${days} days ago"`, '--', relPath], rootDir);

    // Count non-empty lines (each line is one commit)
    const lines = output
      .trim()
      .split('\n')
      .filter((l) => l.length > 0);
    return lines.length;
  } catch {
    return 0;
  }
}

/**
 * Get per-line blame information for a file.
 * Returns a Map of line number → blame info.
 * Uses execFile for safety.
 */
export async function getBlameForFile(filePath: string, rootDir: string): Promise<Map<number, GitBlameInfo>> {
  const blameMap = new Map<number, GitBlameInfo>();

  try {
    validateGitPath(filePath, rootDir);
    const relPath = path.relative(rootDir, path.resolve(rootDir, filePath));
    const output = await runGit(['blame', '--porcelain', relPath], rootDir);

    const lines = output.split('\n');
    const now = Date.now();

    // Parse git blame --porcelain format
    // Groups: header line (hash orig-line final-line count), then metadata lines, then content line (\t...)
    const commitMap = new Map<string, { author: string; authorTime: number }>();
    const lineCommit = new Map<number, string>();
    let currentCommit = '';
    let finalLine = 0;

    for (const line of lines) {
      const headerMatch = line.match(/^([0-9a-f]{40})\s+(\d+)\s+(\d+)/);
      if (headerMatch) {
        currentCommit = headerMatch[1];
        finalLine = parseInt(headerMatch[3], 10);
        continue;
      }
      if (line.startsWith('author ')) {
        const authorName = line.slice(7);
        if (!commitMap.has(currentCommit)) {
          commitMap.set(currentCommit, { author: authorName, authorTime: 0 });
        } else {
          commitMap.get(currentCommit)!.author = authorName;
        }
      }
      if (line.startsWith('author-time ')) {
        const time = parseInt(line.slice(12), 10);
        if (!commitMap.has(currentCommit)) {
          commitMap.set(currentCommit, { author: '', authorTime: time });
        } else {
          commitMap.get(currentCommit)!.authorTime = time;
        }
      }
      if (line.startsWith('\t')) {
        lineCommit.set(finalLine, currentCommit);
      }
    }

    // Build the blame map
    for (const [lineNum, commitHash] of lineCommit) {
      const info = commitMap.get(commitHash);
      if (info) {
        const daysSince = Math.floor((now - info.authorTime * 1000) / (1000 * 60 * 60 * 24));
        blameMap.set(lineNum, {
          lastModified: new Date(info.authorTime * 1000).toISOString(),
          author: info.author,
          commitHash,
          age: daysSince,
        });
      }
    }
  } catch {
    // Not a git repo or file not tracked — return empty map
  }

  return blameMap;
}
