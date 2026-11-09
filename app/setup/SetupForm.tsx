'use client';

import { useState, useTransition } from 'react';
import { setupAction } from '../actions';
import { CATALOG_SIZE } from '@/lib/catalog';

export function SetupForm({ loginReady }: { loginReady: boolean }) {
  const [v, setV] = useState({ salonName: '', area: '', ownerName: '', ownerPhone: '', start: 'catalog' as 'demo' | 'catalog' | 'empty' });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  return (
    <form noValidate onSubmit={e => { e.preventDefault(); setErr(''); start(async () => { const r = await setupAction(v); if (r && !r.ok) setErr(r.error); }); }}>
      <div>
        <h1>إعداد الصالون</h1>
        <p className="muted" style={{ marginTop: 6 }}>تاخذ دقيقة. تقدرين تعدّلين كل شي بعدين من الإعدادات.</p>
      </div>
      <label className="field"><span>اسم الصالون</span><input id="s-salon" className="input" value={v.salonName} onChange={e => setV({ ...v, salonName: e.target.value })} autoFocus /></label>
      <label className="field"><span>الحي والمدينة</span><input id="s-area" className="input" value={v.area} onChange={e => setV({ ...v, area: e.target.value })} placeholder="مثلاً: حي النرجس، الرياض" /></label>
      <div className="grid-2">
        <label className="field"><span>اسمك</span><input id="s-owner" className="input" value={v.ownerName} onChange={e => setV({ ...v, ownerName: e.target.value })} /></label>
        <label className="field"><span>جوالك (للدخول)</span><input id="s-phone" className="input num" dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={v.ownerPhone} onChange={e => setV({ ...v, ownerPhone: e.target.value })} /></label>
      </div>
      <fieldset className="stack tight" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 8 }}>كيف تبدين؟</legend>
        {([
          ['catalog', 'قائمة خدمات جاهزة', `${CATALOG_SIZE} خدمة شائعة بمددها (شعر، أظافر، رموش، مكياج، بشرة، سبا…). تحذفين اللي ما تقدمينه وتعبّين الأسعار.`],
          ['demo', 'بيانات تجريبية', '5 موظفات، 14 خدمة، 20 عميلة، وحجوزات 6 أسابيع عشان تجربين كل شي. أسماء العميلات تبدأ بكلمة "مثال".'],
          ['empty', 'صالون فاضي', 'تضيفين خدماتك وفريقك بنفسك من الصفر.'],
        ] as const).map(([k, t, d]) => (
          <label key={k} className="picked" style={{ cursor: 'pointer', borderColor: v.start === k ? 'var(--plum)' : undefined }}>
            <input type="radio" name="start" checked={v.start === k} onChange={() => setV({ ...v, start: k })} style={{ accentColor: 'var(--plum)', width: 18, height: 18 }} />
            <span><b>{t}</b><div className="tiny muted">{d}</div></span>
          </label>
        ))}
      </fieldset>
      {!loginReady && <p className="notice warn">تنبيه: ما فيه طريقة دخول مهيّأة. أضيفي TEST_ACCESS_CODE في إعدادات الاستضافة عشان تقدرين تدخلين مرة ثانية.</p>}
      {err && <p className="notice bad" role="alert">{err}</p>}
      <button className="btn primary lg" disabled={pending}>{pending ? 'جاري الإعداد…' : 'ابدئي'}</button>
    </form>
  );
}
