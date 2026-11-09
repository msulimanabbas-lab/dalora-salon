'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { sql, pgCode, EXCLUSION_VIOLATION, type Tx } from '@/lib/db';
import { requestCode, verifyCode, endSession, getCtx, requireAction, can, Forbidden, type Ctx } from '@/lib/auth';
import { findSlots, totalsOf } from '@/lib/availability';
import { getSalon, getServices, getStaff, isDayClosed } from '@/lib/data';
import { normalizePhone, sar } from '@/lib/format';
import { isDay, todayIn, zoned } from '@/lib/time';
import { issueInvoice, isVatNumber } from '@/lib/invoice';
import { CATALOG } from '@/lib/catalog';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const uuid = z.string().uuid();

async function guard<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try { return await fn(); }
  catch (e) {
    if (e instanceof Forbidden) return fail('ما عندك صلاحية لهالإجراء.');
    if (e && typeof e === 'object' && 'digest' in e) throw e; // let Next redirects through
    console.error(e);
    return fail('صار خطأ غير متوقع. جربي مرة ثانية.');
  }
}
async function audit(tx: Tx | typeof sql, ctx: Ctx, entity: string, id: string | null, action: string, detail: object = {}) {
  await tx`INSERT INTO audit_log (salon_id, entity, entity_id, action, detail, user_id)
           VALUES (${ctx.salonId}, ${entity}, ${id}, ${action}, ${sql.json(detail as never)}, ${ctx.userId})`;
}
const refresh = () => revalidatePath('/', 'layout');

/* ======================= login ======================= */

export async function requestCodeAction(phoneRaw: string): Promise<Result<{ phone: string; devCode?: string; testMode?: boolean }>> {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return fail('اكتبي رقم جوال سعودي صحيح، مثل 05XXXXXXXX.');
  const r = await requestCode(phone);
  if (!r.ok) return r;
  return { ok: true, phone, devCode: r.devCode, testMode: r.testMode };
}
export async function verifyCodeAction(phone: string, code: string): Promise<Result> {
  if (!/^\d{6}$/.test(code.trim())) return fail('الرمز 6 أرقام.');
  const r = await verifyCode(phone, code);
  if (!r.ok) return r;
  redirect('/');
}
export async function logoutAction() { await endSession(); redirect('/login'); }

/* ======================= availability ======================= */

const slotInput = z.object({
  day: z.string().refine(isDay), serviceIds: z.array(uuid).max(10), staffId: z.union([uuid, z.literal('any')]),
  location: z.enum(['salon', 'home']), excludeBookingId: uuid.optional(),
});
export async function slotsAction(input: z.infer<typeof slotInput>): Promise<Result<{ slots: { min: number; staffId: string }[]; duration: number; price: number }>> {
  return guard(async () => {
    const ctx = await requireAction('editBookings');
    const p = slotInput.safeParse(input);
    if (!p.success) return fail('بيانات غير صحيحة');
    // the front desk may book into the past (walk-ins entered late) — only the public app enforces lead time
    const r = await findSlots({ ...p.data, salonId: ctx.salonId, ignoreLead: true });
    return { ok: true, slots: r.slots, duration: r.duration, price: r.price };
  });
}

export async function searchCustomersAction(q: string): Promise<Result<{ customers: { id: string; name: string; phone: string; visits: number; no_shows: number; allergies: string }[] }>> {
  return guard(async () => {
    const ctx = await requireAction('editBookings');
    const t = q.trim();
    if (t.length < 2) return { ok: true, customers: [] };
    const digits = t.replace(/\D/g, '').replace(/^0/, '');
    const rows = await sql`
      SELECT c.id, c.name, c.phone, c.allergies,
        (SELECT count(*)::int FROM bookings b WHERE b.customer_id = c.id AND b.status = 'done') AS visits,
        (SELECT count(*)::int FROM bookings b WHERE b.customer_id = c.id AND b.status = 'no_show') AS no_shows
      FROM customers c
      WHERE c.salon_id = ${ctx.salonId}
        AND (c.name ILIKE ${'%' + t + '%'} ${digits.length >= 3 ? sql`OR c.phone LIKE ${'%' + digits + '%'}` : sql``})
      ORDER BY c.name LIMIT 8`;
    return { ok: true, customers: rows as never };
  });
}

/* ======================= bookings ======================= */

const bookingInput = z.object({
  customerId: uuid.optional(),
  customerName: z.string().trim().max(80).optional(),
  customerPhone: z.string().max(20).optional(),
  serviceIds: z.array(uuid).min(1, 'اختاري خدمة على الأقل').max(10),
  staffId: z.union([uuid, z.literal('any')]),
  day: z.string().refine(isDay),
  min: z.number().int().min(0).max(1439),
  location: z.enum(['salon', 'home']),
  address: z.string().max(300).default(''),
  source: z.enum(['whatsapp', 'phone', 'walk_in', 'social', 'app']).default('whatsapp'),
  notes: z.string().max(500).default(''),
  discount: z.number().min(0).default(0),
  payNow: z.object({ method: z.enum(['cash', 'card', 'online', 'transfer']), amount: z.number().positive(), kind: z.enum(['payment', 'deposit']) }).optional(),
});

function newCode() { return 'DL-' + randomInt(10000, 100000); }

