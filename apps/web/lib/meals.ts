'use client';
/** Client side of meal parsing. Debounced 600 ms; never blocks saving (05 §4.2). Filled in fully in M3. */
import { useEffect, useState } from 'react';
import { api, ApiError } from './api';

export interface ParsedItem {
  raw_text: string; food_id: string | null; canonical_name: string | null; quantity: number | null; unit: string | null;
  grams_est: number | null; confidence: number | null; resolved_by: string | null; portion_precision?: string;
  /** The photo this item was seen in (08 §4.4); absent for typed items. */
  media_id?: string | null;
}
export interface AddOn { food_id: string; label: string; canonical_name: string; quantity: number; unit: string; grams_est: number; confidence: number; resolved_by: string; portion_precision: string }

export function useParse(text: string, at: string | null) {
  const [state, setState] = useState<'idle' | 'parsing' | 'done' | 'offline'>('idle');
  const [items, setItems] = useState<ParsedItem[] | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  useEffect(() => {
    if (text.trim().length < 3) { setState('idle'); return; }
    const ctl = new AbortController();
    const h = setTimeout(async () => {
      setState('parsing');
      try {
        const r = await api<{ items: ParsedItem[]; degraded?: boolean; add_ons?: AddOn[] }>('/meals/parse', { method: 'POST', body: { text, occurred_at: at ?? new Date().toISOString() }, signal: ctl.signal });
        setItems(r.items); setDegraded(Boolean(r.degraded)); setAddOns(r.add_ons ?? []); setState('done');
      } catch (e) { if (!ctl.signal.aborted) setState(e instanceof ApiError && e.offline ? 'offline' : 'done'); }
    }, 600);
    return () => { clearTimeout(h); ctl.abort(); };
  }, [text, at]);
  return { state, items, degraded, addOns };
}
