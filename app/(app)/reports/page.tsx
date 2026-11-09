import Link from 'next/link';
import { requirePage } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getSalon, getStaff } from '@/lib/data';
import { sar, SOURCE_LABEL } from '@/lib/format';
import { addDays, fmtShortDay, fmtTime, isDay, todayIn, weekdayOf, zoned } from '@/lib/time';

export const metadata = { title: 'التقارير' };
export const dynamic = 'force-dynamic';

function presets(today: string) {
  const [y, m] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const monthStart = `${y}-${pad(m)}-01`;
  const prevMonthEnd = addDays(monthStart, -1);
  const prevMonthStart = prevMonthEnd.slice(0, 8) + '01';
  return [
    { k: '7', label: 'آخر 7 أيام', from: addDays(today, -6), to: today },
    { k: '30', label: 'آخر 30 يوم', from: addDays(today, -29), to: today },
    { k: 'month', label: 'هالشهر', from: monthStart, to: today },
    { k: 'prev', label: 'الشهر الماضي', from: prevMonthStart, to: prevMonthEnd },
  ];
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; p?: string }> }) {
  const ctx = await requirePage('reports');
  const sp = await searchParams;
  const salon = await getSalon(ctx.salonId);
  const tz = salon.timezone;
  const today = todayIn(tz);
  const ps = presets(today);
  const preset = ps.find(p => p.k === sp.p);
  let from = preset?.from ?? (isDay(sp.from) ? sp.from : ps[1].from);
  let to = preset?.to ?? (isDay(sp.to) ? sp.to : ps[1].to);
  if (to < from) [from, to] = [to, from];
  const active = preset?.k ?? (!sp.from && !sp.to ? '30' : '');
  const a = zoned(from, 0, tz), z = zoned(addDays(to, 1), 0, tz);

  const [[k], byDay, byStaff, bySvc, bySrc, byHour, [cash], staff] = await Promise.all([
    sql`SELECT count(*) FILTER (WHERE status='done')::int AS done, count(*) FILTER (WHERE status='no_show')::int AS no_show,
               count(*) FILTER (WHERE status='cancelled')::int AS cancelled, count(*)::int AS all,
               COALESCE(sum(total) FILTER (WHERE status='done'),0) AS revenue,
               count(DISTINCT customer_id) FILTER (WHERE status='done')::int AS customers
        FROM bookings WHERE salon_id=${ctx.salonId} AND starts_at>=${a} AND starts_at<${z}`,
    sql`SELECT (starts_at AT TIME ZONE ${tz})::date AS d, COALESCE(sum(total) FILTER (WHERE status='done'),0) AS revenue, count(*) FILTER (WHERE status='done')::int AS n
        FROM bookings WHERE salon_id=${ctx.salonId} AND starts_at>=${a} AND starts_at<${z} GROUP BY 1 ORDER BY 1`,
    sql`SELECT staff_id, count(*) FILTER (WHERE status='done')::int AS done, count(*) FILTER (WHERE status='no_show')::int AS no_show,
               COALESCE(sum(total) FILTER (WHERE status='done'),0) AS revenue,
               COALESCE(sum(extract(epoch FROM ends_at-starts_at)/60) FILTER (WHERE status NOT IN ('cancelled','no_show')),0)::int AS minutes
        FROM bookings WHERE salon_id=${ctx.salonId} AND starts_at>=${a} AND starts_at<${z} GROUP BY staff_id`,
    sql`SELECT i.name, count(*)::int AS n, sum(i.price) AS revenue FROM booking_items i JOIN bookings b ON b.id=i.booking_id
        WHERE b.salon_id=${ctx.salonId} AND b.starts_at>=${a} AND b.starts_at<${z} AND b.status='done' GROUP BY i.name ORDER BY revenue DESC`,
    sql`SELECT source, count(*)::int AS n FROM bookings WHERE salon_id=${ctx.salonId} AND starts_at>=${a} AND starts_at<${z} AND status<>'cancelled' GROUP BY source ORDER BY n DESC`,
    sql`SELECT extract(hour FROM starts_at AT TIME ZONE ${tz})::int AS h, count(*)::int AS n FROM bookings
        WHERE salon_id=${ctx.salonId} AND starts_at>=${a} AND starts_at<${z} AND status NOT IN ('cancelled') GROUP BY 1 ORDER BY 1`,
    sql`SELECT COALESCE(sum(CASE WHEN kind='refund' THEN -amount ELSE amount END),0) AS net FROM payments WHERE salon_id=${ctx.salonId} AND business_date BETWEEN ${from} AND ${to}`,
    getStaff(ctx.salonId, true),
  ]);

  // available minutes per staff over the range, from their weekly hours
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const avail = (wk: Record<string, [number, number]>) => days.reduce((s, d) => { const h = wk?.[String(weekdayOf(d))]; return s + (h ? Math.max(0, Math.min(h[1], salon.closes_min) - Math.max(h[0], salon.opens_min)) : 0); }, 0);
  const staffRows = staff.map(s => {
    const r = byStaff.find(x => x.staff_id === s.id);
    const av = avail(s.week);
    return { s, done: r?.done ?? 0, noShow: r?.no_show ?? 0, revenue: Number(r?.revenue ?? 0), minutes: r?.minutes ?? 0, avail: av, occ: av ? (r?.minutes ?? 0) / av : 0 };
  }).filter(r => r.s.active || r.done);
  const totalAvail = staffRows.reduce((s, r) => s + r.avail, 0), totalMin = staffRows.reduce((s, r) => s + r.minutes, 0);
  const revenue = Number(k.revenue);
  const noShowRate = k.done + k.no_show ? k.no_show / (k.done + k.no_show) : 0;

  const dayMap = new Map(byDay.map(r => [r.d, Number(r.revenue)]));
  const series = days.map(d => ({ d, v: dayMap.get(d) ?? 0 }));
  const maxV = Math.max(1, ...series.map(s => s.v));
  const bestDay = series.reduce((b, s) => (s.v > b.v ? s : b), series[0]);
  const hours = Array.from({ length: Math.ceil(salon.closes_min / 60) - Math.floor(salon.opens_min / 60) }, (_, i) => Math.floor(salon.opens_min / 60) + i);
  const maxH = Math.max(1, ...byHour.map(h => h.n));
  const peak = byHour.reduce((b, h) => (h.n > (b?.n ?? 0) ? h : b), byHour[0]);
  const srcTotal = bySrc.reduce((s, r) => s + r.n, 0) || 1;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const label = series.length > 20 ? (i: number) => (i % 5 === 0 ? fmtShortDay(series[i].d).split(' ')[0] : '') : (i: number) => fmtShortDay(series[i].d).split(' ')[0];

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>التقارير</h1><p className="sub">{fmtShortDay(from)} – {fmtShortDay(to)} · {days.length} يوم</p></div>
        <form className="row tight" action="/reports">
          <input type="date" name="from" defaultValue={from} className="input num" style={{ width: 'auto' }} aria-label="من" />
          <span className="faint">إلى</span>
          <input type="date" name="to" defaultValue={to} className="input num" style={{ width: 'auto' }} aria-label="إلى" />
          <button className="btn">عرض</button>
        </form>
      </div>
      <div className="chips">
        {ps.map(p => <Link key={p.k} href={`/reports?p=${p.k}`} className="chip" aria-pressed={active === p.k} style={{ textDecoration: 'none' }}>{p.label}</Link>)}
      </div>

      <div className="figures">
        <div><div className="k">إيراد الخدمات المنجزة</div><div className="v">{sar(revenue)}</div><div className="d">المحصّل فعلياً {sar(cash.net)}</div></div>
        <div><div className="k">زيارات منجزة</div><div className="v">{k.done}</div><div className="d">{k.customers} عميلة مختلفة</div></div>
        <div><div className="k">متوسط الفاتورة</div><div className="v">{sar(k.done ? revenue / k.done : 0)}</div></div>
        <div><div className="k">نسبة الإشغال</div><div className="v">{pct(totalAvail ? totalMin / totalAvail : 0)}</div><div className="d">من ساعات دوام الموظفات</div></div>
        <div><div className="k">الغياب</div><div className="v" style={noShowRate > 0.08 ? { color: 'var(--bad)' } : undefined}>{pct(noShowRate)}</div><div className="d">{k.no_show} غياب · {k.cancelled} إلغاء</div></div>
      </div>

      <section className="panel panel-pad">
        <div className="row spread"><h2>الإيراد اليومي</h2>{bestDay && bestDay.v > 0 && <span className="small muted">أعلى يوم: {fmtShortDay(bestDay.d)} · {sar(bestDay.v)}</span>}</div>
        <div className="bars" role="img" aria-label="الإيراد اليومي">
          {series.map(s => <div key={s.d} className={'b' + (s.d === bestDay?.d ? ' hi' : '')} style={{ height: `${Math.max(2, (s.v / maxV) * 100)}%` }} title={`${fmtShortDay(s.d)}: ${sar(s.v)}`} />)}
        </div>
        <div className="bars-x">{series.map((s, i) => <span key={s.d}>{label(i)}</span>)}</div>
      </section>

      <section className="stack tight">
        <h2>الموظفات</h2>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>الموظفة</th><th className="end">زيارات</th><th className="end">الإيراد</th><th>الإشغال</th><th className="end">غياب</th><th className="end">العمولة</th></tr></thead>
            <tbody>
              {staffRows.map(r => (
                <tr key={r.s.id}>
                  <td><span className="row tight"><span className="av" style={{ background: r.s.color, width: 24, height: 24, fontSize: 11 }}>{r.s.name.charAt(0)}</span>{r.s.name}</span></td>
                  <td className="end num">{r.done}</td>
                  <td className="end num">{sar(r.revenue)}</td>
                  <td><span className="row tight" style={{ flexWrap: 'nowrap' }}><span className="meter" style={{ width: 90 }}><i style={{ width: pct(Math.min(1, r.occ)) }} /></span><span className="num small">{pct(r.occ)}</span></span></td>
                  <td className="end num">{r.noShow}</td>
                  <td className="end num">{sar(r.revenue * Number(r.s.commission_pct) / 100)} <span className="faint tiny">({Number(r.s.commission_pct)}%)</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="stack tight">
          <h2>الخدمات</h2>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>الخدمة</th><th className="end">مرات</th><th className="end">الإيراد</th></tr></thead>
              <tbody>{bySvc.map(s => <tr key={s.name}><td>{s.name}</td><td className="end num">{s.n}</td><td className="end num">{sar(s.revenue)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
        <div className="stack">
          <section className="panel panel-pad stack tight">
            <h2>من وين تجي الحجوزات</h2>
            {bySrc.map(s => (
              <div key={s.source} className="stack" style={{ gap: 4 }}>
                <div className="row spread small"><span>{SOURCE_LABEL[s.source]}</span><span className="num">{s.n} · {pct(s.n / srcTotal)}</span></div>
                <div className="meter"><i style={{ width: pct(s.n / srcTotal) }} /></div>
              </div>
            ))}
          </section>
          <section className="panel panel-pad">
            <div className="row spread"><h2>أوقات الذروة</h2>{peak && <span className="small muted">أزحم ساعة {fmtTime(peak.h * 60)}</span>}</div>
            <div className="bars" style={{ height: 110 }} role="img" aria-label="عدد الحجوزات حسب الساعة">
              {hours.map(h => { const n = byHour.find(x => x.h === h)?.n ?? 0; return <div key={h} className={'b' + (peak && h === peak.h ? ' hi' : '')} style={{ height: `${Math.max(2, n / maxH * 100)}%` }} title={`${fmtTime(h * 60)}: ${n}`} />; })}
            </div>
            <div className="bars-x">{hours.map(h => <span key={h}>{h % 2 === 0 ? (h % 12 || 12) : ''}</span>)}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