export async function createBookingAction(input: z.input<typeof bookingInput>): Promise<Result<{ id: string; code: string }>> {
  return guard(async () => {
    const ctx = await requireAction('editBookings');
    const p = bookingInput.safeParse(input);
    if (!p.success) return fail(p.error.issues[0]?.message || 'بيانات غير صحيحة');
    const d = p.data;
    const salon = await getSalon(ctx.salonId);
    if (d.location === 'home' && !salon.home_service) return fail('الخدمة المنزلية غير مفعّلة في الإعدادات.');

    // who and when: re-check against the live schedule; the database constraint is the final word
    const r = await findSlots({ salonId: ctx.salonId, day: d.day, serviceIds: d.serviceIds, staffId: d.staffId, location: d.location, ignoreLead: true });
    const slot = r.slots.find(s => s.min === d.min);
    if (!slot) return fail('هذا الوقت ما عاد فاضي. اختاري وقت ثاني.');
    const services = await getServices(ctx.salonId);
    const t = totalsOf(services, d.serviceIds);
    const homeFee = d.location === 'home' ? Number(salon.home_fee) : 0;
    const total = Math.max(0, t.price + homeFee - d.discount);
    if (d.payNow && d.payNow.amount > total) return fail('المبلغ المدفوع أكبر من الإجمالي.');
    const starts = zoned(d.day, d.min, salon.timezone);
    const ends = new Date(starts.getTime() + t.duration * 60000);

    try {
      const out = await sql.begin(async tx => {
        let customerId = d.customerId;
        if (customerId) {
          const [c] = await tx`SELECT id FROM customers WHERE id = ${customerId} AND salon_id = ${ctx.salonId}`;
          if (!c) throw new UserError('العميلة غير موجودة.');
        } else {
          const phone = normalizePhone(d.customerPhone || '');
          if (!phone) throw new UserError('اكتبي رقم جوال صحيح للعميلة.');
          if (!d.customerName) throw new UserError('اكتبي اسم العميلة.');
          const [c] = await tx`
            INSERT INTO customers (salon_id, name, phone) VALUES (${ctx.salonId}, ${d.customerName}, ${phone})
            ON CONFLICT (salon_id, phone) DO UPDATE SET name = customers.name RETURNING id`;
          customerId = c.id;
        }
        let code = newCode(), id = '';
        for (let i = 0; i < 5; i++) {
          const rows = await tx`
            INSERT INTO bookings (salon_id, code, customer_id, staff_id, starts_at, ends_at, buffer_min, travel_min, status, source, location, address,
                                  subtotal, discount, home_fee, total, paid, notes, created_by, occupied)
            VALUES (${ctx.salonId}, ${code}, ${customerId!}, ${slot.staffId}, ${starts}, ${ends}, ${t.buffer}, ${r.travel}, 'booked', ${d.source}, ${d.location},
                    ${d.location === 'home' ? d.address : ''}, ${t.price}, ${d.discount}, ${homeFee}, ${total}, 0, ${d.notes}, ${ctx.userId}, 'empty')
            ON CONFLICT (salon_id, code) DO NOTHING RETURNING id`;
          if (rows.length) { id = rows[0].id; break; }
          code = newCode();
        }
        if (!id) throw new UserError('تعذّر إنشاء رقم حجز، جربي مرة ثانية.');
        let sort = 0;
        for (const sid of d.serviceIds) {
          const s = services.find(x => x.id === sid)!;
          await tx`INSERT INTO booking_items (booking_id, service_id, name, duration_min, price, sort) VALUES (${id}, ${sid}, ${s.name}, ${s.duration_min}, ${s.price}, ${sort++})`;
        }
        if (d.payNow) await insertPayment(tx, ctx, salon.timezone, { bookingId: id, customerId: customerId!, ...d.payNow, note: '' });
        await audit(tx, ctx, 'booking', id, 'created', { code, source: d.source });
        return { id, code };
      });
      refresh();
      return { ok: true, ...out };
    } catch (e) {
      if (pgCode(e) === EXCLUSION_VIOLATION) return fail('هذا الوقت انحجز قبل لحظات. اختاري وقت ثاني.');
      if (e instanceof UserError) return fail(e.message);
      throw e;
    }
  });
}
class UserError extends Error {}

const moveInput = z.object({
  id: uuid, serviceIds: z.array(uuid).min(1).max(10), staffId: z.union([uuid, z.literal('any')]),
  day: z.string().refine(isDay), min: z.number().int().min(0).max(1439),
  location: z.enum(['salon', 'home']), address: z.string().max(300).default(''), notes: z.string().max(500).default(''),
});
export async function updateBookingAction(input: z.input<typeof moveInput>): Promise<Result> {
  return guard(async () => {
    const ctx = await requireAction('editBookings');
    const p = moveInput.safeParse(input);
    if (!p.success) return fail('بيانات غير صحيحة');
    const d = p.data;
    const [b] = await sql`SELECT id, status, discount, paid FROM bookings WHERE id = ${d.id} AND salon_id = ${ctx.salonId}`;
    if (!b) return fail('الحجز غير موجود.');
    if (!['booked', 'arrived'].includes(b.status)) return fail('ما يمديك تعدّلين حجز بدأ أو انتهى أو انلغى.');
    const salon = await getSalon(ctx.salonId);
    const r = await findSlots({ salonId: ctx.salonId, day: d.day, serviceIds: d.serviceIds, staffId: d.staffId, location: d.location, excludeBookingId: d.id, ignoreLead: true });
    const slot = r.slots.find(s => s.min === d.min);
    if (!slot) return fail('هذا الوقت ما هو فاضي.');
    const services = await getServices(ctx.salonId);
    const t = totalsOf(services, d.serviceIds);
    const homeFee = d.location === 'home' ? Number(salon.home_fee) : 0;
    const total = Math.max(0, t.price + homeFee - Number(b.discount));
    const starts = zoned(d.day, d.min, salon.timezone);
    try {
      await sql.begin(async tx => {
        await tx`UPDATE bookings SET staff_id = ${slot.staffId}, starts_at = ${starts}, ends_at = ${new Date(starts.getTime() + t.duration * 60000)},
                   buffer_min = ${t.buffer}, travel_min = ${r.travel}, location = ${d.location}, address = ${d.location === 'home' ? d.address : ''},
                   subtotal = ${t.price}, home_fee = ${homeFee}, total = ${total}, notes = ${d.notes}
                 WHERE id = ${d.id}`;
        await tx`DELETE FROM booking_items WHERE booking_id = ${d.id}`;
        let sort = 0;
        for (const sid of d.serviceIds) {
          const s = services.find(x => x.id === sid)!;
          await tx`INSERT INTO booking_items (booking_id, service_id, name, duration_min, price, sort) VALUES (${d.id}, ${sid}, ${s.name}, ${s.duration_min}, ${s.price}, ${sort++})`;
        }
        await audit(tx, ctx, 'booking', d.id, 'moved', { day: d.day, min: d.min, staffId: slot.staffId });
      });
    } catch (e) {
      if (pgCode(e) === EXCLUSION_VIOLATION) return fail('هذا الوقت انحجز قبل لحظات. اختاري وقت ثاني.');
      throw e;
    }
    refresh();
    return { ok: true };
  });
}

