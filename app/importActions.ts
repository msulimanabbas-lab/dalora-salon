'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql, type Tx } from '@/lib/db';
import { requireAction, Forbidden } from '@/lib/auth';
import { cleanServices, planStaff, SPECIALTY, type ImportPayload } from '@/lib/importer';
import { generatePassword, hashPassword } from '@/lib/password';
import { addDays, nowMinIn, todayIn, weekdayOf, zoned } from '@/lib/time';

const payloadSchema = z.object({
  source: z.literal('gobeauti'),
  salon: z.string().max(80).optional(),
  services: z.array(z.tuple([z.number(), z.string().max(200), z.string().max(200), z.string().max(100), z.number(), z.number().nullable(), z.number(), z.number(), z.number()])).max(2000),
  staffTitles: z.array(z.string().max(80)).max(300),
});
const optsSchema = z.object({
  wipe: z.boolean(), sample: z.boolean(), opens: z.number().int().min(0).max(1439), closes: z.number().int().min(1).max(1440),
  accounts: z.boolean(), prefix: z.string().regex(/^[a-z][a-z0-9]{1,15}$/),
});

type Cred = { role: string; name: string; username: string; password: string };
type Out = { ok: true; services: number; staff: number; bookings: number; creds: Cred[] } | { ok: false; error: string };

/**
 * Replaces a salon's catalog and team with what came over from the old system.
 * Owner only. With `wipe`, the salon's current bookings, customers, payments, services and team are removed first
 * (refused if any tax invoice was issued: those must be kept).
 */
