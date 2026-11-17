import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, setMeta } from './db/local';
import { deleteLocal, editObservation, isoTime, saveObservation, serverValues } from './store';

beforeEach(async () => { await db().delete(); await db().open(); await setMeta('user', { id: 'u', timezone: 'Asia/Jerusalem', day_rollover: '04:00', locale: 'he-IL', idle_lock_minutes: 15, display_name: null }); });

describe('the client write path (06 §4)', () => {
  it('a save is one Dexie transaction: row + outbox entry, local_day with the 04:00 rollover', async () => {
    const t0 = performance.now();
    const o = await saveObservation({ tracker_key: 'stool', values: { bristol: 4 }, occurred_at: '2026-08-21T01:00:00+03:00' });
    expect(performance.now() - t0).toBeLessThan(100);
    expect(o.local_day).toBe('2026-08-20');
    expect(await db().outbox.count()).toBe(1);
    expect((await db().observations.get(o.id))?.sync).toBe('pending');
  });
  it('editing an unsynced row does not queue a second mutation', async () => {
    const o = await saveObservation({ tracker_key: 'stool', values: { bristol: 4 } });
    await editObservation(o.id, { values: { urgency: 2 } });
    expect(await db().outbox.count()).toBe(1);
    expect((await db().observations.get(o.id))?.values).toEqual({ bristol: 4, urgency: 2 });
  });
  it('deleting a row that never reached the server drops its queued create', async () => {
    const o = await saveObservation({ tracker_key: 'stool', values: { bristol: 4 } });
    await deleteLocal(o.id);
    expect(await db().outbox.count()).toBe(0);
    expect((await db().observations.get(o.id))?.deleted_at).toBeTruthy();
  });
  it('deleting a synced row queues a delete', async () => {
    const o = await saveObservation({ tracker_key: 'stool', values: { bristol: 4 } });
    await db().outbox.clear(); await db().observations.update(o.id, { revision: 1, sync: 'synced' });
    await deleteLocal(o.id);
    const rows = await db().outbox.toArray();
    expect(rows.map((r) => r.op)).toEqual(['delete']);
  });
  it('a time without a zone is read as device-local and stored as a full ISO instant', async () => {
    expect(isoTime('2026-11-16T12:00:00')).toBe(new Date('2026-11-16T12:00:00').toISOString());
    expect(isoTime('2026-08-21T01:00:00+03:00')).toBe('2026-08-20T22:00:00.000Z');
    expect(isoTime('not a time')).toBe('not a time'); // left for the server to reject with a reason
    const o = await saveObservation({ tracker_key: 'stool', values: { bristol: 4 }, occurred_at: '2026-11-16T12:00:00' });
    expect(o.occurred_at).toMatch(/Z$/);
  });
  it('placeholder photo ids never leave the device', () => {
    expect(serverValues({ description: 'toast', photos: ['local_1', '0190-real', 'local_2'], tags: ['a'] }))
      .toEqual({ description: 'toast', photos: ['0190-real'], tags: ['a'] });
  });
});
