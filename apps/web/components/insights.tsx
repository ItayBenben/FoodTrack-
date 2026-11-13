'use client';
import { useI18n } from '@/lib/i18n';
import { Empty } from './ui';
// Replaced by the full Insights screen in M4.
export function InsightsScreen() { const { t } = useI18n(); return <div><h1 className="text-title font-semibold">{t('tabs.insights')}</h1><div className="mt-4"><Empty title={t('insights.not_yet_title')} body={t('insights.not_yet_body')} /></div></div>; }
