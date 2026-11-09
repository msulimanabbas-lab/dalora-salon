'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Re-fetch the page's server data on an interval while the tab is visible, and when it becomes visible again. */
export function useAutoRefresh(ms: number) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') router.refresh(); };
    const t = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [ms, router]);
}