const FLOW: Record<string, string[]> = {
  booked: ['arrived', 'in_service', 'no_show'],
  arrived: ['in_service', 'done', 'booked'],
  in_service: ['done', 'arrived'],
  done: ['in_service'],
  no_show: ['booked'],
  cancelled: [],
};
export async function setStatusAction(id: string, status: string): Promise<Result> {
  return guard(async () => {
    const ctx = await getCtx();
    if (!ctx) return fail('سجّلي الدخول.');
    if (!uuid.safeParse(id).success) return fail('حجز غير صحيح');
    const [b] = await sql`SELECT status, staff_id FROM bookings WHERE id = ${id} AND salon_id = ${ctx.salonId}`;
    if (!b) return fail('الحجز غير موجود.');
    const own = ctx.role === 'staff' && ctx.staffId === b.staff_id;
    if (!can(ctx, 'editBookings') && !(own && ['arrived', 'in_service', 'done'].includes(status))) return fail('ما عندك صلاحية لهالإجراء.');
    if (!FLOW[b.status]?.includes(status)) return fail('ما يصير تنقلين الحجز لهالحالة.');
    try {
      await sql.begin(async tx => {
        // each step keeps the moment it happened; stepping back clears what hadn't really happened yet
        await tx`UPDATE bookings SET status = ${status as never},
                   arrived_at  = CASE WHEN ${status}::text = 'booked' THEN NULL
                                      WHEN ${status}::text IN ('arrived', 'in_service', 'done') THEN COALESCE(arrived_at, now()) ELSE arrived_at END,
                   started_at  = CASE WHEN ${status}::text IN ('booked', 'arrived') THEN NULL
                                      WHEN ${status}::text IN ('in_service', 'done') THEN COALESCE(started_at, now()) ELSE started_at END,
                   finished_at = CASE WHEN ${status}::text = 'done' THEN COALESCE(finished_at, now()) ELSE NULL END
                 WHERE id = ${id}`;
        await audit(tx, ctx, 'booking', id, 'status', { from: b.status, to: status });
      });
    } catch (e) {
      if (pgCode(e) === EXCLUSION_VIOLATION) return fail('ما يصير ترجعينه، الوقت صار محجوز لعميلة ثانية.');
      throw e;
    }
    refresh();
    return { ok: true };
  });
}

/** The customer confirmed she's coming (usually a WhatsApp reply). Tapping again undoes it. */
export async function confirmBookingAction(id: string, confirmed: boolean): Promise<Result> {
  return guard(async () => {
    const ctx = await requireAction('editBookings');
    if (!uuid.safeParse(id).success) return fail('حجز غير صحيح');
    const r = await sql`UPDATE bookings SET confirmed_at = ${confirmed ? sql`now()` : null}
                        WHERE id = ${id} AND salon_id = ${ctx.salonId} AND status IN ('booked', 'arrived') RETURNING id`;
    if (!r.length) return fail('ما يصير، الحجز بدأ أو انتهى.');
    await audit(sql, ctx, 'booking', id, confirmed ? 'confirmed' : 'unconfirmed');
    refresh();
    return { ok: true };
  });
}

export async function cancelBookingAction(id: string, reason: string): Promise<Result> {
  return guard(async () => {
    const ctx = await requireAction('editBookings');
    if (!uuid.safeParse(id).success) return fail('حجز غير صحيح');
    const [b] = await sql`SELECT status FROM bookings WHERE id = ${id} AND salon_id = ${ctx.salonId}`;
    if (!b) return fail('الحجز غير موجود.');
    if (!['booked', 'arrived'].includes(b.status)) return fail('ما يصير تلغين حجز بدأ أو انتهى.');
    await sql.begin(async tx => {
      await tx`UPDATE bookings SET status = 'cancelled', cancel_reason = ${reason.slice(0, 200)} WHERE id = ${id}`;
      await audit(tx, ctx, 'booking', id, 'cancelled', { reason });
    });
    refresh();
    return { ok: true };
  });
}

/* ======================= money ======================= */

type PayIn = { bookingId?: string; customerId?: string; method: 'cash' | 'card' | 'online' | 'transfer'; kind: 'payment' | 'deposit' | 'refund'; amount: number; note: string };
async function insertPayment(tx: Tx, ctx: Ctx, tz: string, p: PayIn) {
  const day = todayIn(tz);
  const [closed] = await tx`SELECT 1 FROM day_closes WHERE salon_id = ${ctx.salonId} AND business_date = ${day}`;
  if (closed) throw new UserError('صندوق اليوم مقفل. ما يمديك تسجلين مبالغ جديدة اليوم.');
  await tx`INSERT INTO payments (salon_id, booking_id, customer_id, method, kind, amount, business_date, note, received_by)
           VALUES (${ctx.salonId}, ${p.bookingId ?? null}, ${p.customerId ?? null}, ${p.method}, ${p.kind}, ${p.amount}, ${day}, ${p.note}, ${ctx.userId})`;
  if (p.bookingId) {
    const delta = p.kind === 'refund' ? -p.amount : p.amount;
    const [b] = await tx`UPDATE bookings SET paid = paid + ${delta} WHERE id = ${p.bookingId} RETURNING paid, total, status`;
    // tax invoice: issued the moment the booking is fully paid; a refund on an invoiced booking issues a credit note
    // (both only once the salon has entered its VAT number)
    if (p.kind === 'refund') {
      await issueInvoice(tx, { salonId: ctx.salonId, userId: ctx.userId, bookingId: p.bookingId, kind: 'credit', amount: p.amount, reason: p.note || 'استرجاع مبلغ' });
    } else if (Number(b.paid) >= Number(b.total) - 0.001 && !['cancelled', 'no_show'].includes(b.status)) {
      await issueInvoice(tx, { salonId: ctx.salonId, userId: ctx.userId, bookingId: p.bookingId, kind: 'invoice' });
    }
  }
  await audit(tx, ctx, 'payment', p.bookingId ?? null, p.kind, { method: p.method, amount: p.amount });
}

