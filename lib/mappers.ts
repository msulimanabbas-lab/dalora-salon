import 'server-only';
import type { BookingRow, Salon, Service, Staff } from './data';
import type { BookingView, SalonView, ServiceView, StaffView } from './views';
import { localParts, nowMinIn, todayIn } from './time';

export function bookingView(b: BookingRow, tz: string): BookingView {
  const s = localParts(new Date(b.starts_at), tz), e = localParts(new Date(b.ends_at), tz);
  return {
    id: b.id, code: b.code, staffId: b.staff_id, customerId: b.customer_id, customerName: b.customer_name, customerPhone: b.customer_phone,
    day: s.day, startMin: s.min, endMin: e.day === s.day ? e.min : 1440, bufferMin: b.buffer_min, travelMin: b.travel_min,
    status: b.status as BookingView['status'], source: b.source, location: b.location as BookingView['location'], address: b.address,
    subtotal: Number(b.subtotal), discount: Number(b.discount), homeFee: Number(b.home_fee), total: Number(b.total), paid: Number(b.paid),
    notes: b.notes, cancelReason: b.cancel_reason, allergies: b.allergies, customerNotes: b.customer_notes,
    items: (b.items || []).map(i => ({ name: i.name, durationMin: i.duration_min, price: Number(i.price), serviceId: i.service_id })),
    confirmed: !!b.confirmed_at, arrivedMin: minOf(b.arrived_at, tz), startedMin: minOf(b.started_at, tz), finishedMin: minOf(b.finished_at, tz),
  };
}
const minOf = (d: Date | null, tz: string) => (d ? localParts(new Date(d), tz).min : null);

export const staffView = (s: Staff): StaffView => ({ id: s.id, name: s.name, title: s.title, color: s.color, week: s.week || {}, worksHome: s.works_home });
export const serviceView = (s: Service): ServiceView => ({
  id: s.id, name: s.name, category: s.category, durationMin: s.duration_min, bufferMin: s.buffer_min, price: Number(s.price), homeOk: s.home_ok, staffIds: s.staff_ids,
});
export const salonView = (s: Salon): SalonView => ({
  opens: s.opens_min, closes: s.closes_min, step: s.slot_step, homeService: s.home_service, homeFee: Number(s.home_fee),
  travel: s.travel_mins, depositPct: s.deposit_pct, today: todayIn(s.timezone), nowMin: nowMinIn(s.timezone), name: s.name, lateMins: s.late_mins,
});
