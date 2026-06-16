import fs from 'node:fs';
import path from 'node:path';
import { Config } from './graph/index.js';

const CONFIG_FILE = '.codemaperrc.json';
const CONFIG_FIELDS = ['include', 'exclude', 'languages', 'nodeColors'];

export function loadConfig(dir: string): Config {
  const configPath = path.join(dir, CONFIG_FILE);
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const config: Config = {};
      if (Array.isArray(parsed.include)) config.include = parsed.include;
      if (Array.isArray(parsed.exclude)) config.exclude = parsed.exclude;
      if (Array.isArray(parsed.languages)) config.languages = parsed.languages;
      if (parsed.nodeColors && typeof parsed.nodeColors === 'object') config.nodeColors = parsed.nodeColors;
      return config;
    }
  } catch { }
  return {};
}

export function shouldIncludeFile(filePath: string, config: Config): boolean {
  if (config.exclude) {
    for (const pattern of config.exclude) {
      try {
        if (new RegExp(pattern).test(filePath)) return false;
      } catch { }
    }
  }
  if (config.include) {
    for (const pattern of config.include) {
      try {
        if (new RegExp(pattern).test(filePath)) return true;
      } catch { }
    }
    return false;
  }
  return true;
}