/** For bookings paid in full before the salon added its VAT number, or anything that missed the automatic issue. */
export async function issueInvoiceAction(bookingId: string): Promise<Result<{ number: string }>> {
  return guard(async () => {
    const ctx = await requireAction('takePayments');
    if (!uuid.safeParse(bookingId).success) return fail('حجز غير صحيح');
    const [b] = await sql`SELECT paid, total, status FROM bookings WHERE id = ${bookingId} AND salon_id = ${ctx.salonId}`;
    if (!b) return fail('الحجز غير موجود.');
    if (Number(b.paid) < Number(b.total) - 0.001) return fail('الفاتورة تنطلع بعد ما ينسدد المبلغ كامل.');
    const out = await sql.begin(tx => issueInvoice(tx, { salonId: ctx.salonId, userId: ctx.userId, bookingId, kind: 'invoice' }));
    if (!out) return fail('أضيفي الرقم الضريبي للصالون من الإعدادات أول.');
    await audit(sql, ctx, 'booking', bookingId, 'invoiced', { number: out.number });
    refresh();
    return { ok: true, number: out.number };
  });
}

const payInput = z.object({
  bookingId: uuid, method: z.enum(['cash', 'card', 'online', 'transfer']), kind: z.enum(['payment', 'deposit', 'refund']),
  amount: z.number().positive().max(100000), note: z.string().max(200).default(''),
});
export async function addPaymentAction(input: z.input<typeof payInput>): Promise<Result> {
  return guard(async () => {
    const p = payInput.safeParse(input);
    if (!p.success) return fail('اكتبي مبلغ صحيح.');
    const ctx = await requireAction(p.data.kind === 'refund' ? 'refunds' : 'takePayments');
    const [b] = await sql`SELECT customer_id, total, paid FROM bookings WHERE id = ${p.data.bookingId} AND salon_id = ${ctx.salonId}`;
    if (!b) return fail('الحجز غير موجود.');
    const due = Number(b.total) - Number(b.paid);
    if (p.data.kind !== 'refund' && p.data.amount > due + 0.001) return fail(`المتبقي ${sar(due)} بس.`);
    if (p.data.kind === 'refund' && p.data.amount > Number(b.paid) + 0.001) return fail(`المدفوع ${sar(b.paid)} بس.`);
    const salon = await getSalon(ctx.salonId);
    try {
      await sql.begin(tx => insertPayment(tx, ctx, salon.timezone, { ...p.data, customerId: b.customer_id }));
    } catch (e) { if (e instanceof UserError) return fail(e.message); throw e; }
    refresh();
    return { ok: true };
  });
}

export async function closeDayAction(day: string, countedCash: number, note: string): Promise<Result> {
  return guard(async () => {
    const ctx = await requireAction('closeDay');
    if (!isDay(day) || !(countedCash >= 0)) return fail('اكتبي مبلغ الكاش الموجود بالدرج.');
    if (await isDayClosed(ctx.salonId, day)) return fail('هذا اليوم مقفل من قبل.');
    const [t] = await sql`
      SELECT
        COALESCE(sum(CASE WHEN method='cash' THEN (CASE WHEN kind='refund' THEN -amount ELSE amount END) END),0) AS cash,
        COALESCE(sum(CASE WHEN method='card' THEN (CASE WHEN kind='refund' THEN -amount ELSE amount END) END),0) AS card,
        COALESCE(sum(CASE WHEN method='online' THEN (CASE WHEN kind='refund' THEN -amount ELSE amount END) END),0) AS online,
        COALESCE(sum(CASE WHEN method='transfer' THEN (CASE WHEN kind='refund' THEN -amount ELSE amount END) END),0) AS transfer
      FROM payments WHERE salon_id = ${ctx.salonId} AND business_date = ${day}`;
    await sql.begin(async tx => {
      await tx`INSERT INTO day_closes (salon_id, business_date, expected_cash, counted_cash, difference, card_total, online_total, transfer_total, note, closed_by)
               VALUES (${ctx.salonId}, ${day}, ${t.cash}, ${countedCash}, ${countedCash - Number(t.cash)}, ${t.card}, ${t.online}, ${t.transfer}, ${note.slice(0, 300)}, ${ctx.userId})`;
      await audit(tx, ctx, 'day_close', null, 'closed', { day, expected: t.cash, counted: countedCash });
    });
    refresh();
    return { ok: true };
  });
}
export async function reopenDayAction(day: string): Promise<Result> {
  return guard(async () => {
    const ctx = await requireAction('settings');
    await sql.begin(async tx => {
      await tx`DELETE FROM day_closes WHERE salon_id = ${ctx.salonId} AND business_date = ${day}`;
      await audit(tx, ctx, 'day_close', null, 'reopened', { day });
    });
    refresh();
    return { ok: true };
  });
}

/* ======================= customers ======================= */

const custInput = z.object({
  id: uuid, name: z.string().trim().min(1).max(80), notes: z.string().max(1000), allergies: z.string().max(300),
  tags: z.array(z.string().trim().min(1).max(20)).max(8),
});
export async function updateCustomerAction(input: z.input<typeof custInput>): Promise<Result> {
  return guard(async () => {
    const ctx = await requireAction('customers');
    const p = custInput.safeParse(input);
    if (!p.success) return fail('بيانات غير صحيحة');
    const d = p.data;
    await sql`UPDATE customers SET name = ${d.name}, notes = ${d.notes}, allergies = ${d.allergies}, tags = ${d.tags}
              WHERE id = ${d.id} AND salon_id = ${ctx.salonId}`;
    await audit(sql, ctx, 'customer', d.id, 'updated');
    refresh();
    return { ok: true };
  });
}

