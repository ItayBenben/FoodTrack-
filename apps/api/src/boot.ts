/** Shared boot sequence for the server, the worker and the tests. Fails closed on any config error. */
import { join } from 'node:path';
import { configDir, loadEnv, readConfigJson, REPO_ROOT, type AnalysisConfig, type Env } from './config.js';
import { createPool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { loadKeys } from './crypto/keys.js';
import { TrackerRegistry } from './registry.js';
import { createLLMRouter } from './llm/router.js';
import { VolumeMediaStore } from './services/media-store.js';
import { EventBus } from './lib/events.js';
import type { Deps } from './app.js';

export async function boot(overrides: Partial<Record<keyof Env, string>> = {}, opts: { migrate?: boolean } = {}): Promise<Deps> {
  const env = loadEnv(overrides);
  if (opts.migrate !== false) await migrate(env.DATABASE_OWNER_URL, 'up', () => undefined);
  const registry = new TrackerRegistry(configDir(env));   // invalid definition → throws with path + reason
  await registry.register(env.DATABASE_OWNER_URL);
  const db = createPool(env.DATABASE_URL);
  const keys = await loadKeys(db, env.FOODTRACK_KEK);       // missing/wrong KEK → throws KeyError
  const analysis = readConfigJson<AnalysisConfig>('analysis.json', env);
  const llm = createLLMRouter(env);
  const media = new VolumeMediaStore(env.MEDIA_DIR.startsWith('/') ? env.MEDIA_DIR : join(REPO_ROOT, env.MEDIA_DIR));
  return { env, db, registry, keys, analysis, llm, media, events: new EventBus() };
}
