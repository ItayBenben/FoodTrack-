/** A real provider, not a stub (CLAUDE.md rule 5): template output with no model. */
import type { LLMProvider, LocalizedText, MealParseInput, MealParseResult, NarrateInput } from './types.js';

const pct = (x: unknown) => Math.round(Number(x) * 100);

export function templateNarrative(p: Record<string, unknown>): LocalizedText {
  const exp = p.exposure_label as LocalizedText; const out = p.outcome_label as LocalizedText;
  const warnEn = (p.warnings as string[] | undefined)?.length ? 'other things changed on those days too' : 'other things may have changed on those days';
  const warnHe = (p.warnings as string[] | undefined)?.length ? 'גם דברים אחרים השתנו בימים האלה' : 'ייתכן שגם דברים אחרים השתנו בימים האלה';
  if (p.effect_type === 'risk_difference') {
    return {
      en: `On the ${p.n_exposed} days you had ${exp.en}, ${out.en.toLowerCase()} happened ${pct(p.rate_exposed)}% of the time, compared with ${pct(p.rate_unexposed)}% on the ${p.n_unexposed} days you didn't. That's a difference of ${pct(p.risk_difference)} percentage points. This is an association, not proof — ${warnEn}. The reliable way to find out is a short trial.`,
      he: `ב-${p.n_exposed} הימים שבהם היה ${exp.he}, ${out.he} הופיע/ה ב-${pct(p.rate_exposed)}% מהמקרים, לעומת ${pct(p.rate_unexposed)}% ב-${p.n_unexposed} הימים בלי. זה הבדל של ${pct(p.risk_difference)} נקודות אחוז. זה קשר, לא הוכחה — ${warnHe}. הדרך האמינה לברר היא ניסוי קצר.`,
    };
  }
  return {
    en: `On the ${p.n_exposed} days with ${exp.en}, ${out.en.toLowerCase()} averaged ${p.mean_exposed} compared with ${p.mean_unexposed} on the ${p.n_unexposed} days without. This is an association, not proof — ${warnEn}. A short trial is the reliable way to find out.`,
    he: `ב-${p.n_exposed} הימים עם ${exp.he}, ${out.he} עמד/ה בממוצע על ${p.mean_exposed} לעומת ${p.mean_unexposed} ב-${p.n_unexposed} הימים בלי. זה קשר, לא הוכחה — ${warnHe}. ניסוי קצר הוא הדרך האמינה לברר.`,
  };
}

export class DeterministicProvider implements LLMProvider {
  readonly id = 'deterministic' as const;
  readonly dataEgress = 'local' as const;
  readonly capabilities = { text: true, vision: false, streaming: false };
  readonly model = 'deterministic';
  async parseMeal(input: MealParseInput): Promise<MealParseResult> {
    // Without a model the residual text stays unresolved, honestly marked — never guessed.
    return { model: 'deterministic', prompt_version: 'deterministic-v1', items: input.segments.map((s) => ({ raw_text: s.text, food_id: null, canonical_name: s.text, quantity: null, unit: null, grams_est: null, confidence: 0.2, category: null })) };
  }
  async parsePhoto(): Promise<MealParseResult> { return { items: [], model: 'deterministic', prompt_version: 'deterministic-v1' }; }
  async narrate(input: NarrateInput): Promise<LocalizedText> { return templateNarrative(input.payload); }
  async classifyFood() { return { tags: [] }; }
}
