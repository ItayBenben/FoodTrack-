/**
 * Export & import (03 §9, 02 §9.5). Exports are plaintext by design — an export you can't read isn't an
 * export — so they are short-lived: written encrypted to disk, downloadable once via a signed link that
 * expires in an hour, then deleted. The clinical report is numbers only; no AI narrative.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { addDays, uuidv7, type ObservationInput } from '@foodtrack/shared';
import type { Deps } from '../app.js';
import type { Tx } from '../db/pool.js';
import { HttpProblem } from '../lib/problem.js';
import { handlers, publish } from '../workers/jobs.js';
import { createObservation, loadObservations } from './observations.js';
import { rollupRange } from './days.js';
import { getUser } from './users.js';

export function signDownload(deps: Deps, jobId: string, userId: string, exp: number) {
  return createHmac('sha256', deps.env.SESSION_SECRET).update(`export:${jobId}:${userId}:${exp}`).digest('base64url');
}
export function verifyDownload(deps: Deps, jobId: string, userId: string, exp: number, sig: string) {
  const want = Buffer.from(signDownload(deps, jobId, userId, exp)); const got = Buffer.from(sig);
  return exp > Date.now() && want.length === got.length && timingSafeEqual(want, got);
}

const csvCell = (v: unknown) => { const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function buildExport(tx: Tx, deps: Deps, format: 'json' | 'csv', from: string, to: string): Promise<{ body: Buffer; mime: string; ext: string }> {
  const obs = await loadObservations(tx, deps, 'local_day BETWEEN $1 AND $2 AND deleted_at IS NULL ORDER BY occurred_at', [from, to]);
  if (format === 'json') {
    const user = await getUser(tx);
    const { rows: trials } = await tx.query('SELECT id, target_label, design, status, primary_outcome, hypothesis, phases, started_at, completed_at, verdict FROM trial WHERE design <> \'D\' OR revealed_at IS NOT NULL');
    return { mime: 'application/json', ext: 'json', body: Buffer.from(JSON.stringify({ format: 'foodtrack-export', version: 1, exported_at: new Date().toISOString(), range: { from, to },
      settings: { timezone: user.timezone, day_rollover: user.day_rollover, locale: user.locale }, observations: obs, trials }, null, 1)) };
  }
  const keys = [...new Set(obs.flatMap((o) => Object.keys(o.values)))].sort();
  const lines = [['id', 'client_id', 'tracker', 'occurred_at', 'local_day', 'time_precision', 'note', ...keys.map((k) => `value.${k}`), 'meal_items'].join(',')];
  for (const o of obs) lines.push([o.id, o.client_id, o.tracker_key, o.occurred_at, o.local_day, o.time_precision, o.note, ...keys.map((k) => o.values[k]),
    o.meal_items?.map((i) => `${i.raw_text}${i.canonical_name ? ` [${i.canonical_name}]` : ''}${i.grams_est ? ` ${i.grams_est}g` : ''}`).join('; ')].map(csvCell).join(','));
  return { mime: 'text/csv', ext: 'csv', body: Buffer.from(`${String.fromCharCode(0xfeff)}${lines.join('\n')}\n`) };
}

/** The clinical summary (01 U8): Bristol distribution, frequency, symptom trend, IBS-SSS-style score, weight, meds, red flags, diary. */
export async function clinicalSummary(tx: Tx, deps: Deps, from: string, to: string) {
  const days = await rollupRange(tx, deps, from, to);
  const obs = await loadObservations(tx, deps, 'local_day BETWEEN $1 AND $2 AND deleted_at IS NULL ORDER BY occurred_at', [from, to]);
  const reg = await deps.registry.forUser(tx);
  const bristolTr = [...reg.values()].find((r) => r.def.fields.some((f) => f.options?.some((o) => o.illustration?.startsWith('bristol'))));
  const bristolField = bristolTr?.def.fields.find((f) => f.options?.some((o) => o.illustration?.startsWith('bristol')));
  const dist: Record<string, number> = {};
  for (const o of obs.filter((x) => x.tracker_key === bristolTr?.def.key)) { const b = o.values[bristolField!.key]; if (b !== undefined) dist[String(b)] = (dist[String(b)] ?? 0) + 1; }
  const n_days = Math.max(1, (Date.parse(to) - Date.parse(from)) / 86400_000 + 1);
  const stools = Object.values(dist).reduce((s, x) => s + x, 0);
  const weekly: { week: string; symptom_load: number | null; score: number | null }[] = [];
  for (let d = from; d <= to; d = addDays(d, 7)) {
    const w = days.filter((x) => x.local_day >= d && x.local_day < addDays(d, 7));
    const loads = w.map((x) => Number(x.trackers.symptom?.load ?? 0));
    const scores = w.map((x) => x.score?.value).filter((v): v is number => v !== undefined && v !== null);
    weekly.push({ week: d, symptom_load: w.length ? Math.round(loads.reduce((s, x) => s + x, 0) / w.length) : null, score: scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : null });
  }
  // IBS-SSS-style (published item structure, 0–500): pain severity, pain frequency, distension severity,
  // bowel-habit dissatisfaction, life interference — each 0–100, derived from logged data, labelled as derived.
  const last10 = days.slice(-10);
  const sym = obs.filter((o) => o.tracker_key === 'symptom');
  const painSev = Math.min(100, (Math.max(0, ...sym.filter((o) => ['pain', 'cramping'].includes(String(o.values.kind))).map((o) => Number(o.values.severity ?? 0))) || 0) * 10);
  const painDays = new Set(sym.filter((o) => ['pain', 'cramping'].includes(String(o.values.kind)) && Number(o.values.severity) > 0 && o.local_day >= (last10[0]?.local_day ?? from)).map((o) => o.local_day)).size;
  const painFreq = Math.round((painDays / 10) * 100);
  const dist2 = Math.min(100, (Math.max(0, ...sym.filter((o) => o.values.kind === 'bloating').map((o) => Number(o.values.severity ?? 0))) || 0) * 10);
  const abnormal = stools ? ((dist['1'] ?? 0) + (dist['2'] ?? 0) + (dist['6'] ?? 0) + (dist['7'] ?? 0)) / stools : 0;
  const bowel = Math.round(abnormal * 100);
  const energy = obs.filter((o) => o.tracker_key === 'checkin' && o.values.energy).map((o) => Number(o.values.energy));
  const life = energy.length ? Math.round((1 - (energy.reduce((s, x) => s + x, 0) / energy.length - 1) / 4) * 100) : 0;
  const total = painSev + painFreq + dist2 + bowel + life;
  const weights = obs.filter((o) => o.tracker_key === 'weight').map((o) => ({ day: o.local_day, kg: Number(o.values.kg) }));
  const meds = obs.filter((o) => o.tracker_key === 'medication').map((o) => ({ day: o.local_day, name: o.values.name, class: o.values.class, dose: o.values.dose }));
  const { rows: flags } = await tx.query(`SELECT rule_key, raised_at, acknowledged_at FROM safety_flag WHERE raised_at::date BETWEEN $1 AND $2 ORDER BY raised_at`, [from, to]);
  const diary = obs.filter((o) => reg.get(o.tracker_key)?.def.has_meal_items).slice(-60).map((o) => ({ at: o.occurred_at, day: o.local_day, text: o.meal_items?.map((i) => i.raw_text).join(', ') || String(o.values.description ?? '') }));
  return { range: { from, to }, n_days, bristol_distribution: dist, stools_per_week: Math.round((stools / n_days) * 7 * 10) / 10, weekly,
    ibs_sss_style: { items: { pain_severity: painSev, pain_frequency: painFreq, distension: dist2, bowel_dissatisfaction: bowel, life_interference: life }, total, band: total < 175 ? 'mild' : total <= 300 ? 'moderate' : 'severe', derived: true },
    weights, medications: meds, red_flags: flags, diary };
}

