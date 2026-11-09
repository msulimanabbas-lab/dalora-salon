// Demo salon for development and testing. Wipes and recreates the demo salon only.
// Usage: DATABASE_URL=... node scripts/seed.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const TZ = 'Asia/Riyadh'; // UTC+3, no DST
const pad = n => String(n).padStart(2, '0');
const localToday = () => { const d = new Date(Date.now() + 3 * 3600e3); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const addDays = (day, n) => { const [y, m, d] = day.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
const at = (day, min) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 0, min) - 3 * 3600e3); };
const weekday = day => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];

const today = localToday();
const DEMO = 'صالون روز';

await sql.begin(async tx => {
  await tx`DELETE FROM salons WHERE name = ${DEMO}`;
  const [salon] = await tx`
    INSERT INTO salons (name, area, phone, timezone, opens_min, closes_min, home_service, home_fee, travel_mins, deposit_pct, cancel_hours)
    VALUES (${DEMO}, 'حي النرجس، الرياض', '+966112345678', ${TZ}, 600, 1380, true, 50, 30, 20, 24) RETURNING id`;
  const S = salon.id;

  const full = (a, b, off = [5]) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].filter(d => !off.includes(d)).map(d => [String(d), [a, b]]));
  const staffRows = [
    { key: 'mona', name: 'منى', title: 'رموش وحواجب', color: '#B9708A', week: full(720, 1290), home: true, comm: 20 },
    { key: 'sara', name: 'سارة', title: 'شعر وصبغات', color: '#8C6BA8', week: full(840, 1380), home: false, comm: 15 },
    { key: 'reem', name: 'ريم', title: 'ميكب آرتست', color: '#C99263', week: full(720, 1380, [2]), home: true, comm: 25 },
    { key: 'haya', name: 'هيا', title: 'أظافر', color: '#5E978A', week: full(600, 1260), home: false, comm: 15 },
  ];
  const staff = {};
  let sort = 0;
  for (const s of staffRows) {
    const [r] = await tx`INSERT INTO staff (salon_id, name, title, color, week, works_home, commission_pct, sort)
                         VALUES (${S}, ${s.name}, ${s.title}, ${s.color}, ${tx.json(s.week)}, ${s.home}, ${s.comm}, ${sort++}) RETURNING id`;
    staff[s.key] = r.id;
  }

  const svcRows = [
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
  ];
  const svc = {};
  sort = 0;
  for (const [key, name, cat, dur, buf, price, home, who] of svcRows) {
    const [r] = await tx`INSERT INTO services (salon_id, name, category, duration_min, buffer_min, price, home_ok, sort)
                         VALUES (${S}, ${name}, ${cat}, ${dur}, ${buf}, ${price}, ${home}, ${sort++}) RETURNING id`;
    svc[key] = { id: r.id, name, dur, buf, price, who };
    for (const w of who) await tx`INSERT INTO service_staff (service_id, staff_id) VALUES (${r.id}, ${staff[w]})`;
  }

  // accounts (log in with these numbers; the code appears on screen in development)
  const people = [
    ['+966500000001', 'نوف', 'owner', null],
    ['+966500000002', 'لمى', 'reception', null],
    ['+966500000003', 'خالد', 'accountant', null],
    ['+966500000011', 'منى', 'staff', 'mona'],
    ['+966500000013', 'ريم', 'staff', 'reem'],
  ];
  const users = {};
  for (const [phone, name, role, st] of people) {
    const [u] = await tx`INSERT INTO users (phone, name) VALUES (${phone}, ${name}) ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id`;
    await tx`INSERT INTO memberships (salon_id, user_id, role, staff_id) VALUES (${S}, ${u.id}, ${role}, ${st ? staff[st] : null})`;
    users[role] = users[role] || u.id;
  }

  const names = ['نورة', 'هند', 'أمل', 'جود', 'دانة', 'لمى', 'ريما', 'غادة', 'سارة', 'مها', 'العنود', 'شهد', 'رزان', 'وعد', 'لجين', 'ديما', 'أروى', 'جنى', 'تالا', 'ليان'];
  const customers = [];
  for (let i = 0; i < names.length; i++) {
    const [c] = await tx`INSERT INTO customers (salon_id, name, phone, allergies, notes, tags)
      VALUES (${S}, ${names[i]}, ${'+9665' + String(51000000 + i * 7919).slice(0, 8)}, ${i === 1 ? 'حساسية من صمغ الرموش العادي' : ''},
              ${i === 0 ? 'تفضّل منى · رموش طول 11' : ''}, ${i % 6 === 0 ? ['VIP'] : []}) RETURNING id`;
    customers.push(c.id);
  }

  // bookings: 35 days back, today, and 6 days ahead
  const combos = [['lash'], ['lashfill'], ['brow'], ['lash', 'brow'], ['evening'], ['protein'], ['color'], ['blow'], ['nails'], ['gel'], ['nails', 'gel'], ['bride']];
  let code = 41000, made = 0;
  for (let off = -35; off <= 6; off++) {
    const day = addDays(today, off);
    const wd = weekday(day);
    const perStaffNext = {};
    const n = off === 0 ? 12 : off > 0 ? Math.round(3 + rnd() * 5) : Math.round(7 + rnd() * 7);
    let placed = 0;
    for (let k = 0; k < n * 4 && placed < n; k++) {
      const combo = pick(combos);
      const items = combo.map(c => svc[c]);
      const who = items.reduce((acc, it) => acc.filter(x => it.who.includes(x)), Object.keys(staff));
      if (!who.length) continue;
      const st = pick(who);
      const hours = staffRows.find(s => s.key === st).week[String(wd)];
      if (!hours) continue;
      const dur = items.reduce((a, i) => a + i.dur, 0), buf = Math.max(...items.map(i => i.buf));
      const start = perStaffNext[st] ?? hours[0] + (rnd() < 0.5 ? 0 : 30);
      if (start + dur + buf > hours[1]) continue;
      perStaffNext[st] = start + dur + buf + (rnd() < 0.55 ? 30 + Math.floor(rnd() * 3) * 30 : 0);
      const price = items.reduce((a, i) => a + i.price, 0);
      const past = off < 0 || (off === 0 && start + dur < 15 * 60);
      let status = 'booked';
      if (past) status = rnd() < 0.06 ? 'no_show' : rnd() < 0.05 ? 'cancelled' : 'done';
      else if (off === 0 && start < 16 * 60) status = 'arrived';
      const src = pick(['app', 'app', 'app', 'phone', 'phone', 'walk_in', 'social']);
      const cust = pick(customers);
      const paidFull = status === 'done' || (rnd() < 0.35 && status !== 'cancelled');
      const deposit = !paidFull && status !== 'cancelled' && rnd() < 0.5 ? Math.round(price * 0.2) : 0;
      const paid = paidFull ? price : deposit;
      const [b] = await tx`
        INSERT INTO bookings (salon_id, code, customer_id, staff_id, starts_at, ends_at, buffer_min, travel_min, status, source, subtotal, total, paid, created_by, occupied)
        VALUES (${S}, ${'DL-' + code++}, ${cust}, ${staff[st]}, ${at(day, start)}, ${at(day, start + dur)}, ${buf}, 0, ${status}, ${src}, ${price}, ${price}, ${paid}, ${users.reception}, 'empty')
        RETURNING id`;
      let i = 0;
      for (const it of items) await tx`INSERT INTO booking_items (booking_id, service_id, name, duration_min, price, sort) VALUES (${b.id}, ${it.id}, ${it.name}, ${it.dur}, ${it.price}, ${i++})`;
      await tx`INSERT INTO audit_log (salon_id, entity, entity_id, action, detail, user_id) VALUES (${S}, 'booking', ${b.id}, 'created', ${tx.json({ source: src })}, ${users.reception})`;
      if (paid > 0) {
        const payDay = off < 0 ? day : today;
        const method = src === 'app' ? 'online' : pick(['cash', 'cash', 'card', 'card', 'transfer']);
        if (deposit && !paidFull) {
          await tx`INSERT INTO payments (salon_id, booking_id, customer_id, method, kind, amount, business_date, received_by) VALUES (${S}, ${b.id}, ${cust}, 'online', 'deposit', ${deposit}, ${addDays(payDay, off < 0 ? 0 : 0)}, ${users.reception})`;
        } else {
          await tx`INSERT INTO payments (salon_id, booking_id, customer_id, method, kind, amount, business_date, received_by) VALUES (${S}, ${b.id}, ${cust}, ${method}, 'payment', ${paid}, ${payDay}, ${users.reception})`;
        }
      }
      made++; placed++;
    }
  }
  // close every past day so the money page has history
  for (let off = -35; off < 0; off++) {
    const day = addDays(today, off);
    const [t] = await tx`SELECT COALESCE(sum(amount) FILTER (WHERE method='cash'),0) AS cash, COALESCE(sum(amount) FILTER (WHERE method='card'),0) AS card,
                         COALESCE(sum(amount) FILTER (WHERE method='online'),0) AS online, COALESCE(sum(amount) FILTER (WHERE method='transfer'),0) AS transfer
                         FROM payments WHERE salon_id = ${S} AND business_date = ${day}`;
    const diff = rnd() < 0.15 ? -20 : 0;
    await tx`INSERT INTO day_closes (salon_id, business_date, expected_cash, counted_cash, difference, card_total, online_total, transfer_total, closed_by, closed_at)
             VALUES (${S}, ${day}, ${t.cash}, ${Number(t.cash) + diff}, ${diff}, ${t.card}, ${t.online}, ${t.transfer}, ${users.reception}, ${at(day, 1390)})`;
  }
  console.log(`seeded ${DEMO}: ${made} bookings, ${names.length} customers. Owner login: 0500000001`);
});
await sql.end();
