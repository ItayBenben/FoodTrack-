'use client';
import type { TrackerDefinition } from '@foodtrack/tracker-schema';
import type { T } from './i18n';

export interface Card {
  id: string; exposure: { kind: string; ref: string; label: { en: string; he: string } }; outcome: { ref: string; label: { en: string; he: string } };
  lag_window_hours: [number, number]; confidence: 'low' | 'medium' | 'high'; narrative: { en: string; he: string } | null; outcome_state: string | null; seen: boolean;
  evidence: { n_exposed_days: number; n_unexposed_days: number; n_outcome_exposed: number; n_outcome_unexposed: number; effect_type: string; effect: number; ci: [number, number];
    q_value: number; rho_1: number; attenuation: number | null; adjusted_for: string[]; warnings: { code: string; detail?: Record<string, unknown> }[];
    rate_exposed?: number; rate_unexposed?: number; mean_exposed?: number; mean_unexposed?: number; cohens_d?: number; adjusted_effect?: number;
    dose_response?: { tertile_means: number[]; monotone: boolean } | null; replication?: { replicated: boolean } | null; overlapping_events?: { label: { en: string; he: string }; days_overlapping: number }[] };
  days?: { day: string; exposed: boolean; outcome: number; weight: number }[];
  also_outcomes?: { ref: string; label: { en: string; he: string }; confidence: string }[]; also_as?: { ref: string; label: { en: string; he: string } }[];
}

/** Label for a confounder ref, read from the tracker definitions (no hard-coded list). */
export function confounderLabel(ref: string, defs: Map<string, TrackerDefinition>, label: (l: { en: string; he: string }) => string, t: T): string {
  if (ref === 'weekend') return t('insights.conf.weekend');
  if (ref.startsWith('tag.')) return t(`insights.conf.tag_${ref.slice(4)}`);
  const [tr, agg] = ref.split('.');
  const a = defs.get(tr!)?.aggregation?.daily.find((x) => x.key === agg);
  return a?.analysis ? label(a.analysis.labels) : ref;
}

export function effectLine(c: Card, t: T, label: (l: { en: string; he: string }) => string, num: (n: number, d?: number) => string): string {
  const lag = t('insights.lag', { a: c.lag_window_hours[0], b: c.lag_window_hours[1] });
  if (c.evidence.effect_type === 'risk_difference') {
    const pp = Math.round(Math.abs(c.evidence.effect) * 100);
    return t(c.evidence.effect > 0 ? 'insights.more_pp' : 'insights.fewer_pp', { pp, outcome: label(c.outcome.label), lag });
  }
  return t(c.evidence.effect > 0 ? 'insights.higher_mean' : 'insights.lower_mean', { d: num(Math.abs(c.evidence.effect), 1), outcome: label(c.outcome.label), lag });
}
