import 'server-only';
import { sql, type Tx } from './db';
import { seedDemo } from './demo';
import { issueInvoice } from './invoice';
import { todayIn, zoned } from './time';

/**
 * One shared demo salon for showing Dalora to salon owners: anyone can step in as the owner, the front desk
 * or a specialist without a login code. It holds sample data only, and refills itself each new day so the
 * schedule always shows "today". A salon's real data never lives here.
 */
const TZ = 'Asia/Riyadh';
export const DEMO_ROLES = {
  owner:     { phone: '+966500000901', name: 'صاحبة الصالون', role: 'owner' },
  reception: { phone: '+966500000902', name: 'الاستقبال', role: 'reception' },
  staff:     { phone: '+966500000903', name: 'منى', role: 'staff' },
} as const;
export type DemoRole = keyof typeof DEMO_ROLES;

export const demoEnabled = () => process.env.DEMO_DISABLED !== '1';

/** Makes sure the demo salon exists and holds today's data. Returns its id and the user id for the role. */
export async function ensureDemo(role: DemoRole, force = false): Promise<{ salonId: string; userId: string }> {
  return sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(4242001)`; // one refill at a time
    let [s] = await tx`SELECT id, demo_day FROM salons WHERE is_demo LIMIT 1`;
    if (!s) {
      [s] = await tx`INSERT INTO salons (name, area, timezone, home_service, is_demo, vat_number, cr_number, address)
                     VALUES ('صالون تجريبي', 'حي النرجس، الرياض', ${TZ}, true, true, '300000000000003', '1010000000', 'حي النرجس، الرياض')
                     RETURNING id, demo_day`;
    }
    const users: Record<string, string> = {};
    for (const [k, u] of Object.entries(DEMO_ROLES)) {
      const [r] = await tx`INSERT INTO users (phone, name) VALUES (${u.phone}, ${u.name})
                           ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
      users[k] = r.id;
    }
    const today = todayIn(TZ);
    if (force || s.demo_day !== today) await refill(tx, s.id, users.owner, today);
    const [mona] = await tx`SELECT id FROM staff WHERE salon_id = ${s.id} AND name = 'منى' LIMIT 1`;
    for (const [k, u] of Object.entries(DEMO_ROLES)) {
      await tx`INSERT INTO memberships (salon_id, user_id, role, staff_id, active)
               VALUES (${s.id}, ${users[k]}, ${u.role}, ${u.role === 'staff' ? mona?.id ?? null : null}, true)
               ON CONFLICT (salon_id, user_id) DO UPDATE SET role = EXCLUDED.role, staff_id = EXCLUDED.staff_id, active = true`;
    }
    return { salonId: s.id as string, userId: users[role] };
  });
}

async function refill(tx: Tx, salonId: string, ownerId: string, today: string) {
  await tx`SELECT set_config('dalora.wipe', 'on', true)`;
  await tx`DELETE FROM invoices WHERE salon_id = ${salonId}`;
  await tx`DELETE FROM payments WHERE salon_id = ${salonId}`;
  await tx`DELETE FROM bookings WHERE salon_id = ${salonId}`;
  await tx`DELETE FROM customers WHERE salon_id = ${salonId}`;
  await tx`DELETE FROM staff_time_off WHERE salon_id = ${salonId}`;
  await tx`DELETE FROM services WHERE salon_id = ${salonId}`;
  await tx`UPDATE memberships SET staff_id = NULL WHERE salon_id = ${salonId}`;
  await tx`DELETE FROM staff WHERE salon_id = ${salonId}`;
  await tx`DELETE FROM day_closes WHERE salon_id = ${salonId}`;
  await tx`DELETE FROM audit_log WHERE salon_id = ${salonId}`;
  await tx`UPDATE salons SET invoice_icv = 0, invoice_pih = '', demo_day = ${today} WHERE id = ${salonId}`;
  await seedDemo(tx, salonId, ownerId, TZ);
  // today's fully paid bookings get their invoices, so the invoice screens have something to show
  const paid = await tx`SELECT id, starts_at FROM bookings WHERE salon_id = ${salonId} AND status NOT IN ('cancelled', 'no_show')
                        AND paid >= total AND total > 0 AND starts_at >= ${zoned(today, 0, TZ)} ORDER BY starts_at`;
  for (const b of paid) await issueInvoice(tx, { salonId, userId: ownerId, bookingId: b.id, kind: 'invoice' });
}
