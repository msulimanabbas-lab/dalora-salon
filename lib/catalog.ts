// A ready list of common salon & spa services in Saudi Arabia: names, typical durations and prep time.
// Prices are left for each salon to fill in. Durations are starting points; the salon adjusts them.

export type CatalogItem = { name: string; dur: number; buf: number; home: boolean };
export const CATALOG: { category: string; items: CatalogItem[] }[] = [
  { category: 'شعر', items: [
    { name: 'قص شعر', dur: 45, buf: 10, home: false },
    { name: 'قص أطراف', dur: 30, buf: 10, home: false },
    { name: 'سشوار قصير', dur: 30, buf: 10, home: true },
    { name: 'سشوار طويل', dur: 45, buf: 10, home: true },
    { name: 'استشوار ويفي', dur: 60, buf: 10, home: true },
    { name: 'تسريحة سهرة', dur: 60, buf: 10, home: true },
    { name: 'تسريحة عروس', dur: 120, buf: 15, home: true },
    { name: 'غسيل وماسك شعر', dur: 30, buf: 10, home: false },
    { name: 'حمام زيت', dur: 45, buf: 10, home: false },
  ] },
  { category: 'صبغات وعلاجات الشعر', items: [
    { name: 'صبغة جذور', dur: 90, buf: 15, home: false },
    { name: 'صبغة كاملة', dur: 120, buf: 15, home: false },
    { name: 'هايلايت', dur: 150, buf: 15, home: false },
    { name: 'بالياج', dur: 180, buf: 15, home: false },
    { name: 'تونر', dur: 45, buf: 10, home: false },
    { name: 'بروتين', dur: 150, buf: 15, home: false },
    { name: 'كيراتين', dur: 180, buf: 15, home: false },
    { name: 'بوتوكس شعر', dur: 120, buf: 15, home: false },
  ] },
  { category: 'أظافر', items: [
    { name: 'مناكير', dur: 45, buf: 10, home: true },
    { name: 'بديكير', dur: 60, buf: 10, home: true },
    { name: 'مناكير وبديكير', dur: 90, buf: 10, home: true },
    { name: 'طلاء جل', dur: 45, buf: 10, home: true },
    { name: 'تركيب أظافر', dur: 90, buf: 10, home: false },
    { name: 'تعبئة أظافر', dur: 60, buf: 10, home: false },
    { name: 'إزالة جل أو تركيب', dur: 30, buf: 5, home: true },
    { name: 'رسم على الأظافر (للظفر)', dur: 10, buf: 0, home: true },
  ] },
  { category: 'رموش وحواجب', items: [
    { name: 'رموش كلاسيك', dur: 90, buf: 15, home: true },
    { name: 'رموش هايبرد', dur: 120, buf: 15, home: true },
    { name: 'رموش فوليوم', dur: 150, buf: 15, home: true },
    { name: 'تعبئة رموش', dur: 60, buf: 10, home: true },
    { name: 'إزالة رموش', dur: 20, buf: 5, home: true },
    { name: 'رفع رموش', dur: 60, buf: 10, home: true },
    { name: 'تهذيب حواجب', dur: 20, buf: 5, home: true },
    { name: 'تشقير حواجب', dur: 30, buf: 5, home: true },
    { name: 'لامينيشن حواجب', dur: 45, buf: 10, home: true },
  ] },
  { category: 'مكياج', items: [
    { name: 'مكياج ناعم', dur: 45, buf: 10, home: true },
    { name: 'مكياج سهرة', dur: 60, buf: 10, home: true },
    { name: 'مكياج عروس', dur: 120, buf: 15, home: true },
    { name: 'مكياج خطوبة / ملكة', dur: 90, buf: 15, home: true },
  ] },
  { category: 'بشرة', items: [
    { name: 'تنظيف بشرة', dur: 60, buf: 15, home: false },
    { name: 'تنظيف بشرة عميق', dur: 90, buf: 15, home: false },
    { name: 'هيدرافيشل', dur: 60, buf: 15, home: false },
    { name: 'ماسك نضارة', dur: 30, buf: 10, home: true },
  ] },
  { category: 'سبا ومساج', items: [
    { name: 'حمام مغربي', dur: 60, buf: 20, home: false },
    { name: 'حمام مغربي ملكي', dur: 90, buf: 20, home: false },
    { name: 'مساج استرخاء', dur: 60, buf: 15, home: true },
    { name: 'مساج عميق', dur: 60, buf: 15, home: true },
    { name: 'مساج بالأحجار الساخنة', dur: 75, buf: 15, home: false },
    { name: 'سنفرة الجسم', dur: 45, buf: 15, home: false },
  ] },
  { category: 'إزالة الشعر', items: [
    { name: 'حلاوة وجه', dur: 20, buf: 5, home: true },
    { name: 'حلاوة يدين', dur: 30, buf: 5, home: true },
    { name: 'حلاوة رجلين', dur: 45, buf: 10, home: true },
    { name: 'حلاوة جسم كامل', dur: 90, buf: 15, home: true },
    { name: 'خيط وجه', dur: 20, buf: 5, home: true },
  ] },
  { category: 'حناء', items: [
    { name: 'حناء يدين', dur: 45, buf: 10, home: true },
    { name: 'حناء يدين ورجلين', dur: 75, buf: 10, home: true },
    { name: 'حناء عروس', dur: 150, buf: 15, home: true },
  ] },
];
export const CATALOG_SIZE = CATALOG.reduce((n, c) => n + c.items.length, 0);
