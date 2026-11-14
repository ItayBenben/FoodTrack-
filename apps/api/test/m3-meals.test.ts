import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { Deps } from '../src/app';
import { uuidv7 } from '@foodtrack/shared';
import { createLLMRouter } from '../src/llm/router';
import { DeterministicProvider } from '../src/llm/deterministic';
import type { LLMProvider, MealParseInput } from '../src/llm/types';
import { runOnce } from '../src/workers/jobs';
import '../src/workers/register';
import { segment } from '../src/services/meal-parse';
import { OWNER_URL, freshDeps, testApp } from './helpers';

let deps: Deps; let app: FastifyInstance; let token = '';
const H = () => ({ authorization: `Bearer ${token}`, 'x-device-id': 'dev-m3' });
let llmDown = true; let llmCalls = 0; let llmMode: 'ok' | 'invent' | 'garbage' | 'causal' = 'ok';

/** A fake remote model we can switch off, to prove the app works with it unreachable. */
const fake: LLMProvider = {
  id: 'anthropic', dataEgress: 'remote', capabilities: { text: true, vision: false, streaming: false }, model: 'fake',
  async parseMeal(input: MealParseInput) {
    llmCalls++;
    if (llmDown) throw new Error('ECONNREFUSED');
    if (llmMode === 'garbage') return { items: [{ raw_text: 'x' } as never], model: 'fake', prompt_version: 'v' };
    return { model: 'anthropic:fake', prompt_version: 'meal-parse-v3', items: input.segments.map((s) => ({
      raw_text: s.text, food_id: llmMode === 'invent' ? uuidv7() : s.candidates[0]?.food_id ?? null,
      canonical_name: s.candidates[0]?.name ?? 'Mystery stew', quantity: 1, unit: 'portion' as const, grams_est: 250, confidence: 0.8, category: 'dish' })) };
  },
  async parsePhoto() { return { items: [], model: 'fake', prompt_version: 'v' }; },
  async narrate(input) {
    if (llmDown) throw new Error('down');
    const p = input.payload as { n_exposed: number };
    if (llmMode === 'causal') return { en: `Dairy causes your loose stools on ${p.n_exposed} days, clearly.`, he: 'חלב גורם לשלשול אצלך.' };
    return { en: `On ${p.n_exposed} days this happened more often, and that is worth testing with a short trial.`, he: `ב-${p.n_exposed} ימים זה קרה יותר, ושווה לבדוק בניסוי קצר.` };
  },
  async classifyFood() { return { tags: [] }; },
};

beforeAll(async () => {
  deps = await freshDeps();
  deps.llm = createLLMRouter(undefined, [fake, new DeterministicProvider()]);
  app = await testApp(deps);
  token = (await app.inject({ method: 'POST', url: '/api/v1/auth/setup', payload: { passphrase: 'meal tests passphrase', locale: 'he-IL', timezone: 'Asia/Jerusalem' } })).json().access_token;
});
afterAll(async () => { await app.close(); await deps.db.end(); });

const parse = async (text: string) => (await app.inject({ method: 'POST', url: '/api/v1/meals/parse', headers: H(), payload: { text } })).json();

describe('the LLM is the last resort — and the app works without it (written first)', () => {
  it('with the model unreachable, known foods still resolve from the canonical table and the response is marked degraded', async () => {
    llmDown = true;
    const r = await parse('פיתה עם חומוס, וסלט ירקות, ומרק חרדל מיוחד של סבתא');
    const names = r.items.map((i: { canonical_name: string }) => i.canonical_name);
    expect(names).toEqual(expect.arrayContaining(['Pita bread', 'Hummus', 'Israeli salad']));
    expect(r.degraded).toBe(true);
    expect(r.unresolved.length).toBeGreaterThan(0);
    expect(r.tier).toBe(2);
  });
  it('a meal saved with no items while the model is down parses automatically when it comes back', async () => {
    llmDown = true;
    const o = (await app.inject({ method: 'POST', url: '/api/v1/observations', headers: H(), payload: {
      client_id: `c-${uuidv7()}`, tracker_key: 'meal', occurred_at: new Date().toISOString(), values: { description: 'מרק עדשים כתום עם לחם' } } })).json();
    expect(o.parse_status).toBe('pending');
    expect(o.specificity).toBe('partial');
    // first attempt: canonical stages resolve everything here, so the job completes even with the model down
    await runOnce(deps);
    let now = (await app.inject({ url: `/api/v1/observations/${o.id}`, headers: H() })).json();
    expect(now.meal_items.length).toBeGreaterThan(0);
    // a meal made only of text the canonical table cannot place waits for the model
    const o2 = (await app.inject({ method: 'POST', url: '/api/v1/observations', headers: H(), payload: {
      client_id: `c-${uuidv7()}`, tracker_key: 'meal', occurred_at: new Date().toISOString(), values: { description: 'תבשיל קוקלה של דודה רינה' } } })).json();
    await runOnce(deps);
    now = (await app.inject({ url: `/api/v1/observations/${o2.id}`, headers: H() })).json();
    expect(now.meal_items ?? []).toHaveLength(0);
    expect(now.parse_status).toBe('degraded');
    llmDown = false; llmMode = 'ok';
    const c = new pg.Client({ connectionString: OWNER_URL }); await c.connect(); await c.query(`UPDATE job SET run_after = now() WHERE status = 'queued'`); await c.end();
    await runOnce(deps);
    now = (await app.inject({ url: `/api/v1/observations/${o2.id}`, headers: H() })).json();
    expect(now.meal_items.length).toBeGreaterThan(0);
    expect(now.parse_status).toBe('done');
  });
});

