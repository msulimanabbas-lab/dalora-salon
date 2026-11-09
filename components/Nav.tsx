'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon';

export type NavItem = { href: string; label: string; icon: string; group?: string };

function isActive(path: string, href: string) {
  return path === href || path.startsWith(href + '/');
}

export function RailNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  let lastGroup: string | undefined;
  return (
    <nav className="nav" aria-label="الأقسام">
      {items.map(it => {
        const head = it.group && it.group !== lastGroup ? <div className="group" key={'g' + it.group}>{it.group}</div> : null;
        lastGroup = it.group;
        return [head, (
          <Link key={it.href} href={it.href} aria-current={isActive(path, it.href) ? 'page' : undefined}>
            <Icon name={it.icon} />{it.label}
          </Link>
        )];
      })}
    </nav>
  );
}

export function TabBar({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="الأقسام">
      {items.map(it => (
        <Link key={it.href} href={it.href} aria-current={isActive(path, it.href) ? 'page' : undefined}>
          <Icon name={it.icon} />{it.label}
        </Link>
      ))}
    </nav>
  );
}
