import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Deps } from '../src/app';
import { createLLMRouter } from '../src/llm/router';
import { DeterministicProvider } from '../src/llm/deterministic';
import type { LLMProvider, MealParseResult, PhotoParseInput } from '../src/llm/types';
import { withUser } from '../src/db/pool';
import { issueAccess } from '../src/services/auth';
import { createUser, freshDeps, testApp } from './helpers';

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
});