describe('the five stages', () => {
  it('normalises quantities, units and filler in both languages', () => {
    expect(segment('אכלתי 2 כפות חומוס עם חצי פיתה')).toEqual([
      { text: 'חומוס', quantity: 2, unit: 'tbsp', raw: 'אכלתי 2 כפות חומוס' }, { text: 'פיתה', quantity: 0.5, unit: null, raw: 'חצי פיתה' }]);
    expect(segment('I had 2 slices of white bread and a coffee').map((s) => [s.text, s.quantity, s.unit])).toEqual([['white bread', 2, 'slice'], ['coffee', null, null]]);
  });
  it('the same food typed in Hebrew and in English resolves to one food_id, both directions', async () => {
    const he = (await parse('חומוס')).items[0]; const en = (await parse('hummus')).items[0];
    expect(he.food_id).toBeTruthy(); expect(he.food_id).toBe(en.food_id);
    const he2 = (await parse('קפה הפוך')).items[0]; const en2 = (await parse('latte')).items[0];
    expect(he2.food_id).toBe(en2.food_id);
  });
  it('after one log, the personal library answers first, and a fuzzy typo still hits it', async () => {
    llmDown = true; llmCalls = 0;
    const first = (await parse('שקשוקה')).items[0];
    expect(first.resolved_by).toBe('canonical');
    await app.inject({ method: 'POST', url: '/api/v1/observations', headers: H(), payload: { client_id: `c-${uuidv7()}`, tracker_key: 'meal', occurred_at: new Date().toISOString(),
      values: { description: 'שקשוקה' }, meal_items: [{ raw_text: 'שקשוקה', food_id: first.food_id, quantity: 1, unit: 'portion', grams_est: 300, confidence: 0.9, resolved_by: 'canonical' }] } });
    expect((await parse('שקשוקה')).items[0].resolved_by).toBe('library');
    expect((await parse('שקשוקהה')).items[0]).toMatchObject({ resolved_by: 'library', food_id: first.food_id });
    expect(llmCalls).toBe(0);
  });
  it('the model only sees the residual text, and an invented food_id is never trusted', async () => {
    llmDown = false; llmMode = 'invent'; llmCalls = 0;
    const r = await parse('פיתה עם קציצות דג בסגנון מרוקאי');
    expect(llmCalls).toBe(1);
    const llmItem = r.items.find((i: { resolved_by: string }) => i.resolved_by === 'llm');
    expect(llmItem).toBeTruthy();
    // the invented id was replaced by a private, unverified food
    const f = (await app.inject({ url: `/api/v1/foods/${llmItem.food_id}`, headers: H() })).json();
    expect(f).toMatchObject({ source: 'llm', is_verified: false, personal: true });
  });
  it('a non-conforming model response is discarded, not echoed', async () => {
    llmMode = 'garbage';
    const r = await parse('ממרח סודי מהשוק');
    expect(r.degraded).toBe(true);
    expect(r.items.every((i: { food_id: string | null }) => i.food_id === null)).toBe(true);
    llmMode = 'ok';
  });
  it('correcting an item updates the library, and the next log defaults to the corrected portion (US-01 AC6)', async () => {
    llmDown = true;
    const p = await parse('פלאפל');
    const o = (await app.inject({ method: 'POST', url: '/api/v1/observations', headers: H(), payload: { client_id: `c-${uuidv7()}`, tracker_key: 'meal', occurred_at: new Date().toISOString(), values: { description: 'פלאפל' }, meal_items: p.items } })).json();
    const item = o.meal_items[0];
    await app.inject({ method: 'PATCH', url: `/api/v1/meals/${o.id}/items/${item.id}`, headers: H(), payload: { quantity: 8, unit: 'unit', grams_est: 136 } });
    const next = (await parse('פלאפל')).items[0];
    expect(next).toMatchObject({ resolved_by: 'library', quantity: 8, grams_est: 136 });
  });
  it('vague text is tier 3 and gets no invented items', async () => {
    const r = await parse('נשנשתי כל הערב');
    expect(r.tier).toBe(3); expect(r.items.filter((i: { food_id: string }) => i.food_id)).toHaveLength(0);
  });
  it('specificity is recomputed by the server: an empty meal cannot be marked resolved', async () => {
    const o = (await app.inject({ method: 'POST', url: '/api/v1/observations', headers: H(), payload: { client_id: `c-${uuidv7()}`, tracker_key: 'meal', occurred_at: new Date().toISOString(), values: {}, specificity: 'resolved' } })).json();
    expect(o.specificity).toBe('unspecified');
  });
});

