'use client';

import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

export function Sheet({ title, sub, onClose, foot, children }: {
  title: React.ReactNode; sub?: React.ReactNode; onClose: () => void; foot?: React.ReactNode; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabIndex={-1} ref={ref}>
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <h2 id="sheet-title">{title}</h2>
            {sub && <p className="small faint" style={{ marginTop: 2 }}>{sub}</p>}
          </div>
          <button className="x" onClick={onClose} aria-label="إغلاق"><Icon name="x" /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </>
  );
}