export async function importSalonAction(payload: ImportPayload, options: z.input<typeof optsSchema>): Promise<Out> {
  let ctx;
  try { ctx = await requireAction('settings'); } catch (e) { if (e instanceof Forbidden) return { ok: false, error: 'للمالكة بس.' }; throw e; }
  const p = payloadSchema.safeParse(payload), o = optsSchema.safeParse(options);
  if (!p.success || !o.success) return { ok: false, error: 'الملف غير صحيح.' };
  if (o.data.closes <= o.data.opens) return { ok: false, error: 'وقت الإقفال لازم يكون بعد الفتح.' };
  const { services } = cleanServices(p.data.services as ImportPayload['services']);
  const staff = planStaff(p.data.staffTitles);
  if (!services.length) return { ok: false, error: 'ما فيه خدمات صالحة في الملف.' };

  const salonId = ctx.salonId;
  // passwords are hashed before the transaction (scrypt is slow on purpose)
  const roles = [
    ['owner', 'تجربة المالكة', 'owner'], ['manager', 'تجربة المديرة', 'manager'],
    ['reception', 'استقبال ١', 'reception1'], ['reception', 'استقبال ٢', 'reception2'],
    ['staff', '', 'specialist'], ['accountant', 'تجربة المحاسبة', 'accounts'],
  ] as const;
  const creds: (Cred & { hash: string })[] = [];
  if (o.data.accounts) for (const [role, name, suffix] of roles) {
    const password = generatePassword();
    creds.push({ role, name, username: `${o.data.prefix}.${suffix}`, password, hash: await hashPassword(password) });
  }

  try {
    const out = await sql.begin(async tx => {
      const [salon] = await tx`SELECT timezone FROM salons WHERE id = ${salonId} FOR UPDATE`;
      if (o.data.wipe) {
        const [{ n }] = await tx`SELECT count(*)::int AS n FROM invoices WHERE salon_id = ${salonId}`;
        if (n > 0) throw new Error('INVOICES');
        await tx`DELETE FROM payments WHERE salon_id = ${salonId}`;
        await tx`DELETE FROM bookings WHERE salon_id = ${salonId}`;
        await tx`DELETE FROM customers WHERE salon_id = ${salonId}`;
        await tx`DELETE FROM staff_time_off WHERE salon_id = ${salonId}`;
        await tx`DELETE FROM services WHERE salon_id = ${salonId}`;
        await tx`UPDATE memberships SET staff_id = NULL, active = (role <> 'staff') WHERE salon_id = ${salonId} AND staff_id IS NOT NULL`;
        await tx`DELETE FROM staff WHERE salon_id = ${salonId}`;
        await tx`DELETE FROM day_closes WHERE salon_id = ${salonId}`;
      }
      await tx`UPDATE salons SET opens_min = ${o.data.opens}, closes_min = ${o.data.closes} WHERE id = ${salonId}`;

      // services (one round trip; names are unique after cleaning)
      const svcRows = services.map((s, i) => ({ salon_id: salonId, name: s.name, category: s.category, duration_min: s.duration, buffer_min: 0, price: s.price, home_ok: false, sort: i + 1 }));
      const inserted = await tx`INSERT INTO services ${tx(svcRows, 'salon_id', 'name', 'category', 'duration_min', 'buffer_min', 'price', 'home_ok', 'sort')} RETURNING id, name`;
      const idOf = new Map(inserted.map(r => [r.name as string, r.id as string]));
      const svcIds = services.map(s => ({ id: idOf.get(s.name)!, category: s.category, duration: s.duration, price: s.price, visits: s.visits, name: s.name }));

      // team: same hours every day, services by specialty
      const week = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [String(d), [o.data.opens, o.data.closes]]));
      const staffRows = staff.map((st, i) => ({ salon_id: salonId, name: st.name, title: st.title, color: st.color, week: tx.json(week as never), works_home: false, commission_pct: 0, sort: i + 1 }));
      const made = await tx`INSERT INTO staff ${tx(staffRows, 'salon_id', 'name', 'title', 'color', 'week', 'works_home', 'commission_pct', 'sort')} RETURNING id, sort`;
      const team = made.sort((a, b) => a.sort - b.sort).map((r, i) => ({ id: r.id as string, name: staff[i].name, cats: SPECIALTY[staff[i].specialty].categories }));
      const links: { service_id: string; staff_id: string }[] = [];
      for (const t of team) for (const sv of svcIds) {
        // add-ons (coffee, socks…) can be done by anyone
        if (t.cats.includes(sv.category) || sv.category === 'إضافات') links.push({ service_id: sv.id, staff_id: t.id });
      }
      for (let i = 0; i < links.length; i += 2000) await tx`INSERT INTO service_staff ${tx(links.slice(i, i + 2000), 'service_id', 'staff_id')}`;

      const bookings = o.data.sample ? await sampleBookings(tx, salonId, ctx.userId, salon.timezone, svcIds, team, o.data.opens, o.data.closes) : 0;

      // one sign-in per role so the owners can try each view
      const out: Cred[] = [];
      for (const c of creds) {
        const linked = c.role === 'staff' ? team.find(t => t.cats.includes('الشعر')) ?? team[0] : null;
        const name = c.role === 'staff' ? `${linked?.name ?? 'مختصة'} (مختصة)` : c.name;
        const [u] = await tx`INSERT INTO users (name, username, password_hash, must_change) VALUES (${name}, ${c.username}, ${c.hash}, false)
                             ON CONFLICT (lower(username)) WHERE username IS NOT NULL
                             DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, failed_logins = 0, locked_until = NULL
                             RETURNING id`;
        await tx`INSERT INTO memberships (salon_id, user_id, role, staff_id, active) VALUES (${salonId}, ${u.id}, ${c.role}, ${linked?.id ?? null}, true)
                 ON CONFLICT (salon_id, user_id) DO UPDATE SET role = EXCLUDED.role, staff_id = EXCLUDED.staff_id, active = true`;
        out.push({ role: c.role, name, username: c.username, password: c.password });
      }
      await tx`INSERT INTO audit_log (salon_id, entity, entity_id, action, detail, user_id)
               VALUES (${salonId}, 'salon', ${salonId}, 'imported', ${tx.json({ source: p.data.source, services: svcIds.length, staff: team.length, wipe: o.data.wipe })}, ${ctx.userId})`;
      return { services: svcIds.length, staff: team.length, bookings, creds: out };
    });
    revalidatePath('/', 'layout');
    return { ok: true, ...out };
  } catch (e) {
    if (e instanceof Error && e.message === 'INVOICES') return { ok: false, error: 'فيه فواتير ضريبية صادرة، فما ينمسح الصالون. استوردي بدون مسح.' };
    console.error(e);
    return { ok: false, error: 'صار خطأ أثناء الاستيراد. ما تغيّر شي.' };
  }
}

