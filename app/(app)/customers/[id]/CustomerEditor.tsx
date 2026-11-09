'use client';

import { useState, useTransition } from 'react';
import { updateCustomerAction } from '@/app/actions';
import { useToast } from '@/components/Toast';

const SUGGESTED = ['VIP', 'عروس', 'حساسة', 'تحب العروض', 'منزلي'];

export function CustomerEditor({ customer }: { customer: { id: string; name: string; notes: string; allergies: string; tags: string[] } }) {
  const toast = useToast();
  const [v, setV] = useState(customer);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(v) !== JSON.stringify(customer);
  const toggle = (t: string) => setV(x => ({ ...x, tags: x.tags.includes(t) ? x.tags.filter(y => y !== t) : [...x.tags, t] }));
  return (
    <form className="panel panel-pad stack" onSubmit={e => {
      e.preventDefault(); setErr('');
      start(async () => { const r = await updateCustomerAction(v); if (!r.ok) setErr(r.error); else toast('انحفظ'); });
    }}>
      <h2>عنها</h2>
      <label className="field"><span>الاسم</span><input id="c-name" className="input" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></label>
      <label className="field"><span>حساسية أو تنبيه (يظهر للموظفة قبل الخدمة)</span>
        <input id="c-allergy" className="input" value={v.allergies} onChange={e => setV({ ...v, allergies: e.target.value })} placeholder="مثلاً: حساسية من الصمغ" /></label>
      <label className="field"><span>ملاحظات خاصة بالصالون</span>
        <textarea id="c-notes" className="input" value={v.notes} onChange={e => setV({ ...v, notes: e.target.value })} placeholder="تفضيلاتها، اللون، الطول…" /></label>
      <div className="field"><span>تصنيف</span>
        <div className="chips">
          {[...new Set([...SUGGESTED, ...v.tags])].map(t => <button type="button" key={t} className="chip" aria-pressed={v.tags.includes(t)} onClick={() => toggle(t)}>{t}</button>)}
        </div>
      </div>
      {err && <p className="notice bad">{err}</p>}
      <button className="btn primary" disabled={!dirty || pending}>{pending ? 'جاري الحفظ…' : 'حفظ'}</button>
    </form>
  );
}
