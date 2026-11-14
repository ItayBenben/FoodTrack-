'use client';
/** Error boundary: says what happened, what was kept, what to do (CLAUDE.md rule 7). */
import { useI18n } from '@/lib/i18n';
export default function Error({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (<main className="max-w-md mx-auto p-6"><h1 className="text-title font-semibold">{t('error.title')}</h1><p className="mt-2">{t('error.body')}</p>
    <button className="mt-4 min-h-12 px-4 rounded-chip bg-accent text-on-accent" onClick={reset}>{t('common.retry')}</button></main>);
}
