import { requirePage } from '@/lib/auth';
import { sql } from '@/lib/db';
import { ROLE_LABEL } from '@/lib/format';
import { PasswordForm } from './PasswordForm';

export const metadata = { title: 'حسابي' };
export const dynamic = 'force-dynamic';

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const ctx = await requirePage(undefined, { allowMustChange: true });
  const first = (await searchParams).first === '1' && ctx.mustChange;
  const [u] = await sql`SELECT password_hash IS NOT NULL AS has_pw FROM users WHERE id = ${ctx.userId}`;
  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <div className="page-head"><div>
        <h1>{first ? 'اختاري كلمة مرور' : 'حسابي'}</h1>
        <p className="sub">{ctx.userName} · {ROLE_LABEL[ctx.role]} · {ctx.salonName}</p>
      </div></div>
      {first && <p className="notice info">هذي أول مرة تدخلين. اختاري كلمة مرور خاصة فيك بدال اللي أعطوك إياها، عشان ما يعرفها أحد غيرك.</p>}
      {ctx.username && <div className="panel panel-pad"><div className="kv"><span>اسم المستخدم</span><b className="ltr">{ctx.username}</b></div></div>}
      {ctx.isDemo ? <p className="notice warn">هذا حساب تجريبي، كلمة المرور ما تتغير هنا.</p> : <PasswordForm first={first} hasPassword={u.has_pw} hasUsername={!!ctx.username} />}
    </div>
  );
}
