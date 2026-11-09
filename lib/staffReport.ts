import 'server-only';
import { sql } from './db';
import { zoned } from './time';

/**
 * The monthly report per specialist: who she served, what she did, how long it really took
 * (from the arrival / start / finish times the desk and the specialist record), and what needs attention.
 */

export const monthBounds = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${pad(mo + 1)}`;
  const prev = mo === 1 ? `${y - 1}-12` : `${y}-${pad(mo - 1)}`;
  return { first: `${m}-01`, nextFirst: `${next}-01`, prev, next };
};
export const isMonth = (m?: string): m is string => !!m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export type Flag = { tone: 'bad' | 'warn' | 'ok'; text: string };
export type StaffMonth = {
  id: string; name: string; title: string; color: string; commissionPct: number;
  done: number; customers: number; services: number; noShow: number; cancelled: number;
  revenue: number; prevRevenue: number;
  plannedMin: number; actualMin: number;      // over bookings with a recorded start and finish
  workMin: number;                             // all finished time (actual when recorded, else planned)
  startDelay: number | null; wait: number | null; overruns: number; measured: number;
  returning: number; topService: string | null;
  flags: Flag[];
};

export async function staffMonth(salonId: string, tz: string, m: string): Promise<StaffMonth[]> {
  const { first, nextFirst, prev } = monthBounds(m);
  const a = zoned(first, 0, tz), z = zoned(nextFirst, 0, tz), pa = zoned(`${prev}-01`, 0, tz);
  const [staff, stats, items, top, back, before] = await Promise.all([
    sql`SELECT id, name, title, color, commission_pct, active FROM staff WHERE salon_id = ${salonId} ORDER BY sort, name`,
    sql`SELECT staff_id,
          count(*) FILTER (WHERE status = 'done')::int AS done,
          count(DISTINCT customer_id) FILTER (WHERE status = 'done')::int AS customers,
          count(*) FILTER (WHERE status = 'no_show')::int AS no_show,
          count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
          COALESCE(sum(total) FILTER (WHERE status = 'done'), 0) AS revenue,
          COALESCE(sum(extract(epoch FROM ends_at - starts_at) / 60) FILTER (WHERE status = 'done' AND started_at IS NOT NULL AND finished_at IS NOT NULL), 0)::int AS planned_min,
          COALESCE(sum(extract(epoch FROM finished_at - started_at) / 60) FILTER (WHERE status = 'done' AND started_at IS NOT NULL AND finished_at IS NOT NULL), 0)::int AS actual_min,
          COALESCE(sum(extract(epoch FROM COALESCE(finished_at - started_at, ends_at - starts_at)) / 60) FILTER (WHERE status = 'done'), 0)::int AS work_min,
          count(*) FILTER (WHERE status = 'done' AND started_at IS NOT NULL AND finished_at IS NOT NULL)::int AS measured,
          count(*) FILTER (WHERE status = 'done' AND finished_at - started_at > (ends_at - starts_at) * 1.15)::int AS overruns,
          avg(GREATEST(0, extract(epoch FROM started_at - starts_at) / 60)) FILTER (WHERE status = 'done' AND started_at IS NOT NULL) AS start_delay,
          avg(GREATEST(0, extract(epoch FROM started_at - arrived_at) / 60)) FILTER (WHERE status = 'done' AND started_at IS NOT NULL AND arrived_at IS NOT NULL) AS wait
        FROM bookings WHERE salon_id = ${salonId} AND starts_at >= ${a} AND starts_at < ${z} GROUP BY staff_id`,
    sql`SELECT b.staff_id, count(*)::int AS n FROM booking_items i JOIN bookings b ON b.id = i.booking_id
        WHERE b.salon_id = ${salonId} AND b.starts_at >= ${a} AND b.starts_at < ${z} AND b.status = 'done' GROUP BY b.staff_id`,
    sql`SELECT DISTINCT ON (b.staff_id) b.staff_id, i.name, count(*) AS n FROM booking_items i JOIN bookings b ON b.id = i.booking_id
        WHERE b.salon_id = ${salonId} AND b.starts_at >= ${a} AND b.starts_at < ${z} AND b.status = 'done'
        GROUP BY b.staff_id, i.name ORDER BY b.staff_id, n DESC, i.name`,
    // customers she served this month who had been to her before
    sql`SELECT b.staff_id, count(DISTINCT b.customer_id)::int AS n FROM bookings b
        WHERE b.salon_id = ${salonId} AND b.starts_at >= ${a} AND b.starts_at < ${z} AND b.status = 'done'
          AND EXISTS (SELECT 1 FROM bookings p WHERE p.staff_id = b.staff_id AND p.customer_id = b.customer_id AND p.status = 'done' AND p.starts_at < ${a})
        GROUP BY b.staff_id`,
    sql`SELECT staff_id, COALESCE(sum(total), 0) AS revenue FROM bookings
        WHERE salon_id = ${salonId} AND starts_at >= ${pa} AND starts_at < ${a} AND status = 'done' GROUP BY staff_id`,
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const by = (rows: readonly any[], id: string): any => rows.find(r => r.staff_id === id);

  return staff.map(s => {
    const r = by(stats, s.id) as Record<string, number> | undefined;
    const row: StaffMonth = {
      id: s.id, name: s.name, title: s.title, color: s.color, commissionPct: Number(s.commission_pct),
      done: r?.done ?? 0, customers: r?.customers ?? 0, services: by(items, s.id)?.n ?? 0,
      noShow: r?.no_show ?? 0, cancelled: r?.cancelled ?? 0,
      revenue: Number(r?.revenue ?? 0), prevRevenue: Number(by(before, s.id)?.revenue ?? 0),
      plannedMin: r?.planned_min ?? 0, actualMin: r?.actual_min ?? 0, workMin: r?.work_min ?? 0,
      startDelay: r?.start_delay == null ? null : Number(r.start_delay), wait: r?.wait == null ? null : Number(r.wait),
      overruns: r?.overruns ?? 0, measured: r?.measured ?? 0,
      returning: by(back, s.id)?.n ?? 0,
      topService: by(top, s.id)?.name ?? null,
      flags: [],
    };
    row.flags = flagsFor(row);
    return { row, active: s.active };
  }).filter(x => x.active || x.row.done > 0).map(x => x.row);
}

/** Plain-words notes on what stands out. Thresholds are deliberately mild: they start a conversation. */
const mins = (n: number) => `${n} ${n >= 3 && n <= 10 ? 'دقايق' : 'دقيقة'}`;

export function flagsFor(r: StaffMonth): Flag[] {
  const f: Flag[] = [];
  if (r.measured >= 3 && r.plannedMin > 0) {
    const over = r.actualMin / r.plannedMin - 1;
    if (over >= 0.1) f.push({ tone: over >= 0.2 ? 'bad' : 'warn', text: `خدماتها تاخذ أطول من وقتها بـ ${Math.round(over * 100)}%` });
    else if (over <= -0.12) f.push({ tone: 'warn', text: `تخلص أسرع من الوقت المحدد بـ ${Math.round(-over * 100)}%` });
  }
  if (r.startDelay != null && r.startDelay >= 6) f.push({ tone: r.startDelay >= 10 ? 'bad' : 'warn', text: `تبدأ متأخرة ${mins(Math.round(r.startDelay))} بالمتوسط` });
  if (r.wait != null && r.wait >= 10) f.push({ tone: 'warn', text: `عميلاتها ينتظرن ${mins(Math.round(r.wait))} بعد ما يوصلن` });
  if (r.noShow >= 2) f.push({ tone: 'warn', text: `${r.noShow} غياب هالشهر` });
  if (r.prevRevenue > 0) {
    const d = r.revenue / r.prevRevenue - 1;
    if (d <= -0.2) f.push({ tone: 'bad', text: `إيرادها نازل ${Math.round(-d * 100)}% عن الشهر الماضي` });
    else if (d >= 0.2) f.push({ tone: 'ok', text: `إيرادها طالع ${Math.round(d * 100)}% عن الشهر الماضي` });
  }
  if (r.customers >= 5 && r.returning / r.customers >= 0.5) f.push({ tone: 'ok', text: `${r.returning} من عميلاتها رجعن لها` });
  return f;
}

export type DetailRow = {
  id: string; day: string; startMin: number; customer: string; customerId: string; services: string[];
  plannedMin: number; actualMin: number | null; wait: number | null; startDelay: number | null; status: string; total: number;
};
export async function staffMonthDetail(salonId: string, tz: string, m: string, staffId: string): Promise<DetailRow[]> {
  const { first, nextFirst } = monthBounds(m);
  const a = zoned(first, 0, tz), z = zoned(nextFirst, 0, tz);
  const rows = await sql`
    SELECT b.id, to_char(b.starts_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
           (extract(hour FROM b.starts_at AT TIME ZONE ${tz}) * 60 + extract(minute FROM b.starts_at AT TIME ZONE ${tz}))::int AS start_min,
           c.name AS customer, c.id AS customer_id, b.status, b.total,
           (extract(epoch FROM b.ends_at - b.starts_at) / 60)::int AS planned,
           (extract(epoch FROM b.finished_at - b.started_at) / 60)::int AS actual,
           (extract(epoch FROM b.started_at - b.arrived_at) / 60)::int AS wait,
           (extract(epoch FROM b.started_at - b.starts_at) / 60)::int AS delay,
           COALESCE((SELECT array_agg(i.name ORDER BY i.sort) FROM booking_items i WHERE i.booking_id = b.id), '{}') AS services
    FROM bookings b JOIN customers c ON c.id = b.customer_id
    WHERE b.salon_id = ${salonId} AND b.staff_id = ${staffId} AND b.starts_at >= ${a} AND b.starts_at < ${z} AND b.status <> 'cancelled'
    ORDER BY b.starts_at`;
  return rows.map(r => ({
    id: r.id, day: r.day, startMin: r.start_min, customer: r.customer, customerId: r.customer_id, services: r.services, status: r.status, total: Number(r.total),
    plannedMin: r.planned, actualMin: r.status === 'done' ? r.actual : null, wait: r.wait == null ? null : Math.max(0, r.wait), startDelay: r.delay,
  }));
}
