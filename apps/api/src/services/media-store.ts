/**
 * Photo storage (D14). Plain volume by default; every object is encrypted with its
 * own key before it touches disk (06 §5.3). The S3/MinIO driver implements the same
 * interface; at personal scale the volume driver is the recommended default.
 */
import { mkdir, readFile, writeFile, unlink, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface MediaStore {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  ready(): Promise<boolean>;
}

export class VolumeMediaStore implements MediaStore {
  private readonly root: string;
  constructor(root: string) { this.root = resolve(root); }
  private path(key: string) {
    if (!/^[a-f0-9-]+(\/[a-f0-9-]+)*$/i.test(key)) throw new Error('invalid media key');
    return join(this.root, key);
  }
  async put(key: string, bytes: Buffer) { const p = this.path(key); await mkdir(dirname(p), { recursive: true }); await writeFile(p, bytes, { mode: 0o600 }); }
  async get(key: string) { return readFile(this.path(key)); }
  async delete(key: string) { await unlink(this.path(key)).catch(() => undefined); }
  async ready() { try { await mkdir(this.root, { recursive: true }); await access(this.root, constants.W_OK); return true; } catch { return false; } }
}
