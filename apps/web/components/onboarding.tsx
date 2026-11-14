'use client';
/** F1 (08 §2): modal, autosaved per step (to localStorage), resumes at the first incomplete step. */
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Button, Card, Chip } from './ui';

interface State { step: number; pack: string; trackers: string[] | null; birth_year: string; sex: string; height: string; weight: string; timezone: string; rollover: string; checkin_at: string; reminders: boolean; meal_nudges: boolean; email: string }
const KEY = 'ft_onboarding';
const PACK_TRACKERS: Record<string, string[]> = {
  gut_health: ['meal', 'stool', 'symptom', 'checkin', 'medication', 'supplement', 'exercise', 'hydration', 'note', 'weight'],
  body: ['meal', 'weight', 'body', 'hydration', 'exercise'], energy: ['meal', 'checkin', 'exercise', 'note'],
};
const ALL = ['meal', 'stool', 'symptom', 'checkin', 'weight', 'body', 'hydration', 'medication', 'supplement', 'exercise', 'note', 'event_marker', 'transit_marker'];

export function Onboarding() {
  const { t, locale } = useI18n();
  const { unlocked, mode } = useSession();
  const [s, setS] = useState<State>({ step: 1, pack: 'gut_health', trackers: null, birth_year: '', sex: '', height: '', weight: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, rollover: '04:00', checkin_at: '21:30', reminders: true, meal_nudges: false, email: '' });
  const [pass, setPass] = useState(''); const [pass2, setPass2] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { try { const saved = localStorage.getItem(KEY); if (saved) setS(JSON.parse(saved)); } catch { /* ignore */ } }, []);
  const up = (p: Partial<State>) => setS((x) => { const n = { ...x, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const chosen = s.trackers ?? PACK_TRACKERS[s.pack] ?? PACK_TRACKERS.gut_health!;
  const strength = Math.min(4, Math.floor(pass.length / 5) + (/[^a-zA-Z]/.test(pass) ? 1 : 0));

  const finish = async () => {
    setErr(null);
    if (pass.length < 12) { setErr(t('onboarding.pass_short')); return; }
    if (pass !== pass2) { setErr(t('onboarding.pass_mismatch')); return; }
    setBusy(true);
    try {
      const r = await api<{ access_token: string }>('/auth/setup', { method: 'POST', auth: false, body: {
        passphrase: pass, email: mode === 'multi' ? s.email : undefined, locale: locale === 'he' ? 'he-IL' : 'en-US', timezone: s.timezone, day_rollover: s.rollover,
        pack: s.pack, trackers: chosen, disclaimer_accepted: true,
        profile: { birth_year: s.birth_year ? Number(s.birth_year) : null, sex_at_birth: s.sex || null, height_cm: s.height ? Number(s.height) : null },
        reminders: { checkin_at: s.reminders ? s.checkin_at : null, meal_nudges: s.meal_nudges },
      } });
      await unlocked(r.access_token);
      if (s.weight) { const { saveObservation } = await import('@/lib/store'); await saveObservation({ tracker_key: 'weight', values: { kg: Number(s.weight) } }); }
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    } catch (e) { setErr(e instanceof ApiError ? (e.offline ? t('onboarding.offline') : e.problem.detail ?? e.message) : String(e)); }
    finally { setBusy(false); }
  };

  switch (s.step) {
    case 1: return <Step s={s} up={up}><h1 className="text-display font-bold">{t('onboarding.welcome_title')}</h1><ul className="mt-4 list-disc ps-5 space-y-2"><li>{t('onboarding.welcome_1')}</li><li>{t('onboarding.welcome_2')}</li><li>{t('onboarding.welcome_3')}</li></ul><Card className="mt-6 text-label text-text-muted">{t('onboarding.disclaimer_body')}</Card></Step>;
    case 2: return <Step s={s} up={up} skip><h1 className="text-title font-semibold">{t('onboarding.goal_title')}</h1><div className="flex flex-col gap-2 mt-4">{(['gut_health', 'body', 'energy'] as const).map((p) => <Chip key={p} on={s.pack === p} onClick={() => up({ pack: p, trackers: null })}>{t(`onboarding.goal_${p}`)}</Chip>)}<Chip on={s.pack === 'other'} onClick={() => up({ pack: 'other', trackers: [] })}>{t('onboarding.goal_other')}</Chip></div></Step>;
    case 3: return <Step s={s} up={up}><h1 className="text-title font-semibold">{t('onboarding.trackers_title')}</h1><div className="flex flex-col gap-2 mt-4">{ALL.map((k) => { const on = chosen.includes(k); return <label key={k} className="flex items-start gap-3 min-h-12 py-1"><input type="checkbox" className="mt-1 h-5 w-5" checked={on} onChange={() => up({ trackers: on ? chosen.filter((x) => x !== k) : [...chosen, k] })} /><span><span className="block">{t(`trackers.names.${k}`)}</span><span className="block text-label text-text-muted">{t(`onboarding.why.${k}`)}</span></span></label>; })}</div></Step>;
    case 4: return <Step s={s} up={up} skip><h1 className="text-title font-semibold">{t('onboarding.about_title')}</h1><p className="text-text-muted mt-1">{t('onboarding.about_note')}</p>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <Field label={t('onboarding.birth_year')} value={s.birth_year} onChange={(v) => up({ birth_year: v })} />
        <label className="flex flex-col gap-1"><span className="text-label text-text-muted">{t('onboarding.sex')}</span><select className="min-h-12 rounded-chip border border-border bg-surface px-2" value={s.sex} onChange={(e) => up({ sex: e.target.value })}><option value="">—</option><option value="female">{t('onboarding.sex_f')}</option><option value="male">{t('onboarding.sex_m')}</option><option value="other">{t('onboarding.sex_o')}</option></select></label>
        <Field label={t('onboarding.height')} value={s.height} onChange={(v) => up({ height: v })} />
        <Field label={t('onboarding.weight')} value={s.weight} onChange={(v) => up({ weight: v })} />
      </div></Step>;
    case 5: return <Step s={s} up={up}><h1 className="text-title font-semibold">{t('onboarding.day_title')}</h1>
      <label className="flex flex-col gap-1 mt-4"><span className="text-label text-text-muted">{t('onboarding.timezone')}</span><input dir="ltr" className="min-h-12 rounded-chip border border-border bg-surface px-3" value={s.timezone} onChange={(e) => up({ timezone: e.target.value })} /></label>
      <label className="flex flex-col gap-1 mt-4"><span className="text-label text-text-muted">{t('onboarding.rollover')}</span><input type="time" dir="ltr" className="min-h-12 rounded-chip border border-border bg-surface px-3 w-32" value={s.rollover} onChange={(e) => up({ rollover: e.target.value })} /></label>
      <p className="text-label text-text-muted mt-1">{t('onboarding.rollover_explain')}</p></Step>;
    case 6: return <Step s={s} up={up} skip><h1 className="text-title font-semibold">{t('onboarding.reminders_title')}</h1>
      <label className="flex items-center gap-3 mt-4 min-h-12"><input type="checkbox" className="h-5 w-5" checked={s.reminders} onChange={(e) => up({ reminders: e.target.checked })} />{t('onboarding.checkin_reminder')}<input type="time" dir="ltr" className="min-h-12 rounded-chip border border-border bg-surface px-2" value={s.checkin_at} onChange={(e) => up({ checkin_at: e.target.value })} /></label>
      <label className="flex items-center gap-3 min-h-12"><input type="checkbox" className="h-5 w-5" checked={s.meal_nudges} onChange={(e) => up({ meal_nudges: e.target.checked })} />{t('onboarding.meal_nudges')}</label></Step>;
    case 7: return <Step s={s} up={up}><h1 className="text-title font-semibold">{t('onboarding.lock_title')}</h1>
      <div className="flex flex-col gap-3 mt-4">
        {mode === 'multi' && <input type="email" autoComplete="username" className="min-h-12 rounded-chip border border-border bg-surface px-3" placeholder={t('unlock.email')} value={s.email} onChange={(e) => up({ email: e.target.value })} />}
        <input type="password" autoComplete="new-password" data-testid="new-passphrase" className="min-h-12 rounded-chip border border-border bg-surface px-3" placeholder={t('onboarding.passphrase')} value={pass} onChange={(e) => setPass(e.target.value)} aria-label={t('onboarding.passphrase')} />
        <div className="h-1 rounded-pill bg-surface-sunken"><div className="h-1 rounded-pill bg-accent" style={{ inlineSize: `${strength * 25}%` }} /></div>
        <input type="password" autoComplete="new-password" data-testid="confirm-passphrase" className="min-h-12 rounded-chip border border-border bg-surface px-3" placeholder={t('onboarding.confirm')} value={pass2} onChange={(e) => setPass2(e.target.value)} aria-label={t('onboarding.confirm')} />
        <p className="text-label text-text-muted">{t('onboarding.lock_note')}</p>
        {err && <p role="alert" className="text-danger">{err}</p>}
        <Button onClick={() => void finish()} disabled={busy} data-testid="set-passphrase">{t('onboarding.set_passphrase')}</Button>
      </div></Step>;
    default: return null;
  }
}

function Step({ s, up, children, skip }: { s: State; up: (p: Partial<State>) => void; children: React.ReactNode; skip?: boolean }) {
  const { t, locale, setLocale } = useI18n();
  const next = () => up({ step: s.step + 1 });
  return (
    <div className="min-h-dvh max-w-md mx-auto p-6 flex flex-col" data-testid={`onboarding-step-${s.step}`}>
      <div className="flex justify-between items-center"><span className="text-label text-text-muted">{t('onboarding.step', { n: s.step, total: 7 })}</span>
        <button className="min-h-12 px-3 text-label" onClick={() => setLocale(locale === 'he' ? 'en' : 'he')}>{locale === 'he' ? 'English' : 'עברית'}</button></div>
      <div className="flex-1 mt-4">{children}</div>
      <div className="flex flex-col gap-2 mt-6">
        {s.step !== 7 && <Button onClick={next} data-testid="onboarding-continue">{t(s.step === 1 ? 'onboarding.start' : 'common.continue')}</Button>}
        {skip && <Button variant="ghost" onClick={next}>{t('common.skip')}</Button>}
        {s.step > 1 && <Button variant="ghost" onClick={() => up({ step: s.step - 1 })}>{t('common.back')}</Button>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="flex flex-col gap-1"><span className="text-label text-text-muted">{label}</span><input inputMode="decimal" dir="ltr" className="min-h-12 rounded-chip border border-border bg-surface px-3" value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
