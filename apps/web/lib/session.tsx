'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { TrackerDefinition } from '@foodtrack/tracker-schema';
import { api, ApiError, getAccessToken, onAuthChange, setAccessToken, tryRefresh } from './api';
import { db, getMeta, setMeta, wipeLocal } from './db/local';
import { drain, pull, scheduleDrain, useSync, type UserMeta } from './store';

export type Phase = 'loading' | 'onboarding' | 'locked' | 'ready';
export interface UserTracker { tracker_key: string; enabled: boolean; sort_order: number; settings: Record<string, unknown> }
interface SessionCtx {
  phase: Phase; mode: 'single' | 'multi'; user: UserMeta | null; defs: Map<string, TrackerDefinition>; trackers: UserTracker[];
  unlocked: (token: string) => Promise<void>; lock: () => void; logout: () => Promise<void>; reload: () => Promise<void>;
  events: EventTarget;
}
const Ctx = createContext<SessionCtx | null>(null);
export const useSession = () => { const c = useContext(Ctx); if (!c) throw new Error('SessionProvider missing'); return c; };

async function cachedDefs(): Promise<Map<string, TrackerDefinition>> {
  const rows = await db().defs.toArray();
  return new Map(rows.map((r) => [r.key, r.definition as TrackerDefinition]));
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [user, setUser] = useState<UserMeta | null>(null);
  const [defs, setDefs] = useState<Map<string, TrackerDefinition>>(new Map());
  const [trackers, setTrackers] = useState<UserTracker[]>([]);
  const events = useRef(new EventTarget()).current;
  const es = useRef<EventSource | null>(null);

  const loadLocal = useCallback(async () => {
    setUser(await getMeta<UserMeta | null>('user', null));
    setDefs(await cachedDefs());
    setTrackers(await getMeta<UserTracker[]>('trackers', []));
  }, []);

  const loadRemote = useCallback(async () => {
    const [d, me] = await Promise.all([
      api<{ data: { key: string; content_hash: string; definition: TrackerDefinition; custom: boolean }[] }>('/trackers'),
      api<{ user: UserMeta; trackers: UserTracker[] }>('/auth/me'),
    ]);
    await db().transaction('rw', db().defs, db().meta, async () => {
      await db().defs.clear();
      await db().defs.bulkPut(d.data.map((x) => ({ key: x.key, content_hash: x.content_hash, definition: x.definition, custom: x.custom })));
      await setMeta('user', me.user); await setMeta('trackers', me.trackers);
    });
    await loadLocal();
  }, [loadLocal]);

  const connectEvents = useCallback(() => {
    es.current?.close();
    const token = getAccessToken(); if (!token || typeof EventSource === 'undefined') return;
    const src = new EventSource(`/api/v1/events?access_token=${encodeURIComponent(token)}`);
    for (const type of ['parse.completed', 'analysis.completed', 'trial.phase_changed', 'safety.flag_raised', 'sync.hint', 'export.completed', 'trial.exposure_detected', 'trial.washout_stalled']) {
      src.addEventListener(type, (ev) => {
        events.dispatchEvent(new CustomEvent(type, { detail: JSON.parse((ev as MessageEvent).data) }));
        if (type === 'sync.hint' || type === 'parse.completed') void pull().catch(() => 0);
      });
    }
    src.onerror = () => { src.close(); setTimeout(() => { if (getAccessToken()) connectEvents(); }, 15_000); };
    es.current = src;
  }, [events]);

  const becomeReady = useCallback(async () => {
    const minutes = (await getMeta<UserMeta | null>('user', null))?.idle_lock_minutes ?? 15;
    await setMeta('alive_until', Date.now() + (minutes || 60 * 24 * 365) * 60_000);
    setPhase('ready');
    try { await loadRemote(); await pull(); scheduleDrain(0); connectEvents(); } catch { /* offline: render from cache */ }
  }, [loadRemote, connectEvents]);

  const boot = useCallback(async () => {
    await loadLocal();
    let status: { mode: 'single' | 'multi'; set_up: boolean } | null = null;
    try { status = await api('/auth/status', { auth: false }); } catch { /* offline */ }
    if (status) setMode(status.mode);
    if (status && !status.set_up) { setPhase('onboarding'); return; }
    if (await tryRefresh()) { await becomeReady(); return; }
    // Offline cold start: continue the session if it was alive recently (no server to ask).
    const alive = await getMeta<number>('alive_until', 0);
    if (!status && alive > Date.now() && (await getMeta('user', null))) { setPhase('ready'); return; }
    setPhase('locked');
  }, [loadLocal, becomeReady]);

  useEffect(() => { void boot(); }, [boot]);
  // exposure notes from the sync response arrive here too (same request cycle as the save)
  useEffect(() => { const h = (e: Event) => events.dispatchEvent(new CustomEvent('trial.exposure_detected', { detail: (e as CustomEvent).detail })); window.addEventListener('ft:trial-exposure', h); return () => window.removeEventListener('ft:trial-exposure', h); }, [events]);
  useEffect(() => onAuthChange((authed) => { if (authed && phase === 'ready') { scheduleDrain(0); connectEvents(); } }), [phase, connectEvents]);

  // Idle lock (08 §3.1) and activity keep-alive for offline continuity.
  useEffect(() => {
    if (phase !== 'ready') return;
    let last = Date.now();
    const bump = () => { last = Date.now(); void setMeta('alive_until', Date.now() + ((user?.idle_lock_minutes || 60 * 24 * 365) * 60_000)); };
    const iv = setInterval(() => {
      const mins = user?.idle_lock_minutes ?? 15;
      if (mins > 0 && Date.now() - last > mins * 60_000) { setAccessToken(null); es.current?.close(); setPhase('locked'); }
    }, 30_000);
    window.addEventListener('pointerdown', bump); window.addEventListener('keydown', bump);
    return () => { clearInterval(iv); window.removeEventListener('pointerdown', bump); window.removeEventListener('keydown', bump); };
  }, [phase, user]);

  // Reconnect: drain + pull (06 §4).
  useEffect(() => {
    const on = () => { useSync.setState({ online: true }); if (!getAccessToken()) void tryRefresh().then((ok) => ok && void drain().then(() => pull())); else void drain().then(() => pull()); };
    const off = () => useSync.setState({ online: false });
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    const u = useSync.subscribe((s) => { if (s.needsUnlock && phase === 'ready') { useSync.setState({ needsUnlock: false }); setPhase('locked'); } });
    return u;
  }, [phase]);

  const unlocked = useCallback(async (token: string) => { setAccessToken(token); await becomeReady(); }, [becomeReady]);
  const lock = useCallback(() => { setAccessToken(null); es.current?.close(); void setMeta('alive_until', 0); setPhase('locked'); }, []);
  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch (e) { if (!(e instanceof ApiError)) throw e; }
    setAccessToken(null); es.current?.close();
    if ('caches' in window) for (const k of await caches.keys()) if (k.startsWith('ft-data')) await caches.delete(k);
    await wipeLocal(); setUser(null); setDefs(new Map()); setTrackers([]); setPhase('locked');
  }, []);

  return <Ctx.Provider value={{ phase, mode, user, defs, trackers, unlocked, lock, logout, reload: loadRemote, events }}>{children}</Ctx.Provider>;
}
