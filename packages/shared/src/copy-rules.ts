/**
 * Forbidden-phrase rules (CLAUDE.md rule 3, 01 safety, 04 §9).
 * Applied to locale files at lint time and to every LLM output at runtime.
 */
export const FORBIDDEN_PATTERNS: { code: string; re: RegExp }[] = [
  { code: 'causal', re: /\b(causes?|caused|causing|triggers? your|is making you|makes you sick|responsible for your)\b/i },
  { code: 'causal_he', re: /(גורם ל|גורמת ל|גורמים ל|גרם ל|גרמה ל|הסיבה ל)/ },
  { code: 'diagnostic', re: /\b(you have|diagnos(is|ed|e)|IBS|SIBO|celiac|coeliac|crohn'?s?|colitis|intoleran(t|ce) to|allergic to)\b/i },
  { code: 'diagnostic_he', re: /(יש לך (תסמונת|מחלת|רגישות)|אבחנה|אבחון|צליאק|קרוהן|קוליטיס|מעי רגיז)/ },
  { code: 'medication_advice', re: /\b(stop|start|reduce|increase|change|skip) (taking )?(your )?(medication|meds|pills|dose)\b/i },
  { code: 'medication_advice_he', re: /(הפסק|הפסיקי|תפסיק|תפסיקי|הפחת|הגדל|שנה|שני)\s*(את\s*)?(ה)?(תרופה|תרופות|מינון)/ },
  { code: 'certainty', re: /\b(proves?|proven|definitely|certainly|guaranteed)\b/i },
];

/** Strings explicitly allowed to contain otherwise-forbidden words (e.g. the medication safety line that says "don't change it"). */
export const COPY_ALLOWLIST_KEYS = new Set<string>([
  'insights.medication_pattern',
  'safety.disclaimer_body',
  'onboarding.disclaimer_body',
  'trial.limitations.not_diagnosis',
  'safety.not_diagnosis',
  'report.footer',
]);

export interface CopyViolation { code: string; match: string }

export function lintCopy(text: string): CopyViolation[] {
  const out: CopyViolation[] = [];
  for (const { code, re } of FORBIDDEN_PATTERNS) {
    const m = text.match(re);
    if (m) out.push({ code, match: m[0] });
  }
  return out;
}

/** Narrative guard (03 §10): every numeral in the output must be present in the input payload. */
export function numeralsNotInInput(output: string, input: unknown): string[] {
  const inputNums = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'number') {
      for (const s of [String(v), String(Math.round(v * 100)), String(Math.round(v * 1000) / 10), String(Math.round(v * 100) / 100), String(Math.abs(Math.round(v * 100)))]) inputNums.add(s);
    } else if (typeof v === 'string') { for (const m of v.match(/\d+(?:\.\d+)?/g) ?? []) inputNums.add(m); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(input);
  return (output.match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => !inputNums.has(n));
}
