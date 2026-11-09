import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { sql } from './db';
import { sendSms } from './sms';

export type Role = 'owner' | 'manager' | 'reception' | 'staff' | 'accountant';
export type Ctx = {
  userId: string; userName: string; phone: string;
  salonId: string; salonName: string; tz: string;
  role: Role; staffId: string | null;
};

const COOKIE = 'dl_session';
const SESSION_DAYS = 30;
const OTP_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;

const secret = () => process.env.AUTH_SECRET || 'dev-secret-change-me';
const hash = (s: string) => createHash('sha256').update(secret() + ':' + s).digest('hex');

/** What each role may do. Pages and server actions both check these. */
export const CAN = {
  schedule:      ['owner', 'manager', 'reception', 'accountant'] as Role[],
  editBookings:  ['owner', 'manager', 'reception'] as Role[],
  customers:     ['owner', 'manager', 'reception'] as Role[],
  money:         ['owner', 'manager', 'reception', 'accountant'] as Role[],
  takePayments:  ['owner', 'manager', 'reception'] as Role[],
  closeDay:      ['owner', 'manager', 'reception', 'accountant'] as Role[],
  refunds:       ['owner', 'manager'] as Role[],
  reports:       ['owner', 'manager', 'accountant'] as Role[],
  catalog:       ['owner', 'manager'] as Role[],          // services + staff
  team:          ['owner'] as Role[],                     // who can log in and their roles
  settings:      ['owner'] as Role[],
  myDay:         ['staff'] as Role[],
};
export const can = (ctx: Ctx, what: keyof typeof CAN) => CAN[what].includes(ctx.role);

/* ---------------- OTP ---------------- */

/**
 * How login codes reach people:
 *  - SMS_PROVIDER set      → a random code by SMS (production)
 *  - TEST_ACCESS_CODE set  → no SMS; everyone types this fixed 6-digit code (a private test deployment)
 *  - neither, development  → a random code shown on screen
 */
export function loginMode(): 'sms' | 'test' | 'dev' | 'off' {
  if (process.env.SMS_PROVIDER) return 'sms';
  if (/^\d{6}$/.test(process.env.TEST_ACCESS_CODE || '')) return 'test';
  return process.env.NODE_ENV === 'production' ? 'off' : 'dev';
}

export async function requestCode(phone: string): Promise<{ ok: true; devCode?: string; testMode?: boolean } | { ok: false; error: string }> {
  const mode = loginMode();
  if (mode === 'off') return { ok: false, error: 'الدخول غير مهيّأ: أضيفي TEST_ACCESS_CODE أو مزوّد رسائل في إعدادات الاستضافة.' };
  const [member] = await sql`
    SELECT 1 FROM users u JOIN memberships m ON m.user_id = u.id AND m.active
    WHERE u.phone = ${phone} LIMIT 1`;
  // Same answer whether or not the number exists, so the form can't be used to discover accounts.
  const [last] = await sql`SELECT sent_at FROM otp_codes WHERE phone = ${phone}`;
  if (mode !== 'test' && last && Date.now() - new Date(last.sent_at).getTime() < 30_000) {
    return { ok: false, error: 'انتظري نص دقيقة قبل طلب رمز جديد.' };
  }
  const code = mode === 'test' ? process.env.TEST_ACCESS_CODE! : String(randomInt(100000, 1000000));
  await sql`
    INSERT INTO otp_codes (phone, code_hash, expires_at, attempts, sent_at)
    VALUES (${phone}, ${hash(phone + ':' + code)}, now() + make_interval(mins => ${OTP_MINUTES}), 0, now())
    ON CONFLICT (phone) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0, sent_at = now()`;
  if (mode === 'test') return { ok: true, testMode: true };
  if (!member) return { ok: true };
  if (mode === 'sms') {
    await sendSms(phone, `رمز الدخول إلى Dalora: ${code}`);
    return { ok: true };
  }
  return { ok: true, devCode: code }; // development: no SMS provider configured
}

export async function verifyCode(phone: string, code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await sql`SELECT code_hash, expires_at, attempts FROM otp_codes WHERE phone = ${phone}`;
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return { ok: false, error: 'الرمز انتهى. اطلبي رمز جديد.' };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, error: 'محاولات كثيرة. اطلبي رمز جديد.' };
  const a = Buffer.from(row.code_hash), b = Buffer.from(hash(phone + ':' + code.trim()));
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await sql`UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = ${phone}`;
    return { ok: false, error: 'الرمز غير صحيح.' };
  }
  const [m] = await sql`
    SELECT u.id AS user_id, m.salon_id FROM users u
    JOIN memberships m ON m.user_id = u.id AND m.active
    WHERE u.phone = ${phone} ORDER BY m.created_at LIMIT 1`;
  if (!m) return { ok: false, error: 'هذا الرقم غير مسجّل في أي صالون.' };
  await sql`DELETE FROM otp_codes WHERE phone = ${phone}`;
  await startSession(m.user_id, m.salon_id);
  return { ok: true };
}

/* ---------------- sessions ---------------- */

export async function startSession(userId: string, salonId: string) {
  const token = randomBytes(32).toString('base64url');
  await sql`
    INSERT INTO sessions (token_hash, user_id, salon_id, expires_at)
    VALUES (${hash(token)}, ${userId}, ${salonId}, now() + make_interval(days => ${SESSION_DAYS}))`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${hash(token)}`;
  jar.delete(COOKIE);
}

export async function getCtx(): Promise<Ctx | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [r] = await sql`
    SELECT u.id AS user_id, u.name AS user_name, u.phone, s.id AS salon_id, s.name AS salon_name, s.timezone,
           m.role, m.staff_id
    FROM sessions se
    JOIN users u ON u.id = se.user_id
    JOIN salons s ON s.id = se.salon_id
    JOIN memberships m ON m.user_id = u.id AND m.salon_id = s.id AND m.active
    WHERE se.token_hash = ${hash(token)} AND se.expires_at > now()`;
  if (!r) return null;
  return {
    userId: r.user_id, userName: r.user_name, phone: r.phone,
    salonId: r.salon_id, salonName: r.salon_name, tz: r.timezone,
    role: r.role, staffId: r.staff_id,
  };
}

/** For pages: the signed-in context, or a redirect to /login (or home if the role may not see this page). */
export async function requirePage(what?: keyof typeof CAN): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect('/login');
  if (what && !can(ctx, what)) redirect('/');
  return ctx;
}

export class Forbidden extends Error {}
/** For server actions: throws if not signed in or not allowed. */
export async function requireAction(what: keyof typeof CAN): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx || !can(ctx, what)) throw new Forbidden('غير مسموح');
  return ctx;
}
