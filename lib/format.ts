export function sar(n: number | string | null | undefined) {
  const v = Math.round(Number(n || 0) * 100) / 100;
  return `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} ر.س`;
}
export function initial(name: string) { return (name || '؟').trim().charAt(0) || '؟'; }

/** Normalise a Saudi mobile to E.164 (+9665XXXXXXXX). Returns null if it isn't one. */
export function normalizePhone(input: string): string | null {
  const d = (input || '').replace(/[^\d+]/g, '').replace(/^00/, '+');
  let n = d.replace(/^\+/, '');
  if (n.startsWith('966')) n = n.slice(3);
  if (n.startsWith('0')) n = n.slice(1);
  if (/^5\d{8}$/.test(n)) return '+966' + n;
  return null;
}
/** +966512345678 → 0512345678 */
export function displayPhone(e164: string) {
  return e164.startsWith('+966') ? '0' + e164.slice(4) : e164;
}

export const STATUS_LABEL: Record<string, string> = {
  booked: 'محجوز', arrived: 'وصلت', in_service: 'في الخدمة', done: 'انتهت', no_show: 'غياب', cancelled: 'ملغي',
};
export const SOURCE_LABEL: Record<string, string> = { whatsapp: 'واتساب', phone: 'اتصال', walk_in: 'حضور مباشر', social: 'سوشل ميديا', app: 'التطبيق' };

/** wa.me link that opens a chat with the customer, optionally with a message typed in */
export function waLink(e164: string, text = '') {
  return `https://wa.me/${e164.replace(/\D/g, '')}${text ? '?text=' + encodeURIComponent(text) : ''}`;
}
export const METHOD_LABEL: Record<string, string> = { cash: 'كاش', card: 'شبكة (مدى)', online: 'دفع إلكتروني', transfer: 'تحويل' };
export const ROLE_LABEL: Record<string, string> = {
  owner: 'المالكة', manager: 'مديرة', reception: 'الاستقبال', staff: 'مختصة', accountant: 'المحاسبة',
};
