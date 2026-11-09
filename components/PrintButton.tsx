'use client';

export function PrintButton({ label = 'طباعة' }: { label?: string }) {
  return <button className="btn no-print" onClick={() => window.print()}>{label}</button>;
}
