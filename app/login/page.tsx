import { redirect } from 'next/navigation';
import { getCtx } from '@/lib/auth';
import { sql } from '@/lib/db';
import { Wordmark } from '@/components/Wordmark';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'الدخول' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getCtx()) redirect('/');
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM salons`;
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
        <LoginForm />
      </section>
    </main>
  );
}
