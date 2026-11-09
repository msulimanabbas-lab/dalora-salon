'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { BookingView, SalonView, ServiceView, StaffView } from '@/lib/views';
import { createBookingAction, updateBookingAction, slotsAction, searchCustomersAction } from '@/app/actions';
import { displayPhone, METHOD_LABEL, sar } from '@/lib/format';
import { fmtDay, fmtDuration, fmtTime } from '@/lib/time';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

export type FormSeed = { mode: 'new' | 'edit'; day: string; staffId?: string; min?: number; booking?: BookingView; customer?: { id: string; name: string; phone: string } };
type Cust = { id: string; name: string; phone: string; visits?: number; no_shows?: number; allergies?: string };

export function BookingForm({ seed, salon, staff, services, onClose, onDone }: {
  seed: FormSeed; salon: SalonView; staff: StaffView[]; services: ServiceView[];
  onClose: () => void; onDone: (id: string, day: string) => void;
}) {
  const toast = useToast();
  const editing = seed.mode === 'edit' && seed.booking;
  const b = seed.booking;

  const [customer, setCustomer] = useState<Cust | null>(b ? { id: b.customerId, name: b.customerName, phone: b.customerPhone } : seed.customer ?? null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Cust[]>([]);
  const [newCust, setNewCust] = useState<{ name: string; phone: string } | null>(null);

  const [location, setLocation] = useState<'salon' | 'home'>(b?.location ?? 'salon');
  const [svc, setSvc] = useState<string[]>(b ? b.items.map(i => i.serviceId).filter((x): x is string => !!x) : []);
  const [staffId, setStaffId] = useState<string>(seed.staffId ?? 'any');
  const [day, setDay] = useState(seed.day);
  const [min, setMin] = useState<number | null>(seed.min ?? null);
  const wanted = useRef<number | null>(seed.min ?? null);
  const [slots, setSlots] = useState<{ min: number; staffId: string }[] | null>(null);
  const [address, setAddress] = useState(b?.address ?? '');
  const [notes, setNotes] = useState(b?.notes ?? '');
  const [source, setSource] = useState<'whatsapp' | 'phone' | 'walk_in' | 'social'>('whatsapp');
  const [svcQ, setSvcQ] = useState('');
  const [discount, setDiscount] = useState('');
  const [payNow, setPayNow] = useState<'none' | 'deposit' | 'full'>('none');
  const [method, setMethod] = useState<'cash' | 'card' | 'online' | 'transfer'>('transfer'); // deposits on WhatsApp bookings usually arrive by bank transfer
  const [err, setErr] = useState('');
  const [nonce, setNonce] = useState(0);
  const [showPast, setShowPast] = useState(false);
  const [pending, start] = useTransition();

  const visible = services.filter(s => location === 'salon' || s.homeOk);
  const byCat = useMemo(() => {
    const m = new Map<string, ServiceView[]>();
    const nq = norm(svcQ);
    for (const s of visible) {
      if (nq && !norm(s.name + ' ' + s.category).includes(nq)) continue;
      const k = s.category || 'خدمات'; m.set(k, [...(m.get(k) || []), s]);
    }
    return [...m.entries()];
  }, [visible, svcQ]);
  const qualified = staff.filter(st => (location === 'salon' || st.worksHome) && svc.every(id => services.find(s => s.id === id)?.staffIds.includes(st.id)));
  const totals = svc.reduce((a, id) => { const s = services.find(x => x.id === id); return s ? { d: a.d + s.durationMin, p: a.p + s.price } : a; }, { d: 0, p: 0 });
  const homeFee = location === 'home' ? salon.homeFee : 0;
  const disc = Math.min(Number(discount) || 0, totals.p + homeFee);
  const total = totals.p + homeFee - (editing ? b!.discount : disc);
  const deposit = Math.round(total * salon.depositPct / 100);

  // keep the staff choice valid when services change
  useEffect(() => { if (staffId !== 'any' && svc.length && !qualified.some(s => s.id === staffId)) setStaffId('any'); }, [svc.join(), location]); // eslint-disable-line react-hooks/exhaustive-deps

  // customer search
  useEffect(() => {
    if (customer || newCust || q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => { const r = await searchCustomersAction(q); if (r.ok) setResults(r.customers); }, 220);
    return () => clearTimeout(t);
  }, [q, customer, newCust]);

  // available times
  useEffect(() => {
    if (!svc.length) { setSlots(null); return; }
    let live = true;
    setSlots(null);
    const t = setTimeout(async () => {
      const r = await slotsAction({ day, serviceIds: svc, staffId, location, excludeBookingId: b?.id });
      if (!live) return;
      if (!r.ok) { setErr(r.error); return; }
      setSlots(r.slots);
      setMin(cur => {
        const want = cur ?? wanted.current;
        return want != null && r.slots.some(s => s.min === want) ? want : null;
      });
    }, 150);
    return () => { live = false; clearTimeout(t); };
  }, [svc.join(), staffId, day, location, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // today: times that already passed stay folded away (still reachable for a walk-in entered late)
  const cutoff = day === salon.today && !showPast ? salon.nowMin - 30 : -1;
  const shownSlots = (slots ?? []).filter(s => s.min >= cutoff || s.min === min);
  const hiddenPast = (slots?.length ?? 0) - shownSlots.length;
  const chosen = slots?.find(s => s.min === min);
  const chosenStaff = staff.find(s => s.id === chosen?.staffId);
  const wantedMissing = wanted.current != null && slots && !slots.some(s => s.min === wanted.current);
  const custOk = editing || customer || (newCust && newCust.name.trim() && newCust.phone.replace(/\D/g, '').length >= 9);
  const ready = custOk && svc.length > 0 && chosen && (location === 'salon' || address.trim());

  function submit() {
    if (!ready || !chosen) return;
    setErr('');
    start(async () => {
      if (editing) {
        const r = await updateBookingAction({ id: b!.id, serviceIds: svc, staffId: chosen.staffId, day, min: chosen.min, location, address, notes });
        if (!r.ok) { setErr(r.error); return; }
        toast('انحفظ التعديل'); onDone(b!.id, day);
      } else {
        const amount = payNow === 'full' ? total : payNow === 'deposit' ? deposit : 0;
        const r = await createBookingAction({
          customerId: customer?.id, customerName: newCust?.name, customerPhone: newCust?.phone,
          serviceIds: svc, staffId: chosen.staffId, day, min: chosen.min, location, address, source, notes, discount: disc,
          payNow: amount > 0 ? { method, amount, kind: payNow === 'deposit' ? 'deposit' : 'payment' } : undefined,
        });
        if (!r.ok) { setErr(r.error); if (r.error.includes('انحجز') || r.error.includes('فاضي')) { setMin(null); setNonce(n => n + 1); } return; }
        toast(`تم الحجز · ${r.code}`); onDone(r.id, day);
      }
    });
  }

  return (
    <Sheet title={editing ? 'تعديل الحجز' : 'حجز جديد'} sub={editing ? b!.customerName : undefined} onClose={onClose}
      foot={<>
        {err && <p className="notice bad" role="alert" style={{ position: 'absolute', insetInline: 20, bottom: '100%', marginBottom: 8 }}>{err}</p>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="total-line"><span className="small muted">{svc.length ? fmtDuration(totals.d) : 'اختاري الخدمة'}</span><b>{sar(total)}</b></div>
          {chosen && <div className="tiny muted">{fmtDay(day)} · {fmtTime(chosen.min)} · {chosenStaff?.name}</div>}
        </div>
        <button className="btn primary lg" disabled={!ready || pending} onClick={submit}>{pending ? 'جاري الحفظ…' : editing ? 'حفظ التعديل' : 'تأكيد الحجز'}</button>
      </>}>

      {!editing && (
        <section className="row tight" aria-label="جاء الحجز من">
          <span className="label" style={{ marginInlineEnd: 4 }}>جاء من</span>
          {([['whatsapp', 'واتساب'], ['phone', 'اتصال'], ['walk_in', 'حضور'], ['social', 'سوشل']] as const).map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={source === k} onClick={() => setSource(k)}>{l}</button>
          ))}
        </section>
      )}

      {/* customer */}
      {!editing && (
        <section className="stack tight">
          <span className="label">العميلة</span>
          {customer ? (
            <div className="picked">
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{customer.name}</b> <span className="ltr num faint small">{displayPhone(customer.phone)}</span>
                {(customer.visits || customer.no_shows) ? <div className="tiny muted">{customer.visits} زيارة{customer.no_shows ? ` · ${customer.no_shows} غياب` : ''}</div> : null}
                {customer.allergies && <div className="tiny" style={{ color: 'var(--warn)' }}>تنبيه: {customer.allergies}</div>}
              </div>
              <button className="btn quiet sm" onClick={() => { setCustomer(null); setQ(''); }}>تغيير</button>
            </div>
          ) : newCust ? (
            <div className="grid-2">
              <label className="field"><span>الاسم</span><input id="nc-name" className="input" value={newCust.name} onChange={e => setNewCust({ ...newCust, name: e.target.value })} autoFocus /></label>
              <label className="field"><span>الجوال</span><input id="nc-phone" className="input num" dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={newCust.phone} onChange={e => setNewCust({ ...newCust, phone: e.target.value })} /></label>
              <button className="btn quiet sm" style={{ justifySelf: 'start' }} onClick={() => setNewCust(null)}>بحث عن عميلة مسجّلة</button>
            </div>
          ) : (
            <>
              <input id="cust-q" className="input" placeholder="ابحثي بالاسم أو رقم الجوال" value={q} onChange={e => setQ(e.target.value)} autoFocus />
              {results.length > 0 && (
                <div className="results">
                  {results.map(c => (
                    <button key={c.id} onClick={() => setCustomer(c)}>
                      <span><b>{c.name}</b>{c.no_shows ? <span className="tag bad" style={{ marginInlineStart: 6 }}>{c.no_shows} غياب</span> : null}</span>
                      <span className="ltr num faint">{displayPhone(c.phone)}</span>
                    </button>
                  ))}
                </div>
              )}
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => {
                const digits = q.replace(/\D/g, '');
                setNewCust(digits.length >= 6 ? { name: '', phone: q } : { name: q, phone: '' });
              }}>+ عميلة جديدة{q.trim() && !/\d{6,}/.test(q) ? `: ${q.trim()}` : ''}</button>
            </>
          )}
        </section>
      )}

      {salon.homeService && (
        <div className="seg" role="group" aria-label="المكان">
          <button aria-pressed={location === 'salon'} onClick={() => setLocation('salon')}>في الصالون</button>
          <button aria-pressed={location === 'home'} onClick={() => { setLocation('home'); setSvc(s => s.filter(id => services.find(x => x.id === id)?.homeOk)); }}>في البيت · +{sar(salon.homeFee)}</button>
        </div>
      )}

      {/* services */}
      <section className="stack tight">
        <span className="label">الخدمات {svc.length > 0 && <span className="faint">({svc.length})</span>}</span>
        {svc.length > 0 && (
          <div className="chips">
            {svc.map(id => { const x = services.find(v => v.id === id); return x && (
              <button key={id} className="chip" aria-pressed="true" onClick={() => setSvc(v => v.filter(y => y !== id))} aria-label={`إزالة ${x.name}`}>{x.name} ×</button>
            ); })}
          </div>
        )}
        {visible.length > 10 && (
          <input id="svc-q" className="input" placeholder="ابحثي عن خدمة…" value={svcQ} onChange={e => setSvcQ(e.target.value)} />
        )}
        <div className="svc-list">
          {byCat.length === 0 && <p className="small faint" style={{ padding: 12 }}>ما فيه خدمة بهالاسم.</p>}
          {byCat.map(([cat, list]) => (
            <div key={cat}>
              {byCat.length > 1 && <div className="svc-cat">{cat}</div>}
              {list.map(s => (
                <label key={s.id} className="svc-opt">
                  <input type="checkbox" checked={svc.includes(s.id)} onChange={e => setSvc(v => e.target.checked ? [...v, s.id] : v.filter(x => x !== s.id))} />
                  <span>{s.name} <span className="faint tiny">· {s.durationMin} د</span></span>
                  <span className="p">{sar(s.price)}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* who & when */}
      <section className="grid-2">
        <label className="field"><span>الموظفة</span>
          <select id="f-staff" className="input" value={staffId} onChange={e => { setStaffId(e.target.value); }}>
            <option value="any">أي موظفة متاحة</option>
            {(svc.length ? qualified : staff).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="field"><span>اليوم</span>
          <input id="f-day" type="date" className="input num" value={day} onChange={e => e.target.value && setDay(e.target.value)} />
        </label>
      </section>
      {svc.length > 0 && qualified.length === 0 && <p className="notice warn">ما فيه موظفة تقدّم كل هالخدمات مع بعض{location === 'home' ? ' في البيت' : ''}.</p>}

      <section className="stack tight">
        <span className="label">الوقت {svc.length > 0 && <span className="faint">· المتاح فعلاً لمدة {fmtDuration(totals.d)}</span>}</span>
        {!svc.length ? <p className="small faint">اختاري الخدمة أول، وتطلع لك الأوقات الفاضية.</p>
          : slots === null ? <p className="small faint">نشيك على الجدول…</p>
          : slots.length === 0 ? <p className="notice warn">ما فيه وقت فاضي بهاليوم لهالخدمات. جربي يوم ثاني أو موظفة ثانية.</p>
          : (
            <>
              {wantedMissing && <p className="notice info small">الوقت {fmtTime(wanted.current!)} ما يكفي لهالخدمات أو صار مشغول. اختاري من المتاح.</p>}
              <div className="slots" role="group" aria-label="الأوقات المتاحة">
                {shownSlots.map(s => <button key={s.min} className="slot" aria-pressed={min === s.min} onClick={() => { setMin(s.min); wanted.current = null; }}>{fmtTime(s.min)}</button>)}
              </div>
              {shownSlots.length === 0 && <p className="small faint">ما بقى وقت فاضي اليوم.</p>}
              {hiddenPast > 0 && <button className="btn quiet sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowPast(true)}>عرض الأوقات اللي فاتت ({hiddenPast})</button>}
            </>
          )}
      </section>

      {location === 'home' && (
        <label className="field"><span>العنوان</span><input id="f-addr" className="input" value={address} onChange={e => setAddress(e.target.value)} placeholder="الحي، الشارع، رقم البيت" /></label>
      )}

      <details className="more-box" open={!!b?.notes}>
        <summary>{editing ? 'ملاحظة' : 'ملاحظة، خصم، عربون'}{!editing && (payNow !== 'none' || disc > 0 || notes) ? ' · فيه إضافات' : ''}</summary>
        <div className="stack tight" style={{ paddingTop: 10 }}>
          <label className="field"><span>ملاحظة على الحجز</span><textarea id="f-notes" className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="مثلاً: تبي نفس لون المرة الماضية" /></label>
          {!editing && (
            <label className="field"><span>خصم (ر.س)</span>
              <input id="f-disc" className="input num" inputMode="decimal" value={discount} onChange={e => setDiscount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" />
            </label>
          )}
          {!editing && total > 0 && (
            <>
              <span className="label">دفعت شي مقدّم؟</span>
              <div className="seg" role="group" aria-label="دفع مقدّم">
                <button aria-pressed={payNow === 'none'} onClick={() => setPayNow('none')}>لا، عند الحضور</button>
                <button aria-pressed={payNow === 'deposit'} onClick={() => setPayNow('deposit')}>عربون {sar(deposit)}</button>
                <button aria-pressed={payNow === 'full'} onClick={() => setPayNow('full')}>كامل</button>
              </div>
              {payNow !== 'none' && (
                <div className="chips">
                  {(['transfer', 'cash', 'card', 'online'] as const).map(m => <button key={m} className="chip" aria-pressed={method === m} onClick={() => setMethod(m)}>{METHOD_LABEL[m]}</button>)}
                </div>
              )}
            </>
          )}
        </div>
      </details>

    </Sheet>
  );
}

/** loose Arabic match: ignore diacritics and the usual alef / taa marbuta / yaa spellings */
function norm(t: string) {
  return t.toLowerCase().replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();
}
