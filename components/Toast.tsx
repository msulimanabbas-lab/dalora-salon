'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

const Ctx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('');
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(''), 2600);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div role="status" aria-live="polite">{msg && <div className="toast">{msg}</div>}</div>
    </Ctx.Provider>
  );
}