/** Two weeks back and one ahead of made-up bookings on the real menu, so the schedule looks like a working day. */
async function sampleBookings(tx: Tx, salonId: string, userId: string, tz: string,
  svcs: { id: string; category: string; duration: number; price: number; visits: number; name: string }[],
  team: { id: string; cats: string[] }[], opens: number, closes: number) {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const today = todayIn(tz), NOW = nowMinIn(tz);
  const first = ['نورة', 'هند', 'أمل', 'سارة', 'مها', 'عبير', 'أفنان', 'غادة', 'منال', 'خلود', 'رنيم', 'لولوة', 'بدور', 'حصة', 'مشاعل', 'نوال', 'سمر', 'ابتهال', 'وجدان', 'هديل'];
  const customers: string[] = [];
  for (let i = 0; i < first.length; i++) {
    const [c] = await tx`INSERT INTO customers (salon_id, name, phone) VALUES (${salonId}, ${'مثال: ' + first[i]}, ${'+96650000' + String(1000 + i * 37)})
                         ON CONFLICT (salon_id, phone) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
    customers.push(c.id);
  }
  // favour what they actually sell most
  const popular = (cats: string[]) => {
    const list = svcs.filter(s => cats.includes(s.category) && s.duration <= 180);
    return list.sort((a, b) => b.visits - a.visits).slice(0, 12);
  };
  type Row = { salon_id: string; code: string; customer_id: string; staff_id: string; starts_at: Date; ends_at: Date; buffer_min: number; travel_min: number;
    status: string; source: string; subtotal: number; total: number; paid: number; created_by: string; occupied: string;
    arrived_at: Date | null; started_at: Date | null; finished_at: Date | null };
  const rows: Row[] = []; const meta: { svc: typeof svcs[number]; day: string; method: string }[] = [];
  let code = 70000;
  for (let off = -14; off <= 7; off++) {
    const day = addDays(today, off);
    if (weekdayOf(day) === 5 && rnd() < 0.5) continue;
    for (const t of team) {
      const options = popular(t.cats);
      if (!options.length) continue;
      let at = opens + Math.floor(rnd() * 4) * 30;
      const n = off > 0 ? Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const s = pick(options);
        if (at + s.duration > closes) break;
        const past = off < 0 || (off === 0 && at + s.duration <= NOW);
        const status = past ? (rnd() < 0.05 ? 'no_show' : 'done') : off === 0 && at <= NOW ? 'in_service' : 'booked';
        const starts = zoned(day, at, tz), ends = zoned(day, at + s.duration, tz);
        const begun = status === 'done' || status === 'in_service';
        rows.push({ salon_id: salonId, code: 'DL-' + code++, customer_id: pick(customers), staff_id: t.id, starts_at: starts, ends_at: ends, buffer_min: 0, travel_min: 0,
          status, source: pick(['whatsapp', 'whatsapp', 'phone', 'walk_in']), subtotal: s.price, total: s.price, paid: status === 'done' ? s.price : 0,
          created_by: userId, occupied: 'empty', arrived_at: begun ? starts : null, started_at: begun ? starts : null, finished_at: status === 'done' ? ends : null });
        meta.push({ svc: s, day, method: pick(['cash', 'card', 'card']) });
        at += s.duration + (rnd() < 0.5 ? 30 : 0);
      }
    }
  }
  const cols = ['salon_id', 'code', 'customer_id', 'staff_id', 'starts_at', 'ends_at', 'buffer_min', 'travel_min', 'status', 'source', 'subtotal', 'total', 'paid',
    'created_by', 'occupied', 'arrived_at', 'started_at', 'finished_at'];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = await tx`INSERT INTO bookings ${(tx as any)(chunk, cols)} RETURNING id, code`;
    const byCode = new Map(ids.map(r => [r.code as string, r.id as string]));
    const items = chunk.map((r, k) => ({ booking_id: byCode.get(r.code)!, service_id: meta[i + k].svc.id, name: meta[i + k].svc.name, duration_min: meta[i + k].svc.duration, price: meta[i + k].svc.price, sort: 0 }));
    await tx`INSERT INTO booking_items ${tx(items, 'booking_id', 'service_id', 'name', 'duration_min', 'price', 'sort')}`;
    const pays = chunk.flatMap((r, k) => r.paid > 0 ? [{ salon_id: salonId, booking_id: byCode.get(r.code)!, customer_id: r.customer_id, method: meta[i + k].method, kind: 'payment', amount: r.paid, business_date: meta[i + k].day, received_by: userId }] : []);
    if (pays.length) await tx`INSERT INTO payments ${tx(pays, 'salon_id', 'booking_id', 'customer_id', 'method', 'kind', 'amount', 'business_date', 'received_by')}`;
  }
  await tx`SELECT dalora_vary_sample_times(${salonId})`; // believable start/finish times for the report
  const made = rows.length;
  return made;
}
