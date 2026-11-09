'use client';

import { useState, useTransition } from 'react';
import { closeDayAction, reopenDayAction } from '@/app/actions';
import { sar } from '@/lib/format';
import { useToast } from '@/components/Toast';

export function CloseDay({ day, expected, mode }: { day: string; expected: number; mode: 'close' | 'reopen' }) {
  const toast = useToast();
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  if (mode === 'reopen') {
    return confirm ? (
      <div className="row">
        <button className="btn danger sm" disabled={pending} onClick={() => start(async () => { const r = await reopenDayAction(day); if (!r.ok) setErr(r.error); else toast('انفتح الصندوق'); })}>تأكيد فتح الصندوق</button>
        <button className="btn quiet sm" onClick={() => setConfirm(false)}>رجوع</button>
        {err && <p className="notice bad">{err}</p>}
      </div>
    ) : <button className="btn quiet sm" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(true)}>إعادة فتح الصندوق</button>;
  }

  const c = Number(counted);
  const diff = counted === '' ? null : Math.round((c - expected) * 100) / 100;
  return (
    <form className="panel panel-pad stack tight" onSubmit={e => {
      e.preventDefault(); setErr('');
      if (!confirm) { setConfirm(true); return; }
      start(async () => { const r = await closeDayAction(day, c, note); if (!r.ok) { setErr(r.error); setConfirm(false); } else toast('انقفل اليوم'); });
    }}>
      <h2>إقفال اليوم</h2>
      <p className="small muted">عدّي الكاش اللي بالدرج واكتبيه. بعد الإقفال ما ينضاف أي مبلغ لهاليوم.</p>
      <div className="kv"><span>الكاش حسب النظام</span><b className="num">{sar(expected)}</b></div>
      <label className="field"><span>الكاش الفعلي بالدرج</span>
        <input id="counted" className="input num" inputMode="decimal" value={counted} onChange={e => { setCounted(e.target.value.replace(/[^\d.]/g, '')); setConfirm(false); }} placeholder="0" /></label>
      {diff !== null && (
        <p className={'notice ' + (diff === 0 ? 'ok' : 'warn')}>{diff === 0 ? 'مطابق للنظام.' : diff > 0 ? `زيادة ${sar(diff)} عن النظام.` : `نقص ${sar(-diff)} عن النظام.`}</p>
      )}
      {diff !== null && diff !== 0 && (
        <label className="field"><span>سبب الفرق</span><input id="close-note" className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="مثلاً: باقي فكّة لعميلة" /></label>
      )}
      {err && <p className="notice bad">{err}</p>}
      <button className={'btn ' + (confirm ? 'danger' : 'primary')} disabled={pending || counted === '' || (diff !== 0 && diff !== null && !note.trim())}>
        {pending ? 'جاري الإقفال…' : confirm ? 'متأكدة؟ اضغطي للإقفال' : 'إقفال اليوم'}
      </button>
    </form>
  );
}
