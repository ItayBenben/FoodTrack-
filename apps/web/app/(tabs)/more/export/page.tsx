'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { BackHeader } from '@/components/back';
import { Button, Card, Chip, SectionTitle } from '@/components/ui';

const ago = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

export default function ExportPage() {
  const { t } = useI18n();
  const [from, setFrom] = useState(ago(90)); const to = ago(0);
  const [state, setState] = useState<string | null>(null); const [url, setUrl] = useState<string | null>(null);
  const [imp, setImp] = useState<{ would_create: number; already_present: number; errors: unknown[]; total: number; dry_run: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null); const [file, setFile] = useState<string | null>(null);
  const run = async (format: 'json' | 'csv') => {
    setState('working'); setUrl(null);
    try {
      const { job_id } = await api<{ job_id: string }>('/export', { method: 'POST', body: { format, from, to } });
      for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 1000)); const s = await api<{ status: string; url: string | null }>(`/export/${job_id}`); if (s.status === 'done') { setUrl(s.url); setState('done'); return; } if (s.status === 'failed') break; }
      setState('failed');
    } catch (e) { setState(e instanceof ApiError && e.offline ? 'offline' : 'failed'); }
  };
  const doImport = async (dry: boolean) => { if (!file) return; setImp(await api(`/import?dry_run=${dry}`, { method: 'POST', body: JSON.parse(file) })); };
  return (
    <div><BackHeader title={t('more.export')} />
      <SectionTitle>{t('export.range')}</SectionTitle>
      <div className="flex gap-2">{[30, 90, 365, 3650].map((n) => <Chip key={n} on={from === ago(n)} onClick={() => setFrom(ago(n))}>{t(`export.last_${n}`)}</Chip>)}</div>
      <SectionTitle>{t('export.for_clinician')}</SectionTitle>
      <Card><p>{t('export.clinical_body')}</p><Link className="mt-3 inline-flex min-h-12 items-center px-4 rounded-chip bg-accent text-on-accent" href={`/report?from=${from}&to=${to}`}>{t('export.clinical_open')}</Link></Card>
      <SectionTitle>{t('export.your_data')}</SectionTitle>
      <Card>
        <div className="flex gap-2"><Button onClick={() => void run('json')}>JSON</Button><Button variant="secondary" onClick={() => void run('csv')}>CSV</Button></div>
        <p className="text-label text-text-muted mt-2">{t('export.unencrypted')}</p>
        {state && state !== 'done' && <p className="mt-2" role="status">{t(`export.state.${state}`)}</p>}
        {url && <a className="mt-2 inline-flex min-h-12 items-center text-accent font-medium" href={url}>{t('export.download')}</a>}
      </Card>
      <SectionTitle>{t('export.import')}</SectionTitle>
      <Card>
        <input ref={fileRef} type="file" accept="application/json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setFile(await f.text()); setImp(null); } }} aria-label={t('export.import')} />
        {file && <Button variant="secondary" className="mt-2" onClick={() => void doImport(true).catch((e) => alert((e as ApiError).problem?.detail))}>{t('export.check')}</Button>}
        {imp && <p className="mt-2">{t('export.import_result', { n: imp.would_create, k: imp.already_present, e: imp.errors.length })}</p>}
        {imp?.dry_run && imp.would_create > 0 && <Button className="mt-2" onClick={() => void doImport(false)}>{t('export.import_now', { n: imp.would_create })}</Button>}
      </Card>
    </div>
  );
}
