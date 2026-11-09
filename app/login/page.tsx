import { redirect } from 'next/navigation';
import { getCtx } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Wordmark } from '@/components/Wordmark';
import { LoginForm } from './LoginForm';
import { demoEnabled } from '@/lib/demoSalon';

export const metadata = { title: 'الدخول' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getCtx()) redirect('/');
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM salons WHERE NOT is_demo`;
  if (n === 0) redirect('/setup');
  return (
    <main className="login">
      <section className="login-art">
        <Wordmark className="wm" />
        <svg className="rings" viewBox="0 0 520 520" aria-hidden="true">
          {[120, 180, 240].map(r => <circle key={r} cx="260" cy="260" r={r} fill="none" stroke="#4E2244" strokeWidth="2" />)}
        </svg>
        <p>جدول الصالون، العميلات، والمال في مكان واحد. كل حجز من التطبيق أو الهاتف ينزل هنا بنفس القواعد.</p>
      </section>
      <section className="login-form">
        <div style={{ width: 'min(380px, 100%)' }}>
          <LoginForm />
          {demoEnabled() && <p className="small muted" style={{ marginTop: 22, textAlign: 'center' }}>تبي تشوف النظام قبل؟ <a href="/demo" style={{ color: 'var(--rose-ink)', fontWeight: 600 }}>جرّب النسخة التجريبية</a></p>}
        </div>
      </section>
    </main>
  );
}
