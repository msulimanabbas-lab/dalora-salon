import Link from 'next/link';
import { requirePage } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { logoutAction } from '../../actions';
import { navFor } from '@/lib/nav';

export const metadata = { title: 'المزيد' };

export default async function MorePage() {
  const ctx = await requirePage();
  const { more } = navFor(ctx);
  return (
    <div className="stack">
      <div className="page-head"><div><h1>المزيد</h1><p className="sub">{ctx.userName} · {ROLE_LABEL[ctx.role]}</p></div></div>
      <div className="panel divide">
        {more.map(i => (
          <Link key={i.href} href={i.href} className="row" style={{ padding: '14px 18px', textDecoration: 'none' }}>
            <Icon name={i.icon} className="faint" /><span style={{ fontWeight: 600 }}>{i.label}</span>
          </Link>
        ))}
      </div>
      <form action={logoutAction}><button className="btn block">تسجيل الخروج</button></form>
    </div>
  );
}
