import 'server-only';
import type { Tx } from './db';
import { addDays, nowMinIn, todayIn, weekdayOf, zoned } from './time';

/** Fills a salon with sample staff, services, customers and six weeks of bookings, for trying the system out. */
export async function seedDemo(tx: Tx, salonId: string, userId: string, tz: string) {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const today = todayIn(tz);
  const NOW = nowMinIn(tz);

  const full = (a: number, b: number, off = [5]) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].filter(d => !off.includes(d)).map(d => [String(d), [a, b]]));
  const staffRows = [
    { key: 'mona', name: 'منى', title: 'رموش وحواجب', color: '#B9708A', week: full(720, 1290), home: true, comm: 20 },
    { key: 'sara', name: 'سارة', title: 'شعر وصبغات', color: '#8C6BA8', week: full(840, 1380), home: false, comm: 15 },
    { key: 'reem', name: 'ريم', title: 'ميكب آرتست', color: '#C99263', week: full(720, 1380, [2]), home: true, comm: 25 },
    { key: 'haya', name: 'هيا', title: 'أظافر', color: '#5E978A', week: full(600, 1260), home: false, comm: 15 },
    { key: 'jawaher', name: 'جواهر', title: 'سبا ومساج', color: '#6F86A8', week: full(780, 1380, [6]), home: true, comm: 20 },
  ];
  const staff: Record<string, string> = {};
  let sort = 0;
  for (const s of staffRows) {
    const [r] = await tx`INSERT INTO staff (salon_id, name, title, color, week, works_home, commission_pct, sort)
                         VALUES (${salonId}, ${s.name}, ${s.title}, ${s.color}, ${tx.json(s.week as never)}, ${s.home}, ${s.comm}, ${sort++}) RETURNING id`;
    staff[s.key] = r.id;
  }
  const svcRows: [string, string, string, number, number, number, boolean, string[]][] = [
    ['lash', 'رموش كلاسيك', 'رموش وحواجب', 90, 15, 250, true, ['mona']],
    ['lashfill', 'تعبئة رموش', 'رموش وحواجب', 60, 10, 180, true, ['mona']],
    ['brow', 'حواجب تشقير وتهذيب', 'رموش وحواجب', 30, 5, 80, true, ['mona', 'reem']],
    ['evening', 'ميكب سهرة', 'ميكب', 60, 10, 400, true, ['reem']],
    ['bride', 'ميكب عروس', 'ميكب', 120, 15, 1200, true, ['reem']],
    ['protein', 'بروتين شعر', 'شعر', 120, 15, 600, false, ['sara']],
    ['color', 'صبغة + قص', 'شعر', 150, 15, 450, false, ['sara']],
    ['blow', 'سشوار', 'شعر', 45, 10, 120, false, ['sara']],
    ['nails', 'مناكير + بديكير', 'أظافر', 75, 10, 180, false, ['haya']],
    ['gel', 'أظافر جل', 'أظافر', 60, 10, 150, false, ['haya']],
    ['hammam', 'حمام مغربي', 'سبا ومساج', 60, 20, 250, false, ['jawaher']],
    ['royal', 'حمام مغربي ملكي', 'سبا ومساج', 90, 20, 380, false, ['jawaher']],
    ['massage', 'مساج استرخاء', 'سبا ومساج', 60, 15, 300, true, ['jawaher']],
    ['facial', 'تنظيف بشرة', 'بشرة', 60, 15, 220, false, ['jawaher', 'reem']],
  ];
  const svc: Record<string, { id: string; name: string; dur: number; buf: number; price: number; who: string[] }> = {};
  sort = 0;
  for (const [key, name, cat, dur, buf, price, home, who] of svcRows) {
    const [r] = await tx`INSERT INTO services (salon_id, name, category, duration_min, buffer_min, price, home_ok, sort)
                         VALUES (${salonId}, ${name}, ${cat}, ${dur}, ${buf}, ${price}, ${home}, ${sort++}) RETURNING id`;
    svc[key] = { id: r.id, name, dur, buf, price, who };
    for (const w of who) await tx`INSERT INTO service_staff (service_id, staff_id) VALUES (${r.id}, ${staff[w]})`;
  }
  const names = ['نورة', 'هند', 'أمل', 'جود', 'دانة', 'لمى', 'ريما', 'غادة', 'سارة', 'مها', 'العنود', 'شهد', 'رزان', 'وعد', 'لجين', 'ديما', 'أروى', 'جنى', 'تالا', 'ليان'];
  const customers: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const [c] = await tx`INSERT INTO customers (salon_id, name, phone, allergies, notes, tags)
      VALUES (${salonId}, ${'مثال: ' + names[i]}, ${'+9665' + String(51000000 + i * 7919).slice(0, 8)}, ${i === 1 ? 'حساسية من صمغ الرموش العادي' : ''},
              ${i === 0 ? 'تفضّل منى · رموش طول 11' : ''}, ${i % 6 === 0 ? ['VIP'] : []}) RETURNING id`;
    customers.push(c.id);
  }
  const combos = [['lash'], ['lashfill'], ['brow'], ['lash', 'brow'], ['evening'], ['protein'], ['color'], ['blow'], ['nails'], ['gel'], ['nails', 'gel'], ['bride'], ['hammam'], ['royal'], ['massage'], ['hammam', 'massage'], ['facial']];
  let code = 41000;
  for (let off = -35; off <= 6; off++) {
    const day = addDays(today, off);
    const wd = String(weekdayOf(day));
    const next: Record<string, number> = {};
    const n = off === 0 ? 15 : off > 0 ? Math.round(3 + rnd() * 5) : Math.round(7 + rnd() * 7);
    let placed = 0;
    for (let k = 0; k < n * 4 && placed < n; k++) {
      const items = pick(combos).map(c => svc[c]);
      const who = items.reduce((acc, it) => acc.filter(x => it.who.includes(x)), Object.keys(staff));
      if (!who.length) continue;
      const st = pick(who);
      const hours = staffRows.find(s => s.key === st)!.week[wd] as [number, number] | undefined;
      if (!hours) continue;
      const dur = items.reduce((a, i) => a + i.dur, 0), buf = Math.max(...items.map(i => i.buf));
      const start = next[st] ?? hours[0] + (rnd() < 0.5 ? 0 : 30);
      if (start + dur + buf > hours[1]) continue;
      next[st] = start + dur + buf + (rnd() < 0.55 ? 30 + Math.floor(rnd() * 3) * 30 : 0);
      const price = items.reduce((a, i) => a + i.price, 0);
      const past = off < 0 || (off === 0 && start + dur <= NOW);
      let status = 'booked';
      if (past) status = rnd() < 0.06 ? 'no_show' : rnd() < 0.05 ? 'cancelled' : 'done';
      // today follows the real clock: whoever's time has come is in the chair, whoever's due in 15 minutes just walked in
      else if (off === 0 && start <= NOW) status = 'in_service';
      else if (off === 0 && start - NOW <= 15) status = 'arrived';
      const src = pick(['whatsapp', 'whatsapp', 'whatsapp', 'app', 'app', 'phone', 'walk_in', 'social']);
      const cust = pick(customers);
      const paidFull = status === 'done' || (rnd() < 0.35 && status !== 'cancelled');
      const deposit = !paidFull && status !== 'cancelled' && rnd() < 0.5 ? Math.round(price * 0.2) : 0;
      const paid = paidFull ? price : deposit;
      const [b] = await tx`
        INSERT INTO bookings (salon_id, code, customer_id, staff_id, starts_at, ends_at, buffer_min, travel_min, status, source, subtotal, total, paid, created_by, occupied)
        VALUES (${salonId}, ${'DL-' + code++}, ${cust}, ${staff[st]}, ${zoned(day, start, tz)}, ${zoned(day, start + dur, tz)}, ${buf}, 0, ${status}, ${src}, ${price}, ${price}, ${paid}, ${userId}, 'empty')
        RETURNING id`;
      let i = 0;
      for (const it of items) await tx`INSERT INTO booking_items (booking_id, service_id, name, duration_min, price, sort) VALUES (${b.id}, ${it.id}, ${it.name}, ${it.dur}, ${it.price}, ${i++})`;
      if (paid > 0) {
        const payDay = off < 0 ? day : today;
        const method = deposit && !paidFull ? 'online' : src === 'app' ? 'online' : pick(['cash', 'cash', 'card', 'card', 'transfer']);
        await tx`INSERT INTO payments (salon_id, booking_id, customer_id, method, kind, amount, business_date, received_by)
                 VALUES (${salonId}, ${b.id}, ${cust}, ${method}, ${deposit && !paidFull ? 'deposit' : 'payment'}, ${paid}, ${payDay}, ${userId})`;
      }
      placed++;
    }
  }
  // arrival times, so the waiting clock and the booking timeline have something to show
  await tx`UPDATE bookings SET
      arrived_at   = CASE WHEN status IN ('arrived', 'in_service', 'done') THEN LEAST(starts_at - interval '6 minutes', now()) END,
      started_at   = CASE WHEN status IN ('in_service', 'done') THEN LEAST(starts_at + interval '2 minutes', now()) END,
      finished_at  = CASE WHEN status = 'done' THEN ends_at END,
      confirmed_at = CASE WHEN status <> 'cancelled' AND random() < 0.6 THEN starts_at - interval '1 day' END
    WHERE salon_id = ${salonId}`;
  for (let off = -35; off < 0; off++) {
    const day = addDays(today, off);
    const [t] = await tx`SELECT COALESCE(sum(amount) FILTER (WHERE method='cash'),0) AS cash, COALESCE(sum(amount) FILTER (WHERE method='card'),0) AS card,
                         COALESCE(sum(amount) FILTER (WHERE method='online'),0) AS online, COALESCE(sum(amount) FILTER (WHERE method='transfer'),0) AS transfer
                         FROM payments WHERE salon_id = ${salonId} AND business_date = ${day}`;
    await tx`INSERT INTO day_closes (salon_id, business_date, expected_cash, counted_cash, difference, card_total, online_total, transfer_total, closed_by, closed_at)
             VALUES (${salonId}, ${day}, ${t.cash}, ${t.cash}, 0, ${t.card}, ${t.online}, ${t.transfer}, ${userId}, ${zoned(day, 1390, tz)})`;
  }
}
