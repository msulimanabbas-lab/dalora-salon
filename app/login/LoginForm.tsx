'use client';

import { useState, useTransition } from 'react';
import { requestCodeAction, verifyCodeAction, passwordLoginAction } from '../actions';

export function LoginForm({ phoneEnabled }: { phoneEnabled: boolean }) {
  const [mode, setMode] = useState<'password' | 'phone'>('password');
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [e164, setE164] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [testMode, setTestMode] = useState(false);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  function sendCode(ev: React.FormEvent) {
    ev.preventDefault();
    setError('');
    start(async () => {
      const r = await requestCodeAction(phone);
      if (!r.ok) { setError(r.error); return; }
      setE164(r.phone); setDevCode(r.devCode); setTestMode(!!r.testMode); setStep('code'); setCode('');
    });
  }
  function verify(ev: React.FormEvent) {
    ev.preventDefault();
    setError('');
    start(async () => {
      const r = await verifyCodeAction(e164, code);
      if (r && !r.ok) setError(r.error);
    });
  }

  function signIn(ev: React.FormEvent) {
    ev.preventDefault();
    setError('');
    start(async () => {
      const r = await passwordLoginAction(user, pw);
      if (r && !r.ok) setError(r.error);
    });
  }

  if (mode === 'password') return (
    <form onSubmit={signIn} noValidate>
      <div>
        <h1>أهلاً فيك</h1>
        <p className="muted" style={{ marginTop: 6 }}>ادخلي باسم المستخدم وكلمة المرور اللي أعطتك إياها صاحبة الصالون.</p>
      </div>
      <label className="field">
        <span>اسم المستخدم</span>
        <input id="username" className="input" dir="ltr" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          value={user} onChange={e => setUser(e.target.value)} required autoFocus />
      </label>
      <label className="field">
        <span>كلمة المرور</span>
        <input id="password" className="input" type="password" dir="ltr" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} required />
      </label>
      {error && <p className="notice bad" role="alert">{error}</p>}
      <button className="btn primary lg" disabled={pending || !user.trim() || !pw}>{pending ? 'جاري الدخول…' : 'دخول'}</button>
      {phoneEnabled && <button type="button" className="btn quiet" onClick={() => { setMode('phone'); setError(''); }}>الدخول برقم الجوال</button>}
    </form>
  );

  if (step === 'phone') return (
    <form onSubmit={sendCode} noValidate>
      <div>
        <h1>أهلاً فيك</h1>
        <p className="muted" style={{ marginTop: 6 }}>ادخلي برقم جوالك المسجّل في الصالون.</p>
      </div>
      <label className="field">
        <span>رقم الجوال</span>
        <input id="phone" className="input num" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="05XXXXXXXX"
          value={phone} onChange={e => setPhone(e.target.value)} required autoFocus />
      </label>
      {error && <p className="notice bad" role="alert">{error}</p>}
      <button className="btn primary lg" disabled={pending || phone.replace(/\D/g, '').length < 9}>
        {pending ? 'جاري الإرسال…' : 'أرسلي رمز الدخول'}
      </button>
      <button type="button" className="btn quiet" onClick={() => { setMode('password'); setError(''); }}>الدخول باسم المستخدم</button>
    </form>
  );

  return (
    <form onSubmit={verify} noValidate>
      <div>
        <h1>اكتبي الرمز</h1>
        <p className="muted" style={{ marginTop: 6 }}>{testMode ? 'نسخة تجريبية: اكتبي رمز الدخول اللي أعطتك إياه صاحبة الصالون.' : <>أرسلنا رمز من 6 أرقام إلى <span className="ltr num">{phone}</span></>}</p>
      </div>
      {devCode && (
        <p className="notice info">وضع التطوير بدون مزوّد رسائل: الرمز <b className="ltr num">{devCode}</b></p>
      )}
      <label className="field">
        <span>رمز الدخول</span>
        <input id="code" className="input otp num" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
          value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
      </label>
      {error && <p className="notice bad" role="alert">{error}</p>}
      <button className="btn primary lg" disabled={pending || code.length !== 6}>{pending ? 'جاري التحقق…' : 'دخول'}</button>
      <button type="button" className="btn quiet" onClick={() => { setStep('phone'); setError(''); }}>تغيير الرقم</button>
    </form>
  );
}
