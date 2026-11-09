'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ServiceView, StaffView } from '@/lib/views';
import { saveServiceAction, addCatalogServicesAction } from '@/app/actions';
import { CATALOG } from '@/lib/catalog';
import { sar } from '@/lib/format';
import { fmtDuration } from '@/lib/time';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';

type Svc = ServiceView & { active: boolean };
const blank: Svc = { id: '', name: '', category: '', durationMin: 60, bufferMin: 10, price: 0, homeOk: false, staffIds: [], active: true };

export function ServicesClient({ services, staff }: { services: Svc[]; staff: StaffView[] }) {
  const [edit, setEdit] = useState<Svc | null>(null);
  const [pick, setPick] = useState(false);
  const unpriced = services.filter(s => s.active && s.price <= 0).length;
  const unstaffed = services.filter(s => s.active && !s.staffIds.length).length;
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
        <div className="row tight">
          <button className="btn" onClick={() => setPick(true)}>من القائمة الجاهزة</button>
          <button className="btn primary" onClick={() => setEdit({ ...blank, staffIds: staff.map(s => s.id) })}><Icon name="plus" />خدمة جديدة</button>
        </div>
      </div>
      {(unpriced > 0 || unstaffed > 0) && (
        <p className="notice warn">
          {unpriced > 0 && <>{unpriced} خدمة بدون سعر. </>}
          {unstaffed > 0 && <>{unstaffed} خدمة ما حددتي مين تقدّمها، وما تنحجز لين تحددين. </>}
          اضغطي على الخدمة وكمّليها.
        </p>
      )}
      {services.length === 0 ? <div className="panel empty"><h3>ما فيه خدمات</h3><p>أضيفي أول خدمة مع مدتها وسعرها.</p></div> : groups.map(([cat, list]) => (
        <section key={cat} className="stack tight">
          <h2>{cat}</h2>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>الخدمة</th><th>المدة</th><th>تجهيز بعدها</th><th className="end">السعر</th><th>مين تقدّمها</th><th></th></tr></thead>
              <tbody>
                {list.map(s => (
                  <tr key={s.id} className="link" onClick={() => setEdit(s)} style={s.active ? undefined : { opacity: .55 }}>
                    <td><b>{s.name}</b>{s.homeOk && <span className="tag info" style={{ marginInlineStart: 6 }}>منزلي</span>}{!s.active && <span className="tag mute" style={{ marginInlineStart: 6 }}>موقوفة</span>}{s.active && s.price <= 0 && <span className="tag warn" style={{ marginInlineStart: 6 }}>بدون سعر</span>}</td>
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
      {pick && <CatalogSheet have={new Set(services.map(s => s.name))} onClose={() => setPick(false)} />}
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

function CatalogSheet({ have, onClose }: { have: Set<string>; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [sel, setSel] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const toggle = (n: string) => setSel(v => v.includes(n) ? v.filter(x => x !== n) : [...v, n]);
  return (
    <Sheet title="من القائمة الجاهزة" sub="اختاري اللي تقدّمينه. تنضاف بمددها، وتحددين السعر ومين تقدّمها بعدين." onClose={onClose}
      foot={<button className="btn primary lg block" disabled={!sel.length || pending} onClick={() => start(async () => {
        const r = await addCatalogServicesAction(sel);
        if (!r.ok) { setErr(r.error); return; }
        toast(`انضافت ${r.added} خدمة`); router.refresh(); onClose();
      })}>{pending ? 'جاري الإضافة…' : sel.length ? `إضافة ${sel.length} خدمة` : 'اختاري الخدمات'}</button>}>
      {err && <p className="notice bad">{err}</p>}
      {CATALOG.map(c => {
        const free = c.items.filter(i => !have.has(i.name));
        const all = free.length > 0 && free.every(i => sel.includes(i.name));
        return (
          <section key={c.category} className="stack tight">
            <div className="row spread">
              <h3>{c.category}</h3>
              {free.length > 0 && <button className="btn quiet sm" onClick={() => setSel(v => all ? v.filter(n => !free.some(i => i.name === n)) : [...new Set([...v, ...free.map(i => i.name)])])}>{all ? 'إلغاء الكل' : 'اختيار الكل'}</button>}
            </div>
            <div className="svc-list" style={{ maxHeight: 'none' }}>
              {c.items.map(i => (
                <label key={i.name} className="svc-opt" style={have.has(i.name) ? { opacity: .5, cursor: 'default' } : undefined}>
                  <input type="checkbox" disabled={have.has(i.name)} checked={have.has(i.name) || sel.includes(i.name)} onChange={() => toggle(i.name)} />
                  <span>{i.name} <span className="faint tiny">· {fmtDuration(i.dur)}</span></span>
                  {have.has(i.name) && <span className="p tiny">موجودة</span>}
                </label>
              ))}
            </div>
          </section>
        );
      })}
    </Sheet>
  );
}