/* ======================= catalog ======================= */

const svcInput = z.object({
  id: uuid.optional(), name: z.string().trim().min(1).max(80), category: z.string().trim().max(40).default(''),
  duration_min: z.number().int().min(5).max(600), buffer_min: z.number().int().min(0).max(120), price: z.number().min(0).max(100000),
  home_ok: z.boolean(), active: z.boolean(), staff_ids: z.array(uuid),
});
export async function saveServiceAction(input: z.input<typeof svcInput>): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const ctx = await requireAction('catalog');
    const p = svcInput.safeParse(input);
    if (!p.success) return fail(p.error.issues[0]?.path.join('.') === 'name' ? 'اكتبي اسم الخدمة.' : 'تأكدي من المدة والسعر.');
    const d = p.data;
    const id = await sql.begin(async tx => {
      let id = d.id;
      if (id) {
        const r = await tx`UPDATE services SET name=${d.name}, category=${d.category}, duration_min=${d.duration_min}, buffer_min=${d.buffer_min},
                             price=${d.price}, home_ok=${d.home_ok}, active=${d.active} WHERE id=${id} AND salon_id=${ctx.salonId} RETURNING id`;
        if (!r.length) throw new UserError('الخدمة غير موجودة.');
      } else {
        const [m] = await tx`SELECT COALESCE(max(sort),0)+1 AS n FROM services WHERE salon_id=${ctx.salonId}`;
        [{ id }] = await tx`INSERT INTO services (salon_id, name, category, duration_min, buffer_min, price, home_ok, active, sort)
                            VALUES (${ctx.salonId}, ${d.name}, ${d.category}, ${d.duration_min}, ${d.buffer_min}, ${d.price}, ${d.home_ok}, ${d.active}, ${m.n}) RETURNING id`;
      }
      await tx`DELETE FROM service_staff WHERE service_id = ${id!}`;
      for (const s of d.staff_ids) {
        await tx`INSERT INTO service_staff (service_id, staff_id) SELECT ${id!}, id FROM staff WHERE id = ${s} AND salon_id = ${ctx.salonId}`;
      }
      await audit(tx, ctx, 'service', id!, d.id ? 'updated' : 'created', { name: d.name, price: d.price });
      return id!;
    }).catch(e => { if (e instanceof UserError) return null; throw e; });
    if (!id) return fail('الخدمة غير موجودة.');
    refresh();
    return { ok: true, id };
  });
}

const weekSchema = z.record(z.string().regex(/^[0-6]$/), z.tuple([z.number().int().min(0).max(1440), z.number().int().min(0).max(1440)]));
const staffInput = z.object({
  id: uuid.optional(), name: z.string().trim().min(1).max(60), title: z.string().trim().max(60).default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/), week: weekSchema, works_home: z.boolean(),
  commission_pct: z.number().min(0).max(100), active: z.boolean(), service_ids: z.array(uuid),
});
export async function saveStaffAction(input: z.input<typeof staffInput>): Promise<Result<{ id: string }>> {
  return guard(async () => {
    const ctx = await requireAction('catalog');
    const p = staffInput.safeParse(input);
    if (!p.success) return fail('تأكدي من الاسم والدوام.');
    const d = p.data;
    for (const [, [a, b]] of Object.entries(d.week)) if (b <= a) return fail('نهاية الدوام لازم تكون بعد بدايته.');
    const id = await sql.begin(async tx => {
      let id = d.id;
      if (id) {
        await tx`UPDATE staff SET name=${d.name}, title=${d.title}, color=${d.color}, week=${sql.json(d.week as never)}, works_home=${d.works_home},
                   commission_pct=${d.commission_pct}, active=${d.active} WHERE id=${id} AND salon_id=${ctx.salonId}`;
      } else {
        const [m] = await tx`SELECT COALESCE(max(sort),0)+1 AS n FROM staff WHERE salon_id=${ctx.salonId}`;
        [{ id }] = await tx`INSERT INTO staff (salon_id, name, title, color, week, works_home, commission_pct, active, sort)
                            VALUES (${ctx.salonId}, ${d.name}, ${d.title}, ${d.color}, ${sql.json(d.week as never)}, ${d.works_home}, ${d.commission_pct}, ${d.active}, ${m.n}) RETURNING id`;
      }
      await tx`DELETE FROM service_staff WHERE staff_id = ${id!}`;
      for (const s of d.service_ids) {
        await tx`INSERT INTO service_staff (service_id, staff_id) SELECT id, ${id!} FROM services WHERE id = ${s} AND salon_id = ${ctx.salonId}`;
      }
      await audit(tx, ctx, 'staff', id!, d.id ? 'updated' : 'created', { name: d.name });
      return id!;
    });
    refresh();
    return { ok: true, id };
  });
}

const offInput = z.object({ staffId: uuid, day: z.string().refine(isDay), from: z.number().int().min(0).max(1440), to: z.number().int().min(0).max(1440), reason: z.string().max(100).default('') });
export async function addTimeOffAction(input: z.input<typeof offInput>): Promise<Result> {
  return guard(async () => {
    const ctx = await requireAction('editBookings');
    const p = offInput.safeParse(input);
    if (!p.success || p.data.to <= p.data.from) return fail('تأكدي من الوقت.');
    const salon = await getSalon(ctx.salonId);
    const d = p.data;
    await sql`INSERT INTO staff_time_off (salon_id, staff_id, starts_at, ends_at, reason)
              SELECT ${ctx.salonId}, id, ${zoned(d.day, d.from, salon.timezone)}, ${zoned(d.day, d.to, salon.timezone)}, ${d.reason}
              FROM staff WHERE id = ${d.staffId} AND salon_id = ${ctx.salonId}`;
    await audit(sql, ctx, 'staff', d.staffId, 'time_off', d);
    refresh();
    return { ok: true };
  });
}
export async function removeTimeOffAction(id: string): Promise<Result> {
  return guard(async () => {
    const ctx = await requireAction('editBookings');
    await sql`DELETE FROM staff_time_off WHERE id = ${id} AND salon_id = ${ctx.salonId}`;
    refresh();
    return { ok: true };
  });
}

