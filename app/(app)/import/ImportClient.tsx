'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { importSalonAction } from '@/app/importActions';
import { cleanServices, planStaff, SPECIALTY, CATEGORY_ORDER, type ImportPayload } from '@/lib/importer';
import { sar, ROLE_LABEL } from '@/lib/format';
import { fmtTime } from '@/lib/time';

type Cred = { role: string; name: string; username: string; password: string };

/** Reads what the old system handed over (in the page address after #, which never leaves the browser), shows it, then applies it. */
export function ImportClient({ salonName }: { salonName: string }) {
  const [payload, setPayload] = useState<ImportPayload | null>(null);
  const [bad, setBad] = useState(false);
  const [opts, setOpts] = useState({ wipe: true, sample: true, accounts: true, opens: 780, closes: 1380, prefix: 'lilys' });
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ services: number; staff: number; bookings: number; creds: Cred[] } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (!h) return;
    try {
      const p = JSON.parse(decodeURIComponent(h)) as ImportPayload;
      if (p.source !== 'gobeauti' || !Array.isArray(p.services)) throw new Error();
      setPayload(p);
    } catch { setBad(true); }
    history.replaceState(null, '', window.location.pathname); // keep the data out of history and the address bar
  }, []);

  const clean = useMemo(() => payload ? cleanServices(payload.services) : null, [payload]);
  const team = useMemo(() => payload ? planStaff(payload.staffTitles) : [], [payload]);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of clean?.services ?? []) m.set(s.category, (m.get(s.category) || 0) + 1);
    return [...m.entries()].sort((a, b) => (CATEGORY_ORDER.indexOf(a[0]) + 1 || 99) - (CATEGORY_ORDER.indexOf(b[0]) + 1 || 99));
  }, [clean]);
  const bySpec = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of team) m.set(SPECIALTY[t.specialty].label, (m.get(SPECIALTY[t.specialty].label) || 0) + 1);
    return [...m.entries()];
  }, [team]);

  if (done) return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div className="page-head"><div><h1>تم النقل</h1><p className="sub">{salonName}</p></div></div>
      <div className="figures">
        <div><div className="k">خدمة</div><div className="v">{done.services}</div></div>
        <div><div className="k">مختصة</div><div className="v">{done.staff}</div></div>
        <div><div className="k">حجز تجريبي</div><div className="v">{done.bookings}</div></div>
      </div>
      {done.creds.length > 0 && (
        <section className="stack tight">
          <h2>حسابات التجربة</h2>
          <p className="small muted">حساب لكل دور عشان تجربون كل شاشة. كلمات المرور تطلع هنا مرة وحدة؛ تقدرين تطلعين غيرها من صفحة الفريق.</p>
          <div className="table-wrap">
            <table className="t" id="creds">
              <thead><tr><th>الدور</th><th>الاسم</th><th>اسم المستخدم</th><th>كلمة المرور</th></tr></thead>
              <tbody>{done.creds.map(c => (
                <tr key={c.username}><td>{ROLE_LABEL[c.role]}</td><td>{c.name}</td><td className="ltr">{c.username}</td><td className="ltr num" style={{ userSelect: 'all' }}>{c.password}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}
      <div className="row"><a className="btn primary" href="/schedule">افتحي الجدول</a><a className="btn" href="/services">الخدمات</a><a className="btn" href="/team">الفريق</a></div>
    </div>
  );

  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <div className="page-head"><div><h1>نقل البيانات من نظامك السابق</h1><p className="sub">إلى {salonName}</p></div></div>
      {!payload && !bad && <div className="panel empty"><h3>ما وصلت بيانات</h3><p>هذي الصفحة تفتح من أداة النقل، ومعها الخدمات والفريق جاهزين.</p></div>}
      {bad && <p className="notice bad">البيانات اللي وصلت ناقصة أو تالفة. جربي النقل مرة ثانية.</p>}
      {payload && clean && (
        <>
          <div className="figures">
            <div><div className="k">خدمة تنضاف</div><div className="v">{clean.services.length}</div><div className="d">من {payload.services.length}</div></div>
            <div><div className="k">مختصة</div><div className="v">{team.length}</div><div className="d">بأسماء جديدة</div></div>
            <div><div className="k">ما تنضاف</div><div className="v">{clean.skipped.length}</div><div className="d">تجربة، مكررة، بدون سعر</div></div>
          </div>

          <div className="grid-2" style={{ alignItems: 'start' }}>
            <section className="panel panel-pad stack tight">
              <h2>الخدمات حسب التصنيف</h2>
              {byCat.map(([c, n]) => <div key={c} className="kv"><span>{c}</span><b className="num">{n}</b></div>)}
            </section>
            <section className="panel panel-pad stack tight">
              <h2>الفريق</h2>
              {bySpec.map(([c, n]) => <div key={c} className="kv"><span>{c}</span><b className="num">{n}</b></div>)}
              <p className="tiny faint">كل مختصة تاخذ خدمات تخصصها. تقدرين تعدلين من صفحة الفريق.</p>
            </section>
          </div>

          {clean.services.some(s => s.flag) && (
            <details className="more-box">
              <summary>خدمات تحتاج مراجعة ({clean.services.filter(s => s.flag).length})</summary>
              <ul className="small" style={{ margin: '8px 0 0', paddingInlineStart: 18 }}>
                {clean.services.filter(s => s.flag).map(s => <li key={s.name}>{s.name} · {s.flag}</li>)}
              </ul>
            </details>
          )}
          {clean.skipped.length > 0 && (
            <details className="more-box">
              <summary>ما تنضاف ({clean.skipped.length})</summary>
              <ul className="small" style={{ margin: '8px 0 0', paddingInlineStart: 18 }}>
                {clean.skipped.map((s, i) => <li key={i}>{s.name} · {s.reason}</li>)}
              </ul>
            </details>
          )}
          <details className="more-box">
            <summary>كل الخدمات ({clean.services.length})</summary>
            <div className="table-wrap" style={{ marginTop: 8, maxHeight: 360, overflowY: 'auto' }}>
              <table className="t"><tbody>{clean.services.map(s => (
                <tr key={s.name}><td>{s.name}</td><td className="faint small">{s.category}</td><td className="num">{s.duration} د</td><td className="end num">{sar(s.price)}</td></tr>
              ))}</tbody></table>
            </div>
          </details>

          <section className="panel panel-pad stack">
            <h2>قبل النقل</h2>
            <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={opts.wipe} onChange={e => setOpts({ ...opts, wipe: e.target.checked })} />
              <span><b>امسحي البيانات الحالية في الصالون</b><div className="tiny muted">الحجوزات والعميلات والخدمات والفريق اللي فيه الحين. ما يرجع. حسابك والإعدادات تبقى.</div></span></label>
            <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={opts.sample} onChange={e => setOpts({ ...opts, sample: e.target.checked })} />
              <span><b>حجوزات تجريبية</b><div className="tiny muted">أسبوعين قبل وأسبوع بعد، على خدماتكم، وأسماء العميلات تبدأ بـ "مثال".</div></span></label>
            <label className="row" style={{ gap: 10 }}><input type="checkbox" checked={opts.accounts} onChange={e => setOpts({ ...opts, accounts: e.target.checked })} />
              <span><b>حساب تجربة لكل دور</b><div className="tiny muted">مالكة، مديرة، استقبال ×2، مختصة، محاسبة. كل حساب باسم مستخدم وكلمة مرور.</div></span></label>
            <div className="grid-2">
              <label className="field"><span>الدوام</span><span className="small">{fmtTime(opts.opens)} – {fmtTime(opts.closes)} كل يوم</span></label>
              <label className="field"><span>بداية أسماء المستخدمين</span><input className="input" dir="ltr" value={opts.prefix} onChange={e => setOpts({ ...opts, prefix: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })} /></label>
            </div>
            {err && <p className="notice bad" role="alert">{err}</p>}
            <button className="btn primary lg" disabled={pending} onClick={() => start(async () => {
              setErr('');
              const r = await importSalonAction(payload, opts);
              if (!r.ok) { setErr(r.error); return; }
              setDone(r);
            })}>{pending ? 'جاري النقل… (دقيقة تقريباً)' : `انقلي ${clean.services.length} خدمة و${team.length} مختصة`}</button>
          </section>
        </>
      )}
    </div>
  );
}
