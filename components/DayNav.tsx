'use client';

import { useRouter } from 'next/navigation';
import { addDays } from '@/lib/time';
import { Icon } from './Icon';

export function DayNav({ day, today, base }: { day: string; today: string; base: string }) {
  const router = useRouter();
  const go = (d: string) => router.push(`${base}?d=${d}`);
  return (
    <div className="day-nav">
      <button className="btn icon" onClick={() => go(addDays(day, -1))} aria-label="اليوم السابق"><Icon name="prev" /></button>
      {day !== today && <button className="btn" onClick={() => go(today)}>اليوم</button>}
      <input type="date" className="input num" style={{ width: 'auto' }} value={day} aria-label="اختيار التاريخ" onChange={e => e.target.value && go(e.target.value)} />
      <button className="btn icon" onClick={() => go(addDays(day, 1))} aria-label="اليوم التالي"><Icon name="next" /></button>
    </div>
  );
}
