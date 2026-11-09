import { requirePage } from '@/lib/auth';
import { navFor } from '@/lib/nav';
import { ROLE_LABEL } from '@/lib/format';
import { Wordmark } from '@/components/Wordmark';
import { RailNav, TabBar } from '@/components/Nav';
import { ToastProvider } from '@/components/Toast';
import { logoutAction } from '../actions';
import { DemoBar } from '@/components/DemoBar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage(undefined, { allowMustChange: true });
  const { rail, tabs } = navFor(ctx);
  return (
    <div className="shell">
      <aside className="rail">
        <a className="brand" href="/" aria-label="Dalora"><Wordmark /></a>
        <div className="salon">{ctx.salonName}</div>
        <RailNav items={rail} />
        <div className="me">
          <div><a href="/account" style={{ textDecoration: 'none' }}><b>{ctx.userName || 'حسابي'}</b></a></div>
          <div className="faint tiny">{ROLE_LABEL[ctx.role]}</div>
          <form action={logoutAction} style={{ marginTop: 6 }}><button>تسجيل الخروج</button></form>
        </div>
      </aside>
      <header className="mobile-top">
        <Wordmark />
        <span className="salon">{ctx.salonName}</span>
      </header>
      <main className="main">{ctx.isDemo && <DemoBar role={ctx.role} />}<ToastProvider>{children}</ToastProvider></main>
      <TabBar items={tabs} />
    </div>
  );
}
