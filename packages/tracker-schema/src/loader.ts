/**
 * Startup loader: reads config/trackers/*.json and config/packs/*.json,
 * validates every file, and fails loudly with the exact path and reason.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  contentHash, formatZodIssues, PackSchema, parseTrackerDefinition, TrackerDefinitionError,
  type Pack, type TrackerDefinition,
} from './index.js';

export interface LoadedTracker { def: TrackerDefinition; hash: string; source: string }

export function loadTrackerDir(dir: string): LoadedTracker[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const out: LoadedTracker[] = [];
  const seen = new Map<string, string>();
  for (const file of files) {
    const source = join(dir, file);
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(source, 'utf8')); } catch (e) {
      throw new TrackerDefinitionError(source, [`not valid JSON: ${(e as Error).message}`]);
    }
    const def = parseTrackerDefinition(raw, source);
    if (`${def.key}.json` !== file) throw new TrackerDefinitionError(source, [`key '${def.key}' does not match filename`]);
    if (seen.has(def.key)) throw new TrackerDefinitionError(source, [`duplicate key '${def.key}' (also in ${seen.get(def.key)})`]);
    seen.set(def.key, source);
    out.push({ def, hash: contentHash(def), source });
  }
  if (out.length === 0) throw new TrackerDefinitionError(dir, ['no tracker definitions found']);
  return out;
}

export function loadPackDir(dir: string, trackerKeys: Set<string>): Pack[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  return files.map((file) => {
    const source = join(dir, file);
    const res = PackSchema.safeParse(JSON.parse(readFileSync(source, 'utf8')));
    if (!res.success) throw new TrackerDefinitionError(source, formatZodIssues(res.error));
    const missing = res.data.trackers.filter((t) => !trackerKeys.has(t));
    if (missing.length) throw new TrackerDefinitionError(source, missing.map((m) => `unknown tracker '${m}'`));
    return res.data;
  });
}
