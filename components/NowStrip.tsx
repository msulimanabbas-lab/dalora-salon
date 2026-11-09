'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BookingView, SalonView, StaffView } from '@/lib/views';
import { setStatusAction } from '@/app/actions';
import { fmtTime, fmtDuration } from '@/lib/time';
import { sar, STATUS_LABEL } from '@/lib/format';
import { Icon } from './Icon';
import { useToast } from './Toast';

/** One short line for a booking card: the current step and when it happened ("وصلت 2:44 م"). */
export function statusLine(b: BookingView) {
  if (b.status === 'arrived' && b.arrivedMin != null) return `وصلت ${fmtTime(b.arrivedMin)}`;
  if (b.status === 'in_service' && b.startedMin != null) return `بدأت ${fmtTime(b.startedMin)}`;
  if (b.status === 'done' && b.finishedMin != null) return `انتهت ${fmtTime(b.finishedMin)}`;
  if (b.status === 'booked' && b.confirmed) return 'محجوز · مؤكد';
  return STATUS_LABEL[b.status];
}
/** Past this, a "waiting" customer almost certainly started and nobody updated her status. */
export const STALE_WAIT = 90;
export const mins = (n: number) => (n < 60 ? `${n} د` : fmtDuration(n));

/**
 * The front desk's "right now": who's waiting, who's due, who's in the chair, who still has to pay.
 * One tap moves each customer to the next step; the specialist's phone picks it up on its next refresh.
 */
export function NowStrip({ salon, staff, bookings, canEdit, canPay, onOpen }: {
  salon: SalonView; staff: StaffView[]; bookings: BookingView[]; canEdit: boolean; canPay: boolean; onOpen: (id: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const now = salon.nowMin;
  const who = (id: string) => staff.find(s => s.id === id)?.name ?? '';

  const waiting = bookings.filter(b => b.status === 'arrived').sort((a, b) => (a.arrivedMin ?? a.startMin) - (b.arrivedMin ?? b.startMin));
  const due = bookings.filter(b => b.status === 'booked' && b.startMin - now <= 45 && now - b.startMin <= 120).sort((a, b) => a.startMin - b.startMin);
  const chair = bookings.filter(b => b.status === 'in_service').sort((a, b) => a.endMin - b.endMin);
  const owing = bookings.filter(b => b.status === 'done' && b.total - b.paid > 0.001);
  if (!waiting.length && !due.length && !chair.length && !owing.length) return null;

  const move = (b: BookingView, to: string, msg: string) => start(async () => {
    const r = await setStatusAction(b.id, to);
    toast(r.ok ? msg : r.error);
    router.refresh();
  });

  return (
    <section className="now-strip" aria-label="الحين">
      <Col title="على وصول" n={due.length} empty="ما فيه أحد جاي خلال 45 دقيقة">
        {due.slice(0, 4).map(b => {
          const late = now - b.startMin;
          return (
            <Row key={b.id} b={b} onOpen={onOpen}
              meta={<>{who(b.staffId)} · <span className="num">{fmtTime(b.startMin)}</span>{' · '}
                {late > 0 ? <span className={late > salon.lateMins ? 'bad' : 'warn'}>متأخرة {mins(late)}</span> : late === 0 ? 'الحين' : `بعد ${mins(-late)}`}
                {b.confirmed && <> · <span className="ok">مؤكد</span></>}</>}
              action={canEdit && <button className="btn sm primary" disabled={pending} onClick={() => move(b, 'arrived', `${b.customerName} وصلت · تظهر الحين عند ${who(b.staffId)}`)}>وصلت</button>} />
          );
        })}
        {due.length > 4 && <More n={due.length - 4} />}
      </Col>

      <Col title="تنتظر" n={waiting.length} tone={waiting.length ? 'arrived' : undefined} empty="ما فيه أحد ينتظر">
        {waiting.slice(0, 4).map(b => {
          const w = Math.max(0, now - (b.arrivedMin ?? b.startMin));
          return (
            <Row key={b.id} b={b} onOpen={onOpen}
              meta={<>{who(b.staffId)} · {w > STALE_WAIT
                ? <span className="warn">وصلت {fmtTime(b.arrivedMin ?? b.startMin)} · حدّثي حالتها</span>
                : w < 1 ? 'وصلت الحين' : <span className={w >= 15 ? 'bad' : ''}>تنتظر من {mins(w)}</span>}</>}
              action={canEdit && <button className="btn sm" disabled={pending} onClick={() => move(b, 'in_service', 'بدأت الخدمة')}>بدأت</button>} />
          );
        })}
        {waiting.length > 4 && <More n={waiting.length - 4} />}
      </Col>

      <Col title="في الخدمة" n={chair.length} empty="الكراسي فاضية">
        {chair.slice(0, 4).map(b => {
          const left = b.endMin - now;
          return (
            <Row key={b.id} b={b} onOpen={onOpen}
              meta={<>{who(b.staffId)} · {left >= 0 ? `تخلص بعد ${mins(left)}` : <span className="warn">زادت {mins(-left)}</span>}</>}
              action={canEdit && <button className="btn sm" disabled={pending} onClick={() => move(b, 'done', 'انتهت الخدمة')}>انتهت</button>} />
          );
        })}
        {chair.length > 4 && <More n={chair.length - 4} />}
      </Col>

      {(canPay || owing.length > 0) && (
        <Col title="باقي دفع" n={owing.length} empty="كل اللي خلصوا دفعوا">
          {owing.slice(0, 4).map(b => (
            <Row key={b.id} b={b} onOpen={onOpen}
              meta={<>{who(b.staffId)} · <b className="warn num">{sar(b.total - b.paid)}</b></>}
              action={canPay && <button className="btn sm" onClick={() => onOpen(b.id)}>دفع</button>} />
          ))}
          {owing.length > 4 && <More n={owing.length - 4} />}
        </Col>
      )}
    </section>
  );
}

function Col({ title, n, tone, empty, children }: { title: string; n: number; tone?: string; empty: string; children: React.ReactNode }) {
  return (
    <div className={'now-col' + (tone ? ' tone-' + tone : '')}>
      <div className="now-col-head"><b>{title}</b>{n > 0 && <span className="num">{n}</span>}</div>
      {n ? <div className="now-rows">{children}</div> : <p className="tiny faint">{empty}</p>}
    </div>
  );
}
function Row({ b, meta, action, onOpen }: { b: BookingView; meta: React.ReactNode; action: React.ReactNode; onOpen: (id: string) => void }) {
  return (
    <div className="now-row">
      <button className="now-who" onClick={() => onOpen(b.id)}>
        <b>{b.location === 'home' && <Icon name="home" className="tiny" />}{b.customerName}{b.allergies && <span className="dot-warn" title={b.allergies} aria-label="فيه تنبيه" />}</b>
        <span>{meta}</span>
      </button>
      {action}
    </div>
  );
}
const More = ({ n }: { n: number }) => <p className="tiny faint">و{n} غيرهن</p>;
