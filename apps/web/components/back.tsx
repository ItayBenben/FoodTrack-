'use client';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { Icon } from './icons';
export function BackHeader({ title, extra }: { title: string; extra?: React.ReactNode }) {
  const r = useRouter(); const { t } = useI18n();
  return <header className="flex items-center gap-2"><button onClick={() => r.back()} aria-label={t('common.back')} className="min-h-12 min-w-12 -ms-3 flex items-center justify-center"><Icon name="back" /></button><h1 className="flex-1 text-title font-semibold">{title}</h1>{extra}</header>;
}