/* ======================= team & settings ======================= */

const memberInput = z.object({
  name: z.string().trim().min(1).max(60),
  username: z.string().trim().toLowerCase(),
  phone: z.string().max(20).default(''),
  role: z.enum(['manager', 'reception', 'staff', 'accountant']), staffId: uuid.optional(),
});
/** Creates a login for someone in the salon. The system makes up the first password and shows it once. */
export async function addMemberAction(input: z.input<typeof memberInput>): Promise<Result<{ username: string; password: string }>> {
  return guard(async () => {
    const ctx = await requireAction('team');
    const p = memberInput.safeParse(input);
    if (!p.success) return fail('اكتبي الاسم والدور.');
    const d = p.data;
    const { validUsername, generatePassword, hashPassword } = await import('@/lib/password');
    if (!validUsername(d.username)) return fail('اسم المستخدم بالإنجليزي، من 3 خانات، حروف وأرقام ونقطة بس (مثل: reem.reception).');
    const phone = d.phone.trim() ? normalizePhone(d.phone) : null;
    if (d.phone.trim() && !phone) return fail('رقم الجوال غير صحيح.');
    if (d.role === 'staff' && !d.staffId) return fail('اختاري المختصة المرتبطة بهالحساب.');
    const [taken] = await sql`SELECT 1 FROM users WHERE lower(username) = ${d.username}`;
    if (taken) return fail('اسم المستخدم مأخوذ. اختاري غيره.');
    const password = generatePassword();
    const hash = await hashPassword(password);
    try {
      await sql.begin(async tx => {
        const [u] = phone
          ? await tx`INSERT INTO users (phone, name, username, password_hash, must_change) VALUES (${phone}, ${d.name}, ${d.username}, ${hash}, true)
                     ON CONFLICT (phone) DO UPDATE SET username = COALESCE(users.username, EXCLUDED.username),
                       password_hash = CASE WHEN users.username IS NULL THEN EXCLUDED.password_hash ELSE users.password_hash END,
                       must_change = CASE WHEN users.username IS NULL THEN true ELSE users.must_change END
                     RETURNING id, username`
          : await tx`INSERT INTO users (name, username, password_hash, must_change) VALUES (${d.name}, ${d.username}, ${hash}, true) RETURNING id, username`;
        if (u.username !== d.username) throw new UserError('هالرقم عنده حساب من قبل باسم مستخدم ' + u.username + '.');
        await tx`INSERT INTO memberships (salon_id, user_id, role, staff_id, active)
                 VALUES (${ctx.salonId}, ${u.id}, ${d.role}, ${d.role === 'staff' ? d.staffId! : null}, true)
                 ON CONFLICT (salon_id, user_id) DO UPDATE SET role = EXCLUDED.role, staff_id = EXCLUDED.staff_id, active = true`;
        await audit(tx, ctx, 'member', u.id, 'added', { role: d.role, username: d.username });
      });
    } catch (e) { if (e instanceof UserError) return fail(e.message); throw e; }
    refresh();
    return { ok: true, username: d.username, password };
  });
}

/** Owner gives someone a fresh password (forgot it, or a new device). Shown once. */
export async function resetPasswordAction(membershipId: string): Promise<Result<{ username: string; password: string }>> {
  return guard(async () => {
    const ctx = await requireAction('team');
    if (!uuid.safeParse(membershipId).success) return fail('غير موجود');
    const [m] = await sql`SELECT u.id, u.username, u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ${membershipId} AND m.salon_id = ${ctx.salonId}`;
    if (!m) return fail('غير موجود');
    if (m.id === ctx.userId) return fail('غيّري كلمة مرورك من صفحة حسابي.');
    const { generatePassword, hashPassword, validUsername } = await import('@/lib/password');
    let username = m.username as string | null;
    if (!username) { // older phone-only account: give it a username too
      const base = 'user' + String(Date.now()).slice(-6);
      username = validUsername(base) ? base : 'user' + Math.random().toString(36).slice(2, 8);
    }
    const password = generatePassword();
    await sql`UPDATE users SET username = ${username}, password_hash = ${await hashPassword(password)}, must_change = true, failed_logins = 0, locked_until = NULL WHERE id = ${m.id}`;
    await sql`DELETE FROM sessions WHERE user_id = ${m.id}`;
    await audit(sql, ctx, 'member', m.id, 'password_reset');
    return { ok: true, username, password };
  });
}

export async function passwordLoginAction(username: string, password: string): Promise<Result> {
  const { passwordLogin } = await import('@/lib/auth');
  if (!username.trim() || !password) return fail('اكتبي اسم المستخدم وكلمة المرور.');
  const r = await passwordLogin(username, password.slice(0, 200));
  if (!r.ok) return r;
  redirect(r.mustChange ? '/account?first=1' : '/');
}

