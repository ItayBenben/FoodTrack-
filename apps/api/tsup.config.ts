import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/server.ts', 'src/workers/index.ts', 'src/cli/migrate.ts', 'src/cli/seed.ts', 'src/cli/keys.ts', 'src/cli/reset-passphrase.ts', 'src/cli/vapid.ts', 'src/cli/e2e-reset.ts'],
  format: ['esm'], target: 'node22', platform: 'node', sourcemap: true, clean: true,
  noExternal: [/^@foodtrack\//],
});
