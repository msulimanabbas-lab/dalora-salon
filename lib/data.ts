import 'server-only';
import { sql } from './db';
import { zoned, addDays } from './time';

export type Salon = {
  id: string; name: string; area: string; phone: string; timezone: string;
  opens_min: number; closes_min: number; cancel_hours: number; deposit_pct: number; late_mins: number;
  lead_mins: number; slot_step: number; vat_pct: number; home_service: boolean; home_fee: number; travel_mins: number;
};
export type Staff = {
  id: string; name: string; title: string; color: string; week: Record<string, [number, number]>;
  works_home: boolean; commission_pct: number; active: boolean; sort: number;
};
export type Service = {
  id: string; name: string; category: string; duration_min: number; buffer_min: number; price: number;
  home_ok: boolean; active: boolean; sort: number; staff_ids: string[];
};
export type BookingRow = {
  id: string; code: string; staff_id: string; customer_id: string; customer_name: string; customer_phone: string;
  starts_at: Date; ends_at: Date; buffer_min: number; travel_min: number; status: string; source: string;
  location: string; address: string; subtotal: number; discount: number; home_fee: number; total: number; paid: number;
  notes: string; cancel_reason: string; created_at: Date;
  confirmed_at: Date | null; arrived_at: Date | null; started_at: Date | null; finished_at: Date | null; items: { name: string; duration_min: number; price: number; service_id: string | null }[];
  allergies: string; customer_notes: string;
};

export async function getSalon(salonId: string): Promise<Salon> {
  const [s] = await sql<Salon[]>`SELECT * FROM salons WHERE id = ${salonId}`;
  return s;
}

export async function getStaff(salonId: string, includeInactive = false): Promise<Staff[]> {
  return sql<Staff[]>`
    SELECT id, name, title, color, week, works_home, commission_pct, active, sort FROM staff
    WHERE salon_id = ${salonId} ${includeInactive ? sql`` : sql`AND active`}
    ORDER BY sort, name`;
}

export async function getServices(salonId: string, includeInactive = false): Promise<Service[]> {
  return sql<Service[]>`
    SELECT s.id, s.name, s.category, s.duration_min, s.buffer_min, s.price, s.home_ok, s.active, s.sort,
           COALESCE(array_agg(ss.staff_id) FILTER (WHERE ss.staff_id IS NOT NULL), '{}') AS staff_ids
    FROM services s LEFT JOIN service_staff ss ON ss.service_id = s.id
    WHERE s.salon_id = ${salonId} ${includeInactive ? sql`` : sql`AND s.active`}
    GROUP BY s.id ORDER BY s.sort, s.name`;
}

/** Bookings that touch a salon-local day (or a range of days). */
export async function getBookings(salonId: string, tz: string, fromDay: string, toDay = fromDay, opts: { staffId?: string; customerId?: string } = {}): Promise<BookingRow[]> {
  const from = zoned(fromDay, 0, tz), to = zoned(addDays(toDay, 1), 0, tz);
  return sql<BookingRow[]>`
    SELECT b.id, b.code, b.staff_id, b.customer_id, c.name AS customer_name, c.phone AS customer_phone,
           c.allergies, c.notes AS customer_notes,
           b.starts_at, b.ends_at, b.buffer_min, b.travel_min, b.status, b.source, b.location, b.address,
           b.subtotal, b.discount, b.home_fee, b.total, b.paid, b.notes, b.cancel_reason, b.created_at,
           b.confirmed_at, b.arrived_at, b.started_at, b.finished_at,
           COALESCE((SELECT json_agg(json_build_object('name', i.name, 'duration_min', i.duration_min, 'price', i.price, 'service_id', i.service_id) ORDER BY i.sort)
                     FROM booking_items i WHERE i.booking_id = b.id), '[]') AS items
    FROM bookings b JOIN customers c ON c.id = b.customer_id
    WHERE b.salon_id = ${salonId} AND b.starts_at >= ${from} AND b.starts_at < ${to}
      ${opts.staffId ? sql`AND b.staff_id = ${opts.staffId}` : sql``}
      ${opts.customerId ? sql`AND b.customer_id = ${opts.customerId}` : sql``}
    ORDER BY b.starts_at`;
}

export async function getBooking(salonId: string, id: string): Promise<BookingRow | null> {
  const [b] = await sql<BookingRow[]>`
    SELECT b.id, b.code, b.staff_id, b.customer_id, c.name AS customer_name, c.phone AS customer_phone,
           c.allergies, c.notes AS customer_notes,
           b.starts_at, b.ends_at, b.buffer_min, b.travel_min, b.status, b.source, b.location, b.address,
           b.subtotal, b.discount, b.home_fee, b.total, b.paid, b.notes, b.cancel_reason, b.created_at,
           b.confirmed_at, b.arrived_at, b.started_at, b.finished_at,
           COALESCE((SELECT json_agg(json_build_object('name', i.name, 'duration_min', i.duration_min, 'price', i.price, 'service_id', i.service_id) ORDER BY i.sort)
                     FROM booking_items i WHERE i.booking_id = b.id), '[]') AS items
    FROM bookings b JOIN customers c ON c.id = b.customer_id
    WHERE b.salon_id = ${salonId} AND b.id = ${id}`;
  return b ?? null;
}

export async function isDayClosed(salonId: string, day: string) {
  const [r] = await sql`SELECT 1 FROM day_closes WHERE salon_id = ${salonId} AND business_date = ${day}`;
  return !!r;
}
