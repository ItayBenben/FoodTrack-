'use client';
import { create } from 'zustand';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { Icon } from './icons';

export function Button({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const v = { primary: 'bg-accent text-on-accent', secondary: 'bg-surface border border-border text-text', ghost: 'text-accent', danger: 'bg-danger text-on-accent' }[variant];
  return <button {...p} className={`min-h-12 px-4 rounded-chip font-medium transition-opacity disabled:opacity-50 active:opacity-80 ${v} ${className}`} />;
}

export function Card({ children, className = '', ...p }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={`bg-surface border border-border rounded-card shadow-soft p-4 ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-label font-medium tracking-wide uppercase text-text-muted mt-6 mb-2">{children}</h2>;
}

/** The tap-not-drag scale (05 §2.5). */
export function SegmentedScale({ min, max, value, onChange, label, lowHint, highHint }: { min: number; max: number; value: number | null | undefined; onChange: (v: number) => void; label: string; lowHint?: string; highHint?: string }) {
  const vals = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1">
      <div className={vals.length > 7 ? 'grid grid-cols-6 gap-1' : 'flex gap-1'}>
        {vals.map((v) => (
          <button key={v} role="radio" aria-checked={value === v} aria-label={`${label} ${v}`} onClick={() => onChange(v)}
            className={`flex-1 min-h-12 min-w-12 rounded-chip border tabular-nums text-body ${value === v ? 'bg-accent text-on-accent border-accent' : 'bg-surface border-border text-text'}`}>{v}</button>
        ))}
      </div>
      {(lowHint || highHint) && <div className="flex justify-between text-label text-text-muted"><span>{lowHint}</span><span>{highHint}</span></div>}
    </div>
  );
}

export function Chip({ on, children, onClick, className = '' }: { on?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return <button aria-pressed={on} onClick={onClick} className={`min-h-12 px-3 rounded-pill border text-body ${on ? 'bg-accent-soft border-accent text-text' : 'bg-surface border-border text-text'} ${className}`}>{children}</button>;
}

/** Bottom sheet: ✕, veil tap, or Escape dismiss (08 §1.1). */
export function Sheet({ open, onClose, title, children, headerExtra, testid }: { open: boolean; onClose: () => void; title: string; children: ReactNode; headerExtra?: ReactNode; testid?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" data-testid={testid}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className="relative bg-bg rounded-t-sheet max-h-[92dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))] sheet-in">
        <div className="sticky top-0 bg-bg z-10 flex items-center gap-2 px-4 pt-4 pb-2">
          <button onClick={onClose} aria-label={t('common.close')} className="min-h-12 min-w-12 -ms-3 flex items-center justify-center text-text-muted"><Icon name="close" /></button>
          <h2 className="flex-1 text-title font-semibold">{title}</h2>
          {headerExtra}
        </div>
        <div className="px-4">{children}</div>
      </div>
    </div>
  );
}

// ───────── toasts (undo lives here, 8 s, 08 §1.5) ─────────
interface Toast { id: number; text: string; action?: { label: string; run: () => void }; ms: number }
export const useToasts = create<{ items: Toast[]; push: (t: Omit<Toast, 'id' | 'ms'> & { ms?: number }) => void; dismiss: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => { const id = Date.now() + Math.random(); set((s) => ({ items: [...s.items.slice(-2), { ms: 8000, ...t, id }] })); setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), t.ms ?? 8000); },
  dismiss: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));
export function Toasts() {
  const { items, dismiss } = useToasts();
  return (
    <div aria-live="polite" className="fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
      {items.map((t) => (
        <div key={t.id} role="status" className="pointer-events-auto flex items-center gap-3 bg-text text-bg rounded-card px-4 py-3 shadow-soft max-w-md w-full">
          <span className="flex-1">{t.text}</span>
          {t.action && <button className="font-semibold min-h-12 px-2" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return <Card className="text-center py-8"><p className="text-title font-semibold">{title}</p>{body && <p className="text-text-muted mt-2">{body}</p>}{children}</Card>;
}
