import { requirePage, can } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getSalon, getServices, getStaff } from '@/lib/data';
import { localParts, todayIn } from '@/lib/time';
import { TeamClient } from './TeamClient';

export const metadata = { title: 'الفريق' };
export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const ctx = await requirePage('catalog');
  const salon = await getSalon(ctx.salonId);
  const [staff, services, members, off] = await Promise.all([
    getStaff(ctx.salonId, true), getServices(ctx.salonId, true),
    can(ctx, 'team') ? sql`SELECT m.id, m.role, m.active, m.staff_id, u.name, u.phone, u.username, u.id AS user_id FROM memberships m JOIN users u ON u.id = m.user_id
                           WHERE m.salon_id = ${ctx.salonId} ORDER BY m.active DESC, m.created_at` : Promise.resolve([]),
    sql`SELECT id, staff_id, starts_at, ends_at, reason FROM staff_time_off WHERE salon_id = ${ctx.salonId} AND ends_at > now() ORDER BY starts_at LIMIT 50`,
  ]);
  return (
    <TeamClient
      today={todayIn(salon.timezone)}
      opens={salon.opens_min} closes={salon.closes_min}
      staff={staff.map(s => ({ id: s.id, name: s.name, title: s.title, color: s.color, week: s.week || {}, worksHome: s.works_home, commission: Number(s.commission_pct), active: s.active }))}
      services={services.map(s => ({ id: s.id, name: s.name, staffIds: s.staff_ids, active: s.active }))}
      members={members.map(m => ({ id: m.id, role: m.role, active: m.active, staffId: m.staff_id, name: m.name, phone: m.phone, username: m.username, me: m.user_id === ctx.userId }))}
      timeOff={off.map(o => { const a = localParts(new Date(o.starts_at), salon.timezone), b = localParts(new Date(o.ends_at), salon.timezone); return { id: o.id, staffId: o.staff_id, day: a.day, from: a.min, to: b.day === a.day ? b.min : 1440, reason: o.reason }; })}
      canTeam={can(ctx, 'team')}
    />
  );
}
