/**
 * The meal parse pipeline (03 §5) — the LLM is the LAST resort:
 *   1 normalise → 2 personal library → 3 canonical foods → 4 LLM (residual only, with candidates) → 5 portions → 6 persist new foods
 * Never-block rule: if stage 4 fails or times out, return what 1–3 produced with degraded: true.
 */
import type { Deps } from '../app.js';
import type { Tx } from '../db/pool.js';
import { normalizeAlias } from '../crypto/envelope.js';
import type { Candidate } from '../llm/types.js';

export interface ResolvedItem {
  raw_text: string; food_id: string | null; canonical_name: string | null; quantity: number | null; unit: string | null;
  grams_est: number | null; confidence: number | null; resolved_by: 'library' | 'canonical' | 'llm' | 'vision' | 'deterministic' | null;
  portion_precision: 'estimated' | 'unspecified'; position: number; media_id?: string | null;
}
export interface ParseResult { items: ResolvedItem[]; unresolved: string[]; degraded: boolean; tier: 1 | 2 | 3; model: string; prompt_version: string; add_ons: AddOn[] }
export interface AddOn { food_id: string; label: string; canonical_name: string; quantity: number; unit: string; grams_est: number; confidence: number; resolved_by: 'library'; portion_precision: 'estimated' }

// ───────── stage 1: normalise ─────────
const FILLER = /^(?:i\s+)?(?:ate|had|drank|eaten|some|a bit of|a little|a|an|the|bit of|לאכול|אכלתי|אכלנו|שתיתי|שתינו|קצת|מעט|גם|עוד|איזה|איזו|של)\s+/i;
const HE_NUM: Record<string, number> = { 'חצי': 0.5, 'אחד': 1, 'אחת': 1, 'שני': 2, 'שתי': 2, 'שניים': 2, 'שתיים': 2, 'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5, 'כמה': 2, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'half': 0.5, 'a couple of': 2 };
const UNITS: [RegExp, string][] = [
  [/^(?:כוסות|כוס|cups?|glass(?:es)?)(?=\s|$)/i, 'cup'], [/^(?:כפות|כף|tbsp|tablespoons?)(?=\s|$)/i, 'tbsp'], [/^(?:כפיות|כפית|tsp|teaspoons?)(?=\s|$)/i, 'tsp'],
  [/^(?:פרוסות|פרוסה|slices?)(?=\s|$)/i, 'slice'], [/^(?:קערות|קערה|bowls?)(?=\s|$)/i, 'bowl'], [/^(?:יחידות|יחידה|pieces?|pcs?)(?=\s|$)/i, 'unit'],
  [/^(?:גרם|ג'|ג׳|grams?|g)(?=\s|$)/i, 'g'], [/^(?:מ"ל|מ״ל|מל|ml)(?=\s|$)/i, 'ml'], [/^(?:בקבוקים|בקבוק|bottles?)(?=\s|$)/i, 'bottle'],
  [/^(?:פחיות|פחית|cans?)(?=\s|$)/i, 'can'], [/^(?:מנות|מנה|portions?|servings?)(?=\s|$)/i, 'portion'], [/^(?:שקיות|שקית|bags?)(?=\s|$)/i, 'bag'],
];
const UNIT_GRAMS: Record<string, number> = { g: 1, ml: 1, cup: 240, tbsp: 15, tsp: 5, glass: 200, bottle: 500, can: 330 };

export interface Segment { text: string; quantity: number | null; unit: string | null; raw: string }

export function segment(text: string): Segment[] {
  const clean = text.normalize('NFKC').replace(/[‎‏]/g, '').trim();
  const parts = clean.split(/\s*(?:[,;\n+&/]|\s+(?:with|and|plus|עם|וגם|ועוד)\s+|\s+-\s+)\s*/i).map((s) => s.trim()).filter(Boolean);
  return parts.map((raw) => {
    let s = raw; let prev = '';
    while (prev !== s) { prev = s; s = s.replace(FILLER, ''); }
    let quantity: number | null = null; let unit: string | null = null;
    const num = s.match(/^(\d+(?:[.,]\d+)?)\s*/);
    if (num) { quantity = Number(num[1]!.replace(',', '.')); s = s.slice(num[0].length); }
    else { for (const [w, n] of Object.entries(HE_NUM)) if (s.toLowerCase().startsWith(`${w} `)) { quantity = n; s = s.slice(w.length + 1); break; } }
    for (const [re, u] of UNITS) { const m = s.match(re); if (m) { unit = u; s = s.slice(m[0].length).trim(); break; } }
    s = s.replace(/^(?:של|of)\s+/i, '').trim();
    // trailing quantity: "קפה 2", "eggs x2"
    const tail = s.match(/\s+[x×]?(\d+)$/i); if (tail && quantity === null) { quantity = Number(tail[1]); s = s.slice(0, -tail[0].length); }
    return { text: s || raw, quantity, unit, raw };
  }).filter((x) => x.text.length > 0);
}

/** Hebrew conjunction ו glued to the next word ("חומוס וסלט"): split only when both sides resolve. */
function vavSplits(s: Segment): Segment[] | null {
  const m = s.text.match(/^(.+?)\s+ו([א-ת].*)$/);
  return m ? [{ ...s, text: m[1]! }, { text: m[2]!, quantity: null, unit: null, raw: `ו${m[2]}` }] : null;
}

function trigrams(s: string) { const p = `  ${s} `; const out = new Set<string>(); for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3)); return out; }
export function similarity(a: string, b: string) { const A = trigrams(a), B = trigrams(b); let n = 0; for (const x of A) if (B.has(x)) n++; return (2 * n) / (A.size + B.size); }

const FOOD_FILLER = /\b(?:no content)\b/;
const VAGUE = /^(?:משהו|דברים|כל מיני|אוכל|נשנושים|נשנשתי.*|כל הערב|stuff|something|food|snacks?|whatever|random|כלום)$/i;

interface FoodRow { id: string; canonical_name: string; names_i18n: Record<string, string[]>; default_qty: number | null; default_unit: string; grams_per_unit: number | null; category: string | null }
interface Lib { foodId: string; alias: string; median_qty: number | null; median_unit: string | null; median_grams: number | null }

export class MealParser {
  constructor(private readonly tx: Tx, private readonly deps: Deps, private readonly locale: string) {}
  private libCache: Lib[] | null = null;
  private foods = new Map<string, FoodRow>();

  private async food(id: string): Promise<FoodRow | null> {
    if (this.foods.has(id)) return this.foods.get(id)!;
    const { rows } = await this.tx.query<FoodRow>('SELECT id, canonical_name, names_i18n, default_qty, default_unit, grams_per_unit, category FROM food WHERE id = $1', [id]);
    if (rows[0]) this.foods.set(id, rows[0]);
    return rows[0] ?? null;
  }

  /** Stage 2a: exact blind-index match. 2b: decrypt-then-match fuzzy over the user's own aliases (06 §5.3). */
  private async library(text: string): Promise<{ foodId: string; score: number } | null> {
    const bidx = this.deps.keys.crypto.blindIndex(text);
    const { rows } = await this.tx.query<{ food_id: string }>('SELECT food_id FROM user_food_alias WHERE alias_bidx = $1', [bidx]);
    if (rows[0]) return { foodId: rows[0].food_id, score: 1 };
    if (!this.libCache) {
      const { rows: all } = await this.tx.query<{ food_id: string; alias: Buffer }>('SELECT food_id, alias FROM user_food_alias');
      this.libCache = all.map((r) => ({ foodId: r.food_id, alias: normalizeAlias(this.deps.keys.crypto.open('user_food_alias', 'alias', r.food_id, r.alias) ?? ''), median_qty: null, median_unit: null, median_grams: null }));
    }
    const n = normalizeAlias(text);
    let best: { foodId: string; score: number } | null = null;
    for (const l of this.libCache) { const sc = similarity(n, l.alias); if (sc >= 0.75 && (!best || sc > best.score)) best = { foodId: l.foodId, score: sc }; }
    return best;
  }

  /** Stage 3: canonical foods — exact name in any locale, else trigram word-similarity. */
  async canonical(text: string, limit = 5): Promise<{ food: FoodRow; score: number; exact: boolean }[]> {
    const n = normalizeAlias(text);
    const { rows } = await this.tx.query<FoodRow & { score: number; exact: boolean }>(
      `SELECT id, canonical_name, names_i18n, default_qty, default_unit, grams_per_unit, category,
              (' | ' || search_text || ' | ') LIKE ('% | ' || $1 || ' | %') AS exact,
              greatest(word_similarity($1, search_text), similarity($1, search_text)) AS score
       FROM food WHERE merged_into IS NULL AND (search_text % $1 OR $1 <% search_text OR (' | ' || search_text || ' | ') LIKE ('% | ' || $1 || ' | %'))
       ORDER BY exact DESC, score DESC LIMIT $2`, [n, limit]);
    for (const r of rows) this.foods.set(r.id, r);
    return rows.map((r) => ({ food: r, score: r.exact ? 1 : r.score, exact: r.exact }));
  }

  private async resolveDirect(text: string): Promise<{ foodId: string; by: 'library' | 'canonical'; conf: number } | null> {
    if (VAGUE.test(text.trim()) || FOOD_FILLER.test(text)) return null;
    const hit = await this.resolveExact(text);
    // a leading Hebrew conjunction after a comma: ", וסלט" → "סלט"
    if (!hit && /^ו[א-ת]{2,}/.test(text)) return this.resolveExact(text.slice(1));
    return hit;
  }

  private async resolveExact(text: string): Promise<{ foodId: string; by: 'library' | 'canonical'; conf: number } | null> {
    const lib = await this.library(text);
    if (lib) return { foodId: lib.foodId, by: 'library', conf: Math.min(0.98, 0.8 + lib.score * 0.18) };
    const can = await this.canonical(text, 2);
    const top = can[0];
    if (top && (top.exact || (top.score >= 0.8 && (!can[1] || top.score - can[1].score > 0.1)))) return { foodId: top.food.id, by: 'canonical', conf: top.exact ? 0.93 : Math.min(0.9, top.score) };
    return null;
  }

  /** Stage 5: portion — explicit quantity → user median → food default → LLM estimate. */
  private async portion(foodId: string, seg: Segment, llmGrams: number | null): Promise<{ quantity: number | null; unit: string | null; grams: number | null }> {
    const f = await this.food(foodId);
    const gpu = f?.grams_per_unit ? Number(f.grams_per_unit) : null;
    if (seg.quantity !== null || seg.unit) {
      const q = seg.quantity ?? 1; const u = seg.unit ?? f?.default_unit ?? 'unit';
      const per = u === f?.default_unit || u === 'unit' || u === 'slice' || u === 'portion' ? gpu : UNIT_GRAMS[u] ?? gpu;
      return { quantity: q, unit: u, grams: per ? Math.round(q * per) : llmGrams };
    }
    const { rows } = await this.tx.query<{ median_qty: number | null; median_unit: string | null; median_grams: number | null }>('SELECT median_qty, median_unit, median_grams FROM user_food WHERE food_id = $1', [foodId]);
    const m = rows[0];
    if (m?.median_grams) return { quantity: m.median_qty ?? (gpu ? Math.round((m.median_grams / gpu) * 10) / 10 : null), unit: m.median_unit ?? f?.default_unit ?? null, grams: Math.round(Number(m.median_grams)) };
    if (f?.default_qty && gpu) return { quantity: Number(f.default_qty), unit: f.default_unit, grams: Math.round(Number(f.default_qty) * gpu) };
    return { quantity: null, unit: null, grams: llmGrams };
  }

  async parse(text: string): Promise<ParseResult> {
    let segs = segment(text);
    const resolved: (ResolvedItem | null)[] = [];
    const residual: { idx: number; seg: Segment }[] = [];
    const expanded: Segment[] = [];
    for (const s of segs) {
      const direct = await this.resolveDirect(s.text);
      const split = !direct ? vavSplits(s) : null;
      if (split) {
        const [a, b] = await Promise.all(split.map((x) => this.resolveDirect(x.text)));
        if (a && b) { expanded.push(...split); continue; }
      }
      expanded.push(s);
    }
    segs = expanded;
    for (const [i, s] of segs.entries()) {
      const d = await this.resolveDirect(s.text);
      if (d) {
        const f = await this.food(d.foodId); const p = await this.portion(d.foodId, s, null);
        resolved[i] = { raw_text: s.raw, food_id: d.foodId, canonical_name: f?.canonical_name ?? null, quantity: p.quantity, unit: p.unit, grams_est: p.grams,
          confidence: Math.round(d.conf * 100) / 100, resolved_by: d.by, portion_precision: p.quantity ? 'estimated' : 'unspecified', position: i };
      } else if (VAGUE.test(s.text.trim())) resolved[i] = null;
      else { resolved[i] = null; residual.push({ idx: i, seg: s }); }
    }

    let degraded = false; let model = 'none'; let prompt_version = 'meal-parse-v3';
    const unresolved: string[] = segs.filter((s, i) => !resolved[i] && VAGUE.test(s.text.trim())).map((s) => s.raw);
    if (residual.length) {
      // Stage 4 — only the residual text, with candidate matches so the model picks existing ids.
      const withCands = await Promise.all(residual.map(async (r) => ({ text: r.seg.raw, candidates: (await this.canonical(r.seg.text, 5)).map((c): Candidate => ({ food_id: c.food.id, name: c.food.canonical_name, aliases: Object.values(c.food.names_i18n).flat() })) })));
      const out = await this.deps.llm.parseMeal({ segments: withCands, locale: this.locale });
      degraded = out.degraded; model = out.model; prompt_version = out.prompt_version;
      const allowed = new Set(withCands.flatMap((c) => c.candidates.map((x) => x.food_id)));
      for (const [k, r] of residual.entries()) {
        const it = out.items.find((x) => normalizeAlias(x.raw_text) === normalizeAlias(r.seg.raw)) ?? out.items[k];
        if (!it || out.provider === 'deterministic') { unresolved.push(r.seg.raw); resolved[r.idx] = { raw_text: r.seg.raw, food_id: null, canonical_name: null, quantity: r.seg.quantity, unit: r.seg.unit, grams_est: null, confidence: null, resolved_by: null, portion_precision: 'unspecified', position: r.idx }; continue; }
        let foodId = it.food_id && allowed.has(it.food_id) ? it.food_id : null;
        if (!foodId && it.confidence >= 0.5) foodId = await this.createLlmFood(r.seg.text, it.canonical_name, it.category, it.grams_est, it.unit);
        const p = foodId ? await this.portion(foodId, { ...r.seg, quantity: r.seg.quantity ?? it.quantity, unit: r.seg.unit ?? it.unit }, it.grams_est) : { quantity: it.quantity, unit: it.unit, grams: it.grams_est };
        const f = foodId ? await this.food(foodId) : null;
        resolved[r.idx] = { raw_text: r.seg.raw, food_id: foodId, canonical_name: f?.canonical_name ?? it.canonical_name, quantity: p.quantity, unit: p.unit, grams_est: p.grams,
          confidence: Math.round(it.confidence * 100) / 100, resolved_by: 'llm', portion_precision: p.quantity ? 'estimated' : 'unspecified', position: r.idx };
        if (!foodId) unresolved.push(r.seg.raw);
      }
    }
    const items = resolved.filter((x): x is ResolvedItem => Boolean(x)).map((x, i) => ({ ...x, position: i }));
    const confident = items.filter((i) => i.food_id && (i.confidence ?? 0) >= 0.6).length;
    const tier: 1 | 2 | 3 = confident === 0 ? 3 : unresolved.length ? 2 : 1;
    return { items, unresolved, degraded, tier, model, prompt_version, add_ons: confident ? await this.addOns(items) : [] };
  }

  /**
   * Photo items (08 §4.4): the vision model names what it sees; we place each name in the user's
   * library or the canonical table exactly as typed text would be, so a photographed "hummus" is the
   * same food as a typed "חומוס". An unknown but confident name becomes a private llm food (stage 6).
   */
  async resolveVision(items: { raw_text: string; canonical_name: string; quantity: number | null; unit: string | null; grams_est: number | null; confidence: number; category: string | null }[], mediaId: string | null = null): Promise<ResolvedItem[]> {
    const out: ResolvedItem[] = [];
    for (const [i, it] of items.entries()) {
      const hit = (await this.resolveExact(it.canonical_name)) ?? (await this.resolveExact(it.raw_text));
      const foodId = hit?.foodId ?? (it.confidence >= 0.5 ? await this.createLlmFood(it.raw_text, it.canonical_name, it.category, it.grams_est, it.unit) : null);
      const f = foodId ? await this.food(foodId) : null;
      const gpu = f?.grams_per_unit ? Number(f.grams_per_unit) : null;
      const grams = it.grams_est ?? (it.quantity && gpu ? Math.round(it.quantity * gpu) : null);
      // a picture tells us what, far better than how much: confidence is the model's, capped below a typed match
      out.push({ raw_text: it.raw_text, food_id: foodId, canonical_name: f?.canonical_name ?? it.canonical_name, quantity: it.quantity, unit: it.unit, grams_est: grams,
        confidence: Math.round(Math.min(it.confidence, 0.9) * 100) / 100, resolved_by: 'vision', portion_precision: it.quantity || grams ? 'estimated' : 'unspecified', position: i, media_id: mediaId });
    }
    return out;
  }

  /** Stage 6: an LLM-proposed food becomes a private, unverified food (source 'llm') for later review/merge. */
  private async createLlmFood(alias: string, name: string, category: string | null, grams: number | null, unit: string | null): Promise<string> {
    const key = `llm:${normalizeAlias(name)}`;
    const existing = await this.tx.query<{ id: string }>(`SELECT id FROM food WHERE created_by = app_current_user() AND source = 'llm' AND lower(canonical_name) = lower($1)`, [name]);
    if (existing.rows[0]) return existing.rows[0].id;
    const names = { en: [name.toLowerCase()], ...(this.locale.startsWith('he') ? { he: [alias] } : {}) };
    const { rows } = await this.tx.query<{ id: string }>(
      `INSERT INTO food (canonical_name, names_i18n, search_text, category, source, external_ref, default_unit, default_qty, grams_per_unit, is_verified, created_by)
       VALUES ($1,$2,$3,$4,'llm',$5,$6,1,$7,false,app_current_user()) RETURNING id`,
      [name, names, [name, alias].map((x) => x.toLowerCase()).join(' | '), category, `${key}:${Date.now()}`, unit ?? 'portion', grams]);
    return rows[0]!.id;
  }

  /** D39 — invisible ingredients: oil, butter, sauces. One tap to add; never added silently. */
  private async addOns(items: ResolvedItem[]): Promise<AddOn[]> {
    const present = new Set(items.map((i) => i.food_id));
    const { rows } = await this.tx.query<{ id: string; canonical_name: string; names_i18n: Record<string, string[]>; default_qty: number; default_unit: string; grams_per_unit: number }>(
      `SELECT id, canonical_name, names_i18n, default_qty, default_unit, grams_per_unit FROM food WHERE source = 'seed' AND canonical_name = ANY($1)`,
      [['Olive oil', 'Butter', 'Tahini', 'Mayonnaise', 'Ketchup']]);
    return rows.filter((r) => !present.has(r.id)).slice(0, 4).map((r) => ({
      food_id: r.id, canonical_name: r.canonical_name, label: (this.locale.startsWith('he') ? r.names_i18n.he?.[0] : r.names_i18n.en?.[0]) ?? r.canonical_name,
      quantity: Number(r.default_qty), unit: r.default_unit, grams_est: Math.round(Number(r.default_qty) * Number(r.grams_per_unit)), confidence: 0.95, resolved_by: 'library', portion_precision: 'estimated' }));
  }
}
