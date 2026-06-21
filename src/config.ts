import fs from 'node:fs';
import path from 'node:path';
import { Config } from './graph/index.js';

// Support both correct spelling and old typo for backwards compatibility
const CONFIG_FILES = ['.codemapperrc.json', '.codemaperrc.json'];
const CONFIG_FIELDS = ['include', 'exclude', 'languages', 'nodeColors'];

export function loadConfig(dir: string): Config {
  for (const configFile of CONFIG_FILES) {
    const configPath = path.join(dir, configFile);
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const config: Config = {};
        if (Array.isArray(parsed.include)) config.include = parsed.include;
        if (Array.isArray(parsed.exclude)) config.exclude = parsed.exclude;
        if (Array.isArray(parsed.languages)) config.languages = parsed.languages;
        if (parsed.nodeColors && typeof parsed.nodeColors === 'object') config.nodeColors = parsed.nodeColors;
        // Warn if using old filename
        if (configFile === '.codemaperrc.json') {
          console.warn('  Note: Rename .codemaperrc.json → .codemapperrc.json (typo fix)');
        }
        return config;
      }
    } catch {}
  }
  return {};
}

export function shouldIncludeFile(filePath: string, config: Config): boolean {
  if (config.exclude) {
    for (const pattern of config.exclude) {
      try {
        if (new RegExp(pattern).test(filePath)) return false;
      } catch {}
    }
  }
  if (config.include) {
    for (const pattern of config.include) {
      try {
        if (new RegExp(pattern).test(filePath)) return true;
      } catch {}
    }
    return false;
  }
  return true;
}
