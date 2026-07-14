import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBlameForFile, getFileChurn } from '../src/git.js';

// Mock execSync
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
const mockExecSync = vi.mocked(execSync);

describe('Git integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBlameForFile', () => {
    it('returns blame info with parsed porcelain output', () => {
      const hash = 'a'.repeat(40);
      const time = Math.floor(Date.now() / 1000) - 86400; // 1 day ago
      const porcelainOutput = [
        `${hash} 1 1 1`,
        `author Alice`,
        `author-mail <alice@example.com>`,
        `author-time ${time}`,
        `author-tz +0000`,
        `committer Alice`,
        `summary initial commit`,
        `\tconsole.log("hello");`,
        `${hash} 2 2 1`,
        `author Alice`,
        `author-mail <alice@example.com>`,
        `author-time ${time}`,
        `author-tz +0000`,
        `committer Alice`,
        `summary initial commit`,
        `\treturn true;`,
      ].join('\n');

      mockExecSync.mockReturnValue(porcelainOutput);

      const blame = getBlameForFile('src/test.ts', '/root');
      expect(blame.size).toBe(2);
      const line1 = blame.get(1);
      expect(line1).toBeDefined();
      expect(line1!.author).toBe('Alice');
      expect(line1!.commitHash).toBe(hash);
      expect(line1!.age).toBe(1);
      expect(line1!.lastModified).toBeTruthy();
    });

    it('returns empty map when execSync throws (not a git repo)', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not a git repository');
      });

      const blame = getBlameForFile('src/test.ts', '/root');
      expect(blame.size).toBe(0);
    });

    it('returns empty map for untracked files', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('fatal: not a tracked file');
      });

      const blame = getBlameForFile('src/untracked.ts', '/root');
      expect(blame.size).toBe(0);
    });
  });

  describe('getFileChurn', () => {
    it('returns commit count from git log', () => {
      mockExecSync.mockReturnValue('15\n');

      const churn = getFileChurn('src/test.ts', '/root');
      expect(churn).toBe(15);
    });

    it('returns 0 when execSync throws (not a git repo)', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not a git repository');
      });

      const churn = getFileChurn('src/test.ts', '/root');
      expect(churn).toBe(0);
    });

    it('returns 0 for empty output', () => {
      mockExecSync.mockReturnValue('0\n');

      const churn = getFileChurn('src/new.ts', '/root');
      expect(churn).toBe(0);
    });

    it('uses custom days parameter', () => {
      mockExecSync.mockReturnValue('5\n');

      const churn = getFileChurn('src/test.ts', '/root', 30);
      expect(churn).toBe(5);
      // Verify the command includes the days parameter
      const cmd = mockExecSync.mock.calls[0][0] as string;
      expect(cmd).toContain('30 days ago');
    });
  });
});
