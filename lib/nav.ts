import { can, type Ctx } from './auth';
import type { NavItem } from '@/components/Nav';

export function navFor(ctx: Ctx): { rail: NavItem[]; tabs: NavItem[]; more: NavItem[] } {
  const rail: NavItem[] = [];
  if (can(ctx, 'myDay')) rail.push({ href: '/my-day', label: 'يومي', icon: 'me' });
  if (can(ctx, 'schedule')) rail.push({ href: '/schedule', label: 'الجدول', icon: 'calendar' });
  if (can(ctx, 'customers')) rail.push({ href: '/customers', label: 'العميلات', icon: 'users' });
  if (can(ctx, 'money')) rail.push({ href: '/money', label: 'المال', icon: 'wallet' });
  if (can(ctx, 'reports')) rail.push({ href: '/reports', label: 'التقارير', icon: 'chart' });
  if (can(ctx, 'catalog')) rail.push({ href: '/services', label: 'الخدمات', icon: 'scissors', group: 'إعداد الصالون' });
  if (can(ctx, 'catalog')) rail.push({ href: '/team', label: 'الفريق', icon: 'team', group: 'إعداد الصالون' });
  if (can(ctx, 'settings')) rail.push({ href: '/settings', label: 'الإعدادات', icon: 'settings', group: 'إعداد الصالون' });
  const main = rail.filter(i => !i.group);
  const extra = rail.filter(i => i.group);
  const tabs = main.slice(0, extra.length ? 4 : 5);
  const more = [...main.slice(tabs.length), ...extra];
  return { rail, tabs: more.length ? [...tabs, { href: '/more', label: 'المزيد', icon: 'more' }] : tabs, more };
}

