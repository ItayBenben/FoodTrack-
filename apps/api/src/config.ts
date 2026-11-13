import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'config', 'trackers'))) return dir;
    dir = resolve(dir, '..');
  }
  return process.cwd();
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgres://foodtrack_app:foodtrack_app@localhost:5432/foodtrack'),
  DATABASE_OWNER_URL: z.string().default('postgres://foodtrack:foodtrack@localhost:5432/foodtrack'),
  SESSION_SECRET: z.string().min(32).default('dev-only-session-secret-change-me-0123456789'),
  FOODTRACK_KEK: z.string().optional(),
  ANALYSIS_URL: z.string().default('http://localhost:8000'),
  MEDIA_DIR: z.string().default('./data/media'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL_TEXT: z.string().optional(),
  ANTHROPIC_MODEL_VISION: z.string().optional(),
  OPENAI_COMPAT_URL: z.string().optional(),
  OPENAI_COMPAT_MODEL: z.string().optional(),
  LLM_PROVIDER: z.enum(['auto', 'anthropic', 'openai-compat', 'deterministic']).default('auto'),
  AUTH_MODE: z.enum(['single', 'multi']).default('single'),
  CONFIG_DIR: z.string().optional(),
  PUBLIC_ORIGIN: z.string().default('http://localhost:3000'),
  OFF_USER_AGENT: z.string().optional(),
  FDC_API_KEY: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  INTERNAL_NETWORK_CIDRS: z.string().default('127.0.0.1/32,::1/128,172.16.0.0/12,10.0.0.0/8'),
  LOG_LEVEL: z.string().default('info'),
});
export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  const env = EnvSchema.parse({ ...process.env, ...overrides });
  if (env.NODE_ENV === 'production' && env.SESSION_SECRET.startsWith('dev-only')) {
    throw new Error('SESSION_SECRET must be set in production');
  }
  return env;
}

export const REPO_ROOT = findRepoRoot();
// .env at the repo root is loaded for dev and CLI use; real environment variables win.
if (process.env.NODE_ENV !== 'test' && existsSync(join(REPO_ROOT, '.env'))) {
  const before = { ...process.env };
  process.loadEnvFile(join(REPO_ROOT, '.env'));
  Object.assign(process.env, before);
}
export function configDir(env?: Env) { return env?.CONFIG_DIR ?? join(REPO_ROOT, 'config'); }
export function readConfigJson<T = unknown>(name: string, env?: Env): T {
  return JSON.parse(readFileSync(join(configDir(env), name), 'utf8')) as T;
}

export interface AnalysisConfig {
  engine_version: string; min_day_weight: number; lag_windows_hours: [number, number][];
  day_weight: { meal_coverage: number; outcome_recorded: number; checkin_present: number };
  gut_day_score: Record<string, number>; exact_recording_delay_hours: number; slot_median_min_observations: number;
  trial_default: { baseline_days: number; elimination_days: number; washout_days: number; challenge_days: number; followup_days: number; analytic_washout_k: number; min_adherence: number; min_days_logged: number };
  max_active_trials: number; max_concurrent_eliminations: number; avoid_list_suppression_days: number;
  trial_min_interesting_rd: number; trial_min_days_per_phase: number; design_b_prevalence_threshold: number;
  dismissal_reopen_delta: number; washout_cap_days: number; trial_decision_bar: number; blinding_divergence_threshold: number;
  population_transit_median_hours: number; transit_min_measurements: number;
  [k: string]: unknown;
}
