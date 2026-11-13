'use client';
/** Every user-facing string lives in locales/{he,en}.json (CLAUDE.md). No literals in components. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from '../locales/en.json';
import he from '../locales/he.json';

export type Locale = 'he' | 'en';
type Dict = Record<string, unknown>;
const DICTS: Record<Locale, Dict> = { en, he };

function lookup(d: Dict, key: string): string | undefined {
  let cur: unknown = d;
  for (const part of key.split('.')) { if (cur && typeof cur === 'object') cur = (cur as Dict)[part]; else return undefined; }
  return typeof cur === 'string' ? cur : undefined;
}

export type T = (key: string, vars?: Record<string, string | number>) => string;
interface Ctx { locale: Locale; dir: 'rtl' | 'ltr'; t: T; setLocale: (l: Locale) => void; fmtTime: (iso: string) => string; fmtDay: (day: string, opts?: Intl.DateTimeFormatOptions) => string; num: (n: number, d?: number) => string; label: (l: { en: string; he: string } | undefined | null) => string }
const I18nCtx = createContext<Ctx | null>(null);

export function initialLocale(): Locale {
  if (typeof window === 'undefined') return 'he';
  const saved = window.localStorage?.getItem('ft_locale');
  if (saved === 'en' || saved === 'he') return saved;
  return navigator.language?.startsWith('he') ? 'he' : navigator.language?.startsWith('en') ? 'en' : 'he';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('he');
  useEffect(() => { setLocaleState(initialLocale()); }, []);
  const dir = locale === 'he' ? 'rtl' : 'ltr';
  useEffect(() => { document.documentElement.lang = locale; document.documentElement.dir = dir; }, [locale, dir]);
  const setLocale = useCallback((l: Locale) => { try { localStorage.setItem('ft_locale', l); } catch { /* private mode */ } setLocaleState(l); }, []);
  const t = useCallback<T>((key, vars) => {
    let s = lookup(DICTS[locale], key) ?? lookup(DICTS.en, key) ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  }, [locale]);
  const tag = locale === 'he' ? 'he-IL' : 'en-GB';
  const value = useMemo<Ctx>(() => ({
    locale, dir, t, setLocale,
    fmtTime: (iso) => new Date(iso).toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit', hour12: false }),
    fmtDay: (day, opts) => new Date(`${day}T12:00:00Z`).toLocaleDateString(tag, opts ?? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
    num: (n, d = 0) => n.toLocaleString(tag, { maximumFractionDigits: d, minimumFractionDigits: d }),
    label: (l) => (l ? l[locale] ?? l.en : ''),
  }), [locale, dir, t, setLocale, tag]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() { const c = useContext(I18nCtx); if (!c) throw new Error('I18nProvider missing'); return c; }
