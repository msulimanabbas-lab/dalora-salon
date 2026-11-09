import 'server-only';
import { randomBytes, randomInt, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1 };

/** scrypt$N$r$p$salt$hash (base64) */
export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(pw: string, stored: string | null) {
  if (!stored) return false;
  const [kind, n, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt') return false;
  const want = Buffer.from(hash, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), want.length, { N: +n, r: +r, p: +p });
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Easy to read out loud or type on a phone: no 0/O, 1/l/I. e.g. "kd7m-4tqe" */
export function generatePassword() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  const pick = (n: number) => Array.from({ length: n }, () => a[randomInt(a.length)]).join('');
  return `${pick(4)}-${pick(4)}`;
}

export const validUsername = (u: string) => /^[a-z0-9][a-z0-9._-]{2,31}$/.test(u);
export const passwordProblem = (pw: string) =>
  pw.length < 8 ? 'كلمة المرور 8 خانات على الأقل.' : pw.length > 100 ? 'كلمة المرور طويلة مرة.' : null;
