import Link from 'next/link';
import { requirePage } from '@/lib/auth';
import { getSalon } from '@/lib/data';
import { sar } from '@/lib/format';
import { fmtDuration, fmtShortDay, fmtTime, MONTHS, todayIn } from '@/lib/time';
import { isMonth, monthBounds, staffMonth, staffMonthDetail, type StaffMonth } from '@/lib/staffReport';
import { PrintButton } from '@/components/PrintButton';

export const metadata = { title: 'تقرير المختصات' };
export const dynamic = 'force-dynamic';

const monthName = (m: string) => { const [y, mo] = m.split('-').map(Number); return `${MONTHS[mo - 1]} ${y}`; };
const hrs = (min: number) => fmtDuration(Math.max(0, Math.round(min)));
const pctOver = (r: StaffMonth) => (r.plannedMin > 0 && r.measured > 0 ? Math.round((r.actualMin / r.plannedMin - 1) * 100) : null);

export default async function StaffReportPage({ searchParams }: { searchParams: Promise<{ m?: string; s?: string }> }) {
  const ctx = await requirePage('reports');
  const sp = await searchParams;
  const salon = await getSalon(ctx.salonId);
  const m = isMonth(sp.m) ? sp.m : todayIn(salon.timezone).slice(0, 7);
  const { prev, next } = monthBounds(m);
  const rows = await staffMonth(ctx.salonId, salon.timezone, m);
  const one = sp.s ? rows.find(r => r.id === sp.s) : undefined;

  const nav = (
    <div className="row tight no-print">
      <Link className="btn icon" href={`/reports/staff?m=${prev}${one ? `&s=${one.id}` : ''}`} aria-label="الشهر السابق">›</Link>
      <span className="btn" style={{ cursor: 'default' }}>{monthName(m)}</span>
      <Link className="btn icon" href={`/reports/staff?m=${next}${one ? `&s=${one.id}` : ''}`} aria-label="الشهر التالي">‹</Link>
      <PrintButton />
    </div>
  );

  if (one) return <Detail r={one} m={m} nav={nav} salonId={ctx.salonId} tz={salon.timezone} />;

  const active = rows.filter(r => r.done > 0 || r.noShow > 0);
  const tot = active.reduce((t, r) => ({ customers: t.customers + r.customers, services: t.services + r.services, work: t.work + r.workMin, revenue: t.revenue + r.revenue, flagged: t.flagged + (r.flags.some(f => f.tone !== 'ok') ? 1 : 0) }), { customers: 0, services: 0, work: 0, revenue: 0, flagged: 0 });
  const ranked = [...active].sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>تقرير المختصات</h1><p className="sub">{monthName(m)} · {salon.name}</p></div>
        {nav}
      </div>
      <div className="figures">
        <div><div className="k">مختصات اشتغلن</div><div className="v">{active.length}</div></div>
        <div><div className="k">عميلات</div><div className="v">{tot.customers}</div><div className="d">العميلة تنحسب عند كل مختصة خدمتها</div></div>
        <div><div className="k">خدمات</div><div className="v">{tot.services}</div></div>
        <div><div className="k">وقت الخدمة</div><div className="v" style={{ fontSize: 22 }}>{hrs(tot.work)}</div></div>
        <div><div className="k">يحتاجن متابعة</div><div className="v" style={tot.flagged ? { color: 'var(--warn)' } : undefined}>{tot.flagged}</div><div className="d">تأخير، وقت زايد، غياب، أو نزول</div></div>
      </div>
      {active.length === 0 ? <div className="panel empty"><h3>ما فيه خدمات منتهية بهالشهر</h3><p>التقرير يتعبى من الحجوزات اللي تنتهي.</p></div> : (
        <div className="sr-grid">
          {ranked.map((r, i) => <Card key={r.id} r={r} m={m} rank={i + 1} />)}
        </div>
      )}
      <p className="tiny faint">الوقت الفعلي يتسجل لما تضغط المختصة "بدء الخدمة" و"انتهت". التأخير من موعد الحجز لبداية الخدمة، والانتظار من وصول العميلة لبداية الخدمة.</p>
    </div>
  );
}

function Card({ r, m, rank }: { r: StaffMonth; m: string; rank: number }) {
  const over = pctOver(r);
  return (
    <Link href={`/reports/staff?m=${m}&s=${r.id}`} className="sr-card">
      <div className="sr-head">
        <span className="av" style={{ background: r.color }}>{r.name.charAt(0)}</span>
        <span style={{ flex: 1, minWidth: 0 }}><b>{r.name}</b><span className="tiny faint" style={{ display: 'block' }}>{r.title || 'مختصة'} · #{rank}</span></span>
        <span className="sr-rev"><b className="num">{sar(r.revenue)}</b>{r.prevRevenue > 0 && <span className={'tiny ltr ' + (r.revenue >= r.prevRevenue ? 'ok' : 'bad')}>{r.revenue >= r.prevRevenue ? '▲' : '▼'} {Math.abs(Math.round((r.revenue / r.prevRevenue - 1) * 100))}%</span>}</span>
      </div>
      <div className="sr-nums">
        <div><b className="num">{r.customers}</b><span>عميلة</span></div>
        <div><b className="num">{r.services}</b><span>خدمة</span></div>
        <div><b className="num">{Math.round(r.workMin / 6) / 10}</b><span>ساعة</span></div>
        <div><b className="num ltr">{over == null ? '—' : `${over > 0 ? '+' : ''}${over}%`}</b><span>عن الوقت المحدد</span></div>
        <div><b className="num">{r.startDelay == null ? '—' : Math.round(r.startDelay)}</b><span>دقيقة تأخير</span></div>
      </div>
      {r.flags.length > 0 && <div className="sr-flags">{r.flags.map(f => <span key={f.text} className={'tag ' + f.tone}>{f.text}</span>)}</div>}
      {r.topService && <p className="tiny muted">أكثر خدمة: {r.topService}{r.returning ? ` · ${r.returning} عميلة رجعت لها` : ''}</p>}
    </Link>
  );
}

