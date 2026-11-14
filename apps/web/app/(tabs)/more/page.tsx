'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { db } from '@/lib/db/local';
import { drain, useSync } from '@/lib/store';
import { Button, Card, Chip, SectionTitle, Sheet } from '@/components/ui';
import { Icon } from '@/components/icons';

export default function More() {
  const { t, locale, setLocale } = useI18n();
  const { lock, logout, user, reload } = useSession();
  const [out, setOut] = useState(false);
  const pending = useLiveQuery(() => db().outbox.count(), [], 0);
  const [typed, setTyped] = useState('');
  const online = useSync((s) => s.online);
  const setTheme = async (theme: string) => { await api('/me/settings', { method: 'PUT', body: { theme } }); await reload(); };
  const links: [string, string, string][] = [['/more/trackers', 'more.trackers', 'checkin'], ['/more/foods', 'more.foods', 'meal'], ['/more/day', 'more.day_builder', 'today'], ['/more/trials', 'more.trials', 'trial'], ['/more/export', 'more.export', 'up'], ['/more/reminders', 'more.reminders', 'timer'], ['/more/security', 'more.security', 'lock'], ['/more/deleted', 'more.deleted', 'trash'], ['/more/how', 'more.how', 'info']];
  return (
    <div>
      <h1 className="text-title font-semibold">{t('tabs.more')}</h1>
      <ul className="mt-3 divide-y divide-border bg-surface border border-border rounded-card">
        {links.map(([href, key, icon]) => <li key={href}><Link href={href} className="flex items-center gap-3 min-h-12 px-4 py-3"><Icon name={icon} size={20} /><span className="flex-1">{t(key)}</span><Icon name="next" size={18} /></Link></li>)}
      </ul>
      <SectionTitle>{t('more.language')}</SectionTitle>
      <div className="flex gap-2"><Chip on={locale === 'he'} onClick={() => setLocale('he')}>עברית</Chip><Chip on={locale === 'en'} onClick={() => setLocale('en')}>English</Chip></div>
      <SectionTitle>{t('more.theme')}</SectionTitle>
      <div className="flex gap-2">{['system', 'light', 'dark'].map((x) => <Chip key={x} on={((user as unknown as { theme?: string })?.theme ?? 'system') === x} onClick={() => void setTheme(x)}>{t(`more.theme_${x}`)}</Chip>)}</div>
      <SectionTitle>{t('more.account')}</SectionTitle>
      <Card className="flex flex-col gap-2">
        <Button variant="secondary" onClick={lock}>{t('more.lock_now')}</Button>
        <Button variant="secondary" onClick={() => setOut(true)} data-testid="logout">{t('more.logout')}</Button>
      </Card>
      <Sheet open={out} onClose={() => setOut(false)} title={t('more.logout')}>
        {pending === 0 ? (<><p>{t('logout.clean')}</p><Button className="w-full mt-4" onClick={() => void logout()}>{t('more.logout')}</Button></>) : (
          <>
            <p>{t('logout.unsynced', { n: pending })}</p>
            <Button className="w-full mt-4" disabled={!online} onClick={async () => { await drain(); if ((await db().outbox.count()) === 0) await logout(); }}>{t('logout.sync_then')}</Button>
            <p className="text-label text-text-muted mt-4">{t('logout.discard_hint', { n: pending })}</p>
            <input className="w-full min-h-12 rounded-chip border border-border bg-surface px-3 mt-2" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={t('logout.type_number')} />
            <Button variant="danger" className="w-full mt-2" disabled={typed !== String(pending)} onClick={() => void logout()}>{t('logout.discard_then', { n: pending })}</Button>
          </>
        )}
      </Sheet>
    </div>
  );
}
