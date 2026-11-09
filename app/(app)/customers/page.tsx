import Link from 'next/link';
import { requirePage } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getSalon } from '@/lib/data';
import { displayPhone, sar } from '@/lib/format';
import { fmtShortDay, localParts } from '@/lib/time';
import { CustomerSearch } from './CustomerSearch';

export const metadata = { title: 'العميلات' };
export const dynamic = 'force-dynamic';

const SORTS = { recent: 'آخر زيارة', spend: 'الأكثر صرفاً', visits: 'الأكثر زيارة', lapsed: 'غابت أكثر من 45 يوم' } as const;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string }> }) {
  const ctx = await requirePage('customers');
  const sp = await searchParams;
  const salon = await getSalon(ctx.salonId);
  const q = (sp.q || '').trim();
  const sort = (sp.sort && sp.sort in SORTS ? sp.sort : 'recent') as keyof typeof SORTS;
  const digits = q.replace(/\D/g, '').replace(/^0/, '');
  const rows = await sql`
    WITH s AS (
      SELECT c.id, c.name, c.phone, c.tags, c.allergies,
        count(b.*) FILTER (WHERE b.status = 'done')::int AS visits,
        count(b.*) FILTER (WHERE b.status = 'no_show')::int AS no_shows,
        COALESCE(sum(b.total) FILTER (WHERE b.status = 'done'), 0) AS spend,
        max(b.starts_at) FILTER (WHERE b.status = 'done') AS last_visit,
        min(b.starts_at) FILTER (WHERE b.status IN ('booked','arrived') AND b.starts_at > now()) AS next_visit
      FROM customers c LEFT JOIN bookings b ON b.customer_id = c.id
      WHERE c.salon_id = ${ctx.salonId}
        ${q ? sql`AND (c.name ILIKE ${'%' + q + '%'} ${digits.length >= 3 ? sql`OR c.phone LIKE ${'%' + digits + '%'}` : sql``})` : sql``}
      GROUP BY c.id
    )
    SELECT * FROM s
    ${sort === 'lapsed' ? sql`WHERE last_visit < now() - interval '45 days' AND next_visit IS NULL` : sql``}
    ORDER BY ${sort === 'spend' ? sql`spend DESC` : sort === 'visits' ? sql`visits DESC` : sql`last_visit DESC NULLS LAST`}, name
    LIMIT 200`;
  const [tot] = await sql`SELECT count(*)::int AS n FROM customers WHERE salon_id = ${ctx.salonId}`;

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>العميلات</h1><p className="sub">{tot.n} عميلة مسجّلة. كل عميلة تحجز من التطبيق أو الهاتف تنضاف هنا تلقائياً.</p></div>
      </div>
      <div className="row spread">
        <CustomerSearch q={q} />
        <div className="chips" role="group" aria-label="الترتيب">
          {Object.entries(SORTS).map(([k, l]) => (
            <Link key={k} href={`/customers?sort=${k}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className="chip" aria-pressed={sort === k} style={{ textDecoration: 'none' }}>{l}</Link>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="panel empty"><h3>{q ? `ما لقينا "${q}"` : 'ما فيه عميلات بهالتصنيف'}</h3><p>جربي اسم ثاني أو آخر أرقام الجوال.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>العميلة</th><th>الجوال</th><th className="end">الزيارات</th><th className="end">الصرف</th><th>آخر زيارة</th><th>الموعد الجاي</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/customers/${r.id}`} style={{ fontWeight: 600, textDecoration: 'none' }}>{r.name}</Link>
                    {r.tags?.map((t: string) => <span key={t} className="tag plum" style={{ marginInlineStart: 6 }}>{t}</span>)}
                    {r.no_shows > 0 && <span className="tag bad" style={{ marginInlineStart: 6 }}>{r.no_shows} غياب</span>}
                    {r.allergies && <span className="tag warn" style={{ marginInlineStart: 6 }}>تنبيه</span>}
                  </td>
                  <td><span className="ltr num">{displayPhone(r.phone)}</span></td>
                  <td className="end num">{r.visits}</td>
                  <td className="end num">{sar(r.spend)}</td>
                  <td className="num">{r.last_visit ? fmtShortDay(localParts(new Date(r.last_visit), salon.timezone).day) : <span className="faint">—</span>}</td>
                  <td className="num">{r.next_visit ? fmtShortDay(localParts(new Date(r.next_visit), salon.timezone).day) : <span className="faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
