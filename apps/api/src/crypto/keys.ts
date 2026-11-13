import type { Db } from '../db/pool.js';
import { FieldCrypto, KeyError, parseKek, unwrapDek } from './envelope.js';

export interface LoadedKeys { crypto: FieldCrypto; createdAt: Date; rotatedAt: Date | null; checksum: string; alg: string }

/** Startup gate: missing/malformed/wrong KEK → throws KeyError with a named reason. */
export async function loadKeys(db: Db, kekB64: string | undefined): Promise<LoadedKeys> {
  const kek = parseKek(kekB64);
  const { rows } = await db.query<{ dek_wrapped: Buffer; alg: string; created_at: Date; rotated_at: Date | null; checksum: string }>(
    'SELECT dek_wrapped, alg, created_at, rotated_at, checksum FROM crypto_key WHERE id = 1');
  const row = rows[0];
  if (!row) throw new KeyError('keys_not_initialised', 'No data key exists yet. Run `pnpm keys:init` once to create the keys and print the recovery card.');
  const dek = unwrapDek(kek, new Uint8Array(row.dek_wrapped));
  const crypto = new FieldCrypto(dek);
  crypto.selfTest();
  return { crypto, createdAt: row.created_at, rotatedAt: row.rotated_at, checksum: row.checksum, alg: row.alg };
}
