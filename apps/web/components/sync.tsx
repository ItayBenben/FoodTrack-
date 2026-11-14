'use client';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '@/lib/i18n';
import { db } from '@/lib/db/local';
import { retryFailed, syncNow, useSync } from '@/lib/store';
import { Icon } from './icons';
import { Button, Sheet } from './ui';

/** `⟳ synced` · `↑ 3 waiting` · `⚠ offline` · `⟳ syncing…` (08 §1.6). */
export function SyncBadge() {
  const { t } = useI18n();
  const s = useSync();
  const [open, setOpen] = useState(false);
  const pending = useLiveQuery(() => db().outbox.count(), [], 0);
  const label = !s.online ? (pending ? t('sync.offline_waiting', { n: pending }) : t('sync.offline')) : s.syncing ? t('sync.syncing') : pending ? t('sync.waiting', { n: pending }) : t('sync.synced');
  return (
    <>
      <button onClick={() => setOpen(true)} data-testid="sync-badge" className={`min-h-12 px-3 rounded-pill text-label flex items-center gap-1 ${!s.online ? 'text-warn' : 'text-text-muted'}`}>
        <Icon name={!s.online ? 'offline' : pending ? 'up' : 'sync'} size={16} />{label}
      </button>
      <SyncSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function SyncSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, fmtTime } = useI18n();
  const s = useSync();
  const rows = useLiveQuery(() => db().outbox.toArray(), [], []);
  return (
    <Sheet open={open} onClose={onClose} title={t('sync.title')}>
      <p className="text-text-muted">{rows.length ? t('sync.pending_count', { n: rows.length }) : t('sync.all_saved')}</p>
      {s.lastSyncAt && <p className="text-label text-text-muted mt-1">{t('sync.last', { time: fmtTime(s.lastSyncAt) })}</p>}
      <ul className="mt-3">{rows.map((r) => <li key={r.seq} className="py-2 border-b border-border text-label"><span className="font-medium">{t(`sync.op.${r.op}`)}</span> · {r.status === 'failed' ? <span className="text-danger">{r.last_error}</span> : r.attempts ? t('sync.retrying', { n: r.attempts }) : t('sync.queued')}</li>)}</ul>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <Button variant="secondary" onClick={() => void retryFailed()} disabled={!rows.some((r) => r.status === 'failed')}>{t('sync.retry_failed')}</Button>
        <Button onClick={() => void syncNow()} disabled={!s.online}>{t('sync.retry_all')}</Button>
      </div>
      {!s.online && <p className="text-label text-text-muted mt-2">{t('sync.offline_explain')}</p>}
    </Sheet>
  );
}
