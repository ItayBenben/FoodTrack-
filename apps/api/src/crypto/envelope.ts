/**
 * L2 field encryption with envelope keys (D28, 06 §5.3).
 *
 *   KEK (FOODTRACK_KEK, .env) ──wraps──► DEK (crypto_key.dek_wrapped) ──encrypts──► narrative columns + media
 *
 * XChaCha20-Poly1305, random 24-byte nonce per value, AAD bound to table|column|row_id
 * so ciphertext cannot be transplanted between rows. Fail closed: if the KEK is missing,
 * malformed, or does not unwrap the stored DEK, the API refuses to start.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from 'node:crypto';

export const ALG = 'xchacha20poly1305/hkdf-sha256/v1';
const WRAP_AAD = new TextEncoder().encode('foodtrack/dek-wrap/v1');
const enc = new TextEncoder();
const dec = new TextDecoder();

export class KeyError extends Error {
  constructor(public readonly reason: 'kek_missing' | 'kek_malformed' | 'keys_not_initialised' | 'kek_mismatch' | 'self_test_failed', message: string) {
    super(message); this.name = 'KeyError';
  }
}

export function parseKek(b64: string | undefined): Uint8Array {
  if (!b64) throw new KeyError('kek_missing', 'FOODTRACK_KEK is not set. Run `pnpm keys:init` on first install, or restore it from your recovery card.');
  const raw = b64.startsWith('base64:') ? b64.slice(7) : b64;
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new KeyError('kek_malformed', `FOODTRACK_KEK must be 32 bytes of base64 (got ${buf.length} bytes).`);
  return new Uint8Array(buf);
}

export function generateKey(): Uint8Array { return new Uint8Array(randomBytes(32)); }

export function wrapDek(kek: Uint8Array, dek: Uint8Array): Uint8Array {
  const nonce = new Uint8Array(randomBytes(24));
  const ct = xchacha20poly1305(kek, nonce, WRAP_AAD).encrypt(dek);
  return concat(nonce, ct);
}

export function unwrapDek(kek: Uint8Array, wrapped: Uint8Array): Uint8Array {
  try {
    return xchacha20poly1305(kek, wrapped.subarray(0, 24), WRAP_AAD).decrypt(wrapped.subarray(24));
  } catch {
    throw new KeyError('kek_mismatch', 'FOODTRACK_KEK does not unwrap the stored data key. The KEK in .env is wrong for this database — restore it from the recovery card. The API will not start, and nothing has been written.');
  }
}

export function checksum(kek: Uint8Array, wrapped: Uint8Array): string {
  const h = Buffer.from(sha256(concat(kek, wrapped, enc.encode(ALG)))).toString('hex').toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function normalizeAlias(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[֑-ׇ]/g, '') // Hebrew niqqud
    .replace(/["'״׳`]/g, '').replace(/\s+/g, ' ').trim();
}

export class FieldCrypto {
  private readonly indexKey: Uint8Array;
  constructor(private readonly dek: Uint8Array) {
    this.indexKey = hkdf(sha256, dek, undefined, enc.encode('foodtrack/blind-index/v1'), 32);
  }

  private aad(table: string, column: string, rowId: string) { return enc.encode(`${table}|${column}|${rowId}`); }

  seal(table: string, column: string, rowId: string, plaintext: string): Buffer {
    const nonce = new Uint8Array(randomBytes(24));
    const ct = xchacha20poly1305(this.dek, nonce, this.aad(table, column, rowId)).encrypt(enc.encode(plaintext));
    return Buffer.from(concat(nonce, ct));
  }

  open(table: string, column: string, rowId: string, sealed: Uint8Array | null | undefined): string | null {
    if (!sealed) return null;
    const b = new Uint8Array(sealed);
    return dec.decode(xchacha20poly1305(this.dek, b.subarray(0, 24), this.aad(table, column, rowId)).decrypt(b.subarray(24)));
  }

  sealOpt(table: string, column: string, rowId: string, plaintext: string | null | undefined): Buffer | null {
    return plaintext === null || plaintext === undefined || plaintext === '' ? null : this.seal(table, column, rowId, plaintext);
  }

  blindIndex(alias: string): Buffer {
    return Buffer.from(hmac(sha256, this.indexKey, enc.encode(normalizeAlias(alias))));
  }

  /** Media: a per-object key wrapped by the DEK, so one photo can be deleted or shared alone. */
  sealMedia(mediaId: string, bytes: Uint8Array): { ciphertext: Buffer; wrappedKey: Buffer; nonce: Buffer } {
    const objKey = generateKey();
    const nonce = new Uint8Array(randomBytes(24));
    const ciphertext = xchacha20poly1305(objKey, nonce, this.aad('media', 'object', mediaId)).encrypt(bytes);
    const wrappedKey = this.seal('media', 'object_key', mediaId, Buffer.from(objKey).toString('base64'));
    return { ciphertext: Buffer.from(ciphertext), wrappedKey, nonce: Buffer.from(nonce) };
  }

  openMedia(mediaId: string, ciphertext: Uint8Array, wrappedKey: Uint8Array, nonce: Uint8Array): Buffer {
    const objKey = Buffer.from(this.open('media', 'object_key', mediaId, wrappedKey)!, 'base64');
    return Buffer.from(xchacha20poly1305(new Uint8Array(objKey), new Uint8Array(nonce), this.aad('media', 'object', mediaId)).decrypt(new Uint8Array(ciphertext)));
  }

  selfTest(): void {
    const probe = `self-test-${Date.now()}`;
    const back = this.open('selftest', 'probe', '0', this.seal('selftest', 'probe', '0', probe));
    if (back !== probe) throw new KeyError('self_test_failed', 'encryption self-test failed: decrypt(encrypt(x)) != x');
  }
}

export function recoveryCard(kek: Uint8Array, wrapped: Uint8Array, createdAt: Date): string {
  const line = '─'.repeat(54);
  return [
    `──── FoodTrack recovery card ${'─'.repeat(25)}`,
    ` created  ${createdAt.toISOString().slice(0, 10)}`,
    ` alg      ${ALG}`,
    ` kek      base64:${Buffer.from(kek).toString('base64')}`,
    ` dek(w)   base64:${Buffer.from(wrapped).toString('base64')}`,
    ` check    ${checksum(kek, wrapped)}`,
    ' Keep this off the machine that runs FoodTrack,',
    ' and not in the same place as the backups.',
    ' Anyone holding this card and a database dump can',
    ' read the encrypted fields.',
    line,
  ].join('\n');
}

export function parseRecoveryCard(text: string): { kek: Uint8Array; wrapped: Uint8Array; check: string } {
  const get = (label: string) => text.match(new RegExp(`${label.replace(/[()]/g, '\\$&')}\\s+(\\S+)`))?.[1];
  const kekS = get('kek'); const dekS = get('dek(w)'); const check = get('check');
  if (!kekS || !dekS || !check) throw new Error('not a recovery card: missing kek, dek(w) or check line');
  return { kek: parseKek(kekS), wrapped: new Uint8Array(Buffer.from(dekS.replace(/^base64:/, ''), 'base64')), check };
}
