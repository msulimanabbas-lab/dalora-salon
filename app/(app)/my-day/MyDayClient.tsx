'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BookingView, SalonView, StaffView } from '@/lib/views';
import { setStatusAction } from '@/app/actions';
import { addDays, fmtDay, fmtDuration, fmtTime, weekdayOf } from '@/lib/time';
import { Icon } from '@/components/Icon';
import { BookingSheet } from '@/components/BookingSheet';
import { mins, statusLine, STALE_WAIT } from '@/components/NowStrip';
import { useAutoRefresh } from '@/components/useAutoRefresh';
import { useToast } from '@/components/Toast';

export function MyDayClient({ day, salon, me, staff, bookings }: { day: string; salon: SalonView; me: StaffView | null; staff: StaffView[]; bookings: BookingView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useAutoRefresh(15_000); // arrivals marked at the desk should reach her phone quickly
  const isToday = day === salon.today;
  const now = salon.nowMin;
  const hours = me?.week[String(weekdayOf(day))];
  const active = bookings.filter(b => b.status !== 'no_show');
  const busy = active.reduce((s, b) => s + b.endMin - b.startMin, 0);

  // what needs her attention first: someone waiting > someone in the chair > the next one due
  const waiting = isToday ? active.filter(b => b.status === 'arrived') : [];
  const inChair = isToday ? active.find(b => b.status === 'in_service') : undefined;
  const next = isToday ? active.find(b => b.status === 'booked' && b.endMin > now) : undefined;

  // a waiting customer shows in the tab title too, so it's visible even with the phone on another tab
  useEffect(() => {
    const base = 'يومي · Dalora';
    document.title = waiting.length ? `(${waiting.length}) وصلت عميلتك · Dalora` : base;
    return () => { document.title = base; };
  }, [waiting.length]);

  const move = (b: BookingView, to: string, msg: string) => start(async () => {
    const r = await setStatusAction(b.id, to);
    toast(r.ok ? msg : r.error);
    router.refresh();
  });
  const go = (d: string) => router.push(`/my-day?d=${d}`);

  return (
    <div className="stack">
      <div className="day-head" style={{ marginBottom: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{isToday ? 'يومي' : fmtDay(day)}</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            {isToday ? fmtDay(day) + ' · ' : ''}
            {hours ? `دوامك ${fmtTime(hours[0])} – ${fmtTime(hours[1])}` : 'إجازة'} · {active.length} موعد · {fmtDuration(busy)}
          </p>
        </div>
        <div className="day-nav">
          <button className="btn icon" onClick={() => go(addDays(day, -1))} aria-label="اليوم السابق"><Icon name="prev" /></button>
          {!isToday && <button className="btn" onClick={() => go(salon.today)}>اليوم</button>}
          <button className="btn icon" onClick={() => go(addDays(day, 1))} aria-label="اليوم التالي"><Icon name="next" /></button>
        </div>
      </div>

      {waiting.map(b => {
        const w = Math.max(0, now - (b.arrivedMin ?? b.startMin));
        return (
          <div key={b.id} className="focus-card st-arrived" role="status">
            <span className="kicker">وصلت عميلتك{b.arrivedMin != null ? ` · ${fmtTime(b.arrivedMin)}` : ''}</span>
            <button className="focus-name" onClick={() => setOpen(b.id)}>{b.customerName}</button>
            <p>{b.items.map(i => i.name).join(' + ')}</p>
            <p className="wait">{w > STALE_WAIT ? 'إذا بدأتي معها، اضغطي بدء الخدمة' : w < 1 ? 'وصلت الحين' : <>تنتظر من <b className="num">{mins(w)}</b></>} · موعدها <span className="num">{fmtTime(b.startMin)}</span></p>
            {b.allergies && <p className="notice warn small">تنبيه: {b.allergies}</p>}
            <button className="btn primary lg block" disabled={pending} onClick={() => move(b, 'in_service', 'بدأت الخدمة')}>بدء الخدمة</button>
          </div>
        );
      })}

      {inChair && (
        <div className="focus-card st-in_service">
          <span className="kicker">معك الحين · بدأت {fmtTime(inChair.startedMin ?? inChair.startMin)}</span>
          <button className="focus-name" onClick={() => setOpen(inChair.id)}>{inChair.customerName}</button>
          <p>{inChair.items.map(i => i.name).join(' + ')}</p>
          <p className="wait">{inChair.endMin >= now ? <>تخلص بعد <b className="num">{mins(inChair.endMin - now)}</b></> : <>زادت <b className="num">{mins(now - inChair.endMin)}</b> عن وقتها</>}</p>
          <button className="btn lg block" disabled={pending} onClick={() => move(inChair, 'done', 'انتهت الخدمة')}>انتهت الخدمة</button>
        </div>
      )}

      {!waiting.length && !inChair && next && (
        <button className="focus-card st-booked" style={{ textAlign: 'start', cursor: 'pointer' }} onClick={() => setOpen(next.id)}>
          <span className="kicker">{next.startMin <= now ? `موعدها الحين · ما وصلت بعد` : `الجاية · بعد ${mins(next.startMin - now)}`}</span>
          <span className="focus-name">{next.customerName}</span>
          <p>{next.items.map(i => i.name).join(' + ')} · <span className="num">{fmtTime(next.startMin)}</span></p>
          {next.allergies && <p className="notice warn small">تنبيه: {next.allergies}</p>}
          {next.location === 'home' && <p className="small"><Icon name="home" className="tiny" /> في البيت{next.address ? ` · ${next.address}` : ''}</p>}
        </button>
      )}

      {bookings.length === 0 ? (
        <div className="panel empty"><h3>ما عندك مواعيد{isToday ? ' اليوم' : ''}</h3><p>أي حجز جديد لك يطلع هنا تلقائياً.</p></div>
      ) : (
        <>
          <h3 style={{ marginTop: 6 }}>{isToday ? 'كل مواعيد اليوم' : 'المواعيد'}</h3>
          <div className="agenda">
            {bookings.map(b => (
              <button key={b.id} className="ag-item" onClick={() => setOpen(b.id)}>
                <span className="ag-time">{fmtTime(b.startMin)}<br /><span className="faint">{fmtTime(b.endMin)}</span></span>
                <span className={'ag-card st-' + b.status}>
                  <span className="nm">{b.location === 'home' && <Icon name="home" className="tiny" />}{b.customerName}</span>
                  <span className="meta">{b.items.map(i => i.name).join(' + ')}</span>
                  <span className="meta">{statusLine(b)}{b.allergies ? ' · فيه تنبيه' : ''}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {open && (
        <BookingSheet id={open} staff={staff} canEdit={false} canPay={false} canRefund={false} staffMode
          onClose={() => setOpen(null)} onEdit={() => {}} version={bookings} />
      )}
    </div>
  );
}