/** Change your own password; an account that signed in by phone and has no username yet picks one here. */
export async function changePasswordAction(current: string, next: string, newUsername?: string): Promise<Result> {
  return guard(async () => {
    const ctx = await getCtx();
    if (!ctx) return fail('سجّلي الدخول.');
    if (ctx.isDemo) return fail('الحساب التجريبي ما تتغير كلمة مروره.');
    const { verifyPassword, hashPassword, passwordProblem, validUsername } = await import('@/lib/password');
    const problem = passwordProblem(next);
    if (problem) return fail(problem);
    const [u] = await sql`SELECT password_hash, username FROM users WHERE id = ${ctx.userId}`;
    if (u.password_hash && !(await verifyPassword(current, u.password_hash))) return fail('كلمة المرور الحالية غير صحيحة.');
    if (u.password_hash && current === next) return fail('اختاري كلمة مرور جديدة غير الحالية.');
    let username = u.username as string | null;
    if (!username) {
      const want = (newUsername || '').trim().toLowerCase();
      if (!validUsername(want)) return fail('اختاري اسم مستخدم بالإنجليزي، من 3 خانات، حروف وأرقام ونقطة.');
      const [taken] = await sql`SELECT 1 FROM users WHERE lower(username) = ${want}`;
      if (taken) return fail('اسم المستخدم مأخوذ. اختاري غيره.');
      username = want;
    }
    await sql`UPDATE users SET username = ${username}, password_hash = ${await hashPassword(next)}, must_change = false WHERE id = ${ctx.userId}`;
    await audit(sql, ctx, 'member', ctx.userId, 'password_changed');
    return { ok: true };
  });
}
export async function setMemberActiveAction(membershipId: string, active: boolean): Promise<Result> {
  return guard(async () => {
    const ctx = await requireAction('team');
    const [m] = await sql`SELECT user_id, role FROM memberships WHERE id = ${membershipId} AND salon_id = ${ctx.salonId}`;
    if (!m) return fail('غير موجود');
    if (m.user_id === ctx.userId) return fail('ما يمديك توقفين حسابك.');
    await sql.begin(async tx => {
      await tx`UPDATE memberships SET active = ${active} WHERE id = ${membershipId}`;
      if (!active) await tx`DELETE FROM sessions WHERE user_id = ${m.user_id} AND salon_id = ${ctx.salonId}`;
      await audit(tx, ctx, 'member', m.user_id, active ? 'enabled' : 'disabled');
    });
    refresh();
    return { ok: true };
  });
}

const settingsInput = z.object({
  name: z.string().trim().min(1).max(80), area: z.string().max(120), phone: z.string().max(20),
  opens_min: z.number().int().min(0).max(1439), closes_min: z.number().int().min(1).max(1440),
  cancel_hours: z.number().int().min(0).max(168), deposit_pct: z.number().int().min(0).max(100), late_mins: z.number().int().min(0).max(120),
  lead_mins: z.number().int().min(0).max(1440), slot_step: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30)]),
  home_service: z.boolean(), home_fee: z.number().min(0).max(10000), travel_mins: z.number().int().min(0).max(180),
  vat_number: z.string().trim().max(15).default(''), cr_number: z.string().trim().max(20).default(''), address: z.string().trim().max(200).default(''),
});
export async function saveSettingsAction(input: z.input<typeof settingsInput>): Promise<Result> {
  return guard(async () => {
    const ctx = await requireAction('settings');
    const p = settingsInput.safeParse(input);
    if (!p.success) return fail('تأكدي من القيم.');
    const d = p.data;
    if (d.closes_min <= d.opens_min) return fail('وقت الإقفال لازم يكون بعد الفتح.');
    if (d.vat_number && !isVatNumber(d.vat_number)) return fail('الرقم الضريبي 15 رقم، يبدأ بـ 3 وينتهي بـ 3.');
    await sql`UPDATE salons SET name=${d.name}, area=${d.area}, phone=${d.phone}, opens_min=${d.opens_min}, closes_min=${d.closes_min},
              cancel_hours=${d.cancel_hours}, deposit_pct=${d.deposit_pct}, late_mins=${d.late_mins}, lead_mins=${d.lead_mins}, slot_step=${d.slot_step},
              home_service=${d.home_service}, home_fee=${d.home_fee}, travel_mins=${d.travel_mins},
              vat_number=${d.vat_number}, cr_number=${d.cr_number}, address=${d.address} WHERE id=${ctx.salonId}`;
    await audit(sql, ctx, 'salon', ctx.salonId, 'settings', d);
    refresh();
    return { ok: true };
  });
}

export async function getStaffAndServices() {
  const ctx = await getCtx();
  if (!ctx) return null;
  const [staff, services] = await Promise.all([getStaff(ctx.salonId), getServices(ctx.salonId)]);
  return { staff, services };
}

/* ======================= booking detail (for the side sheet) ======================= */

export type BookingDetail = {
  booking: import('@/lib/views').BookingView;
  payments: { id: string; method: string; kind: string; amount: number; at: string; by: string }[];
  log: { at: string; action: string; detail: Record<string, unknown>; by: string }[];
  history: { visits: number; noShows: number; lastVisit: string | null };
  dayClosed: boolean;
  salonName: string;
  invoices: { id: string; kind: string; number: string; token: string; total: number }[];
  vatReady: boolean;
};
export async function bookingDetailAction(id: string): Promise<Result<{ detail: BookingDetail }>> {
  return guard(async () => {
    const ctx = await getCtx();
    if (!ctx) return fail('سجّلي الدخول.');
    if (!uuid.safeParse(id).success) return fail('حجز غير صحيح');
    const { getBooking } = await import('@/lib/data');
    const { bookingView } = await import('@/lib/mappers');
    const b = await getBooking(ctx.salonId, id);
    if (!b) return fail('الحجز غير موجود.');
    if (ctx.role === 'staff' && b.staff_id !== ctx.staffId) return fail('هذا الحجز لموظفة ثانية.');
    const salon = await getSalon(ctx.salonId);
    const [payments, log, [h], closed, invoices] = await Promise.all([
      sql`SELECT p.id, p.method, p.kind, p.amount, p.created_at AS at, COALESCE(u.name, '') AS by
          FROM payments p LEFT JOIN users u ON u.id = p.received_by WHERE p.booking_id = ${id} ORDER BY p.created_at`,
      sql`SELECT a.at, a.action, a.detail, COALESCE(u.name, '') AS by FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
          WHERE a.salon_id = ${ctx.salonId} AND a.entity_id = ${id} ORDER BY a.at DESC LIMIT 30`,
      sql`SELECT count(*) FILTER (WHERE status = 'done')::int AS visits, count(*) FILTER (WHERE status = 'no_show')::int AS no_shows,
                 max(starts_at) FILTER (WHERE status = 'done') AS last_visit
          FROM bookings WHERE customer_id = ${b.customer_id} AND id <> ${id}`,
      isDayClosed(ctx.salonId, todayIn(salon.timezone)),
      sql`SELECT id, kind, number, share_token, total_incl FROM invoices WHERE booking_id = ${id} ORDER BY icv`,
    ]);
    const view = bookingView(b, salon.timezone);
    if (ctx.role === 'staff') view.customerPhone = ''; // staff see the name, not the number
    return {
      ok: true,
      detail: {
        booking: view,
        payments: payments.map(p => ({ id: p.id, method: p.method, kind: p.kind, amount: Number(p.amount), at: new Date(p.at).toISOString(), by: p.by })),
        log: log.map(l => ({ at: new Date(l.at).toISOString(), action: l.action, detail: l.detail, by: l.by })),
        history: { visits: h.visits, noShows: h.no_shows, lastVisit: h.last_visit ? new Date(h.last_visit).toISOString() : null },
        dayClosed: closed,
        salonName: salon.name,
        invoices: ctx.role === 'staff' ? [] : invoices.map(i => ({ id: i.id, kind: i.kind, number: i.number, token: i.share_token, total: Number(i.total_incl) })),
        vatReady: isVatNumber(salon.vat_number),
      },
    };
  });
}

