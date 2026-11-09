import { demoEnterAction, demoResetAction } from '@/app/actions';
import type { Role } from '@/lib/auth';

const SWITCH = [['reception', 'الاستقبال'], ['staff', 'المختصة'], ['owner', 'صاحبة الصالون']] as const;

/** Shown only inside the shared demo salon: who you are, and a one-tap switch to the other roles. */
export function DemoBar({ role }: { role: Role }) {
  return (
    <div className="demo-bar" role="region" aria-label="النسخة التجريبية">
      <span className="tag plum">تجريبي</span>
      <span className="demo-as">تبديل:</span>
      {SWITCH.map(([k, l]) => (
        <form key={k} action={demoEnterAction.bind(null, k)}>
          <button className="chip" aria-pressed={role === k}>{l}</button>
        </form>
      ))}
      <form action={demoResetAction} style={{ marginInlineStart: 'auto' }}>
        <button className="btn quiet sm">بيانات جديدة</button>
      </form>
    </div>
  );
}
