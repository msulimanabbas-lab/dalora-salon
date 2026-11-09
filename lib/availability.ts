import 'server-only';
import { sql } from './db';
import { getSalon, getServices, getStaff, type Salon, type Service, type Staff } from './data';
import { addDays, localParts, nowMinIn, todayIn, weekdayOf, zoned } from './time';

export type SlotQuery = {
  salonId: string; day: string; serviceIds: string[]; staffId: string | 'any';
  location: 'salon' | 'home'; excludeBookingId?: string; ignoreLead?: boolean;
};
export type Slot = { min: number; staffId: string };

export function totalsOf(services: Service[], ids: string[]) {
  let duration = 0, buffer = 0, price = 0;
  for (const id of ids) {
    const s = services.find(x => x.id === id);
    if (!s) continue;
    duration += s.duration_min; buffer = Math.max(buffer, s.buffer_min); price += Number(s.price);
  }
  return { duration, buffer, price };
}

export function qualifiedStaff(staff: Staff[], services: Service[], ids: string[], location: 'salon' | 'home') {
  return staff.filter(st => st.active && (location === 'salon' || st.works_home) &&
    ids.every(id => services.find(s => s.id === id)?.staff_ids.includes(st.id)));
}

/** Busy intervals per staff member for one local day, in minutes after local midnight. */
async function busyMinutes(salon: Salon, day: string, staffIds: string[], excludeBookingId?: string) {
  const from = zoned(day, 0, salon.timezone), to = zoned(addDays(day, 1), 0, salon.timezone);
  const busy = new Map<string, [number, number][]>(staffIds.map(id => [id, []]));
  if (!staffIds.length) return busy;
  const toMin = (d: Date) => Math.round((d.getTime() - from.getTime()) / 60000);
  const rows = await sql`
    SELECT staff_id, lower(occupied) AS a, upper(occupied) AS z FROM bookings
    WHERE salon_id = ${salon.id} AND staff_id = ANY(${staffIds}::uuid[])
      AND status NOT IN ('cancelled', 'no_show') AND occupied && tstzrange(${from}, ${to}, '[)')
      ${excludeBookingId ? sql`AND id <> ${excludeBookingId}` : sql``}
    UNION ALL
    SELECT staff_id, starts_at, ends_at FROM staff_time_off
    WHERE salon_id = ${salon.id} AND staff_id = ANY(${staffIds}::uuid[]) AND starts_at < ${to} AND ends_at > ${from}`;
  for (const r of rows) busy.get(r.staff_id)!.push([toMin(r.a), toMin(r.z)]);
  return busy;
}

export async function findSlots(q: SlotQuery) {
  const [salon, services, staff] = await Promise.all([getSalon(q.salonId), getServices(q.salonId), getStaff(q.salonId)]);
  const { duration, buffer, price } = totalsOf(services, q.serviceIds);
  const travel = q.location === 'home' ? salon.travel_mins : 0;
  const empty = { slots: [] as Slot[], duration, buffer, price, travel, salon };
  if (!q.serviceIds.length || duration === 0) return empty;

  const wd = String(weekdayOf(q.day));
  let cands = qualifiedStaff(staff, services, q.serviceIds, q.location).filter(st => st.week?.[wd]);
  if (q.staffId !== 'any') cands = cands.filter(st => st.id === q.staffId);
  if (!cands.length) return empty;

  const busy = await busyMinutes(salon, q.day, cands.map(c => c.id), q.excludeBookingId);
  const today = todayIn(salon.timezone);
  let earliest = 0;
  if (!q.ignoreLead) {
    if (q.day < today) return empty;
    if (q.day === today) earliest = nowMinIn(salon.timezone) + salon.lead_mins;
  }
  const step = salon.slot_step;
  const slots: Slot[] = [];
  for (let t = Math.ceil(salon.opens_min / step) * step; t < salon.closes_min; t += step) {
    if (t < earliest) continue;
    for (const st of cands) {
      const [s0, e0] = st.week[wd];
      const open = Math.max(s0, salon.opens_min), close = Math.min(e0, salon.closes_min);
      if (t < open || t + duration + buffer > close) continue;
      const a = t - travel, z = t + duration + buffer + travel;
      if (busy.get(st.id)!.some(([x, y]) => a < y && x < z)) continue;
      slots.push({ min: t, staffId: st.id });
      break;
    }
  }
  return { slots, duration, buffer, price, travel, salon };
}

export function minuteOfDay(d: Date, tz: string) { return localParts(d, tz).min; }
