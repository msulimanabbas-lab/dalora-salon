'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { changePasswordAction } from '@/app/actions';
import { useToast } from '@/components/Toast';

export function PasswordForm({ first, hasPassword, hasUsername }: { first: boolean; hasPassword: boolean; hasUsername: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState({ current: '', next: '', again: '', username: '' });
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const mismatch = v.again.length > 0 && v.next !== v.again;
  return (
    <form className="panel panel-pad stack" onSubmit={e => { e.preventDefault(); setErr(''); start(async () => {
      if (v.next !== v.again) { setErr('كلمتين المرور مو متطابقتين.'); return; }
      const r = await changePasswordAction(v.current, v.next, v.username);
      if (!r.ok) { setErr(r.error); return; }
      toast('تغيّرت كلمة المرور'); setV({ current: '', next: '', again: '', username: '' });
      if (first) router.push('/'); else router.refresh();
    }); }}>
      <h2>{!hasPassword ? 'الدخول باسم مستخدم' : first ? 'كلمة مرور جديدة' : 'تغيير كلمة المرور'}</h2>
      {!hasUsername && (
        <label className="field"><span>اختاري اسم مستخدم (إنجليزي)</span>
          <input id="pw-user" className="input" dir="ltr" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="owner.lilys" value={v.username}
            onChange={e => setV({ ...v, username: e.target.value.toLowerCase().replace(/\s/g, '') })} /></label>
      )}
      {hasPassword && (
        <label className="field"><span>{first ? 'كلمة المرور اللي أعطوك إياها' : 'كلمة المرور الحالية'}</span>
          <input id="pw-current" className="input" type="password" dir="ltr" autoComplete="current-password" value={v.current} onChange={e => setV({ ...v, current: e.target.value })} /></label>
      )}
      <label className="field"><span>الجديدة (8 خانات على الأقل)</span>
        <input id="pw-next" className="input" type="password" dir="ltr" autoComplete="new-password" value={v.next} onChange={e => setV({ ...v, next: e.target.value })} /></label>
      <label className="field"><span>اكتبيها مرة ثانية</span>
        <input id="pw-again" className="input" type="password" dir="ltr" autoComplete="new-password" value={v.again} onChange={e => setV({ ...v, again: e.target.value })} />
        {mismatch && <span className="tiny" style={{ color: 'var(--bad)' }}>مو متطابقة</span>}</label>
      {err && <p className="notice bad" role="alert">{err}</p>}
      <button className="btn primary lg" disabled={pending || (hasPassword && !v.current) || (!hasUsername && v.username.length < 3) || v.next.length < 8 || mismatch}>{pending ? 'جاري الحفظ…' : 'حفظ'}</button>
    </form>
  );
}
