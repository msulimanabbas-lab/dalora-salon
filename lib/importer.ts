// Moving a salon over from another booking system (GoBeauti first).
// Pure functions: the import page runs them for the preview, the server action runs them again to apply.

export type RawService = [id: number, nameAr: string, nameEn: string, category: string, price: number, duration: number | null, visits: number, active: number, online: number];
export type ImportPayload = { source: 'gobeauti'; salon?: string; services: RawService[]; staffTitles: string[] };

export type CleanService = { name: string; category: string; price: number; duration: number; visits: number; flag?: string };
export type Skipped = { name: string; reason: string };
export type StaffPlan = { name: string; title: string; specialty: Specialty; color: string };
export type Specialty = 'hair' | 'nails' | 'makeup' | 'skin' | 'massage' | 'general';

const squash = (s: string) => (s || '').replace(/\s+/g, ' ').trim();

/** Their category names → shorter ones that read well on a phone. */
const CATEGORY: Record<string, string> = {
  'خدمات الشعر': 'الشعر',
  'علاجات و تغذية الشعر': 'علاجات الشعر',
  'خدمات تصفيف الشعر': 'تصفيف الشعر',
  'خدمات الاظافر والاطراف': 'الأظافر',
  'خدمات التجميل والوجه': 'التجميل والوجه',
  'خدمات العناية بالجسم': 'سبا ومساج',
  'خدمات ازالة الشعر': 'إزالة الشعر',
  'خدمات العروس أو الحجز': 'العروس',
  'خدمات إضافية': 'إضافات',
};
export const CATEGORY_ORDER = ['الشعر', 'علاجات الشعر', 'تصفيف الشعر', 'الأظافر', 'التجميل والوجه', 'إزالة الشعر', 'سبا ومساج', 'العروس', 'إضافات'];

/** Things on their list that aren't services a customer books. */
const NOT_A_SERVICE = /^(fast|عرض خدمات|كوفي)$/i;
const norm = (s: string) => squash(s).replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

export function cleanServices(raw: RawService[]): { services: CleanService[]; skipped: Skipped[] } {
  const seen = new Set<string>();
  const services: CleanService[] = [], skipped: Skipped[] = [];
  for (const [, nameAr, nameEn, cat, price, duration, visits, active] of raw) {
    const name = squash(nameAr) || squash(nameEn);
    if (!name) continue;
    if (!active) { skipped.push({ name, reason: 'موقوفة عندهم' }); continue; }
    if (NOT_A_SERVICE.test(name)) { skipped.push({ name, reason: 'مو خدمة تنحجز' }); continue; }
    if (!(price > 1)) { skipped.push({ name, reason: price > 0 ? `سعرها ${price} ريال (تجربة)` : 'بدون سعر' }); continue; }
    const key = norm(name);
    if (seen.has(key)) { skipped.push({ name, reason: 'مكررة' }); continue; }
    seen.add(key);
    const d = Math.min(600, Math.max(5, Math.round((duration || 30) / 5) * 5));
    const c = squash(cat);
    services.push({
      name, category: CATEGORY[c] ?? c ?? 'خدمات', price: Math.round(price * 100) / 100, duration: d, visits: visits || 0,
      flag: price >= 300 && d <= 15 ? `مدتها ${d} دقيقة وسعرها ${price}، تأكدي من المدة` : undefined,
    });
  }
  services.sort((a, b) => (CATEGORY_ORDER.indexOf(a.category) + 1 || 99) - (CATEGORY_ORDER.indexOf(b.category) + 1 || 99) || b.visits - a.visits);
  return { services, skipped };
}

/** Which categories each kind of specialist takes bookings for. */
export const SPECIALTY: Record<Specialty, { label: string; categories: string[] }> = {
  hair:    { label: 'شعر', categories: ['الشعر', 'علاجات الشعر', 'تصفيف الشعر', 'العروس'] },
  nails:   { label: 'أظافر', categories: ['الأظافر'] },
  makeup:  { label: 'مكياج', categories: ['التجميل والوجه', 'العروس'] },
  skin:    { label: 'بشرة', categories: ['التجميل والوجه', 'إزالة الشعر'] },
  massage: { label: 'سبا ومساج', categories: ['سبا ومساج'] },
  general: { label: 'تجميل عام', categories: ['التجميل والوجه', 'إزالة الشعر', 'سبا ومساج'] },
};
export function specialtyOf(title: string): Specialty | null {
  const t = squash(title);
  if (/مساج/.test(t)) return 'massage';
  if (/اظافر|أظافر/.test(t)) return 'nails';
  if (/مكياج/.test(t)) return 'makeup';
  if (/بشرة/.test(t)) return 'skin';
  if (/شعر|صبغ/.test(t)) return 'hair';
  if (/تجميل/.test(t)) return 'general';
  return null;
}

// New names for the team (their real names stay in their system).
const NAMES = ['جود', 'ريم', 'لمى', 'دانة', 'هيا', 'نوف', 'غلا', 'وعد', 'شهد', 'رهف', 'ليان', 'جنى', 'تالا', 'رزان', 'لين', 'سديم', 'ميار', 'أريج',
  'بشاير', 'دلال', 'حلا', 'عهد', 'مرام', 'نجود', 'رغد', 'سما', 'لجين', 'ديم', 'جوري', 'روان', 'أسيل', 'منيرة', 'العنود', 'ملاك', 'شوق', 'فجر', 'ندى', 'رنا', 'سلاف', 'يارا'];
const COLORS = ['#B9708A', '#8C6BA8', '#C99263', '#5E978A', '#6F86A8', '#C0636F', '#7E8A4E', '#A0705A'];
const TITLE: Record<Specialty, string> = { hair: 'شعر', nails: 'أظافر', makeup: 'مكياج', skin: 'بشرة وتنظيف', massage: 'مساج وسبا', general: 'تجميل عام' };
const ORDER: Specialty[] = ['hair', 'nails', 'makeup', 'skin', 'massage', 'general'];

export function planStaff(titles: string[]): StaffPlan[] {
  const specs = titles.map(t => ({ t: squash(t), s: specialtyOf(t) })).filter((x): x is { t: string; s: Specialty } => !!x.s);
  specs.sort((a, b) => ORDER.indexOf(a.s) - ORDER.indexOf(b.s));
  return specs.map((x, i) => ({
    name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''),
    title: /مساعدة/.test(x.t) ? `مساعدة ${TITLE[x.s]}` : /صبغ/.test(x.t) ? 'صبغات' : TITLE[x.s],
    specialty: x.s, color: COLORS[ORDER.indexOf(x.s) % COLORS.length],
  }));
}
