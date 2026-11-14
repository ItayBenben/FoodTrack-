/**
 * Provider routing with fallback (config/llm.json). The deterministic provider is always last,
 * so every call returns something. Narratives are validated (03 §10): every numeral must be in
 * the input, the copy lint must pass, both locales present — else the deterministic template.
 */
import { lintCopy, numeralsNotInInput } from '@foodtrack/shared';
import type { Env } from '../config.js';
import { readConfigJson } from '../config.js';
import { AnthropicProvider } from './anthropic.js';
import { DeterministicProvider, templateNarrative } from './deterministic.js';
import { OpenAICompatProvider } from './openai-compat.js';
import { MealParseResultSchema, type LLMProvider, LocalizedText, MealParseInput, MealParseResult, NarrateInput, PhotoParseInput } from './types.js';

interface LlmConfig { text: { timeout_ms: number }; narrative: { timeout_ms: number }; vision: { enabled: boolean }; fallback_order: string[]; prompt_versions: { meal_parse: string; narrative: string } }

export interface LLMRouter {
  describe(): { active: string; dataEgress: 'remote' | 'local'; chain: string[]; vision: boolean; model: string };
  parseMeal(input: MealParseInput): Promise<MealParseResult & { degraded: boolean; provider: string }>;
  parsePhoto(input: PhotoParseInput): Promise<MealParseResult & { degraded: boolean }>;
  narrate(input: NarrateInput): Promise<LocalizedText & { model: string; prompt_version: string }>;
}

async function withTimeout<T>(ms: number, fn: (s: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(new Error('llm timeout')), ms);
  try { return await fn(ctl.signal); } finally { clearTimeout(t); }
}

export function buildProviders(env: Env, cfg: LlmConfig): LLMProvider[] {
  const all: Record<string, () => LLMProvider | null> = {
    anthropic: () => (env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL_TEXT && !env.ANTHROPIC_MODEL_TEXT.startsWith('<')
      ? new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL_TEXT, cfg.vision.enabled && env.ANTHROPIC_MODEL_VISION && !env.ANTHROPIC_MODEL_VISION.startsWith('<') ? env.ANTHROPIC_MODEL_VISION : null, cfg.prompt_versions.meal_parse) : null),
    'openai-compat': () => (env.OPENAI_COMPAT_URL && env.OPENAI_COMPAT_MODEL ? new OpenAICompatProvider(env.OPENAI_COMPAT_URL, env.OPENAI_COMPAT_MODEL, cfg.prompt_versions.meal_parse) : null),
    deterministic: () => new DeterministicProvider(),
  };
  const order = env.LLM_PROVIDER === 'auto' ? cfg.fallback_order : [env.LLM_PROVIDER, 'deterministic'];
  const out = order.map((k) => all[k]?.() ?? null).filter((p): p is LLMProvider => Boolean(p));
  if (!out.some((p) => p.id === 'deterministic')) out.push(new DeterministicProvider());
  return out;
}

export function createLLMRouter(env?: Env, providers?: LLMProvider[]): LLMRouter {
  const cfg = readConfigJson<LlmConfig>('llm.json', env);
  const chain = providers ?? (env ? buildProviders(env, cfg) : [new DeterministicProvider()]);
  const first = chain[0]!;
  return {
    describe: () => ({ active: first.id, dataEgress: first.dataEgress, chain: chain.map((p) => p.id), vision: chain.some((p) => p.capabilities.vision), model: first.model }),
    async parseMeal(input) {
      for (const p of chain) {
        try {
          const r = await withTimeout(cfg.text.timeout_ms, (s) => p.parseMeal(input, s));
          MealParseResultSchema.parse({ items: r.items }); // non-conforming output is discarded, never echoed
          return { ...r, degraded: p.id === 'deterministic' && chain.length > 1, provider: p.id };
        } catch { /* fall through to the next provider */ }
      }
      const r = await new DeterministicProvider().parseMeal(input);
      return { ...r, degraded: true, provider: 'deterministic' };
    },
    async parsePhoto(input) {
      for (const p of chain.filter((x) => x.capabilities.vision)) {
        try { return { ...(await withTimeout(cfg.text.timeout_ms * 2, (s) => p.parsePhoto(input, s))), degraded: false }; } catch { /* next */ }
      }
      return { items: [], model: 'none', prompt_version: cfg.prompt_versions.meal_parse, degraded: true };
    },
    async narrate(input) {
      for (const p of chain) {
        if (p.id === 'deterministic') break;
        try {
          const r = await withTimeout(cfg.narrative.timeout_ms, (s) => p.narrate(input, s));
          const ok = typeof r?.en === 'string' && typeof r?.he === 'string' && r.en.length > 20 && r.he.length > 10
            && lintCopy(r.en).length === 0 && lintCopy(r.he).length === 0
            && numeralsNotInInput(r.en, input.payload).length === 0 && numeralsNotInInput(r.he, input.payload).length === 0;
          if (ok) return { en: r.en, he: r.he, model: `${p.id}:${p.model}`, prompt_version: cfg.prompt_versions.narrative };
        } catch { /* next */ }
      }
      return { ...templateNarrative(input.payload), model: 'deterministic', prompt_version: 'template-v1' };
    },
  };
}
