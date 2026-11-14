'use client';
import { useEffect } from 'react';
import { useSession } from './session';
/** D24: system | light | dark, applied as data-theme on <html>. */
export function useTheme() {
  const { user } = useSession();
  const theme = (user as unknown as { theme?: string } | null)?.theme ?? 'system';
  useEffect(() => { if (theme === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', theme); }, [theme]);
}
