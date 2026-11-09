import { requirePage } from '@/lib/auth';
import { getServices, getStaff } from '@/lib/data';
import { serviceView, staffView } from '@/lib/mappers';
import { ServicesClient } from './ServicesClient';

export const metadata = { title: 'الخدمات' };
export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const ctx = await requirePage('catalog');
  const [services, staff] = await Promise.all([getServices(ctx.salonId, true), getStaff(ctx.salonId)]);
  return <ServicesClient services={services.map(s => ({ ...serviceView(s), active: s.active }))} staff={staff.map(staffView)} />;
}