/* ======================= first-run setup ======================= */

const setupInput = z.object({
  salonName: z.string().trim().min(2, 'اكتبي اسم الصالون.').max(80),
  area: z.string().trim().max(120).default(''),
  ownerName: z.string().trim().min(1, 'اكتبي اسمك.').max(60),
  ownerPhone: z.string(),
  start: z.enum(['demo', 'catalog', 'empty']),
});
/** Only works while the database has no salon at all: it creates the first salon and its owner, then signs her in. */
export async function setupAction(input: z.input<typeof setupInput>): Promise<Result> {
  const p = setupInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message || 'تأكدي من البيانات.');
  const phone = normalizePhone(p.data.ownerPhone);
  if (!phone) return fail('اكتبي رقم جوال سعودي صحيح، مثل 05XXXXXXXX.');
  const tz = 'Asia/Riyadh';
  const { seedDemo } = await import('@/lib/demo');
  const { startSession } = await import('@/lib/auth');
  const out = await sql.begin(async tx => {
    await tx`LOCK TABLE salons IN EXCLUSIVE MODE`;
    const [{ n }] = await tx`SELECT count(*)::int AS n FROM salons WHERE NOT is_demo`;
    if (n > 0) return null;
    const [s] = await tx`INSERT INTO salons (name, area, timezone, home_service) VALUES (${p.data.salonName}, ${p.data.area}, ${tz}, ${p.data.start === 'demo'}) RETURNING id`;
    const [u] = await tx`INSERT INTO users (phone, name) VALUES (${phone}, ${p.data.ownerName})
                         ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
    await tx`INSERT INTO memberships (salon_id, user_id, role) VALUES (${s.id}, ${u.id}, 'owner')`;
    if (p.data.start === 'demo') await seedDemo(tx, s.id, u.id, tz);
    if (p.data.start === 'catalog') await addCatalog(tx, s.id, CATALOG.flatMap(c => c.items.map(i => i.name)));
    return { salonId: s.id as string, userId: u.id as string };
  });
  if (!out) return fail('الصالون متسجّل من قبل. ادخلي من صفحة الدخول.');
  await startSession(out.userId, out.salonId);
  redirect('/schedule');
}

/* ======================= ready service list ======================= */

async function addCatalog(tx: Tx, salonId: string, names: string[]) {
  const have = new Set((await tx`SELECT name FROM services WHERE salon_id = ${salonId}`).map(r => r.name));
  const [m] = await tx`SELECT COALESCE(max(sort), 0) AS n FROM services WHERE salon_id = ${salonId}`;
  let sort = Number(m.n), added = 0;
  for (const c of CATALOG) for (const i of c.items) {
    if (!names.includes(i.name) || have.has(i.name)) continue;
    // price left at 0 for the salon to fill in; nobody assigned yet, so it can't be booked until she sets it up
    await tx`INSERT INTO services (salon_id, name, category, duration_min, buffer_min, price, home_ok, sort)
             VALUES (${salonId}, ${i.name}, ${c.category}, ${i.dur}, ${i.buf}, 0, ${i.home}, ${++sort})`;
    added++;
  }
  return added;
}
export async function addCatalogServicesAction(names: string[]): Promise<Result<{ added: number }>> {
  return guard(async () => {
    const ctx = await requireAction('catalog');
    const list = z.array(z.string().max(80)).max(200).safeParse(names);
    if (!list.success || !list.data.length) return fail('اختاري خدمة على الأقل.');
    const added = await sql.begin(tx => addCatalog(tx, ctx.salonId, list.data));
    await audit(sql, ctx, 'service', null, 'catalog_added', { added });
    refresh();
    return { ok: true, added };
  });
}

/* ======================= demo ======================= */

export async function demoEnterAction(role: string) {
  const { ensureDemo, demoEnabled, DEMO_ROLES } = await import('@/lib/demoSalon');
  if (!demoEnabled() || !(role in DEMO_ROLES)) redirect('/login');
  const { startSession } = await import('@/lib/auth');
  const { salonId, userId } = await ensureDemo(role as keyof typeof DEMO_ROLES);
  await startSession(userId, salonId); // replaces the cookie; an interrupted switch never leaves you signed out
  redirect(role === 'staff' ? '/my-day' : '/schedule');
}
export async function demoResetAction() {
  const ctx = await getCtx();
  const { ensureDemo } = await import('@/lib/demoSalon');
  if (!ctx?.isDemo) redirect('/');
  await ensureDemo('owner', true);
  refresh();
  redirect(ctx.role === 'staff' ? '/my-day' : '/schedule');
}
