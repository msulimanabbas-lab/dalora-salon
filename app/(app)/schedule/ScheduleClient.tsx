'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BookingView, SalonView, ServiceView, StaffView, TimeOffView } from '@/lib/views';
import { addDays, fmtDay, fmtTime, weekdayOf } from '@/lib/time';
import { initial, sar, STATUS_LABEL } from '@/lib/format';
import { Icon } from '@/components/Icon';
import { BookingSheet } from '@/components/BookingSheet';
import { BookingForm, type FormSeed } from '@/components/BookingForm';
import { useAutoRefresh } from '@/components/useAutoRefresh';
import { NowStrip, statusLine } from '@/components/NowStrip';

const PX = 1.2; // pixels per minute

type Open = { kind: 'detail'; id: string } | { kind: 'form'; seed: FormSeed } | null;

export function ScheduleClient(props: {
  day: string; salon: SalonView; staff: StaffView[]; services: ServiceView[]; bookings: BookingView[]; timeOff: TimeOffView[];
  canEdit: boolean; canPay: boolean; canRefund: boolean; openId?: string; seedCustomer?: { id: string; name: string; phone: string };
}) {
  const { day, salon, staff, services, bookings, timeOff, canEdit } = props;
  const router = useRouter();
  const [open, setOpen] = useState<Open>(props.openId ? { kind: 'detail', id: props.openId } : props.seedCustomer ? { kind: 'form', seed: { mode: 'new', day: props.day, customer: props.seedCustomer } } : null);
  const [who, setWho] = useState<string>('all');
  // big teams: show one specialty at a time on the board
  const titles = useMemo(() => [...new Set(staff.map(s => s.title).filter(Boolean))], [staff]);
  const [spec, setSpec] = useState<string>('all');
  const shown = spec === 'all' ? staff : staff.filter(s => s.title === spec);
  useAutoRefresh(30_000);

  const wd = String(weekdayOf(day));
  const live = bookings.filter(b => b.status !== 'cancelled');
  const expected = live.filter(b => b.status !== 'no_show').reduce((s, b) => s + b.total, 0);
  const due = live.filter(b => b.status !== 'no_show' && b.total - b.paid > 0.001);
  const cancelled = bookings.length - live.length;

  const go = (d: string) => router.push(`/schedule?d=${d}`);
  const isToday = day === salon.today;

  const startNew = (seed: Partial<FormSeed> = {}) => setOpen({ kind: 'form', seed: { mode: 'new', day, ...seed } });

  return (
    <>
      <div className="day-head">
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h1>{isToday ? 'اليوم · ' : ''}{fmtDay(day)}</h1>
          <div className="day-meta" style={{ marginTop: 6 }}>
            <span><b>{live.length}</b> حجز</span>
            <span>متوقع <b>{sar(expected)}</b></span>
            {due.length > 0 && <span>باقي دفع عند <b>{due.length}</b></span>}
            {cancelled > 0 && <span className="faint">{cancelled} ملغي</span>}
          </div>
        </div>
        <div className="day-nav">
          <button className="btn icon" onClick={() => go(addDays(day, -1))} aria-label="اليوم السابق"><Icon name="prev" /></button>
          {!isToday && <button className="btn" onClick={() => go(salon.today)}>اليوم</button>}
          <input type="date" className="input num" style={{ width: 'auto' }} value={day} aria-label="اختيار التاريخ"
            onChange={e => e.target.value && go(e.target.value)} />
          <button className="btn icon" onClick={() => go(addDays(day, 1))} aria-label="اليوم التالي"><Icon name="next" /></button>
        </div>
        {canEdit && <button className="btn primary" onClick={() => startNew()}><Icon name="plus" />حجز جديد</button>}
      </div>

      {isToday && staff.length > 0 && (
        <NowStrip salon={salon} staff={staff} bookings={live} canEdit={canEdit} canPay={props.canPay} onOpen={id => setOpen({ kind: 'detail', id })} />
      )}

      {staff.length === 0 ? (
        <div className="panel empty"><h3>ما فيه موظفات بعد</h3><p>أضيفي الموظفات وخدماتهن من صفحة الفريق، وبعدها يطلع الجدول هنا.</p></div>
      ) : (
        <>
          <div className="show-desk">
            {staff.length > 8 && titles.length > 1 && (
              <div className="staff-filter" role="group" aria-label="التخصص">
                <button className="chip" aria-pressed={spec === 'all'} onClick={() => setSpec('all')}>الكل ({staff.length})</button>
                {titles.map(t => <button key={t} className="chip" aria-pressed={spec === t} onClick={() => setSpec(t)}>{t} ({staff.filter(s => s.title === t).length})</button>)}
              </div>
            )}
            <Board {...props} staff={shown} wd={wd} onOpen={id => setOpen({ kind: 'detail', id })}
              onEmpty={(staffId, min) => canEdit && startNew({ staffId, min })} />
            <div className="legend">
              {(['booked', 'arrived', 'in_service', 'done', 'no_show'] as const).map(s => (
                <span key={s}><i className={'st-' + s} />{STATUS_LABEL[s]}</span>
              ))}
              <span><Icon name="check" className="ok-tick" />مؤكد</span>
              {canEdit && <span className="faint">اضغطي على أي وقت فاضي لحجز سريع</span>}
            </div>
          </div>
          <div className="show-phone">
            <div className="staff-filter" role="group" aria-label="الموظفة">
              <button className="chip" aria-pressed={who === 'all'} onClick={() => setWho('all')}>الكل</button>
              {staff.map(s => <button key={s.id} className="chip" aria-pressed={who === s.id} onClick={() => setWho(s.id)}>{s.name}</button>)}
            </div>
            <Agenda bookings={live.filter(b => who === 'all' || b.staffId === who)} staff={staff} onOpen={id => setOpen({ kind: 'detail', id })} />
          </div>
        </>
      )}

      {open?.kind === 'detail' && (
        <BookingSheet id={open.id} staff={staff} canEdit={canEdit} canPay={props.canPay} canRefund={props.canRefund}
          onClose={() => setOpen(null)}
          onEdit={b => setOpen({ kind: 'form', seed: { mode: 'edit', booking: b, day: b.day, staffId: b.staffId, min: b.startMin } })}
          version={bookings} />
      )}
      {open?.kind === 'form' && (
        <BookingForm seed={open.seed} salon={salon} staff={staff} services={services}
          onClose={() => setOpen(null)}
          onDone={(id, d) => { setOpen({ kind: 'detail', id }); if (d !== day) go(d); else router.refresh(); }} />
      )}
    </>
  );
}

