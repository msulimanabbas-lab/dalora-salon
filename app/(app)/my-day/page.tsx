import { requirePage } from '@/lib/auth';
import { getBookings, getSalon, getStaff } from '@/lib/data';
import { bookingView, salonView, staffView } from '@/lib/mappers';
import { isDay, todayIn } from '@/lib/time';
import { MyDayClient } from './MyDayClient';

export const metadata = { title: 'يومي' };
export const dynamic = 'force-dynamic';

export default async function MyDayPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const ctx = await requirePage('myDay');
  const sp = await searchParams;
  const salon = await getSalon(ctx.salonId);
  const day = isDay(sp.d) ? sp.d : todayIn(salon.timezone);
  if (!ctx.staffId) return <div className="panel empty"><h3>حسابك غير مربوط بموظفة</h3><p>اطلبي من صاحبة الصالون تربط حسابك من صفحة الفريق.</p></div>;
  const [staff, bookings] = await Promise.all([getStaff(ctx.salonId), getBookings(ctx.salonId, salon.timezone, day, day, { staffId: ctx.staffId })]);
  const me = staff.find(s => s.id === ctx.staffId);
  return (
    <MyDayClient day={day} salon={salonView(salon)} me={me ? staffView(me) : null} staff={staff.map(staffView)}
      bookings={bookings.map(b => bookingView(b, salon.timezone)).filter(b => b.status !== 'cancelled')} />
  );
}
