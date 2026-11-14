'use client';
export interface Phase { phase: string; start: string; end: string; period_index?: number; dose?: { en: string; he: string } | null; label?: string }
export interface Trial {
  id: string; status: string; design: 'A' | 'B' | 'C' | 'D'; target_label: { en: string; he: string }; target_ref: string; target_kind: string; primary_outcome: string;
  phases: Phase[]; started_at: string | null; completed_at: string | null; revealed_at: string | null; open_label: boolean; hypothesis: Record<string, unknown>;
  verdict: Verdict | null; today?: string; days?: { local_day: string; phase: string; period_index: number | null; adherent: boolean | null; exposure_detected: boolean; logged: boolean; assigned_dose: string | null }[];
  adherence_so_far?: number | null; guesses?: { period_index: number; guess: string }[];
}
export interface Verdict {
  verdict: 'effect' | 'probable' | 'inconclusive' | 'probably_not' | 'no_meaningful_effect'; reason?: string; effect: number | null; ci: [number, number] | null; p_effect: number | null; p_rope: number | null;
  adherence: number; days_logged_share: number; partial: boolean; stopped_on_day?: number; of_days?: number; open_label: boolean; limitations: string[]; outcome_type: string;
  rate_on?: number; rate_off?: number; analytic_days_excluded: number; washout_days_actual: number | null;
  blinding?: { break_blind_rate: number | null; chance_baseline: number; effect_by_guess: number | null; effect_by_allocation: number; diverges: boolean } | null; downgraded_by_guess?: boolean;
}
export function currentPhase(t: Trial): Phase | null { const d = t.today ?? new Date().toISOString().slice(0, 10); return t.phases.find((p) => p.start <= d && d <= p.end) ?? null; }
export function dayNumber(t: Trial, p: Phase) { const d = t.today ?? new Date().toISOString().slice(0, 10); return Math.round((Date.parse(d) - Date.parse(p.start)) / 86400_000) + 1; }
export function phaseLength(p: Phase) { return Math.round((Date.parse(p.end) - Date.parse(p.start)) / 86400_000) + 1; }
