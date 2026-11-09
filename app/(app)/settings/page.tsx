import { requirePage } from '@/lib/auth';
import { getSalon } from '@/lib/data';
import { SettingsForm } from './SettingsForm';

export const metadata = { title: 'الإعدادات' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const ctx = await requirePage('settings');
  const s = await getSalon(ctx.salonId);
  return (
    <div className="stack">
      <div className="page-head"><div><h1>الإعدادات</h1><p className="sub">تنطبق على كل الحجوزات، من التطبيق ومن الاستقبال.</p></div></div>
      <SettingsForm initial={{
        name: s.name, area: s.area, phone: s.phone, opens_min: s.opens_min, closes_min: s.closes_min, cancel_hours: s.cancel_hours,
        deposit_pct: s.deposit_pct, late_mins: s.late_mins, lead_mins: s.lead_mins, slot_step: s.slot_step as 15,
        home_service: s.home_service, home_fee: Number(s.home_fee), travel_mins: s.travel_mins,
        vat_number: s.vat_number, cr_number: s.cr_number, address: s.address,
      }} />
    </div>
  );
}
