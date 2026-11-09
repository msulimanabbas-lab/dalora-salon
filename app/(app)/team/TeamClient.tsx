'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveStaffAction, addMemberAction, setMemberActiveAction, addTimeOffAction, removeTimeOffAction } from '@/app/actions';
import { displayPhone, ROLE_LABEL } from '@/lib/format';
import { fmtDay, fmtTime, hhmm, parseHhmm, WEEKDAYS } from '@/lib/time';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';

type St = { id: string; name: string; title: string; color: string; week: Record<string, [number, number]>; worksHome: boolean; commission: number; active: boolean };
type Sv = { id: string; name: string; staffIds: string[]; active: boolean };
type Mb = { id: string; role: string; active: boolean; staffId: string | null; name: string; phone: string; me: boolean };
type Off = { id: string; staffId: string; day: string; from: number; to: number; reason: string };
const COLORS = ['#B9708A', '#8C6BA8', '#C99263', '#5E978A', '#6F84B8', '#C0636F', '#7E8A4E', '#A0705A'];
const ORDER = [6, 0, 1, 2, 3, 4, 5]; // Saturday first, as Saudi weeks are usually written

export function TeamClient({ today, opens, closes, staff, services, members, timeOff, canTeam }: {
  today: string; opens: number; closes: number; staff: St[]; services: Sv[]; members: Mb[]; timeOff: Off[]; canTeam: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [edit, setEdit] = useState<St | null>(null);
  const [adding, setAdding] = useState(false);
  const [offFor, setOffFor] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const hoursLabel = (w: St['week']) => {
    const days = ORDER.filter(d => w[String(d)]);
    if (!days.length) return 'ما حُدد دوام';
    const off = ORDER.filter(d => !w[String(d)]).map(d => WEEKDAYS[d]);
    const first = w[String(days[0])];
    const same = days.every(d => w[String(d)][0] === first[0] && w[String(d)][1] === first[1]);
    return `${same ? `${fmtTime(first[0])} – ${fmtTime(first[1])}` : 'دوام متغيّر'}${off.length ? ` · إجازة ${off.join('، ')}` : ''}`;
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>الفريق</h1><p className="sub">دوام كل موظفة وخدماتها يحددون مين يطلع متاح للحجز ومتى.</p></div>
        <button className="btn primary" onClick={() => setEdit({ id: '', name: '', title: '', color: COLORS[staff.length % COLORS.length], week: Object.fromEntries([0, 1, 2, 3, 4, 6].map(d => [String(d), [opens, closes]])), worksHome: false, commission: 0, active: true })}>
          <Icon name="plus" />موظفة جديدة
        </button>
      </div>

      <section className="panel divide">
        {staff.length === 0 && <div className="empty"><p>أضيفي أول موظفة.</p></div>}
        {staff.map(s => {
          const offs = timeOff.filter(o => o.staffId === s.id);
          const svcs = services.filter(v => v.active && v.staffIds.includes(s.id));
          return (
            <div key={s.id} style={{ padding: '14px 18px', opacity: s.active ? 1 : .55 }} className="stack tight">
              <div className="row spread">
                <div className="row" style={{ minWidth: 0 }}>
                  <span className="av" style={{ background: s.color, width: 38, height: 38 }}>{s.name.charAt(0)}</span>
                  <div style={{ minWidth: 0 }}>
                    <b>{s.name}</b> {!s.active && <span className="tag mute">موقوفة</span>} {s.worksHome && <span className="tag info">منزلي</span>}
                    <div className="small muted">{s.title}{s.title ? ' · ' : ''}{hoursLabel(s.week)}</div>
                  </div>
                </div>
                <div className="row tight">
                  <button className="btn sm" onClick={() => setOffFor(offFor === s.id ? null : s.id)}>وقت مقفل</button>
                  <button className="btn sm" onClick={() => setEdit(s)}>تعديل</button>
                </div>
              </div>
              <div className="small faint">{svcs.length ? svcs.map(v => v.name).join('، ') : <span style={{ color: 'var(--bad)' }}>ما ارتبطت بأي خدمة، فما تطلع في الحجز</span>}</div>
              {offs.length > 0 && (
                <div className="chips">
                  {offs.map(o => (
                    <span key={o.id} className="tag mute" style={{ gap: 6 }}>
                      {fmtDay(o.day)} {fmtTime(o.from)}–{fmtTime(o.to)}{o.reason ? ` · ${o.reason}` : ''}
                      <button aria-label="إزالة" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }} disabled={pending}
                        onClick={() => start(async () => { await removeTimeOffAction(o.id); router.refresh(); })}>×</button>
                    </span>
                  ))}
                </div>
              )}
              {offFor === s.id && <TimeOffForm staffId={s.id} today={today} opens={opens} closes={closes} onDone={() => { setOffFor(null); router.refresh(); toast('انقفل الوقت'); }} />}
            </div>
          );
        })}
      </section>

      {canTeam && (
        <section className="stack tight">
          <div className="row spread"><h2>الحسابات والصلاحيات</h2><button className="btn sm" onClick={() => setAdding(true)}><Icon name="plus" />إضافة حساب</button></div>
          <p className="small muted">كل شخص يدخل برقم جواله. الموظفة تشوف مواعيدها بس، والاستقبال يدير الحجوزات والكاش، والمحاسبة تشوف المال والتقارير.</p>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>الاسم</th><th>الجوال</th><th>الدور</th><th></th></tr></thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} style={m.active ? undefined : { opacity: .55 }}>
                    <td><b>{m.name}</b>{m.me && <span className="faint small"> (أنتِ)</span>}{m.staffId && <div className="tiny faint">مرتبط بـ {staff.find(s => s.id === m.staffId)?.name}</div>}</td>
                    <td><span className="ltr num">{displayPhone(m.phone)}</span></td>
                    <td>{ROLE_LABEL[m.role]}</td>
                    <td className="end">{!m.me && m.role !== 'owner' && (
                      <button className="btn quiet sm" disabled={pending} onClick={() => start(async () => {
                        const r = await setMemberActiveAction(m.id, !m.active); if (!r.ok) toast(r.error); else { toast(m.active ? 'انوقف الحساب' : 'انفعّل الحساب'); router.refresh(); }
                      })}>{m.active ? 'إيقاف' : 'تفعيل'}</button>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {edit && <StaffSheet st={edit} services={services} onClose={() => setEdit(null)} />}
      {adding && <MemberSheet staff={staff} onClose={() => setAdding(false)} />}
    </div>
  );
}

function StaffSheet({ st, services, onClose }: { st: St; services: Sv[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(st);
  const [svc, setSvc] = useState(services.filter(s => s.staffIds.includes(st.id)).map(s => s.id));
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const setDay = (d: number, val: [number, number] | null) => setV(x => { const w = { ...x.week }; if (val) w[String(d)] = val; else delete w[String(d)]; return { ...x, week: w }; });
  const firstOn = ORDER.map(d => v.week[String(d)]).find(Boolean) || [600, 1320];
  return (
    <Sheet title={st.id ? `تعديل ${st.name}` : 'موظفة جديدة'} onClose={onClose}
      foot={<button className="btn primary lg block" disabled={pending || !v.name.trim()} onClick={() => start(async () => {
        setErr('');
        const r = await saveStaffAction({ id: st.id || undefined, name: v.name, title: v.title, color: v.color, week: v.week, works_home: v.worksHome, commission_pct: Number(v.commission), active: v.active, service_ids: svc });
        if (!r.ok) { setErr(r.error); return; }
        toast('انحفظ'); router.refresh(); onClose();
      })}>{pending ? 'جاري الحفظ…' : 'حفظ'}</button>}>
      <div className="grid-2">
        <label className="field"><span>الاسم</span><input id="st-name" className="input" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} autoFocus /></label>
        <label className="field"><span>التخصص</span><input id="st-title" className="input" value={v.title} onChange={e => setV({ ...v, title: e.target.value })} placeholder="مثلاً: رموش وحواجب" /></label>
      </div>
      <div className="field"><span>اللون في الجدول</span>
        <div className="colors">{COLORS.map(c => <button type="button" key={c} style={{ background: c }} aria-pressed={v.color === c} aria-label={c} onClick={() => setV({ ...v, color: c })} />)}</div>
      </div>
      <div className="field"><span>الدوام الأسبوعي</span>
        <div className="week">
          {ORDER.map(d => {
            const h = v.week[String(d)];
            return [
              <span key={d + 'n'}>{WEEKDAYS[d]}</span>,
              <input key={d + 't'} type="checkbox" className="switch" checked={!!h} aria-label={`دوام ${WEEKDAYS[d]}`} onChange={e => setDay(d, e.target.checked ? firstOn as [number, number] : null)} />,
              h ? (
                <span key={d + 'h'} className="row tight" style={{ flexWrap: 'nowrap' }}>
                  <input type="time" step={900} className="input num" style={{ padding: '6px 8px', minHeight: 34 }} value={hhmm(h[0])} onChange={e => setDay(d, [parseHhmm(e.target.value), h[1]])} aria-label="من" />
                  <span className="faint">–</span>
                  <input type="time" step={900} className="input num" style={{ padding: '6px 8px', minHeight: 34 }} value={hhmm(h[1])} onChange={e => setDay(d, [h[0], parseHhmm(e.target.value)])} aria-label="إلى" />
                </span>
              ) : <span key={d + 'h'} className="faint small">إجازة</span>,
            ];
          })}
        </div>
      </div>
      <div className="field"><span>الخدمات اللي تقدّمها</span>
        <div className="chips">
          {services.filter(s => s.active).map(s => <button type="button" key={s.id} className="chip" aria-pressed={svc.includes(s.id)} onClick={() => setSvc(x => x.includes(s.id) ? x.filter(y => y !== s.id) : [...x, s.id])}>{s.name}</button>)}
        </div>
      </div>
      <div className="grid-2">
        <label className="field"><span>العمولة %</span><input id="st-comm" className="input num" type="number" min={0} max={100} value={v.commission} onChange={e => setV({ ...v, commission: Number(e.target.value) })} /></label>
      </div>
      <label className="row spread"><span>تطلع خدمة منزلية</span><input type="checkbox" className="switch" checked={v.worksHome} onChange={e => setV({ ...v, worksHome: e.target.checked })} /></label>
      <label className="row spread"><span>نشطة (تطلع في الجدول والحجز)</span><input type="checkbox" className="switch" checked={v.active} onChange={e => setV({ ...v, active: e.target.checked })} /></label>
      {err && <p className="notice bad">{err}</p>}
    </Sheet>
  );
}

function TimeOffForm({ staffId, today, opens, closes, onDone }: { staffId: string; today: string; opens: number; closes: number; onDone: () => void }) {
  const [day, setDay] = useState(today);
  const [from, setFrom] = useState(opens);
  const [to, setTo] = useState(closes);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  return (
    <form className="panel panel-pad stack tight" style={{ background: 'var(--paper)' }} onSubmit={e => { e.preventDefault(); start(async () => { const r = await addTimeOffAction({ staffId, day, from, to, reason }); if (!r.ok) setErr(r.error); else onDone(); }); }}>
      <p className="small muted">يمنع الحجز في هالوقت (موعد خاص، إجازة يوم، تدريب). الحجوزات الموجودة ما تتأثر.</p>
      <div className="row">
        <input type="date" className="input num" style={{ width: 'auto' }} value={day} onChange={e => setDay(e.target.value)} aria-label="اليوم" />
        <input type="time" step={900} className="input num" style={{ width: 'auto' }} value={hhmm(from)} onChange={e => setFrom(parseHhmm(e.target.value))} aria-label="من" />
        <input type="time" step={900} className="input num" style={{ width: 'auto' }} value={hhmm(to)} onChange={e => setTo(parseHhmm(e.target.value))} aria-label="إلى" />
        <input className="input" style={{ flex: '1 1 140px', width: 'auto' }} value={reason} onChange={e => setReason(e.target.value)} placeholder="السبب (اختياري)" />
        <button className="btn primary" disabled={pending}>اقفلي الوقت</button>
      </div>
      {err && <p className="notice bad">{err}</p>}
    </form>
  );
}

function MemberSheet({ staff, onClose }: { staff: St[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState<{ name: string; phone: string; role: 'manager' | 'reception' | 'staff' | 'accountant'; staffId: string }>({ name: '', phone: '', role: 'reception', staffId: '' });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const ROLES = [
    ['reception', 'الاستقبال', 'الجدول والحجوزات والعميلات واستلام الكاش وإقفال اليوم'],
    ['staff', 'موظفة', 'مواعيدها بس، وتغيّر حالتها (وصلت، بدأت، انتهت)'],
    ['manager', 'مديرة', 'كل شي ما عدا الإعدادات والحسابات'],
    ['accountant', 'المحاسبة', 'المال والتقارير، وعرض الجدول'],
  ] as const;
  return (
    <Sheet title="إضافة حساب" onClose={onClose}
      foot={<button className="btn primary lg block" disabled={pending} onClick={() => start(async () => {
        setErr('');
        const r = await addMemberAction({ name: v.name, phone: v.phone, role: v.role, staffId: v.role === 'staff' ? v.staffId || undefined : undefined });
        if (!r.ok) { setErr(r.error); return; }
        toast('انضاف الحساب. تقدر تدخل برقم جوالها الحين'); router.refresh(); onClose();
      })}>{pending ? 'جاري الحفظ…' : 'إضافة'}</button>}>
      <div className="grid-2">
        <label className="field"><span>الاسم</span><input id="m-name" className="input" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} autoFocus /></label>
        <label className="field"><span>الجوال</span><input id="m-phone" className="input num" dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={v.phone} onChange={e => setV({ ...v, phone: e.target.value })} /></label>
      </div>
      <div className="field"><span>الدور</span>
        <div className="stack tight">
          {ROLES.map(([k, l, d]) => (
            <label key={k} className="picked" style={{ cursor: 'pointer', borderColor: v.role === k ? 'var(--plum)' : undefined }}>
              <input type="radio" name="role" checked={v.role === k} onChange={() => setV({ ...v, role: k })} style={{ accentColor: 'var(--plum)' }} />
              <span><b>{l}</b><div className="tiny muted">{d}</div></span>
            </label>
          ))}
        </div>
      </div>
      {v.role === 'staff' && (
        <label className="field"><span>مين هي من الموظفات؟</span>
          <select id="m-staff" className="input" value={v.staffId} onChange={e => setV({ ...v, staffId: e.target.value })}>
            <option value="">اختاري</option>
            {staff.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      {err && <p className="notice bad">{err}</p>}
    </Sheet>
  );
}
