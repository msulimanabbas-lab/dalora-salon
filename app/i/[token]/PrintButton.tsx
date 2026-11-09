'use client';

export function PrintButton() {
  return <button className="btn primary inv-print" onClick={() => window.print()}>طباعة</button>;
}
