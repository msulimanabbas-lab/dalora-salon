import { notFound } from 'next/navigation';
import { Wordmark } from '@/components/Wordmark';
import { demoEnabled } from '@/lib/demoSalon';
import { demoEnterAction } from '../actions';

export const metadata = { title: 'جرّب Dalora', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ROLES = [
  { key: 'reception', title: 'الاستقبال', sub: 'الجدول، الحجز من الواتساب والاتصال، تسجيل وصول العميلة، الدفع والفاتورة' },
  { key: 'staff', title: 'المختصة · من الجوال', sub: 'مواعيدها بس، وتنبيه "وصلت عميلتك" أول ما يسجّل الاستقبال وصولها' },
  { key: 'owner', title: 'صاحبة الصالون', sub: 'كل شي: المال وإقفال الصندوق، التقارير، الخدمات والفريق، الإعدادات' },
] as const;

export default function DemoPage() {
  if (!demoEnabled()) notFound();
  return (
    <main className="login">
      <section className="login-art">
        <Wordmark className="wm" />
        <svg className="rings" viewBox="0 0 520 520" aria-hidden="true">
          {[120, 180, 240].map(r => <circle key={r} cx="260" cy="260" r={r} fill="none" stroke="#4E2244" strokeWidth="2" />)}
        </svg>
        <p>صالون تجريبي فيه فريق وخدمات وحجوزات اليوم. جرّب كل شي بحرية، والبيانات ترجع جديدة كل يوم.</p>
      </section>
      <section className="login-form">
        <div className="demo-pick">
          <div>
            <h1>جرّب Dalora</h1>
            <p className="muted" style={{ marginTop: 6 }}>ادخل بأي دور، وتقدر تبدّل من الشريط اللي فوق.</p>
          </div>
          {ROLES.map(r => (
            <form key={r.key} action={demoEnterAction.bind(null, r.key)}>
              <button className="demo-role">
                <b>{r.title}</b>
                <span>{r.sub}</span>
              </button>
            </form>
          ))}
          <p className="notice info small">أحلى تجربة: افتح <b>الاستقبال</b> على اللابتوب و<b>المختصة</b> على الجوال، وسجّل وصول عميلة وشوفها تطلع عند المختصة.</p>
        </div>
      </section>
    </main>
  );
}