async function Detail({ r, m, nav, salonId, tz }: { r: StaffMonth; m: string; nav: React.ReactNode; salonId: string; tz: string }) {
  const list = await staffMonthDetail(salonId, tz, m, r.id);
  const over = pctOver(r);
  // per customer: visits, services, time she took, spend
  const byC = new Map<string, { name: string; visits: number; services: number; minutes: number; spend: number; noShow: number }>();
  for (const x of list) {
    const c = byC.get(x.customerId) ?? { name: x.customer, visits: 0, services: 0, minutes: 0, spend: 0, noShow: 0 };
    if (x.status === 'done') { c.visits++; c.services += x.services.length; c.minutes += x.actualMin ?? x.plannedMin; c.spend += x.total; }
    if (x.status === 'no_show') c.noShow++;
    byC.set(x.customerId, c);
  }
  const customers = [...byC.values()].filter(c => c.visits || c.noShow).sort((a, b) => b.minutes - a.minutes);
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <Link href={`/reports/staff?m=${m}`} className="small no-print" style={{ color: 'var(--rose-ink)', textDecoration: 'none' }}>كل المختصات</Link>
          <h1 style={{ marginTop: 4 }}>{r.name}</h1>
          <p className="sub">{r.title || 'مختصة'} · {monthName(m)}</p>
        </div>
        {nav}
      </div>
      <div className="figures">
        <div><div className="k">الإيراد</div><div className="v">{sar(r.revenue)}</div>{r.commissionPct > 0 && <div className="d">عمولتها {sar(r.revenue * r.commissionPct / 100)} ({r.commissionPct}%)</div>}</div>
        <div><div className="k">عميلات</div><div className="v">{r.customers}</div><div className="d">{r.returning ? `${r.returning} رجعن لها من قبل` : 'كلهن جدد عليها'}</div></div>
        <div><div className="k">خدمات</div><div className="v">{r.services}</div><div className="d">{r.done} زيارة · {r.noShow} غياب</div></div>
        <div><div className="k">الوقت الفعلي</div><div className="v" style={{ fontSize: 22 }}>{hrs(r.workMin)}</div><div className="d">{over == null ? '' : <><span className="ltr">{`${over > 0 ? '+' : ''}${over}%`}</span> عن الوقت المحدد</>}</div></div>
        <div><div className="k">تبدأ بعد الموعد</div><div className="v">{r.startDelay == null ? '—' : `${Math.round(r.startDelay)} د`}</div><div className="d">{r.wait == null ? '' : `العميلة تنتظر ${Math.round(r.wait)} د بالمتوسط`}</div></div>
      </div>
      {r.flags.length > 0 && <div className="sr-flags">{r.flags.map(f => <span key={f.text} className={'tag ' + f.tone}>{f.text}</span>)}</div>}

      <section className="stack tight">
        <h2>العميلات ({customers.length})</h2>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>العميلة</th><th className="end">زيارات</th><th className="end">خدمات</th><th className="end">أخذت من وقتها</th><th className="end">دفعت</th></tr></thead>
            <tbody>{customers.map(c => (
              <tr key={c.name + c.visits}><td>{c.name}{c.noShow ? <span className="tag bad" style={{ marginInlineStart: 6 }}>{c.noShow} غياب</span> : null}</td>
                <td className="end num">{c.visits}</td><td className="end num">{c.services}</td><td className="end num">{hrs(c.minutes)}</td><td className="end num">{sar(c.spend)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="stack tight">
        <h2>كل خدمة ({list.filter(x => x.status === 'done').length})</h2>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>اليوم</th><th>العميلة</th><th>الخدمة</th><th className="end">المحدد</th><th className="end">الفعلي</th><th className="end">انتظرت</th></tr></thead>
            <tbody>{list.map(x => {
              const diff = x.actualMin == null ? null : x.actualMin - x.plannedMin;
              return (
                <tr key={x.id} style={x.status === 'no_show' ? { opacity: .6 } : undefined}>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>{fmtShortDay(x.day)} <span className="faint tiny">{fmtTime(x.startMin)}</span></td>
                  <td>{x.customer}</td>
                  <td className="small">{x.status === 'no_show' ? <span className="tag bad">غياب</span> : x.services.join(' + ')}</td>
                  <td className="end num">{x.plannedMin} د</td>
                  <td className="end num">{x.actualMin == null ? '—' : <>{x.actualMin} د {diff != null && Math.abs(diff) >= 5 && <span className={'tiny ltr ' + (diff > 0 ? 'bad' : 'ok')}>({diff > 0 ? '+' : ''}{diff})</span>}</>}</td>
                  <td className="end num">{x.wait == null || x.status !== 'done' ? '—' : `${x.wait} د`}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
