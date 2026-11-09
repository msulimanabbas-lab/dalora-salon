'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ServiceView, StaffView } from '@/lib/views';
import { saveServiceAction } from '@/app/actions';
import { sar } from '@/lib/format';
import { fmtDuration } from '@/lib/time';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';

type Svc = ServiceView & { active: boolean };
const blank: Svc = { id: '', name: '', category: '', durationMin: 60, bufferMin: 10, price: 0, homeOk: false, staffIds: [], active: true };

export function ServicesClient({ services, staff }: { services: Svc[]; staff: StaffView[] }) {
  const [edit, setEdit] = useState<Svc | null>(null);
  const groups = useMemo(() => {
    const m = new Map<string, Svc[]>();
    for (const s of services) { const k = s.category || 'بدون تصنيف'; m.set(k, [...(m.get(k) || []), s]); }
    return [...m.entries()];
  }, [services]);
  const cats = [...new Set(services.map(s => s.category).filter(Boolean))];

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>الخدمات</h1><p className="sub">المدة ووقت التجهيز هم اللي يحددون الأوقات المتاحة. أي تعديل يطبّق على الحجوزات الجديدة مباشرة.</p></div>
        <button className="btn primary" onClick={() => setEdit({ ...blank, staffIds: staff.map(s => s.id) })}><Icon name="plus" />خدمة جديدة</button>
      </div>
      {services.length === 0 ? <div className="panel empty"><h3>ما فيه خدمات</h3><p>أضيفي أول خدمة مع مدتها وسعرها.</p></div> : groups.map(([cat, list]) => (
        <section key={cat} className="stack tight">
          <h2>{cat}</h2>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>الخدمة</th><th>المدة</th><th>تجهيز بعدها</th><th className="end">السعر</th><th>مين تقدّمها</th><th></th></tr></thead>
              <tbody>
                {list.map(s => (
                  <tr key={s.id} className="link" onClick={() => setEdit(s)} style={s.active ? undefined : { opacity: .55 }}>
                    <td><b>{s.name}</b>{s.homeOk && <span className="tag info" style={{ marginInlineStart: 6 }}>منزلي</span>}{!s.active && <span className="tag mute" style={{ marginInlineStart: 6 }}>موقوفة</span>}</td>
                    <td className="num">{fmtDuration(s.durationMin)}</td>
                    <td className="num">{s.bufferMin ? `${s.bufferMin} د` : '—'}</td>
                    <td className="end num">{sar(s.price)}</td>
                    <td className="small">{s.staffIds.map(id => staff.find(x => x.id === id)?.name).filter(Boolean).join('، ') || <span style={{ color: 'var(--bad)' }}>ما أحد</span>}</td>
                    <td className="end"><button className="btn quiet sm" onClick={e => { e.stopPropagation(); setEdit(s); }}>تعديل</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {edit && <ServiceSheet svc={edit} staff={staff} cats={cats} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ServiceSheet({ svc, staff, cats, onClose }: { svc: Svc; staff: StaffView[]; cats: string[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState({ ...svc, price: String(svc.price) as unknown as number });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const set = (patch: Partial<Svc>) => setV(x => ({ ...x, ...patch }));
  return (
    <Sheet title={svc.id ? 'تعديل خدمة' : 'خدمة جديدة'} onClose={onClose}
      foot={<button className="btn primary lg block" disabled={pending} onClick={() => start(async () => {
        setErr('');
        const r = await saveServiceAction({ id: svc.id || undefined, name: v.name, category: v.category, duration_min: Number(v.durationMin), buffer_min: Number(v.bufferMin),
          price: Number(v.price), home_ok: v.homeOk, active: v.active, staff_ids: v.staffIds });
        if (!r.ok) { setErr(r.error); return; }
        toast('انحفظت الخدمة'); router.refresh(); onClose();
      })}>{pending ? 'جاري الحفظ…' : 'حفظ'}</button>}>
      <label className="field"><span>اسم الخدمة</span><input id="s-name" className="input" value={v.name} onChange={e => set({ name: e.target.value })} autoFocus /></label>
      <label className="field"><span>التصنيف</span>
        <input id="s-cat" className="input" list="cats" value={v.category} onChange={e => set({ category: e.target.value })} placeholder="مثلاً: شعر" />
        <datalist id="cats">{cats.map(c => <option key={c} value={c} />)}</datalist>
      </label>
      <div className="grid-3">
        <label className="field"><span>المدة (دقيقة)</span><input id="s-dur" className="input num" type="number" min={5} step={5} value={v.durationMin} onChange={e => set({ durationMin: Number(e.target.value) })} /></label>
        <label className="field"><span>تجهيز بعدها</span><input id="s-buf" className="input num" type="number" min={0} step={5} value={v.bufferMin} onChange={e => set({ bufferMin: Number(e.target.value) })} /></label>
        <label className="field"><span>السعر (ر.س)</span><input id="s-price" className="input num" inputMode="decimal" value={String(v.price)} onChange={e => set({ price: e.target.value.replace(/[^\d.]/g, '') as unknown as number })} /></label>
      </div>
      <p className="small faint">وقت التجهيز ينحجز بعد الخدمة للتعقيم والترتيب، وما ينحسب على العميلة.</p>
      <div className="field"><span>مين تقدّمها</span>
        <div className="chips">
          {staff.map(s => <button type="button" key={s.id} className="chip" aria-pressed={v.staffIds.includes(s.id)}
            onClick={() => set({ staffIds: v.staffIds.includes(s.id) ? v.staffIds.filter(x => x !== s.id) : [...v.staffIds, s.id] })}>{s.name}</button>)}
        </div>
      </div>
      <label className="row spread"><span>متاحة كخدمة منزلية</span><input type="checkbox" className="switch" checked={v.homeOk} onChange={e => set({ homeOk: e.target.checked })} /></label>
      <label className="row spread"><span>متاحة للحجز</span><input type="checkbox" className="switch" checked={v.active} onChange={e => set({ active: e.target.checked })} /></label>
      {err && <p className="notice bad">{err}</p>}
    </Sheet>
  );
}
