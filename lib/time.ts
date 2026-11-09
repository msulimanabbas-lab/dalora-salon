// Salon-local time helpers. A "day" is a YYYY-MM-DD string in the salon's time zone;
// a time of day is minutes after local midnight.

export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const WEEKDAYS_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
export const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const pad = (n: number) => String(n).padStart(2, '0');

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

/** The salon-local calendar day, minute of day and weekday of an instant. */
export function localParts(d: Date, tz: string) {
  const p: Record<string, string> = {};
  for (const x of dtf(tz).formatToParts(d)) p[x.type] = x.value;
  const day = `${p.year}-${p.month}-${p.day}`;
  const min = Number(p.hour) * 60 + Number(p.minute);
  return { day, min, weekday: weekdayOf(day) };
}

/** The UTC instant for a salon-local day and minute. Exact for zones without a DST jump at that minute. */
export function zoned(day: string, min: number, tz: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, min);
  const offset = (t: number) => {
    const lp = localParts(new Date(t), tz);
    const [ly, lm, ld] = lp.day.split('-').map(Number);
    return Date.UTC(ly, lm - 1, ld, 0, lp.min) - t;
  };
  let t = guess - offset(guess);
  t = guess - offset(t);
  return new Date(t);
}

export function todayIn(tz: string) { return localParts(new Date(), tz).day; }
export function nowMinIn(tz: string) { return localParts(new Date(), tz).min; }

export function weekdayOf(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export function isDay(s: unknown): s is string { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

/** 2:30 م */
export function fmtTime(min: number) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  const h12 = h % 12 || 12;
  return `${h12}:${pad(m)} ${h < 12 ? 'ص' : 'م'}`;
}
/** 14:30 for <input type=time> */
export function hhmm(min: number) { return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }
export function parseHhmm(v: string) { const [h, m] = v.split(':').map(Number); return h * 60 + (m || 0); }

/** الاثنين 9 نوفمبر */
export function fmtDay(day: string, withYear = false) {
  const [y, m, d] = day.split('-').map(Number);
  return `${WEEKDAYS[weekdayOf(day)]} ${d} ${MONTHS[m - 1]}${withYear ? ' ' + y : ''}`;
}
export function fmtShortDay(day: string) {
  const [, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
export function fmtDuration(min: number) {
  if (min < 60) return `${min} دقيقة`;
  const h = Math.floor(min / 60), m = min % 60;
  const hs = h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : `${h} ساعات`;
  return m ? `${hs} و${m} د` : hs;
}
