import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Deps } from '../src/app';
import { createLLMRouter } from '../src/llm/router';
import { DeterministicProvider } from '../src/llm/deterministic';
import type { LLMProvider, MealParseResult, PhotoParseInput } from '../src/llm/types';
import { withUser } from '../src/db/pool';
import { issueAccess } from '../src/services/auth';
import pg from 'pg';
import { OWNER_URL, createUser, freshDeps, testApp } from './helpers';
import { runOnce } from '../src/workers/jobs';
import { uuidv7 } from '@foodtrack/shared';

let deps: Deps; let app: FastifyInstance; let tokenA = ''; let tokenB = '';
let mode: 'ok' | 'down' = 'ok';
const seen: PhotoParseInput[] = [];

/** A fake vision model: names what it "sees", never knows our food ids. */
const vision: LLMProvider = {
  id: 'anthropic', dataEgress: 'remote', capabilities: { text: true, vision: true, streaming: false }, model: 'fake-vision',
  async parseMeal() { throw new Error('text not used here'); },
  async parsePhoto(input: PhotoParseInput): Promise<MealParseResult> {
    seen.push(input);
    if (mode === 'down') throw new Error('ECONNREFUSED');
    return { model: 'anthropic:fake-vision', prompt_version: 'v', items: [
      { raw_text: 'חומוס', food_id: null, canonical_name: 'hummus', quantity: 1, unit: 'bowl', grams_est: 150, confidence: 0.9, category: 'dish' },
      { raw_text: 'עוגת שמרים של סבתא', food_id: null, canonical_name: 'grandma yeast cake', quantity: null, unit: null, grams_est: null, confidence: 0.7, category: 'sweet' },
      { raw_text: 'משהו לא ברור', food_id: null, canonical_name: 'unclear item', quantity: null, unit: null, grams_est: null, confidence: 0.2, category: null },
    ] };
  },
  async narrate() { throw new Error('unused'); },
  async classifyFood() { return { tags: [] }; },
};

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
function multipart(buf: Buffer, mime: string) {
  const b = '----ftboundary';
  const body = Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="meal"\r\nContent-Type: ${mime}\r\n\r\n`), buf, Buffer.from(`\r\n--${b}--\r\n`)]);
  return { payload: body, headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
}
const parsePhoto = async (token: string, mime = 'image/png') => {
  const m = multipart(PNG, mime);
  return app.inject({ method: 'POST', url: '/api/v1/meals/parse-photo', payload: m.payload, headers: { ...m.headers, authorization: `Bearer ${token}`, 'x-device-id': 'dev-photo' } });
};

beforeAll(async () => {
  deps = await freshDeps();
  deps.llm = createLLMRouter(undefined, [vision, new DeterministicProvider()]);
  app = await testApp(deps);
  tokenA = (await app.inject({ method: 'POST', url: '/api/v1/auth/setup', payload: { passphrase: 'photo tests passphrase long', locale: 'he-IL', timezone: 'Asia/Jerusalem' } })).json().access_token;
  const B = await createUser(deps, 'photo user b passphrase');
  const sid = await withUser(deps.db, B, async (tx) => (await tx.query<{ id: string }>(`INSERT INTO auth_session (user_id, family_id, token_hash, expires_at) VALUES (app_current_user(), uuidv7(), 'x', now() + interval '1 day') RETURNING id`)).rows[0]!.id);
  await withUser(deps.db, B, (tx) => tx.query('UPDATE auth_session SET family_id = id WHERE id = $1', [sid]));
  tokenB = await issueAccess(deps, B, sid);
});
afterAll(async () => { await app.close(); await deps.db.end(); });

describe('meal photo → foods (08 §4.4)', () => {
  it('a seen food lands on the same canonical food typed text would; a confident unknown becomes a private food; a vague guess stays unplaced', async () => {
    mode = 'ok';
    const r = await parsePhoto(tokenA);
    expect(r.statusCode).toBe(200);
    const body = r.json() as { media_id: string; vision: string; items: { canonical_name: string; food_id: string | null; resolved_by: string; confidence: number; portion_precision: string }[] };
    expect(body.vision).toBe('on');
    expect(body.media_id).toBeTruthy();
    const typed = (await app.inject({ method: 'POST', url: '/api/v1/meals/parse', headers: { authorization: `Bearer ${tokenA}`, 'x-device-id': 'dev-photo' }, payload: { text: 'חומוס' } })).json();
    const [hummus, cake, vague] = body.items;
    expect(hummus!.food_id).toBe(typed.items[0].food_id);
    expect(hummus!.resolved_by).toBe('vision');
    expect(hummus!.portion_precision).toBe('estimated');
    expect(cake!.food_id).toBeTruthy();
    expect(vague!.food_id).toBeNull();
    expect(Math.max(...body.items.map((i) => i.confidence))).toBeLessThanOrEqual(0.9);
    expect(seen.at(-1)?.locale).toBe('he-IL');
  });

  it('the model being down never loses the photo', async () => {
    mode = 'down';
    const body = (await parsePhoto(tokenA)).json();
    expect(body.vision).toBe('unavailable');
    expect(body.items).toEqual([]);
    const img = await app.inject({ url: `/api/v1/media/${body.media_id}`, headers: { authorization: `Bearer ${tokenA}` } });
    expect(img.statusCode).toBe(200);
  });

  it('a format the model cannot read is stored but not sent to it', async () => {
    mode = 'ok';
    const before = seen.length;
    const body = (await parsePhoto(tokenA, 'image/heic')).json();
    expect(body.vision).toBe('unavailable');
    expect(seen.length).toBe(before);
  });

  it('RLS: one user cannot read another user\'s meal photo', async () => {
    mode = 'ok';
    const body = (await parsePhoto(tokenA)).json();
    const other = await app.inject({ url: `/api/v1/media/${body.media_id}`, headers: { authorization: `Bearer ${tokenB}` } });
    expect(other.statusCode).toBe(404);
  });

  describe('a meal saved with only a photo still gets its foods (08 §4.4)', () => {
    const H = () => ({ authorization: `Bearer ${tokenA}`, 'x-device-id': 'dev-photo' });
    const save = async (values: Record<string, unknown>) => (await app.inject({ method: 'POST', url: '/api/v1/observations', headers: H(),
      payload: { client_id: `c-${uuidv7()}`, tracker_key: 'meal', occurred_at: new Date().toISOString(), values } })).json();
    const upload = async () => {
      const m = multipart(PNG, 'image/png');
      return (await app.inject({ method: 'POST', url: '/api/v1/media', payload: m.payload, headers: { ...m.headers, ...H() } })).json().media_id as string;
    };
    const get = async (id: string) => (await app.inject({ url: `/api/v1/observations/${id}`, headers: H() })).json();

    it('saved before the composer finished reading it: the server reads the photo in the background', async () => {
      mode = 'ok';
      const o = await save({ photos: [await upload()] });
      expect(o.parse_status).toBe('pending');
      await runOnce(deps);
      const now = await get(o.id);
      expect(now.meal_items.map((i: { raw_text: string }) => i.raw_text)).toContain('חומוס');
      expect(now.meal_items.every((i: { resolved_by: string }) => i.resolved_by === 'vision')).toBe(true);
      expect(now.parse_status).toBe('done');
    });

    it('the model is down: the meal is marked degraded and retried, then filled in when it comes back', async () => {
      mode = 'down';
      const o = await save({ photos: [await upload()] });
      await runOnce(deps);
      expect((await get(o.id)).parse_status).toBe('degraded');
      mode = 'ok';
      const c = new pg.Client({ connectionString: OWNER_URL }); await c.connect(); await c.query(`UPDATE job SET run_after = now() WHERE status = 'queued'`); await c.end();
      await runOnce(deps);
      expect((await get(o.id)).meal_items.length).toBeGreaterThan(0);
    });

    it('a meal that synced before its photo uploaded is read once the real photo id arrives', async () => {
      mode = 'ok';
      const o = await save({ photos: ['local-not-uploaded-yet'] });
      await runOnce(deps);
      expect((await get(o.id)).meal_items ?? []).toHaveLength(0);
      const media = await upload();
      const u = await app.inject({ method: 'PATCH', url: `/api/v1/observations/${o.id}`, headers: H(), payload: { values: { photos: [media] } } });
      expect(u.statusCode).toBe(200);
      await runOnce(deps);
      expect((await get(o.id)).meal_items.length).toBeGreaterThan(0);
    });

    it('words typed later into a meal with no foods are parsed too', async () => {
      const o = await save({ photos: ['local-never-uploaded'] });
      await runOnce(deps);
      await app.inject({ method: 'PATCH', url: `/api/v1/observations/${o.id}`, headers: H(), payload: { values: { description: 'חומוס' } } });
      await runOnce(deps);
      expect((await get(o.id)).meal_items.length).toBeGreaterThan(0);
    });
  });
});
