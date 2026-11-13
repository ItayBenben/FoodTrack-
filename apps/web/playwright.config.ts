import { defineConfig, devices } from '@playwright/test';

const DB = process.env.E2E_DB ?? 'foodtrack_e2e';
const API_PORT = 4100; const WEB_PORT = 3100;
const KEK = process.env.E2E_KEK ?? 'ZTJlLXRlc3Qta2V5LW5vdC1mb3ItcHJvZHVjdGlvbiE=';
const apiEnv = {
  NODE_ENV: 'development', PORT: String(API_PORT), FOODTRACK_KEK: KEK, MEDIA_DIR: '/tmp/foodtrack-e2e-media', LLM_PROVIDER: 'deterministic',
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? `postgres://foodtrack_app:foodtrack_app@localhost:5432/${DB}`,
  DATABASE_OWNER_URL: process.env.E2E_DATABASE_OWNER_URL ?? `postgres://foodtrack:foodtrack@localhost:5432/${DB}`,
  SESSION_SECRET: 'e2e-session-secret-at-least-32-characters-long', AUTH_RATE_LIMIT_PER_MIN: '1000', ANALYSIS_URL: 'http://127.0.0.1:8100',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'off', serviceWorkers: 'allow' },
  projects: [
    { name: 'ltr-en', use: { ...devices['Pixel 7'], locale: 'en-US' } },
    { name: 'rtl-he', use: { ...devices['Pixel 7'], locale: 'he-IL' } },
  ],
  webServer: [
    { command: `pnpm --filter @foodtrack/api exec tsx src/cli/e2e-reset.ts && pnpm --filter @foodtrack/api exec tsx src/server.ts`, port: API_PORT, env: apiEnv, reuseExistingServer: false, timeout: 120_000, cwd: '../..' },
    // rewrites are resolved at build time, so the e2e build must point at the e2e API
    { command: `npx next build && npx next start -p ${WEB_PORT}`, port: WEB_PORT, env: { API_INTERNAL_URL: `http://localhost:${API_PORT}` }, reuseExistingServer: false, timeout: 300_000 },
  ],
});
