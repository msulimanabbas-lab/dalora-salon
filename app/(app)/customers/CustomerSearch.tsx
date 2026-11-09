'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function CustomerSearch({ q }: { q: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [v, setV] = useState(q);
  useEffect(() => {
    if (v === q) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams(sp.toString());
      if (v.trim()) p.set('q', v.trim()); else p.delete('q');
      router.replace(`/customers?${p.toString()}`);
    }, 250);
    return () => clearTimeout(t);
  }, [v, q, sp, router]);
  return (
    <input id="cust-search" className="input" style={{ maxWidth: 340 }} type="search" placeholder="ابحثي بالاسم أو رقم الجوال"
      value={v} onChange={e => setV(e.target.value)} aria-label="بحث" />
  );
}
