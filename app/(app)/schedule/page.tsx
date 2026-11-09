import { requirePage, can } from '@/lib/auth';
import { getBookings, getSalon, getServices, getStaff } from '@/lib/data';
import { bookingView, salonView, serviceView, staffView } from '@/lib/mappers';
import { sql } from '@/lib/db';
import { addDays, isDay, localParts, todayIn, zoned } from '@/lib/time';
import { ScheduleClient } from './ScheduleClient';

export const metadata = { title: 'الجدول' };
export const dynamic = 'force-dynamic';

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ d?: string; b?: string; c?: string }> }) {
  const ctx = await requirePage('schedule');
  const sp = await searchParams;
  const salon = await getSalon(ctx.salonId);
  const day = isDay(sp.d) ? sp.d : todayIn(salon.timezone);
  const from = zoned(day, 0, salon.timezone), to = zoned(addDays(day, 1), 0, salon.timezone);
  const [staff, services, bookings, off] = await Promise.all([
    getStaff(ctx.salonId), getServices(ctx.salonId), getBookings(ctx.salonId, salon.timezone, day),
    sql`SELECT id, staff_id, starts_at, ends_at, reason FROM staff_time_off WHERE salon_id = ${ctx.salonId} AND starts_at < ${to} AND ends_at > ${from}`,
  ]);
  const [seedCustomer] = sp.c && /^[0-9a-f-]{36}$/i.test(sp.c) && can(ctx, 'editBookings')
    ? await sql`SELECT id, name, phone FROM customers WHERE id = ${sp.c} AND salon_id = ${ctx.salonId}` : [];
  const toMin = (d: Date) => { const p = localParts(new Date(d), salon.timezone); return p.day < day ? 0 : p.day > day ? 1440 : p.min; };
  return (
    <ScheduleClient
      day={day}
      salon={salonView(salon)}
      staff={staff.map(staffView)}
      services={services.map(serviceView)}
      bookings={bookings.map(b => bookingView(b, salon.timezone))}
      timeOff={off.map(o => ({ id: o.id, staffId: o.staff_id, startMin: toMin(o.starts_at), endMin: toMin(o.ends_at), reason: o.reason }))}
      canEdit={can(ctx, 'editBookings')}
      canPay={can(ctx, 'takePayments')}
      canRefund={can(ctx, 'refunds')}
      openId={sp.b}
      seedCustomer={seedCustomer ? { id: seedCustomer.id, name: seedCustomer.name, phone: seedCustomer.phone } : undefined}
    />
  );
}