describe('narratives are validated before they are stored (03 §10)', () => {
  const payload = { exposure_label: { en: 'Dairy', he: 'חלב' }, outcome_label: { en: 'Loose stool', he: 'יציאה רכה' }, effect_type: 'risk_difference', n_exposed: 41, n_unexposed: 57, rate_exposed: 0.44, rate_unexposed: 0.19, risk_difference: 0.25, warnings: [] };
  it('a clean model narrative is kept', async () => {
    llmDown = false; llmMode = 'ok';
    const r = await deps.llm.narrate({ payload });
    expect(r.model).toBe('anthropic:fake'); expect(r.en).toContain('41');
  });
  it('causal language falls back to the deterministic template', async () => {
    llmMode = 'causal';
    const r = await deps.llm.narrate({ payload });
    expect(r.model).toBe('deterministic');
    expect(r.en).toContain('44%'); expect(r.en).toContain('association, not proof');
    llmMode = 'ok';
  });
});

describe('the day builder (D30, D31)', () => {
  it('saves a whole day in one batch, marks times as estimates, empties delete, one undo reverses it', async () => {
    const day = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
    const b0 = (await app.inject({ url: `/api/v1/days/${day}/builder`, headers: H() })).json();
    expect(b0.slots.map((s: { slot: string }) => s.slot)).toEqual(['breakfast', 'lunch', 'dinner', 'snack', 'drink']);
    const r = (await app.inject({ method: 'POST', url: `/api/v1/days/${day}/builder`, headers: H(), payload: { slots: [{ slot: 'breakfast', text: 'קפה עם חלב, טוסט' }, { slot: 'lunch', text: 'פיתה עם חומוס' }] } })).json();
    expect(r.results.map((x: { action: string }) => x.action)).toEqual(['created', 'created']);
    const b1 = (await app.inject({ url: `/api/v1/days/${day}/builder`, headers: H() })).json();
    const lunch = b1.slots.find((s: { slot: string }) => s.slot === 'lunch').observations[0];
    expect(lunch.time_precision).toBe('day_only'); // no slot median yet → never shown as exact
    expect(lunch.local_day).toBe(day);
    const r2 = (await app.inject({ method: 'POST', url: `/api/v1/days/${day}/builder`, headers: H(), payload: { slots: [{ slot: 'lunch', observation_id: lunch.id, text: '' }] } })).json();
    expect(r2.results[0].action).toBe('deleted');
    await app.inject({ method: 'DELETE', url: `/api/v1/batches/${r.batch_id}`, headers: H() });
    const b2 = (await app.inject({ url: `/api/v1/days/${day}/builder`, headers: H() })).json();
    expect(b2.slots.every((s: { observations: unknown[] }) => s.observations.length === 0)).toBe(true);
  });
  it('a pasted blob is distributed by label, then time, then order — without creating anything', async () => {
    const r = (await app.inject({ method: 'POST', url: '/api/v1/meals/parse-multiline', headers: H(), payload: { text: 'צהריים: שווארמה\n08:15 קפה\nסלט' } })).json();
    expect(r.proposal.map((p: { slot: string; reason: string }) => [p.slot, p.reason])).toEqual([['lunch', 'label'], ['breakfast', 'time'], ['dinner', 'order']]);
  });
});

describe('photos are encrypted at rest', () => {
  it('stores ciphertext and serves the original back', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
    const boundary = '----ft';
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), png, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const up = await app.inject({ method: 'POST', url: '/api/v1/media', headers: { ...H(), 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
    expect(up.statusCode).toBe(201);
    const id = up.json().media_id;
    const back = await app.inject({ url: `/api/v1/media/${id}`, headers: H() });
    expect(Buffer.compare(back.rawPayload, png)).toBe(0);
    const c = new pg.Client({ connectionString: OWNER_URL }); await c.connect();
    const key = (await c.query('SELECT storage_key FROM media WHERE id = $1', [id])).rows[0].storage_key; await c.end();
    const onDisk = await deps.media.get(key);
    expect(onDisk.includes(png.subarray(0, 8))).toBe(false);
  });
});
