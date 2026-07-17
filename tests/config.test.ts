import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Config validation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('valid config passes validation and loads correctly', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.codemapperrc.json'),
      JSON.stringify({
        include: ['\\.ts$'],
        exclude: ['node_modules'],
        languages: ['typescript', 'rust'],
        nodeColors: { file: '#ff0000', function: '#00ff00' },
      }),
    );
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig(tmpDir);
    expect(config.include).toEqual(['\\.ts$']);
    expect(config.exclude).toEqual(['node_modules']);
    expect(config.languages).toEqual(['typescript', 'rust']);
    expect(config.nodeColors).toEqual({ file: '#ff0000', function: '#00ff00' });
  });

  it('unknown keys are rejected (config returns empty)', async () => {
    fs.writeFileSync(path.join(tmpDir, '.codemapperrc.json'), JSON.stringify({ unknownKey: true }));
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig(tmpDir);
    expect(config).toEqual({});
  });

  it('invalid regex patterns are rejected', async () => {
    fs.writeFileSync(path.join(tmpDir, '.codemapperrc.json'), JSON.stringify({ include: ['[invalid'] }));
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig(tmpDir);
    expect(config).toEqual({});
  });

  it('missing required fields returns valid empty config', async () => {
    fs.writeFileSync(path.join(tmpDir, '.codemapperrc.json'), JSON.stringify({}));
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig(tmpDir);
    expect(config).toEqual({});
  });

  it('config with all optional fields loads correctly', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.codemapperrc.json'),
      JSON.stringify({
        include: ['\\.ts$', '\\.js$'],
        exclude: ['dist', 'build'],
        languages: ['typescript', 'rust', 'python'],
        nodeColors: {
          file: '#30363d',
          function: '#d2a8ff',
          class: '#58a6ff',
          interface: '#79c0ff',
          type: '#3fb950',
        },
      }),
    );
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig(tmpDir);
    expect(config.include).toHaveLength(2);
    expect(config.exclude).toHaveLength(2);
    expect(config.languages).toHaveLength(3);
    expect(config.nodeColors).toBeDefined();
    expect(Object.keys(config.nodeColors!)).toHaveLength(5);
  });

  it('returns empty config for missing config file', async () => {
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig('/nonexistent/dir');
    expect(config).toEqual({});
  });

  it('handles malformed JSON gracefully', async () => {
    fs.writeFileSync(path.join(tmpDir, '.codemapperrc.json'), '{invalid json}');
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig(tmpDir);
    expect(config).toEqual({});
  });

  it('rejects invalid include types', async () => {
    fs.writeFileSync(path.join(tmpDir, '.codemapperrc.json'), JSON.stringify({ include: 'not-an-array' }));
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig(tmpDir);
    expect(config).toEqual({});
  });

  it('rejects invalid languages types', async () => {
    fs.writeFileSync(path.join(tmpDir, '.codemapperrc.json'), JSON.stringify({ languages: 42 }));
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig(tmpDir);
    expect(config).toEqual({});
  });

  it('rejects invalid nodeColors types', async () => {
    fs.writeFileSync(path.join(tmpDir, '.codemapperrc.json'), JSON.stringify({ nodeColors: 'not-an-object' }));
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig(tmpDir);
    expect(config).toEqual({});
  });

  it('loads valid rules config', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.codemapperrc.json'),
      JSON.stringify({
        rules: [
          { from: 'src/**', to: 'src/legacy/**', severity: 'error', description: 'No legacy deps' },
          { from: 'tests/**', to: 'src/**', severity: 'warn' },
          { from: '**/*.test.ts', to: '**/*.spec.ts', severity: 'forbidden' },
        ],
      }),
    );
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig(tmpDir);
    expect(config.rules).toHaveLength(3);
    expect(config.rules![0].severity).toBe('error');
    expect(config.rules![0].description).toBe('No legacy deps');
    expect(config.rules![1].severity).toBe('warn');
    expect(config.rules![2].severity).toBe('forbidden');
  });

  it('rejects rules with invalid severity', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.codemapperrc.json'),
      JSON.stringify({
        rules: [{ from: '**', to: '**', severity: 'invalid' }],
      }),
    );
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig(tmpDir);
    expect(config).toEqual({});
  });

  it('rejects rules with missing from field', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.codemapperrc.json'),
      JSON.stringify({
        rules: [{ to: '**', severity: 'error' }],
      }),
    );
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig(tmpDir);
    expect(config).toEqual({});
  });

  it('rejects non-array rules', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.codemapperrc.json'),
      JSON.stringify({ rules: 'not-an-array' }),
    );
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig(tmpDir);
    expect(config).toEqual({});
  });
});
