/**
 * Database access. Every user-scoped query runs inside withUser(), which sets
 * app.user_id for the transaction so RLS applies. There is no other path: the
 * app role is not the table owner and has no BYPASSRLS.
 */
import pg from 'pg';

pg.types.setTypeParser(1700, (v) => Number(v));       // numeric → number
pg.types.setTypeParser(20, (v) => Number(v));         // int8 → number
pg.types.setTypeParser(1082, (v) => v);               // date → 'YYYY-MM-DD'

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(url: string, max = 10): Db {
  return new pg.Pool({ connectionString: url, max });
}

export async function withUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** For the narrow, pre-authentication paths that call SECURITY DEFINER functions only. */
export async function anonymous<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id', '', true)");
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
