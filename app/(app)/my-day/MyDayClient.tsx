'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BookingView, SalonView, StaffView } from '@/lib/views';
import { addDays, fmtDay, fmtDuration, fmtTime, weekdayOf } from '@/lib/time';
import { STATUS_LABEL } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { BookingSheet } from '@/components/BookingSheet';
import { useAutoRefresh } from '@/components/useAutoRefresh';

export function MyDayClient({ day, salon, me, staff, bookings }: { day: string; salon: SalonView; me: StaffView | null; staff: StaffView[]; bookings: BookingView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  useAutoRefresh(30_000);
  const hours = me?.week[String(weekdayOf(day))];
  const active = bookings.filter(b => b.status !== 'no_show');
  const busy = active.reduce((s, b) => s + b.endMin - b.startMin, 0);
  const next = day === salon.today ? active.find(b => b.status !== 'done' && b.endMin > salon.nowMin) : undefined;
  const go = (d: string) => router.push(`/my-day?d=${d}`);

  return (
    <div className="stack">
      <div className="day-head" style={{ marginBottom: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{day === salon.today ? 'يومي' : fmtDay(day)}</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            {day === salon.today ? fmtDay(day) + ' · ' : ''}
            {hours ? `دوامك ${fmtTime(hours[0])} – ${fmtTime(hours[1])}` : 'إجازة'} · {active.length} موعد · {fmtDuration(busy)}
          </p>
        </div>
        <div className="day-nav">
          <button className="btn icon" onClick={() => go(addDays(day, -1))} aria-label="اليوم السابق"><Icon name="prev" /></button>
          {day !== salon.today && <button className="btn" onClick={() => go(salon.today)}>اليوم</button>}
          <button className="btn icon" onClick={() => go(addDays(day, 1))} aria-label="اليوم التالي"><Icon name="next" /></button>
        </div>
      </div>

      {next && (
        <button className="panel panel-pad" style={{ textAlign: 'start', cursor: 'pointer', borderColor: 'var(--plum)' }} onClick={() => setOpen(next.id)}>
          <span className="tiny faint">{next.startMin <= salon.nowMin ? 'الحين' : `الجاية · بعد ${fmtDuration(next.startMin - salon.nowMin)}`}</span>
          <h2 style={{ marginTop: 2 }}>{next.customerName}</h2>
          <p className="muted">{next.items.map(i => i.name).join(' + ')} · <span className="num">{fmtTime(next.startMin)}</span></p>
          {next.allergies && <p className="notice warn small" style={{ marginTop: 8 }}>تنبيه: {next.allergies}</p>}
          {next.location === 'home' && <p className="small" style={{ marginTop: 6 }}><Icon name="home" className="tiny" /> في البيت{next.address ? ` · ${next.address}` : ''}</p>}
        </button>
      )}

      {bookings.length === 0 ? (
        <div className="panel empty"><h3>ما عندك مواعيد{day === salon.today ? ' اليوم' : ''}</h3><p>أي حجز جديد لك يطلع هنا تلقائياً.</p></div>
      ) : (
        <div className="agenda">
          {bookings.map(b => (
            <button key={b.id} className="ag-item" onClick={() => setOpen(b.id)}>
              <span className="ag-time">{fmtTime(b.startMin)}<br /><span className="faint">{fmtTime(b.endMin)}</span></span>
              <span className={'ag-card st-' + b.status}>
                <span className="nm">{b.location === 'home' && <Icon name="home" className="tiny" />}{b.customerName}</span>
                <span className="meta">{b.items.map(i => i.name).join(' + ')}</span>
                <span className="meta">{STATUS_LABEL[b.status]}{b.allergies ? ' · فيه تنبيه' : ''}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <BookingSheet id={open} staff={staff} canEdit={false} canPay={false} canRefund={false} staffMode
          onClose={() => setOpen(null)} onEdit={() => {}} version={bookings} />
      )}
    </div>
  );
}
