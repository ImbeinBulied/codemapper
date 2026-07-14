/**
 * Git integration — blame info and file churn metrics.
 */

import { execSync } from 'node:child_process';

export interface GitBlameInfo {
  lastModified: string;
  author: string;
  commitHash: string;
  /** Days since last change */
  age: number;
}

/**
 * Get per-line blame information for a file.
 * Returns a Map of line number → blame info.
 */
export function getBlameForFile(filePath: string, rootDir: string): Map<number, GitBlameInfo> {
  const blameMap = new Map<number, GitBlameInfo>();
  try {
    const relPath = filePath.startsWith(rootDir) ? filePath.slice(rootDir.length).replace(/\\/g, '/') : filePath;
    const output = execSync(`git blame --porcelain "${relPath}"`, {
      cwd: rootDir,
      encoding: 'utf-8',
      timeout: 5000,
    });

    // Parse porcelain format
    const lines = output.split('\n');
    const now = Date.now();
    let currentHash = '';
    let author = '';
    let authorTime = '';

    for (const line of lines) {
      // Header line: <hash> <orig-line> <final-line> [<count>]
      if (/^[0-9a-f]{40}/.test(line)) {
        currentHash = line.slice(0, 40);
      } else if (line.startsWith('author ')) {
        author = line.slice(7);
      } else if (line.startsWith('author-time ')) {
        authorTime = line.slice(12);
      } else if (line.startsWith('\t')) {
        // This is the actual content line — emit blame for it
        // We need to figure out which line number this is
        // The header tells us the final line number
      }
    }

    // Simpler approach: parse blame output line by line
    // git blame --porcelain groups per commit, so let's re-parse
    const commitMap = new Map<string, { author: string; authorTime: number }>();
    const lineCommit = new Map<number, string>();
    let currentCommit = '';
    let finalLine = 0;

    for (const line of lines) {
      const headerMatch = line.match(/^([0-9a-f]{40})\s+(\d+)\s+(\d+)/);
      if (headerMatch) {
        currentCommit = headerMatch[1];
        finalLine = parseInt(headerMatch[3]);
        continue;
      }
      if (line.startsWith('author ')) {
        const authorName = line.slice(7);
        if (!commitMap.has(currentCommit)) {
          commitMap.set(currentCommit, {
            author: authorName,
            authorTime: 0,
          });
        } else {
          commitMap.get(currentCommit)!.author = authorName;
        }
      }
      if (line.startsWith('author-time ')) {
        const time = parseInt(line.slice(12));
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
    // Not a git repo or file not tracked
  }
  return blameMap;
}

/**
 * Get the number of commits touching a file in the last N days.
 */
export function getFileChurn(filePath: string, rootDir: string, days = 90): number {
  try {
    const relPath = filePath.startsWith(rootDir) ? filePath.slice(rootDir.length).replace(/\\/g, '/') : filePath;
    const output = execSync(`git log --since="${days} days ago" --format="%H" -- "${relPath}" | wc -l`, {
      cwd: rootDir,
      encoding: 'utf-8',
      timeout: 5000,
    });
    return parseInt(output.trim()) || 0;
  } catch {
    return 0;
  }
}
