import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getSalon } from '@/lib/data';
import { displayPhone, sar, SOURCE_LABEL, STATUS_LABEL } from '@/lib/format';
import { fmtDay, fmtTime, localParts } from '@/lib/time';
import { CustomerEditor } from './CustomerEditor';

export const dynamic = 'force-dynamic';

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage('customers');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [c] = await sql`SELECT * FROM customers WHERE id = ${id} AND salon_id = ${ctx.salonId}`;
  if (!c) notFound();
  const salon = await getSalon(ctx.salonId);
  const history = await sql`
    SELECT b.id, b.code, b.starts_at, b.status, b.total, b.paid, b.source, s.name AS staff,
           (SELECT string_agg(i.name, ' + ' ORDER BY i.sort) FROM booking_items i WHERE i.booking_id = b.id) AS services
    FROM bookings b JOIN staff s ON s.id = b.staff_id
    WHERE b.customer_id = ${id} ORDER BY b.starts_at DESC LIMIT 100`;
  const done = history.filter(h => h.status === 'done');
  const spend = done.reduce((s, h) => s + Number(h.total), 0);
  const noShows = history.filter(h => h.status === 'no_show').length;
  const owed = history.filter(h => !['cancelled', 'no_show'].includes(h.status)).reduce((s, h) => s + Math.max(0, Number(h.total) - Number(h.paid)), 0);
  const favStaff = Object.entries(done.reduce<Record<string, number>>((a, h) => { a[h.staff] = (a[h.staff] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1])[0]?.[0];
  const gaps = done.slice(0, 6).map(h => new Date(h.starts_at).getTime()).sort((a, b) => a - b);
  const avgGap = gaps.length > 2 ? Math.round((gaps[gaps.length - 1] - gaps[0]) / (gaps.length - 1) / 864e5) : null;
  const upcoming = history.filter(h => ['booked', 'arrived'].includes(h.status) && new Date(h.starts_at) > new Date()).pop();

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="small"><Link href="/customers" className="faint">العميلات</Link></p>
          <h1>{c.name}</h1>
          <p className="sub"><span className="ltr num" style={{ userSelect: 'all' }}>{displayPhone(c.phone)}</span> · عميلة من {fmtDay(localParts(new Date(c.created_at), salon.timezone).day, true)}</p>
        </div>
        <Link className="btn primary" href={`/schedule?c=${c.id}`}>حجز جديد لها</Link>
      </div>

      <div className="figures">
        <div><div className="k">الزيارات</div><div className="v">{done.length}</div></div>
        <div><div className="k">مجموع الصرف</div><div className="v">{sar(spend)}</div><div className="d">متوسط {sar(done.length ? spend / done.length : 0)}</div></div>
        <div><div className="k">الغياب</div><div className="v" style={noShows ? { color: 'var(--bad)' } : undefined}>{noShows}</div></div>
        <div><div className="k">تزور كل</div><div className="v">{avgGap ? `${avgGap} يوم` : '—'}</div><div className="d">{favStaff ? `تفضّل ${favStaff}` : ''}</div></div>
      </div>
      {owed > 0.001 && <p className="notice warn">عليها مبلغ متبقي {sar(owed)} من حجوزات سابقة أو قادمة.</p>}
      {upcoming && <p className="notice info">موعدها الجاي: {fmtDay(localParts(new Date(upcoming.starts_at), salon.timezone).day)} · {fmtTime(localParts(new Date(upcoming.starts_at), salon.timezone).min)} مع {upcoming.staff}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 16 }} className="cust-grid">
        <CustomerEditor customer={{ id: c.id, name: c.name, notes: c.notes, allergies: c.allergies, tags: c.tags }} />
        <section className="stack tight" style={{ minWidth: 0 }}>
          <h2>السجل</h2>
          {history.length === 0 ? <div className="panel empty"><p>ما عندها حجوزات للحين.</p></div> : (
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>التاريخ</th><th>الخدمات</th><th>الموظفة</th><th>الحالة</th><th className="end">المبلغ</th></tr></thead>
                <tbody>
                  {history.map(h => {
                    const p = localParts(new Date(h.starts_at), salon.timezone);
                    return (
                      <tr key={h.id}>
                        <td className="num"><Link href={`/schedule?d=${p.day}&b=${h.id}`} style={{ textDecoration: 'none' }}>{fmtDay(p.day)}</Link><div className="tiny faint">{fmtTime(p.min)} · {SOURCE_LABEL[h.source]}</div></td>
                        <td>{h.services}</td>
                        <td>{h.staff}</td>
                        <td><span className={'tag ' + ({ done: 'ok', no_show: 'bad', cancelled: 'mute', booked: 'info', arrived: 'warn', in_service: 'info' } as Record<string, string>)[h.status]}>{STATUS_LABEL[h.status]}</span></td>
                        <td className="end num">{sar(h.total)}{Number(h.total) - Number(h.paid) > 0.001 && !['cancelled', 'no_show'].includes(h.status) && <div className="tiny" style={{ color: 'var(--warn)' }}>باقي {sar(Number(h.total) - Number(h.paid))}</div>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <style>{`@media (max-width: 899px){ .cust-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