handlers.set('export', async (tx, deps, p, userId) => {
  const { format, from, to, job_id } = p as { format: 'json' | 'csv'; from: string; to: string; job_id: string };
  const out = await buildExport(tx, deps, format, from, to);
  const sealed = deps.keys.crypto.sealMedia(job_id, out.body);
  await deps.media.put(`${userId}/${job_id}`, sealed.ciphertext);
  const exp = Date.now() + 3600_000;
  const url = `/api/v1/export/${job_id}/download?u=${userId}&exp=${exp}&sig=${signDownload(deps, job_id, userId!, exp)}`;
  await publish(deps, tx, userId!, 'export.completed', { job_id, url, format });
  return { key: `${userId}/${job_id}`, wrapped: sealed.wrappedKey.toString('base64'), nonce: sealed.nonce.toString('base64'), mime: out.mime, ext: out.ext, url, expires_at: exp };
});

/** Import is idempotent on client_id and runs in one transaction; dry-run reports what would change. */
export async function importData(tx: Tx, deps: Deps, data: unknown, dryRun: boolean) {
  const d = data as { format?: string; observations?: (ObservationInput & { id?: string })[] };
  if (d?.format !== 'foodtrack-export' || !Array.isArray(d.observations)) throw new HttpProblem(422, 'not_an_export', 'This file isn’t a FoodTrack export', 'Choose a .json file made by Export.');
  let create = 0; let skip = 0; const errors: { client_id: string; detail: string }[] = [];
  await tx.query('SAVEPOINT import');
  for (const o of d.observations) {
    const cid = o.client_id ?? `import_${o.id ?? uuidv7()}`;
    const exists = await tx.query('SELECT 1 FROM observation WHERE client_id = $1', [cid]);
    if (exists.rows[0]) { skip++; continue; }
    try {
      await createObservation(tx, { deps, deviceId: 'import' }, { client_id: cid, tracker_key: o.tracker_key, occurred_at: o.occurred_at, time_source: 'user_set', source: 'import', note: o.note ?? null, values: o.values ?? {},
        meal_items: (o as { meal_items?: ObservationInput['meal_items'] }).meal_items?.map((i) => ({ raw_text: i.raw_text, food_id: i.food_id ?? null, quantity: i.quantity ?? null, unit: i.unit ?? null, grams_est: i.grams_est ?? null, confidence: i.confidence ?? null, resolved_by: i.resolved_by ?? null, portion_precision: i.portion_precision })) });
      create++;
    } catch (e) { errors.push({ client_id: cid, detail: (e as Error).message }); }
  }
  if (dryRun) await tx.query('ROLLBACK TO SAVEPOINT import');
  return { dry_run: dryRun, would_create: create, already_present: skip, errors, total: d.observations.length };
}