function Board({ day, salon, staff, bookings, timeOff, wd, canEdit, onOpen, onEmpty }: {
  day: string; salon: SalonView; staff: StaffView[]; bookings: BookingView[]; timeOff: TimeOffView[]; wd: string; canEdit: boolean;
  onOpen: (id: string) => void; onEmpty: (staffId: string, min: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const H = (salon.closes - salon.opens) * PX;
  const y = (m: number) => (m - salon.opens) * PX;
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let m = Math.ceil(salon.opens / 30) * 30; m <= salon.closes; m += 30) out.push(m);
    return out;
  }, [salon.opens, salon.closes]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = bookings.filter(b => b.status !== 'cancelled').map(b => b.startMin).sort((a, b) => a - b)[0];
    const target = day === salon.today ? salon.nowMin - 60 : (first ?? salon.opens) - 30;
    el.scrollTop = Math.max(0, y(target));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const showNow = day === salon.today && salon.nowMin > salon.opens && salon.nowMin < salon.closes;
  return (
    <div className="board" ref={ref}>
      <div className="board-grid" style={{ gridTemplateColumns: `76px repeat(${staff.length}, minmax(180px, 1fr))` }}>
        <div className="col-head corner" />
        {staff.map(s => {
          const h = s.week[wd];
          return (
            <div className="col-head" key={s.id}>
              <span className="av" style={{ background: s.color }}>{initial(s.name)}</span>
              <span className="who"><b>{s.name}</b><span>{h ? `${fmtTime(h[0])} – ${fmtTime(h[1])}` : 'إجازة اليوم'}</span></span>
            </div>
          );
        })}
        <div className="times" style={{ height: H }}>
          <div style={{ position: 'relative', height: '100%' }}>
            {hours.filter(m => m % 60 === 0 && m < salon.closes && m > salon.opens).map(m => <span key={m} style={{ top: y(m) }}>{fmtTime(m)}</span>)}
          </div>
        </div>
        {staff.map((s, li) => {
          const h = s.week[wd];
          const mine = bookings.filter(b => b.staffId === s.id && b.status !== 'cancelled');
          const hits: number[] = [];
          if (h && canEdit) for (let m = Math.max(h[0], salon.opens); m + salon.step <= Math.min(h[1], salon.closes); m += salon.step) hits.push(m);
          return (
            <div key={s.id} className={'lane' + (h ? '' : ' off')} style={{ height: H }}>
              {h && h[0] > salon.opens && <div className="closed" style={{ top: 0, height: y(h[0]) }} />}
              {h && h[1] < salon.closes && <div className="closed" style={{ top: y(h[1]), bottom: 0 }} />}
              {hours.map(m => <div key={m} className={'hr' + (m % 60 ? ' half' : '')} style={{ top: y(m) }} />)}
              {hits.map(m => (
                <div key={m} className="hit" style={{ top: y(m), height: salon.step * PX }} data-label={`+ ${fmtTime(m)}`}
                  onClick={() => onEmpty(s.id, m)} role="button" tabIndex={-1} aria-label={`حجز ${s.name} ${fmtTime(m)}`} />
              ))}
              {timeOff.filter(o => o.staffId === s.id).map(o => (
                <div key={o.id} className="off-blk" style={{ top: y(Math.max(o.startMin, salon.opens)), height: Math.max(18, (Math.min(o.endMin, salon.closes) - Math.max(o.startMin, salon.opens)) * PX - 2) }}>
                  {o.reason || 'وقت مقفل'}
                </div>
              ))}
              {mine.map(b => (
                <div key={b.id + 'p'}>
                  {b.travelMin > 0 && <div className="pad-blk" style={{ top: y(b.startMin - b.travelMin), height: b.travelMin * PX - 2 }}>تنقّل</div>}
                  {b.bufferMin > 0 && <div className="pad-blk" style={{ top: y(b.endMin), height: b.bufferMin * PX - 2 }}>{b.bufferMin >= 15 ? 'تجهيز' : ''}</div>}
                  {b.travelMin > 0 && <div className="pad-blk" style={{ top: y(b.endMin + b.bufferMin), height: b.travelMin * PX - 2 }}>رجوع</div>}
                </div>
              ))}
              {mine.map(b => {
                const hgt = Math.max(26, (b.endMin - b.startMin) * PX - 3);
                const owe = b.total - b.paid;
                return (
                  <button key={b.id} className={'blk st-' + b.status} style={{ top: y(b.startMin) + 1, height: hgt }} onClick={() => onOpen(b.id)}>
                    <span className="nm">{b.location === 'home' && <Icon name="home" />}{b.customerName}{b.status === 'booked' && b.confirmed && <Icon name="check" className="ok-tick" />}</span>
                    {hgt > 40 && <span className="sv">{b.items.map(i => i.name).join(' + ')}</span>}
                    {hgt > 58 && <span className="tm">{b.status === 'arrived' && b.arrivedMin != null ? `وصلت ${fmtTime(b.arrivedMin)}` : `${fmtTime(b.startMin)} – ${fmtTime(b.endMin)}`}</span>}
                    {hgt > 80 && owe > 0.001 && b.status !== 'no_show' && <span className="due num">باقي {sar(owe)}</span>}
                  </button>
                );
              })}
              {showNow && <div className={'now' + (li === 0 ? ' first' : '')} style={{ top: y(salon.nowMin) }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Agenda({ bookings, staff, onOpen }: { bookings: BookingView[]; staff: StaffView[]; onOpen: (id: string) => void }) {
  if (!bookings.length) return <div className="panel empty"><h3>ما فيه حجوزات</h3><p>الحجوزات تظهر هنا بترتيب الوقت.</p></div>;
  return (
    <div className="agenda">
      {bookings.slice().sort((a, b) => a.startMin - b.startMin).map(b => {
        const s = staff.find(x => x.id === b.staffId);
        const owe = b.total - b.paid;
        return (
          <button key={b.id} className="ag-item" onClick={() => onOpen(b.id)}>
            <span className="ag-time">{fmtTime(b.startMin)}<br /><span className="faint">{fmtTime(b.endMin)}</span></span>
            <span className={'ag-card st-' + b.status}>
              <span className="nm">{b.location === 'home' && <Icon name="home" className="tiny" />}{b.customerName}</span>
              <span className="meta">{b.items.map(i => i.name).join(' + ')}</span>
              <span className="meta row tight" style={{ justifyContent: 'space-between' }}>
                <span>{s?.name} · {statusLine(b)}</span>
                {owe > 0.001 && b.status !== 'no_show' && <span className="num">باقي {sar(owe)}</span>}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
