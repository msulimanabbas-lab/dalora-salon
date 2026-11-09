import Link from 'next/link';
import { requirePage, can } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getSalon } from '@/lib/data';
import { METHOD_LABEL, sar } from '@/lib/format';
import { addDays, fmtDay, fmtShortDay, fmtTime, isDay, localParts, todayIn, zoned } from '@/lib/time';
import { DayNav } from '@/components/DayNav';
import { CloseDay } from './CloseDay';

export const metadata = { title: 'المال' };
export const dynamic = 'force-dynamic';

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const ctx = await requirePage('money');
  const sp = await searchParams;
  const salon = await getSalon(ctx.salonId);
  const today = todayIn(salon.timezone);
  const day = isDay(sp.d) ? sp.d : today;
  const from = zoned(day, 0, salon.timezone), to = zoned(addDays(day, 1), 0, salon.timezone);

  const [payments, [close], due, history] = await Promise.all([
    sql`SELECT p.id, p.method, p.kind, p.amount, p.created_at, p.booking_id, b.code, c.name AS customer, COALESCE(u.name,'') AS by
        FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id LEFT JOIN customers c ON c.id = p.customer_id LEFT JOIN users u ON u.id = p.received_by
        WHERE p.salon_id = ${ctx.salonId} AND p.business_date = ${day} ORDER BY p.created_at DESC`,
    sql`SELECT d.*, COALESCE(u.name,'') AS by FROM day_closes d LEFT JOIN users u ON u.id = d.closed_by WHERE d.salon_id = ${ctx.salonId} AND d.business_date = ${day}`,
    sql`SELECT b.id, b.code, b.starts_at, b.status, b.total, b.paid, c.name AS customer, s.name AS staff
        FROM bookings b JOIN customers c ON c.id = b.customer_id JOIN staff s ON s.id = b.staff_id
        WHERE b.salon_id = ${ctx.salonId} AND b.starts_at >= ${from} AND b.starts_at < ${to}
          AND b.status NOT IN ('cancelled','no_show') AND b.total - b.paid > 0.001 ORDER BY b.starts_at`,
    sql`SELECT business_date, expected_cash, counted_cash, difference, card_total, online_total, transfer_total
        FROM day_closes WHERE salon_id = ${ctx.salonId} AND business_date < ${day} ORDER BY business_date DESC LIMIT 10`,
  ]);

  const sign = (p: { kind: string; amount: number }) => (p.kind === 'refund' ? -1 : 1) * Number(p.amount);
  const by = (m: string) => payments.filter(p => p.method === m).reduce((s, p) => s + sign(p as never), 0);
  const net = payments.reduce((s, p) => s + sign(p as never), 0);
  const refunds = payments.filter(p => p.kind === 'refund').reduce((s, p) => s + Number(p.amount), 0);
  const owed = due.reduce((s, b) => s + Number(b.total) - Number(b.paid), 0);
  const cash = by('cash');

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>المال · {day === today ? 'اليوم' : fmtDay(day)}</h1>
          <p className="sub">{day === today ? fmtDay(day) + ' · ' : ''}{close ? 'الصندوق مقفل' : 'الصندوق مفتوح'}</p>
        </div>
        <DayNav day={day} today={today} base="/money" />
      </div>

      <div className="figures">
        <div><div className="k">المحصّل</div><div className="v">{sar(net)}</div><div className="d">{payments.length} عملية{refunds ? ` · استرجاع ${sar(refunds)}` : ''}</div></div>
        <div><div className="k">كاش</div><div className="v">{sar(cash)}</div></div>
        <div><div className="k">شبكة</div><div className="v">{sar(by('card'))}</div></div>
        <div><div className="k">إلكتروني وتحويل</div><div className="v">{sar(by('online') + by('transfer'))}</div></div>
        <div><div className="k">متبقي على حجوزات اليوم</div><div className="v" style={owed ? { color: 'var(--warn)' } : undefined}>{sar(owed)}</div><div className="d">{due.length} حجز</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 16, alignItems: 'start' }} className="money-grid">
        <div className="stack">
          <section className="stack tight">
            <h2>العمليات</h2>
            {payments.length === 0 ? <div className="panel empty"><p>ما فيه مبالغ مسجّلة بهاليوم.</p></div> : (
              <div className="table-wrap">
                <table className="t">
                  <thead><tr><th>الوقت</th><th>العميلة</th><th>النوع</th><th>الطريقة</th><th>بواسطة</th><th className="end">المبلغ</th></tr></thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id}>
                        <td className="num">{fmtTime(localParts(new Date(p.created_at), salon.timezone).min)}</td>
                        <td>{p.customer || '—'} {p.code && <span className="faint tiny ltr">{p.code}</span>}</td>
                        <td>{p.kind === 'refund' ? <span className="tag bad">استرجاع</span> : p.kind === 'deposit' ? <span className="tag info">عربون</span> : 'دفع'}</td>
                        <td>{METHOD_LABEL[p.method]}</td>
                        <td className="faint">{p.by}</td>
                        <td className="end num" style={p.kind === 'refund' ? { color: 'var(--bad)' } : undefined}>{p.kind === 'refund' ? '− ' : ''}{sar(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan={5}>الصافي</td><td className="end num">{sar(net)}</td></tr></tfoot>
                </table>
              </div>
            )}
          </section>

          {due.length > 0 && (
            <section className="stack tight">
              <h2>حجوزات عليها مبلغ</h2>
              <div className="table-wrap">
                <table className="t">
                  <thead><tr><th>الوقت</th><th>العميلة</th><th>الموظفة</th><th className="end">الإجمالي</th><th className="end">المتبقي</th></tr></thead>
                  <tbody>
                    {due.map(b => (
                      <tr key={b.id}>
                        <td className="num">{fmtTime(localParts(new Date(b.starts_at), salon.timezone).min)}</td>
                        <td><Link href={`/schedule?d=${day}&b=${b.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{b.customer}</Link></td>
                        <td>{b.staff}</td>
                        <td className="end num">{sar(b.total)}</td>
                        <td className="end num" style={{ color: 'var(--warn)', fontWeight: 600 }}>{sar(Number(b.total) - Number(b.paid))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <div className="stack">
          {close ? (
            <section className="panel panel-pad stack tight">
              <div className="row spread"><h2>إقفال اليوم</h2><span className="tag ok">مقفل</span></div>
              <div className="kv"><span>الكاش حسب النظام</span><span className="num">{sar(close.expected_cash)}</span></div>
              <div className="kv"><span>الكاش الفعلي بالدرج</span><span className="num">{sar(close.counted_cash)}</span></div>
              <div className="kv"><span><b style={{ color: 'var(--ink)' }}>الفرق</b></span>
                <b className="num" style={{ color: Number(close.difference) === 0 ? 'var(--ok)' : 'var(--bad)' }}>{Number(close.difference) === 0 ? 'مطابق' : sar(close.difference)}</b></div>
              <div className="kv"><span>شبكة / إلكتروني / تحويل</span><span className="num">{sar(close.card_total)} · {sar(close.online_total)} · {sar(close.transfer_total)}</span></div>
              {close.note && <div className="kv"><span>ملاحظة</span><span>{close.note}</span></div>}
              <p className="tiny faint">أقفلته {close.by} · {fmtTime(localParts(new Date(close.closed_at), salon.timezone).min)}</p>
              {can(ctx, 'settings') && <CloseDay day={day} expected={cash} mode="reopen" />}
            </section>
          ) : can(ctx, 'closeDay') ? (
            day > today ? <section className="panel panel-pad"><p className="muted">الإقفال يكون في نفس اليوم أو بعده.</p></section>
              : <CloseDay day={day} expected={cash} mode="close" />
          ) : null}

          {history.length > 0 && (
            <section className="stack tight">
              <h2>آخر الإقفالات</h2>
              <div className="table-wrap">
                <table className="t">
                  <thead><tr><th>اليوم</th><th className="end">الإجمالي</th><th className="end">فرق الكاش</th></tr></thead>
                  <tbody>
                    {history.map(h => {
                      const d = typeof h.business_date === 'string' ? h.business_date : localParts(new Date(h.business_date), 'UTC').day;
                      const total = Number(h.expected_cash) + Number(h.card_total) + Number(h.online_total) + Number(h.transfer_total);
                      return (
                        <tr key={d}>
                          <td><Link href={`/money?d=${d}`} style={{ textDecoration: 'none' }}>{fmtShortDay(d)}</Link></td>
                          <td className="end num">{sar(total)}</td>
                          <td className="end num" style={{ color: Number(h.difference) === 0 ? 'var(--ok)' : 'var(--bad)' }}>{Number(h.difference) === 0 ? 'مطابق' : sar(h.difference)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
      <style>{`@media (max-width: 999px){ .money-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
