import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { loginMode } from '@/lib/auth';
import { Wordmark } from '@/components/Wordmark';
import { SetupForm } from './SetupForm';

export const metadata = { title: 'إعداد الصالون' };
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM salons`;
  if (n > 0) redirect('/login');
  const mode = loginMode();
  return (
    <main className="login">
      <section className="login-art">
        <Wordmark className="wm" />
        <p>أهلاً فيك في Dalora. هذي أول مرة يفتح فيها النظام، فخلينا نسجّل صالونك وحسابك كمالكة.</p>
      </section>
      <section className="login-form">
        <SetupForm loginReady={mode !== 'off'} />
      </section>
    </main>
  );
}
