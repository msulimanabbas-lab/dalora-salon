'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BookingView, StaffView } from '@/lib/views';
import { bookingDetailAction, setStatusAction, cancelBookingAction, addPaymentAction, confirmBookingAction, issueInvoiceAction, type BookingDetail } from '@/app/actions';
import { displayPhone, METHOD_LABEL, sar, SOURCE_LABEL, STATUS_LABEL, waLink } from '@/lib/format';
import { fmtDay, fmtTime } from '@/lib/time';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

const FLOW = ['booked', 'arrived', 'in_service', 'done'] as const;
const NEXT: Record<string, { to: string; label: string } | undefined> = {
  booked: { to: 'arrived', label: 'وصلت العميلة' },
  arrived: { to: 'in_service', label: 'بدء الخدمة' },
  in_service: { to: 'done', label: 'انتهت الخدمة' },
};
const ACTION_LABEL: Record<string, string> = {
  created: 'إنشاء الحجز', confirmed: 'أكدت الحضور', unconfirmed: 'إلغاء التأكيد', moved: 'تعديل الموعد', status: 'تغيير الحالة', cancelled: 'إلغاء', invoiced: 'إصدار فاتورة', payment: 'دفعة', deposit: 'عربون', refund: 'استرجاع',
};

export function BookingSheet({ id, staff, canEdit, canPay, canRefund, onClose, onEdit, version, staffMode = false }: {
  id: string; staff: StaffView[]; canEdit: boolean; canPay: boolean; canRefund: boolean;
  onClose: () => void; onEdit: (b: BookingView) => void; version?: unknown; staffMode?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState<BookingDetail | null>(null);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const [pay, setPay] = useState<{ amount: string; method: 'cash' | 'card' | 'online' | 'transfer'; kind: 'payment' | 'refund' } | null>(null);
  const [cancel, setCancel] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await bookingDetailAction(id);
    if (r.ok) { setD(r.detail); setErr(''); } else setErr(r.error);
  }, [id]);
  useEffect(() => { load(); }, [load, version]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => start(async () => {
    const r = await fn();
    if (!r.ok) { setErr(r.error || 'صار خطأ'); return; }
    toast(msg); setPay(null); setCancel(null); await load(); router.refresh();
  });

  if (!d) return (
    <Sheet title="الحجز" onClose={onClose}>
      {err ? <p className="notice bad">{err}</p> : <p className="muted">جاري التحميل…</p>}
    </Sheet>
  );

  const b = d.booking;
  const s = staff.find(x => x.id === b.staffId);
  const owe = Math.max(0, b.total - b.paid);
  const step = FLOW.indexOf(b.status as typeof FLOW[number]);
  const next = NEXT[b.status];
  const editable = canEdit && (b.status === 'booked' || b.status === 'arrived');
  const canTake = canPay && !d.dayClosed && owe > 0.001 && b.status !== 'cancelled' && b.status !== 'no_show';

  return (
    <Sheet onClose={onClose}
      title={b.customerName}
      sub={<><span className="ltr">{b.code}</span> · {SOURCE_LABEL[b.source] || ''}</>}
      foot={!staffMode && canEdit && next ? (
        <>
          <button className="btn primary lg" style={{ flex: 1 }} disabled={pending} onClick={() => run(() => setStatusAction(b.id, next.to), next.label)}>{next.label}</button>
          {editable && <button className="btn lg" onClick={() => onEdit(b)}>تعديل</button>}
        </>
      ) : staffMode && next && b.status !== 'booked' ? (
        <button className="btn primary lg block" disabled={pending} onClick={() => run(() => setStatusAction(b.id, next.to), next.label)}>{next.label}</button>
      ) : staffMode && b.status === 'booked' ? (
        <button className="btn primary lg block" disabled={pending} onClick={() => run(() => setStatusAction(b.id, 'arrived'), 'وصلت العميلة')}>وصلت العميلة</button>
      ) : undefined}>

      {err && <p className="notice bad" role="alert">{err}</p>}

      {b.status === 'cancelled' || b.status === 'no_show' ? (
        <p className={'notice ' + (b.status === 'no_show' ? 'bad' : 'warn')}>
          {STATUS_LABEL[b.status]}{b.cancelReason ? ` · ${b.cancelReason}` : ''}
        </p>
      ) : (
        <div className="steps" aria-label="حالة الحجز">
          {FLOW.map((f, i) => {
            const at = f === 'booked' ? null : f === 'arrived' ? b.arrivedMin : f === 'in_service' ? b.startedMin : b.finishedMin;
            return (
              <span key={f} className={i === step ? 'on' : i < step ? 'past' : ''}>
                {f === 'booked' && b.confirmed ? 'مؤكد' : STATUS_LABEL[f]}
                {at != null && i <= step && <small className="num">{fmtTime(at)}</small>}
              </span>
            );
          })}
        </div>
      )}

      {b.allergies && <p className="notice warn"><b>تنبيه:</b> {b.allergies}</p>}

      {!staffMode && b.customerPhone && b.status !== 'cancelled' && (
        <div className="contact">
          <span className="ltr num" style={{ userSelect: 'all' }}>{displayPhone(b.customerPhone)}</span>
          <a className="btn sm" href={`tel:${b.customerPhone}`}><Icon name="call" />اتصال</a>
          <a className="btn sm" href={waLink(b.customerPhone)} target="_blank" rel="noopener noreferrer"><Icon name="chat" />واتساب</a>
        </div>
      )}

      {!staffMode && canEdit && b.status === 'booked' && (
        b.confirmed ? (
          <div className="confirm-line ok">
            <Icon name="check" /><span>العميلة أكدت الحضور</span>
            <button className="btn quiet sm" disabled={pending} onClick={() => run(() => confirmBookingAction(b.id, false), 'رجع غير مؤكد')}>تراجع</button>
          </div>
        ) : (
          <div className="confirm-line">
            <span>لسا ما أكدت الحضور</span>
            <a className="btn sm" target="_blank" rel="noopener noreferrer"
              href={waLink(b.customerPhone, `مرحبا ${b.customerName}، نذكّرك بموعدك في ${d.salonName} ${fmtDay(b.day)} الساعة ${fmtTime(b.startMin)} (${b.items.map(i => i.name).join(' + ')}). نرجو تأكيد حضورك بالرد على هالرسالة.`)}>
              <Icon name="chat" />تذكير بالواتساب
            </a>
            <button className="btn sm" disabled={pending} onClick={() => run(() => confirmBookingAction(b.id, true), 'تم: العميلة أكدت')}>أكدت</button>
          </div>
        )
      )}

      <section className="panel panel-pad stack tight">
        <div className="kv"><span>الموعد</span><span>{fmtDay(b.day)} · <span className="num">{fmtTime(b.startMin)} – {fmtTime(b.endMin)}</span></span></div>
        <div className="kv"><span>الموظفة</span><span>{s?.name || '—'}</span></div>
        <div className="kv"><span>المكان</span><span>{b.location === 'home' ? <>في البيت{b.address ? ` · ${b.address}` : ''}</> : 'في الصالون'}</span></div>
        <div className="kv"><span>سجلها</span><span>{d.history.visits} زيارة{d.history.noShows ? <> · <span style={{ color: 'var(--bad)' }}>{d.history.noShows} غياب</span></> : ''}</span></div>
        {b.notes && <div className="kv"><span>ملاحظة</span><span>{b.notes}</span></div>}
        {b.customerNotes && <div className="kv"><span>عن العميلة</span><span>{b.customerNotes}</span></div>}
      </section>

      <section className="panel">
        <div className="panel-pad stack tight">
          {b.items.map((i, k) => (
            <div className="kv" key={k}><span style={{ color: 'var(--ink)' }}>{i.name} <span className="faint tiny">· {i.durationMin} د</span></span><span className="num">{sar(i.price)}</span></div>
          ))}
          {b.homeFee > 0 && <div className="kv"><span>رسوم الوصول</span><span className="num">{sar(b.homeFee)}</span></div>}
          {b.discount > 0 && <div className="kv"><span>خصم</span><span className="num">− {sar(b.discount)}</span></div>}
        </div>
        <div className="panel-pad stack tight" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="total-line"><span>الإجمالي</span><b>{sar(b.total)}</b></div>
          <div className="kv"><span>المدفوع</span><span className="num">{sar(b.paid)}</span></div>
          {owe > 0.001 && b.status !== 'cancelled' && <div className="kv"><span><b style={{ color: 'var(--warn)' }}>المتبقي</b></span><b className="num" style={{ color: 'var(--warn)' }}>{sar(owe)}</b></div>}
        </div>
        {!staffMode && (canTake || (canRefund && b.paid > 0)) && (
          <div className="panel-pad" style={{ borderTop: '1px solid var(--line)' }}>
            {!pay ? (
              <div className="row">
                {canTake && <button className="btn primary" onClick={() => setPay({ amount: String(owe), method: 'cash', kind: 'payment' })}>تسجيل دفع {sar(owe)}</button>}
                {canRefund && b.paid > 0 && !d.dayClosed && <button className="btn quiet sm" onClick={() => setPay({ amount: String(b.paid), method: 'cash', kind: 'refund' })}>استرجاع</button>}
              </div>
            ) : (
              <form className="stack tight" onSubmit={e => { e.preventDefault(); run(() => addPaymentAction({ bookingId: b.id, method: pay.method, kind: pay.kind, amount: Number(pay.amount), note: '' }), pay.kind === 'refund' ? 'تم تسجيل الاسترجاع' : 'تم تسجيل الدفع'); }}>
                <b>{pay.kind === 'refund' ? 'استرجاع مبلغ' : 'تسجيل دفع'}</b>
                <div className="seg" role="group" aria-label="طريقة الدفع">
                  {(['cash', 'card', 'online', 'transfer'] as const).map(m => (
                    <button type="button" key={m} aria-pressed={pay.method === m} onClick={() => setPay({ ...pay, method: m })}>{METHOD_LABEL[m]}</button>
                  ))}
                </div>
                <label className="field"><span>المبلغ (ر.س)</span>
                  <input className="input num" inputMode="decimal" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value.replace(/[^\d.]/g, '') })} />
                </label>
                <div className="row">
                  <button className="btn primary" disabled={pending || !(Number(pay.amount) > 0)}>{pending ? 'جاري الحفظ…' : 'تأكيد'}</button>
                  <button type="button" className="btn quiet" onClick={() => setPay(null)}>رجوع</button>
                </div>
              </form>
            )}
          </div>
        )}
        {!staffMode && d.dayClosed && owe > 0.001 && canPay && <p className="notice warn" style={{ margin: 12 }}>صندوق اليوم مقفل، فما يمديك تسجلين دفعات جديدة اليوم.</p>}
        {!staffMode && d.invoices.length > 0 && (
          <div className="panel-pad stack tight" style={{ borderTop: '1px solid var(--line)' }}>
            {d.invoices.map(i => {
              const url = typeof window === 'undefined' ? '' : `${window.location.origin}/i/${i.token}`;
              return (
                <div key={i.id} className="inv-row">
                  <span><b>{i.kind === 'credit' ? 'إشعار دائن' : 'فاتورة ضريبية'}</b> <span className="ltr num faint small">{i.number}</span></span>
                  <a className="btn sm" href={`/i/${i.token}`} target="_blank" rel="noopener noreferrer">عرض وطباعة</a>
                  {b.customerPhone && <a className="btn sm" target="_blank" rel="noopener noreferrer"
                    href={waLink(b.customerPhone, `${i.kind === 'credit' ? 'إشعار الاسترجاع' : 'فاتورتك'} من ${d.salonName}: ${url}`)}><Icon name="chat" />إرسال</a>}
                </div>
              );
            })}
          </div>
        )}
        {!staffMode && canPay && d.invoices.every(i => i.kind !== 'invoice') && b.total > 0 && owe <= 0.001 && b.status !== 'cancelled' && b.status !== 'no_show' && (
          <div className="panel-pad" style={{ borderTop: '1px solid var(--line)' }}>
            {d.vatReady
              ? <button className="btn sm" disabled={pending} onClick={() => run(() => issueInvoiceAction(b.id), 'انطلعت الفاتورة')}>إصدار فاتورة ضريبية</button>
              : <p className="tiny faint">لإصدار فاتورة ضريبية: أضيفي الرقم الضريبي للصالون من الإعدادات.</p>}
          </div>
        )}
      </section>

      {!staffMode && canEdit && (b.status === 'booked' || b.status === 'arrived') && (
        <section className="stack tight">
          {cancel === null ? (
            <div className="row">
              {b.status === 'booked' && <button className="btn sm" disabled={pending} onClick={() => run(() => setStatusAction(b.id, 'no_show'), 'تم تسجيل الغياب')}>تسجيل غياب</button>}
              <button className="btn sm danger" onClick={() => setCancel('')}>إلغاء الحجز</button>
            </div>
          ) : (
            <form className="panel panel-pad stack tight" style={{ borderColor: 'var(--bad)' }} onSubmit={e => { e.preventDefault(); run(() => cancelBookingAction(b.id, cancel), 'تم الإلغاء والموعد رجع متاح'); }}>
              <b>إلغاء الحجز؟</b>
              <p className="small muted">الموعد يرجع متاح للحجز مباشرة.{b.paid > 0 ? ` المدفوع ${sar(b.paid)}: إذا بترجعينه سجّلي استرجاع.` : ''}</p>
              <label className="field"><span>السبب (اختياري)</span><input className="input" value={cancel} onChange={e => setCancel(e.target.value)} placeholder="مثلاً: طلب العميلة" /></label>
              <div className="row"><button className="btn danger" disabled={pending}>ألغي الحجز</button><button type="button" className="btn quiet" onClick={() => setCancel(null)}>رجوع</button></div>
            </form>
          )}
        </section>
      )}
      {!staffMode && canEdit && b.status === 'no_show' && (
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} disabled={pending} onClick={() => run(() => setStatusAction(b.id, 'booked'), 'رجع الحجز')}>التراجع عن الغياب</button>
      )}

      {d.payments.length > 0 && (
        <section className="stack tight">
          <h3>الدفعات</h3>
          <div className="log">
            {d.payments.map(p => (
              <div key={p.id}><time>{new Date(p.at).toLocaleString('ar-SA-u-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</time>
                <span>{p.kind === 'refund' ? 'استرجاع' : p.kind === 'deposit' ? 'عربون' : 'دفع'} {sar(p.amount)} · {METHOD_LABEL[p.method]}{p.by ? ` · ${p.by}` : ''}</span></div>
            ))}
          </div>
        </section>
      )}
      {!staffMode && (
        <details className="more-box">
          <summary>سجل الحجز ({d.log.length})</summary>
          <div className="log">
            {d.log.map((l, k) => (
              <div key={k}><time>{new Date(l.at).toLocaleString('ar-SA-u-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</time>
                <span>{ACTION_LABEL[l.action] || l.action}{l.action === 'status' && l.detail.to ? `: ${STATUS_LABEL[String(l.detail.to)]}` : ''}{l.by ? ` · ${l.by}` : ''}</span></div>
            ))}
          </div>
        </details>
      )}
    </Sheet>
  );
}
