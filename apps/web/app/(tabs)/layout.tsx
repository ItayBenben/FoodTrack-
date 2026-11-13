'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { Icon } from '@/components/icons';
import { CaptureHost, TrackerPicker, useCapture } from '@/components/capture';
import { useSession } from '@/lib/session';

const TABS = [{ href: '/today', icon: 'today', key: 'tabs.today' }, { href: '/timeline', icon: 'timeline', key: 'tabs.timeline' }, { href: '/insights', icon: 'insights', key: 'tabs.insights' }, { href: '/more', icon: 'more', key: 'tabs.more' }];

export default function TabsLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const path = usePathname();
  const open = useCapture((s) => s.open);
  const { defs } = useSession();
  const [radial, setRadial] = useState(false);
  const [picker, setPicker] = useState(false);
  const mealKey = [...defs.values()].find((d) => d.has_meal_items)?.key;
  let press: ReturnType<typeof setTimeout> | null = null;
  return (
    <div className="min-h-dvh flex flex-col">
      <main className="flex-1 w-full max-w-xl mx-auto px-4 pb-32 pt-[max(1rem,env(safe-area-inset-top))]">{children}</main>
      {radial && <div className="fixed inset-0 z-30" onClick={() => setRadial(false)}><QuickRadial onPick={(k) => { setRadial(false); if (k === '*') setPicker(true); else open(k); }} /></div>}
      <button aria-label={t('capture.fab')} data-testid="fab"
        className="fixed z-30 bottom-24 end-5 h-16 w-16 rounded-pill bg-accent text-on-accent shadow-soft flex items-center justify-center"
        onPointerDown={() => { press = setTimeout(() => setRadial(true), 450); }}
        onPointerUp={() => { if (press) { clearTimeout(press); press = null; if (!radial && mealKey) open(mealKey); } }}
        onContextMenu={(e) => e.preventDefault()}><Icon name="plus" size={28} /></button>
      <nav className="fixed bottom-0 inset-x-0 z-20 bg-surface border-t border-border pb-[env(safe-area-inset-bottom)]" aria-label={t('tabs.label')}>
        <ul className="max-w-xl mx-auto grid grid-cols-4">
          {TABS.map((x) => { const on = path?.startsWith(x.href); return (
            <li key={x.href}><Link href={x.href} aria-current={on ? 'page' : undefined} className={`flex flex-col items-center justify-center min-h-16 gap-0.5 text-label ${on ? 'text-accent' : 'text-text-muted'}`}><Icon name={x.icon} /><span>{t(x.key)}</span></Link></li>); })}
        </ul>
      </nav>
      <CaptureHost />
      <TrackerPicker open={picker} onClose={() => setPicker(false)} />
    </div>
  );
}

function QuickRadial({ onPick }: { onPick: (k: string) => void }) {
  const { trackers, defs } = useSession(); const { label, t } = useI18n();
  const top = trackers.filter((x) => x.enabled && defs.get(x.tracker_key)?.quick_log?.enabled).slice(0, 4);
  return (
    <div className="fixed bottom-44 end-5 flex flex-col gap-2 items-end" onClick={(e) => e.stopPropagation()}>
      {top.map((x) => { const d = defs.get(x.tracker_key)!; return <button key={x.tracker_key} onClick={() => onPick(x.tracker_key)} className="min-h-12 px-4 rounded-pill bg-surface border border-border shadow-soft flex items-center gap-2"><Icon name={d.icon} />{label({ en: d.labels.en.short, he: d.labels.he.short })}</button>; })}
      <button onClick={() => onPick('*')} className="min-h-12 px-4 rounded-pill bg-surface border border-border shadow-soft">{t('capture.more_trackers')}</button>
    </div>
  );
}
