'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Button, Card } from './ui';

/** 08 §3.1. Lockout countdown persists across restarts; "Forgot" tells the truth about reset. */
export function Unlock() {
  const { t, locale, setLocale } = useI18n();
  const { unlocked, mode } = useSession();
  const [pass, setPass] = useState(''); const [email, setEmail] = useState(''); const [totp, setTotp] = useState('');
  const [show, setShow] = useState(false); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [needTotp, setNeedTotp] = useState(false); const [forgot, setForgot] = useState(false); const [cantReach, setCantReach] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number>(() => Number(typeof localStorage !== 'undefined' ? localStorage.getItem('ft_locked_until') ?? 0 : 0));
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i); }, []);
  const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const body = mode === 'multi' ? { email, password: pass, totp: totp || undefined } : { passphrase: pass, totp: totp || undefined };
      const r = await api<{ access_token: string }>(mode === 'multi' ? '/auth/login' : '/auth/unlock', { method: 'POST', body, auth: false });
      try { localStorage.removeItem('ft_locked_until'); } catch { /* ignore */ }
      await unlocked(r.access_token);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.offline) setErr(t('unlock.offline'));
        else if (e.status >= 500) setErr(t('unlock.server_error'));
        else if (e.problem.totp_required) { setNeedTotp(true); setErr(totp ? t('unlock.totp_wrong') : null); }
        else if (e.status === 429 && typeof e.problem.locked_until === 'string') { const u = Date.parse(e.problem.locked_until); setLockedUntil(u); try { localStorage.setItem('ft_locked_until', String(u)); } catch { /* ignore */ } }
        else setErr(typeof e.problem.attempts_remaining === 'number' ? t('unlock.wrong_n', { n: e.problem.attempts_remaining }) : t('unlock.wrong'));
      }
    } finally { setBusy(false); }
  };
  if (forgot) return (
    <div className="min-h-dvh max-w-md mx-auto p-6 flex flex-col justify-center">
      {!cantReach ? (<>
        <h1 className="text-title font-semibold">{t('unlock.forgot_title')}</h1>
        <p className="mt-3">{t('unlock.forgot_body')}</p>
        <pre dir="ltr" className="mt-3 p-3 rounded-chip bg-surface-sunken overflow-x-auto text-label">docker compose exec api pnpm reset-passphrase</pre>
        <p className="mt-3 text-text-muted">{t('unlock.forgot_link')}</p>
        <Button className="mt-4" variant="secondary" onClick={() => void navigator.clipboard?.writeText('docker compose exec api pnpm reset-passphrase')}>{t('unlock.copy_command')}</Button>
        <Button className="mt-2" variant="ghost" onClick={() => setCantReach(true)}>{t('unlock.cant_reach')}</Button>
      </>) : <p>{t('unlock.cant_reach_body')}</p>}
      <Button className="mt-6" variant="ghost" onClick={() => { setForgot(false); setCantReach(false); }}>{t('common.back')}</Button>
    </div>
  );
  return (
    <div className="min-h-dvh max-w-md mx-auto p-6 flex flex-col justify-center">
      <div className="flex justify-end"><button className="min-h-12 px-3 text-label" onClick={() => setLocale(locale === 'he' ? 'en' : 'he')}>{locale === 'he' ? 'English' : 'עברית'}</button></div>
      <h1 className="text-display font-bold">FoodTrack</h1>
      <Card className="mt-6">
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-3">
          {mode === 'multi' && <input type="email" autoComplete="username" className="min-h-12 rounded-chip border border-border bg-surface px-3" placeholder={t('unlock.email')} value={email} onChange={(e) => setEmail(e.target.value)} aria-label={t('unlock.email')} />}
          <div className="flex gap-2">
            <input data-testid="passphrase" type={show ? 'text' : 'password'} autoComplete="current-password" className="flex-1 min-h-12 rounded-chip border border-border bg-surface px-3" placeholder={t('unlock.passphrase')} value={pass} onChange={(e) => setPass(e.target.value)} aria-label={t('unlock.passphrase')} autoFocus />
            <button type="button" className="min-h-12 px-3 text-label" onClick={() => setShow(!show)} aria-pressed={show}>{show ? t('unlock.hide') : t('unlock.show')}</button>
          </div>
          {needTotp && <input inputMode="numeric" autoComplete="one-time-code" className="min-h-12 rounded-chip border border-border bg-surface px-3" placeholder={t('unlock.totp')} value={totp} onChange={(e) => setTotp(e.target.value)} aria-label={t('unlock.totp')} />}
          {remaining > 0 ? <p role="alert" className="text-warn">{t('unlock.locked', { s: remaining })}</p> : err && <p role="alert" className="text-danger">{err}</p>}
          <Button type="submit" disabled={busy || remaining > 0 || !pass} data-testid="unlock">{t('unlock.cta')}</Button>
        </form>
      </Card>
      <button className="mt-4 min-h-12 text-accent" onClick={() => setForgot(true)}>{t('unlock.forgot')}</button>
    </div>
  );
}
