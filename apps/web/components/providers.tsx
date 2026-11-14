'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/lib/i18n';
import { SessionProvider, useSession } from '@/lib/session';
import { Toasts } from './ui';
import { Unlock } from './unlock';
import { Onboarding } from './onboarding';
import { useTheme } from '@/lib/theme';

function Gate({ children }: { children: ReactNode }) {
  const { phase } = useSession();
  useTheme();
  if (phase === 'loading') return <div className="min-h-dvh" aria-busy="true" />;
  if (phase === 'onboarding') return <Onboarding />;
  if (phase === 'locked') return <Unlock />;
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000, networkMode: 'offlineFirst' } } }));
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    void navigator.serviceWorker.register('/sw.js').then(async () => {
      const reg = await navigator.serviceWorker.ready;
      // Assets fetched before the worker took control are not in its cache yet: hand it the list.
      const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.startsWith(location.origin) && u.includes('/_next/static/'));
      reg.active?.postMessage({ type: 'precache', urls: [...urls, location.pathname] });
    }).catch(() => undefined);
  }, []);
  return (
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <SessionProvider>
          <Gate>{children}</Gate>
          <Toasts />
        </SessionProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
