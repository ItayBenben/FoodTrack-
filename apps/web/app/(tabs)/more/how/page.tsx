'use client';
import { useI18n } from '@/lib/i18n';
import { BackHeader } from '@/components/back';
export default function How() {
  const { t } = useI18n();
  return (<div><BackHeader title={t('how.title')} />{['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((k) => <p key={k} className="mt-3">{t(`how.${k}`)}</p>)}<p className="mt-6 text-label text-text-muted">{t('safety.disclaimer_body')}</p></div>);
}
