'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { Trial } from '@/lib/trials';
import { BackHeader } from '@/components/back';
import { Card, Empty } from '@/components/ui';

/** Trial history (08 §9.6). */
export default function Trials() {
  const { t, label, fmtDay } = useI18n();
  const q = useQuery({ queryKey: ['trials'], queryFn: () => api<{ data: Trial[] }>('/trials') });
  return (
    <div><BackHeader title={t('more.trials')} extra={<Link className="min-h-12 px-2 flex items-center text-accent" href="/more/avoid">{t('more.avoid')}</Link>} />
      {q.data?.data.length === 0 && <div className="mt-4"><Empty title={t('trial.none_title')} body={t('trial.none_body')} /></div>}
      {q.data?.data.map((x) => (
        <Link key={x.id} href={`/more/trials/${x.id}`}><Card className="mt-2">
          <p className="font-semibold" dir="auto">{label(x.target_label)} <span className="text-label text-text-muted">· {t(`trial.status.${x.status}`)}</span></p>
          {x.verdict && <p className="mt-1">{t(`trial.verdict.${x.verdict.verdict}`)}</p>}
          {x.started_at && <p className="text-label text-text-muted">{fmtDay(x.started_at.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</p>}
        </Card></Link>))}
    </div>
  );
}
