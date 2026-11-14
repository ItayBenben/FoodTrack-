/**
 * pnpm db:seed — seed shared foods, then (optionally) a demo user with 90 days of
 * synthetic data carrying a known dairy → loose-stool effect at 6–24 h.
 *   pnpm db:seed                 foods + demo user (refuses if a user exists)
 *   pnpm db:seed --foods-only
 *   pnpm db:seed --passphrase "…"
 */
import { hash } from '@node-rs/argon2';
import { boot } from '../boot.js';
import { seedFoods } from '../db/seed-foods.js';
import { anonymous, withUser } from '../db/pool.js';
import { generateFixture } from '../fixtures/synthetic.js';
import { loadFoodRefs, insertFixture } from '../fixtures/load.js';
import { ARGON2 } from '../services/auth.js';
import { applyPack } from '../services/trackers.js';

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

async function main() {
  const deps = await boot();
  const r = await seedFoods(deps.env.DATABASE_OWNER_URL);
  console.log(`foods: ${r.foods} seeded, ${r.tags} tags, ${r.components} components`);
  if (args.includes('--foods-only')) { await deps.db.end(); return; }
  const n = await anonymous(deps.db, async (tx) => Number((await tx.query<{ n: string }>('SELECT auth_count_users() AS n')).rows[0]!.n));
  if (n > 0 && !args.includes('--add-user')) { console.log(`${n} user(s) already exist — not creating the demo user (pass --add-user to force).`); await deps.db.end(); return; }
  const passphrase = flag('--passphrase') ?? 'foodtrack demo passphrase';
  const email = deps.env.AUTH_MODE === 'multi' ? (flag('--email') ?? 'demo@foodtrack.local') : null;
  const uid = await anonymous(deps.db, async (tx) => (await tx.query<{ id: string }>('SELECT auth_create_user($1,$2,$3,$4,$5) AS id',
    [email, await hash(passphrase, ARGON2), 'Demo', 'he-IL', 'Asia/Jerusalem'])).rows[0]!.id);
  await withUser(deps.db, uid, async (tx) => {
    await tx.query('UPDATE app_user SET onboarded_at = now(), disclaimer_accepted_at = now() WHERE id = app_current_user()');
    await tx.query('INSERT INTO user_profile (user_id) VALUES (app_current_user()) ON CONFLICT DO NOTHING');
    for (const p of deps.registry.packs.filter((x) => x.default_enabled)) await applyPack(tx, deps, p.key);
  });
  const foods = await loadFoodRefs(deps.db, uid);
  const { observations, truth } = generateFixture(foods, { days: 90, seed: 42 });
  const t0 = Date.now();
  await insertFixture(deps, uid, observations);
  console.log(`demo user ${uid}: ${observations.length} observations in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`injected effect: ${truth.dairyDays.length} dairy days; loose stools after dairy ${truth.looseAfterDairy}, otherwise ${truth.looseOtherwise}`);
  console.log(`unlock with passphrase: "${passphrase}"`);
  const c = await import('pg'); const owner = new c.default.Client({ connectionString: deps.env.DATABASE_OWNER_URL }); await owner.connect(); await owner.query('SELECT refresh_derived()'); await owner.end();
  await deps.db.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
