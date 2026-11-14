/** Restore drill verifier: with ONLY the recovery card, decrypt a meal's raw text and a photo from a restored copy. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { FieldCrypto, parseRecoveryCard, unwrapDek, checksum } from '../crypto/envelope.js';

const [url, cardPath, mediaDir] = process.argv.slice(2);
const c = new pg.Client({ connectionString: url }); await c.connect();
const card = parseRecoveryCard(readFileSync(cardPath!, 'utf8'));
const { rows: [k] } = await c.query('SELECT dek_wrapped FROM crypto_key WHERE id = 1');
if (checksum(card.kek, new Uint8Array(k.dek_wrapped)) !== card.check) { console.error('FAIL: card checksum does not match the restored key'); process.exit(1); }
const fc = new FieldCrypto(unwrapDek(card.kek, new Uint8Array(k.dek_wrapped)));
const { rows: [mi] } = await c.query('SELECT id, raw_text FROM meal_item LIMIT 1');
if (!mi) { console.error('FAIL: no meal items in the restored copy'); process.exit(1); }
const text = fc.open('meal_item', 'raw_text', mi.id, mi.raw_text);
console.log(`meal text: OK (${text?.length} chars)`);
const { rows: [m] } = await c.query('SELECT id, storage_key, object_key_wrapped, nonce FROM media LIMIT 1');
if (m) { const bytes = fc.openMedia(m.id, readFileSync(join(mediaDir!, m.storage_key)), m.object_key_wrapped, m.nonce); console.log(`photo: OK (${bytes.length} bytes)`); }
else console.log('photo: none in this copy (skipped)');
await c.end();
console.log('RESTORE DRILL PASSED');
