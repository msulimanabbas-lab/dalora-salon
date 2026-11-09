import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { Tx } from './db';

/**
 * Simplified tax invoices (B2C) for Saudi VAT.
 *
 * Phase 1 (generation) today: sequential numbers that are never reused, a QR code with the five
 * required fields (seller, VAT number, time, total, VAT), and invoices that can't be edited or deleted
 * (a database trigger enforces it; corrections are credit notes).
 *
 * Laid out for phase 2 (integration with ZATCA's Fatoora platform): every invoice already carries a UUID,
 * an invoice counter (ICV) and the previous invoice's hash (PIH), chained per salon. Phase 2 adds the
 * UBL XML, the ECDSA (secp256k1) stamp, QR tags 6–9 and reporting to ZATCA within 24 hours.
 */

/** ZATCA's seed for the first invoice's previous hash: base64 of the hex SHA-256 of "0". */
export const FIRST_PIH = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

export const isVatNumber = (v: string) => /^3\d{13}3$/.test(v);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** TLV (tag, length, value) → base64, as read by ZATCA's QR scanner app. Each value is capped at 255 bytes. */
export function tlvQr(fields: string[]) {
  const parts: Buffer[] = [];
  fields.forEach((value, i) => {
    let v = Buffer.from(value, 'utf8');
    if (v.length > 255) {
      let s = value;
      while (Buffer.byteLength(s, 'utf8') > 255) s = s.slice(0, -1); // cut on a character boundary
      v = Buffer.from(s, 'utf8');
    }
    parts.push(Buffer.from([i + 1, v.length]), v);
  });
  return Buffer.concat(parts).toString('base64');
}

/** VAT-inclusive total → excl / VAT, rounded once. Prices shown to customers in KSA include VAT. */
export function splitVat(totalIncl: number, pct: number) {
  const excl = r2(totalIncl / (1 + pct / 100));
  return { excl, vat: r2(totalIncl - excl), incl: r2(totalIncl) };
}

type Line = { name: string; qty: number; unit_incl: number; total_incl: number };

/**
 * Issues an invoice (or a credit note) inside the caller's transaction.
 * Returns null when the salon has no VAT number yet. Locks the salon row so two desks
 * can never take the same counter value.
 */
export async function issueInvoice(tx: Tx, p: {
  salonId: string; userId: string | null; bookingId: string;
  kind: 'invoice' | 'credit'; amount?: number; reason?: string; issuedAt?: Date;
}): Promise<{ id: string; number: string } | null> {
  const [s] = await tx`SELECT name, vat_number, cr_number, address, area, vat_pct, invoice_icv, invoice_pih
                       FROM salons WHERE id = ${p.salonId} FOR UPDATE`;
  if (!s || !isVatNumber(s.vat_number)) return null;

  const [b] = await tx`SELECT b.id, b.total, b.discount, b.home_fee, b.location, c.name AS customer
                       FROM bookings b JOIN customers c ON c.id = b.customer_id
                       WHERE b.id = ${p.bookingId} AND b.salon_id = ${p.salonId}`;
  if (!b) return null;

  let lines: Line[]; let incl: number; let refId: string | null = null;
  if (p.kind === 'invoice') {
    const [existing] = await tx`SELECT id, number FROM invoices WHERE booking_id = ${b.id} AND kind = 'invoice'`;
    if (existing) return { id: existing.id, number: existing.number };
    const items = await tx`SELECT name, price FROM booking_items WHERE booking_id = ${b.id} ORDER BY sort`;
    lines = items.map(i => ({ name: i.name, qty: 1, unit_incl: Number(i.price), total_incl: Number(i.price) }));
    if (Number(b.home_fee) > 0) lines.push({ name: 'رسوم الخدمة المنزلية', qty: 1, unit_incl: Number(b.home_fee), total_incl: Number(b.home_fee) });
    if (Number(b.discount) > 0) lines.push({ name: 'خصم', qty: 1, unit_incl: -Number(b.discount), total_incl: -Number(b.discount) });
    incl = Number(b.total);
  } else {
    const [inv] = await tx`SELECT id, number FROM invoices WHERE booking_id = ${b.id} AND kind = 'invoice'`;
    if (!inv) return null; // nothing invoiced, nothing to credit
    refId = inv.id;
    incl = r2(p.amount ?? 0);
    lines = [{ name: `استرجاع من الفاتورة ${inv.number}`, qty: 1, unit_incl: incl, total_incl: incl }];
  }
  if (!(incl > 0)) return null;

  const pct = Number(s.vat_pct);
  const t = splitVat(incl, pct);
  const icv = Number(s.invoice_icv) + 1;
  const number = (p.kind === 'invoice' ? 'INV-' : 'CRN-') + String(icv).padStart(6, '0');
  const pih = s.invoice_pih || FIRST_PIH;
  const uuid = crypto.randomUUID();
  const issuedAt = p.issuedAt ?? new Date();
  issuedAt.setMilliseconds(0);
  const seller = { name: s.name, vat_number: s.vat_number, cr_number: s.cr_number, address: s.address || s.area };

  // Phase 1 hash over a canonical form of the invoice; phase 2 replaces it with the hash of the signed XML.
  const canonical = JSON.stringify({ icv, uuid, number, kind: p.kind, issuedAt: issuedAt.toISOString(), seller, lines, pct, ...t, pih });
  const hash = createHash('sha256').update(canonical).digest('base64');
  const qr = tlvQr([seller.name, seller.vat_number, issuedAt.toISOString().replace('.000Z', 'Z'), t.incl.toFixed(2), t.vat.toFixed(2)]);

  const [row] = await tx`
    INSERT INTO invoices (salon_id, booking_id, kind, ref_id, icv, number, uuid, issued_at, seller, buyer_name, lines,
                          vat_pct, total_excl, vat, total_incl, pih, hash, qr, share_token, reason, created_by)
    VALUES (${p.salonId}, ${b.id}, ${p.kind}, ${refId}, ${icv}, ${number}, ${uuid}, ${issuedAt}, ${tx.json(seller)}, ${b.customer},
            ${tx.json(lines as never)}, ${pct}, ${t.excl}, ${t.vat}, ${t.incl}, ${pih}, ${hash}, ${qr},
            ${randomBytes(18).toString('base64url')}, ${p.reason ?? ''}, ${p.userId})
    RETURNING id`;
  await tx`UPDATE salons SET invoice_icv = ${icv}, invoice_pih = ${hash} WHERE id = ${p.salonId}`;
  return { id: row.id, number };
}
