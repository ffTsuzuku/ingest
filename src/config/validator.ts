import type { RawConfig } from "./types.js";

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate the structure and types of a raw parsed configuration object.
 * Returns an array of validation errors (empty if valid).
 */
export function validateConfig(raw: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push({ field: 'root', message: 'Configuration must be a JSON object' });
    return errors;
  }

  const config = raw as Record<string, unknown>;

  // repos must be an array if present
  if ('repos' in config && config.repos !== undefined) {
    if (!Array.isArray(config.repos)) {
      errors.push({ field: 'repos', message: '"repos" must be an array of repository configurations' });
    } else {
      for (let i = 0; i < config.repos.length; i++) {
        const repo = config.repos[i];
        if (!repo || typeof repo !== 'object' || Array.isArray(repo)) {
          errors.push({ field: `repos[${i}]`, message: `repos[${i}] must be an object` });
          continue;
        }
        const r = repo as Record<string, unknown>;
        if (typeof r.path !== 'string' || r.path.trim() === '') {
          errors.push({ field: `repos[${i}].path`, message: `repos[${i}].path must be a non-empty string` });
        }
        if ('branches' in r && r.branches !== undefined && !Array.isArray(r.branches)) {
          errors.push({ field: `repos[${i}].branches`, message: `repos[${i}].branches must be an array of strings` });
        }
        if ('max_diff_lines' in r && r.max_diff_lines !== undefined && typeof r.max_diff_lines !== 'number') {
          errors.push({ field: `repos[${i}].max_diff_lines`, message: `repos[${i}].max_diff_lines must be a number` });
        }
        if ('diff_ignore_patterns' in r && r.diff_ignore_patterns !== undefined && !Array.isArray(r.diff_ignore_patterns)) {
          errors.push({ field: `repos[${i}].diff_ignore_patterns`, message: `repos[${i}].diff_ignore_patterns must be an array of strings` });
        }
        if ('diff_mode' in r && r.diff_mode !== undefined && typeof r.diff_mode !== 'boolean') {
          errors.push({ field: `repos[${i}].diff_mode`, message: `repos[${i}].diff_mode must be a boolean` });
        }
      }
    }
  }

  // output_root must be a string if present
  if ('output_root' in config && config.output_root !== undefined && typeof config.output_root !== 'string') {
    errors.push({ field: 'output_root', message: '"output_root" must be a string path' });
  }

  // retention_days must be a number if present
  if ('retention_days' in config && config.retention_days !== undefined && typeof config.retention_days !== 'number') {
    errors.push({ field: 'retention_days', message: '"retention_days" must be a number' });
  }

  // prompt must be a string if present
  if ('prompt' in config && config.prompt !== undefined && typeof config.prompt !== 'string') {
    errors.push({ field: 'prompt', message: '"prompt" must be a string' });
  }

  // default_provider must be a string if present
  if ('default_provider' in config && config.default_provider !== undefined && typeof config.default_provider !== 'string') {
    errors.push({ field: 'default_provider', message: '"default_provider" must be a string' });
  }

  // provider/agents must be an object if present
  if ('provider' in config && config.provider !== undefined && (typeof config.provider !== 'object' || Array.isArray(config.provider) || config.provider === null)) {
    errors.push({ field: 'provider', message: '"provider" must be an object mapping provider names to their configurations' });
  }
  if ('agents' in config && config.agents !== undefined && (typeof config.agents !== 'object' || Array.isArray(config.agents) || config.agents === null)) {
    errors.push({ field: 'agents', message: '"agents" must be an object mapping agent names to their configurations' });
  }

  // diff_ignore_patterns must be an array if present
  if ('diff_ignore_patterns' in config && config.diff_ignore_patterns !== undefined && !Array.isArray(config.diff_ignore_patterns)) {
    errors.push({ field: 'diff_ignore_patterns', message: '"diff_ignore_patterns" must be an array of strings' });
  }

  // report_style must be a string if present
  if ('report_style' in config && config.report_style !== undefined && typeof config.report_style !== 'string') {
    errors.push({ field: 'report_style', message: '"report_style" must be a string' });
  }

  return errors;
}
