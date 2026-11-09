'use client';

import { useState, useTransition } from 'react';
import { saveSettingsAction } from '@/app/actions';
import { hhmm, parseHhmm } from '@/lib/time';
import { useToast } from '@/components/Toast';

type S = {
  name: string; area: string; phone: string; opens_min: number; closes_min: number; cancel_hours: number; deposit_pct: number;
  late_mins: number; lead_mins: number; slot_step: 5 | 10 | 15 | 20 | 30; home_service: boolean; home_fee: number; travel_mins: number;
  vat_number: string; cr_number: string; address: string;
};

export function SettingsForm({ initial }: { initial: S }) {
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const n = (k: keyof S, label: string, unit: string, hint?: string) => (
    <label className="field"><span>{label}</span>
      <span className="row tight" style={{ flexWrap: 'nowrap' }}>
        <input id={'set-' + k} className="input num" type="number" min={0} value={Number(v[k])} onChange={e => setV({ ...v, [k]: Number(e.target.value) })} />
        <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{unit}</span>
      </span>
      {hint && <span className="tiny faint">{hint}</span>}
    </label>
  );
  return (
    <form className="stack" onSubmit={e => { e.preventDefault(); setErr(''); start(async () => { const r = await saveSettingsAction(v); if (!r.ok) setErr(r.error); else toast('انحفظت الإعدادات'); }); }}>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="panel panel-pad stack">
          <h2>الصالون</h2>
          <label className="field"><span>الاسم</span><input id="set-name" className="input" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></label>
          <label className="field"><span>الحي والمدينة</span><input id="set-area" className="input" value={v.area} onChange={e => setV({ ...v, area: e.target.value })} /></label>
          <label className="field"><span>رقم التواصل</span><input id="set-phone" className="input num" dir="ltr" value={v.phone} onChange={e => setV({ ...v, phone: e.target.value })} /></label>
          <div className="grid-2">
            <label className="field"><span>يفتح</span><input id="set-open" className="input num" type="time" step={900} value={hhmm(v.opens_min)} onChange={e => setV({ ...v, opens_min: parseHhmm(e.target.value) })} /></label>
            <label className="field"><span>يقفل</span><input id="set-close" className="input num" type="time" step={900} value={hhmm(Math.min(v.closes_min, 1439))} onChange={e => setV({ ...v, closes_min: parseHhmm(e.target.value) || 1440 })} /></label>
          </div>
          <label className="field"><span>فواصل المواعيد</span>
            <div className="seg" role="group">
              {([10, 15, 20, 30] as const).map(s => <button type="button" key={s} aria-pressed={v.slot_step === s} onClick={() => setV({ ...v, slot_step: s })}>كل {s} د</button>)}
            </div>
          </label>
        </section>
        <section className="panel panel-pad stack">
          <h2>سياسات الحجز</h2>
          <div className="grid-2">
            {n('cancel_hours', 'الإلغاء المجاني قبل', 'ساعة', 'بعدها يُخصم العربون')}
            {n('deposit_pct', 'العربون', '%', 'من إجمالي الحجز')}
            {n('late_mins', 'التأخير المسموح', 'دقيقة', 'بعده يُعتبر غياب')}
            {n('lead_mins', 'أقل وقت قبل الحجز', 'دقيقة', 'لحجوزات التطبيق')}
          </div>
        </section>
        <section className="panel panel-pad stack">
          <label className="row spread"><h2>الخدمة المنزلية</h2><input type="checkbox" className="switch" checked={v.home_service} onChange={e => setV({ ...v, home_service: e.target.checked })} aria-label="تفعيل الخدمة المنزلية" /></label>
          <p className="small muted">اختيارية. الصالون اللي يفعّلها يطلع بأفضلية في تطبيق Dalora. وقت التنقّل ينحجز قبل الموعد وبعده عشان ما يتداخل مع اللي بعده.</p>
          <div className="grid-2">
            {n('home_fee', 'رسوم الوصول', 'ر.س')}
            {n('travel_mins', 'وقت التنقّل (كل اتجاه)', 'دقيقة')}
          </div>
        </section>
        <section className="panel panel-pad stack">
          <h2>الفاتورة الضريبية</h2>
          <p className="small muted">إذا الصالون مسجّل في ضريبة القيمة المضافة، اكتبي الرقم الضريبي. بعدها تنطلع فاتورة ضريبية مبسطة برمز QR تلقائياً أول ما يكتمل دفع أي حجز، وإشعار دائن إذا سجلتي استرجاع. الأسعار تُعتبر شاملة الضريبة 15%.</p>
          <label className="field"><span>الرقم الضريبي</span>
            <input id="set-vat" className="input num" dir="ltr" inputMode="numeric" maxLength={15} placeholder="3XXXXXXXXXXXXX3" value={v.vat_number}
              onChange={e => setV({ ...v, vat_number: e.target.value.replace(/\D/g, '') })} />
            {v.vat_number && !/^3\d{13}3$/.test(v.vat_number) && <span className="tiny" style={{ color: 'var(--warn)' }}>15 رقم، يبدأ بـ 3 وينتهي بـ 3</span>}
          </label>
          <div className="grid-2">
            <label className="field"><span>السجل التجاري</span><input id="set-cr" className="input num" dir="ltr" value={v.cr_number} onChange={e => setV({ ...v, cr_number: e.target.value.replace(/\D/g, '') })} /></label>
            <label className="field"><span>العنوان على الفاتورة</span><input id="set-addr" className="input" value={v.address} onChange={e => setV({ ...v, address: e.target.value })} placeholder="الحي، المدينة" /></label>
          </div>
        </section>
      </div>
      {err && <p className="notice bad">{err}</p>}
      <div><button className="btn primary lg" disabled={!dirty || pending}>{pending ? 'جاري الحفظ…' : 'حفظ الإعدادات'}</button></div>
    </form>
  );
}
