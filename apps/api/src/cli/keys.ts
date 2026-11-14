/** Key lifecycle CLI (06 §5.4). Rotation has no HTTP surface, deliberately. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { loadEnv, REPO_ROOT } from '../config.js';
import { ALG, checksum, generateKey, parseKek, parseRecoveryCard, recoveryCard, unwrapDek, wrapDek, FieldCrypto } from '../crypto/envelope.js';

const env = loadEnv();
const cmd = process.argv[2];

function setEnvKek(b64: string) {
  const path = join(REPO_ROOT, '.env');
  let text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  text = /^FOODTRACK_KEK=.*$/m.test(text) ? text.replace(/^FOODTRACK_KEK=.*$/m, `FOODTRACK_KEK=${b64}`) : `${text.trimEnd()}\nFOODTRACK_KEK=${b64}\n`;
  writeFileSync(path, text, { mode: 0o600 });
  return path;
}

async function main() {
  const client = new pg.Client({ connectionString: env.DATABASE_OWNER_URL });
  await client.connect();
  try {
    const existing = (await client.query('SELECT dek_wrapped, created_at FROM crypto_key WHERE id = 1')).rows[0] as { dek_wrapped: Buffer; created_at: Date } | undefined;
    switch (cmd) {
      case 'init': {
        if (existing) { console.error('Keys already exist. Refusing to overwrite (that would make every encrypted field unreadable). Use keys:show or keys:rotate-kek.'); process.exit(1); }
        const kek = generateKey(); const dek = generateKey(); const wrapped = wrapDek(kek, dek);
        await client.query('INSERT INTO crypto_key (id, dek_wrapped, alg, checksum) VALUES (1, $1, $2, $3)', [Buffer.from(wrapped), ALG, checksum(kek, wrapped)]);
        const b64 = Buffer.from(kek).toString('base64');
        const written = process.argv.includes('--print-kek') ? null : setEnvKek(b64);
        if (written) console.log(`KEK written to ${written}`); else console.log(`FOODTRACK_KEK=${b64}`);
        console.log('\nPRINT THIS AND KEEP IT OFF THIS MACHINE. It will not be shown again unless you run keys:show.\n');
        console.log(recoveryCard(kek, wrapped, new Date()));
        break;
      }
      case 'show': {
        if (!existing) throw new Error('no keys: run keys:init');
        const kek = parseKek(env.FOODTRACK_KEK); unwrapDek(kek, new Uint8Array(existing.dek_wrapped));
        console.log(recoveryCard(kek, new Uint8Array(existing.dek_wrapped), existing.created_at));
        break;
      }
      case 'verify': {
        if (!existing) throw new Error('no keys: run keys:init');
        const text = process.argv[3] ? readFileSync(process.argv[3], 'utf8') : readFileSync(0, 'utf8');
        const card = parseRecoveryCard(text);
        unwrapDek(card.kek, new Uint8Array(existing.dek_wrapped));
        console.log(checksum(card.kek, new Uint8Array(existing.dek_wrapped)) === card.check ? 'valid: this card unwraps the live data key' : 'INVALID checksum');
        break;
      }
      case 'check': {
        if (!existing) throw new Error('no keys: run keys:init');
        const dek = unwrapDek(parseKek(env.FOODTRACK_KEK), new Uint8Array(existing.dek_wrapped));
        new FieldCrypto(dek).selfTest();
        console.log('ok: unwrap, encrypt, decrypt, compare');
        break;
      }
      case 'rotate-kek': {
        if (!existing) throw new Error('no keys: run keys:init');
        const dek = unwrapDek(parseKek(env.FOODTRACK_KEK), new Uint8Array(existing.dek_wrapped));
        const kek = generateKey(); const wrapped = wrapDek(kek, dek);
        await client.query('UPDATE crypto_key SET dek_wrapped = $1, checksum = $2, rotated_at = now() WHERE id = 1', [Buffer.from(wrapped), checksum(kek, wrapped)]);
        const path = setEnvKek(Buffer.from(kek).toString('base64'));
        console.log(`New KEK written to ${path}. Old recovery cards no longer work. New card:\n`);
        console.log(recoveryCard(kek, wrapped, existing.created_at));
        break;
      }
      default:
        console.error('usage: keys init|show|verify [card-file]|check|rotate-kek');
        process.exit(2);
    }
  } finally { await client.end(); }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
