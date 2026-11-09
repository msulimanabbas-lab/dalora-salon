import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { sql } from '@/lib/db';
import { sar } from '@/lib/format';
import { fmtTime, localParts } from '@/lib/time';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'فاتورة', robots: { index: false, follow: false } };

/**
 * The invoice itself. Reached by an unguessable link, so the front desk can print it or send it
 * to the customer on WhatsApp; nothing else about the salon is visible from here.
 */
export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{20,40}$/.test(token)) notFound();
  const [inv] = await sql`
    SELECT i.*, s.timezone, s.is_demo, r.number AS ref_number
    FROM invoices i JOIN salons s ON s.id = i.salon_id LEFT JOIN invoices r ON r.id = i.ref_id
    WHERE i.share_token = ${token}`;
  if (!inv) notFound();
  const at = localParts(new Date(inv.issued_at), inv.timezone);
  const qr = await QRCode.toString(inv.qr, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
  const credit = inv.kind === 'credit';
  const lines = inv.lines as { name: string; qty: number; total_incl: number }[];
  const [y, m, d] = at.day.split('-');

  return (
    <main className="inv-page">
      {inv.is_demo && <p className="inv-demo">نسخة تجريبية من Dalora · هذي ليست فاتورة حقيقية</p>}
      <article className="inv" aria-label={credit ? 'إشعار دائن' : 'فاتورة ضريبية مبسطة'}>
        <header>
          <h1>{inv.seller.name}</h1>
          {inv.seller.address && <p>{inv.seller.address}</p>}
          <p>الرقم الضريبي <span className="num ltr">{inv.seller.vat_number}</span></p>
          {inv.seller.cr_number && <p>السجل التجاري <span className="num ltr">{inv.seller.cr_number}</span></p>}
        </header>

        <h2>{credit ? 'إشعار دائن' : 'فاتورة ضريبية مبسطة'}<span lang="en">{credit ? 'Credit Note' : 'Simplified Tax Invoice'}</span></h2>

        <dl className="inv-meta">
          <div><dt>رقم {credit ? 'الإشعار' : 'الفاتورة'}</dt><dd className="num ltr">{inv.number}</dd></div>
          <div><dt>التاريخ</dt><dd className="num">{`${d}/${m}/${y}`} · {fmtTime(at.min)}</dd></div>
          {inv.buyer_name && <div><dt>العميلة</dt><dd>{inv.buyer_name}</dd></div>}
          {credit && inv.ref_number && <div><dt>عن الفاتورة</dt><dd className="num ltr">{inv.ref_number}</dd></div>}
          {credit && inv.reason && <div><dt>السبب</dt><dd>{inv.reason}</dd></div>}
        </dl>

        <table className="inv-lines">
          <thead><tr><th>البيان</th><th className="end">المبلغ</th></tr></thead>
          <tbody>
            {lines.map((l, i) => <tr key={i}><td>{l.name}</td><td className="end num">{sar(l.total_incl)}</td></tr>)}
          </tbody>
        </table>

        <dl className="inv-totals">
          <div><dt>الإجمالي غير شامل الضريبة</dt><dd className="num">{sar(inv.total_excl)}</dd></div>
          <div><dt>ضريبة القيمة المضافة {Number(inv.vat_pct)}%</dt><dd className="num">{sar(inv.vat)}</dd></div>
          <div className="grand"><dt>الإجمالي شامل الضريبة</dt><dd className="num">{sar(inv.total_incl)}</dd></div>
        </dl>

        <div className="inv-qr" dangerouslySetInnerHTML={{ __html: qr }} aria-label="رمز QR للفاتورة" role="img" />
        <p className="inv-foot">صادرة عبر Dalora</p>
      </article>
      <PrintButton />
    </main>
  );
}
