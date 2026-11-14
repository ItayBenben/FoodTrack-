'use client';
/** Security & encryption (D28). States plainly what L2 protects and what it doesn't. */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError, getAccessToken } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { BackHeader } from '@/components/back';
import { Button, Card, SectionTitle } from '@/components/ui';

export default function Security() {
  const { t, fmtDay } = useI18n();
  const q = useQuery({ queryKey: ['security'], queryFn: () => api<{ alg: string; created_at: string; checksum: string; fields_encrypted: string[] }>('/security/status') });
  const [pass, setPass] = useState(''); const [card, setCard] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [paste, setPaste] = useState(''); const [valid, setValid] = useState<boolean | null>(null);
  const show = async () => {
    setErr(null);
    const r = await fetch('/api/v1/security/recovery-card', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${getAccessToken()}` }, body: JSON.stringify({ passphrase: pass }) });
    if (r.ok) { setCard(await r.text()); setPass(''); } else setErr(r.status === 429 ? t('security.rate_limited') : t('unlock.wrong'));
  };
  return (
    <div><BackHeader title={t('more.security')} />
      {q.data && <Card className="mt-3"><p className="font-medium">{t('security.on')}</p><p className="text-label text-text-muted" dir="ltr">{q.data.alg} · {q.data.checksum}</p>
        <p className="text-label text-text-muted">{t('security.since', { date: fmtDay(q.data.created_at.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) })}</p></Card>}
      <SectionTitle>{t('security.what')}</SectionTitle>
      <p>{t('security.protects')}</p><p className="mt-2">{t('security.leaks')}</p>
      <SectionTitle>{t('security.card')}</SectionTitle>
      <Card>
        <p className="text-label">{t('security.card_explain')}</p>
        {!card ? (<><input type="password" className="w-full min-h-12 rounded-chip border border-border bg-surface px-3 mt-2" placeholder={t('unlock.passphrase')} value={pass} onChange={(e) => setPass(e.target.value)} aria-label={t('unlock.passphrase')} />
          {err && <p role="alert" className="text-danger mt-1">{err}</p>}<Button className="mt-2" disabled={!pass} onClick={() => void show()}>{t('security.show_card')}</Button></>)
          : <><pre dir="ltr" className="mt-2 p-3 rounded-chip bg-surface-sunken text-label overflow-x-auto whitespace-pre">{card}</pre><Button variant="secondary" className="mt-2" onClick={() => window.print()}>{t('export.print')}</Button><Button variant="ghost" className="mt-2" onClick={() => setCard(null)}>{t('security.hide_card')}</Button></>}
      </Card>
      <SectionTitle>{t('security.verify')}</SectionTitle>
      <Card><textarea dir="ltr" rows={5} className="w-full rounded-chip border border-border bg-surface p-2 text-label" value={paste} onChange={(e) => { setPaste(e.target.value); setValid(null); }} aria-label={t('security.verify')} />
        <Button variant="secondary" className="mt-2" disabled={paste.length < 20} onClick={async () => { try { setValid((await api<{ valid: boolean }>('/security/verify-card', { method: 'POST', body: { card: paste } })).valid); } catch (e) { setErr((e as ApiError).message); } }}>{t('security.check_card')}</Button>
        {valid !== null && <p role="status" className={valid ? 'text-accent mt-2' : 'text-danger mt-2'}>{valid ? t('security.card_valid') : t('security.card_invalid')}</p>}</Card>
      <p className="text-label text-text-muted mt-4">{t('security.rotation_cli')}</p>
    </div>
  );
}
