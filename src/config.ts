import fs from 'node:fs';
import path from 'node:path';
import { Config } from './graph/index.js';
import { validateRegex } from './analyze/utils.js';

// Support both correct spelling and old typo for backwards compatibility
const CONFIG_FILES = ['.codemapperrc.json', '.codemaperrc.json'];

/** JSON Schema for .codemapperrc.json */
const CONFIG_SCHEMA: Record<string, string> = {
  include: 'array of strings (regex patterns for files to include)',
  exclude: 'array of strings (regex patterns for files to exclude)',
  languages: 'array of strings (language names: typescript, rust, python, go, java, csharp, swift, php)',
  nodeColors: 'object mapping node kinds to color strings',
  rules: 'array of rule objects (from, to, severity, description)',
};

const VALID_NODE_KINDS = ['file', 'function', 'class', 'interface', 'type', 'module', 'directory', 'enum'];

/**
 * Validate a parsed config object against the schema.
 * Returns an array of error messages (empty if valid).
 */
function validateConfig(parsed: unknown): string[] {
  const errors: string[] = [];

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    errors.push('Config must be a JSON object');
    return errors;
  }

  const obj = parsed as Record<string, unknown>;

  // Reject unknown keys
  const knownKeys = new Set(Object.keys(CONFIG_SCHEMA));
  for (const key of Object.keys(obj)) {
    if (!knownKeys.has(key)) {
      errors.push(`Unknown config key: "${key}". Valid keys: ${[...knownKeys].join(', ')}`);
    }
  }

  // Validate rules
  if (obj.rules !== undefined) {
    if (!Array.isArray(obj.rules)) {
      errors.push('Config key "rules" must be an array');
    } else {
      for (let i = 0; i < obj.rules.length; i++) {
        const rule = obj.rules[i];
        if (typeof rule !== 'object' || rule === null) {
          errors.push(`Config key "rules[${i}]" must be an object`);
          continue;
        }
        const r = rule as Record<string, unknown>;
        if (typeof r.from !== 'string') {
          errors.push(`Config key "rules[${i}].from" must be a string`);
        }
        if (typeof r.to !== 'string') {
          errors.push(`Config key "rules[${i}].to" must be a string`);
        }
        if (r.severity !== 'error' && r.severity !== 'warn' && r.severity !== 'forbidden') {
          errors.push(`Config key "rules[${i}].severity" must be one of: error, warn, forbidden`);
        }
        if (r.description !== undefined && typeof r.description !== 'string') {
          errors.push(`Config key "rules[${i}].description" must be a string`);
        }
      }
    }
  }

  // Validate include
  if (obj.include !== undefined) {
    if (!Array.isArray(obj.include)) {
      errors.push('Config key "include" must be an array of strings');
    } else {
      for (const item of obj.include) {
        if (typeof item !== 'string') {
          errors.push(`Config key "include" contains non-string value: ${JSON.stringify(item)}`);
        } else if (!validateRegex(item)) {
          errors.push(`Config key "include" contains invalid regex: "${item}"`);
        }
      }
    }
  }

  // Validate exclude
  if (obj.exclude !== undefined) {
    if (!Array.isArray(obj.exclude)) {
      errors.push('Config key "exclude" must be an array of strings');
    } else {
      for (const item of obj.exclude) {
        if (typeof item !== 'string') {
          errors.push(`Config key "exclude" contains non-string value: ${JSON.stringify(item)}`);
        } else if (!validateRegex(item)) {
          errors.push(`Config key "exclude" contains invalid regex: "${item}"`);
        }
      }
    }
  }

  // Validate languages
  if (obj.languages !== undefined) {
    if (!Array.isArray(obj.languages)) {
      errors.push('Config key "languages" must be an array of strings');
    } else {
      for (const item of obj.languages) {
        if (typeof item !== 'string') {
          errors.push(`Config key "languages" contains non-string value: ${JSON.stringify(item)}`);
        }
      }
    }
  }

  // Validate nodeColors
  if (obj.nodeColors !== undefined) {
    if (typeof obj.nodeColors !== 'object' || obj.nodeColors === null || Array.isArray(obj.nodeColors)) {
      errors.push('Config key "nodeColors" must be an object');
    } else {
      for (const [key, value] of Object.entries(obj.nodeColors as Record<string, unknown>)) {
        if (typeof value !== 'string') {
          errors.push(`Config key "nodeColors.${key}" must be a string (color value)`);
        }
      }
    }
  }

  return errors;
}

export function loadConfig(dir: string): Config {
  for (const configFile of CONFIG_FILES) {
    const configPath = path.join(dir, configFile);
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`  Error: Failed to parse ${configFile}: ${msg}`);
          return {};
        }

        const errors = validateConfig(parsed);
        if (errors.length > 0) {
          console.error(`  Error: Invalid config in ${configFile}:`);
          for (const err of errors) {
            console.error(`    - ${err}`);
          }
          return {};
        }

        const obj = parsed as Record<string, unknown>;
        const config: Config = {};
        if (Array.isArray(obj.include)) config.include = obj.include as string[];
        if (Array.isArray(obj.exclude)) config.exclude = obj.exclude as string[];
        if (Array.isArray(obj.languages)) config.languages = obj.languages as string[];
        if (obj.nodeColors && typeof obj.nodeColors === 'object')
          config.nodeColors = obj.nodeColors as Record<string, string>;
        if (Array.isArray(obj.rules)) config.rules = obj.rules as Config['rules'];

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
      const re = validateRegex(pattern);
      if (re && re.test(filePath)) return false;
    }
  }
  if (config.include) {
    for (const pattern of config.include) {
      const re = validateRegex(pattern);
      if (re && re.test(filePath)) return true;
    }
    return false;
  }
  return true;
}
