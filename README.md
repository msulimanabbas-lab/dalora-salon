# Dalora · لوحة الصالون

نظام إدارة حجوزات الصالون: الجدول، الحجز اليدوي، العميلات، المال والإقفال اليومي، التقارير، الفريق والصلاحيات.
هذا هو الجزء الأول من منصة Dalora. تطبيق العميلة وتطبيق الخبيرة يُبنون فوق نفس قاعدة البيانات لاحقاً.

## وش فيه

| القسم | مين يشوفه | وش يسوي |
| --- | --- | --- |
| الجدول | المالكة، المديرة، الاستقبال، المحاسبة | يوم كامل بعمود لكل موظفة، حجز سريع بالضغط على وقت فاضي، حالات الحجز، الدفع، الإلغاء والغياب. على الجوال يتحول لقائمة مرتبة بالوقت |
| الحين (أعلى جدول اليوم) | الاستقبال | على وصول ← تنتظر ← في الخدمة ← باقي دفع. ضغطة وحدة "وصلت" وتطلع العميلة عند المختصة مع وقت وصولها ومدة انتظارها |
| يومي | الموظفة | بطاقة كبيرة "وصلت عميلتك" مع زر بدء الخدمة، بعدها "معك الحين" وزر انتهت. مواعيدها بس، تنبيه الحساسية، وما تشوف أرقام العميلات |
| العميلات | المالكة، المديرة، الاستقبال | بحث، ترتيب (الأكثر صرفاً، غابت أكثر من 45 يوم…)، ملف لكل عميلة: سجلها، غيابها، تفضيلاتها، تنبيه الحساسية |
| المال | المالكة، المديرة، الاستقبال، المحاسبة | دفعات اليوم حسب الطريقة، الحجوزات اللي عليها مبلغ، إقفال الصندوق ومطابقة الكاش، سجل الإقفالات |
| التقارير | المالكة، المديرة، المحاسبة | الإيراد، متوسط الفاتورة، الإشغال، الغياب، أداء وعمولة كل موظفة، الخدمات، مصادر الحجز، أوقات الذروة |
| الخدمات والفريق | المالكة، المديرة | المدة ووقت التجهيز والسعر، مين تقدّم كل خدمة، الدوام الأسبوعي، الأوقات المقفلة. "من القائمة الجاهزة": أكثر من 50 خدمة شائعة بمددها، والأسعار تعبّينها |
| الإعدادات والحسابات | المالكة | سياسات الإلغاء والعربون، الخدمة المنزلية، إضافة حسابات وتحديد أدوارها |

### الحجز بالواتساب والاتصال
مصدر الحجز الافتراضي واتساب. من بطاقة الحجز: اتصال أو واتساب بضغطة، "تذكير بالواتساب" يفتح المحادثة والرسالة مكتوبة (اليوم والساعة والخدمة)، ولما ترد العميلة تضغطين "أكدت" ويطلع ✓ على الحجز في الجدول.
كل خطوة تنحفظ بوقتها: أكدت، وصلت، بدأت، انتهت.

### الفاتورة الضريبية
اكتبي الرقم الضريبي من الإعدادات، وبعدها كل حجز يكتمل دفعه تنطلع له **فاتورة ضريبية مبسطة** برمز QR (اسم البائع، الرقم الضريبي، الوقت، الإجمالي، الضريبة)، وأي استرجاع ينطلع له **إشعار دائن**. الأرقام متسلسلة وما تتكرر، والفاتورة بعد ما تنطلع ما تنعدل ولا تنحذف (قاعدة البيانات نفسها ترفض). كل فاتورة لها رابط تطبعينه أو ترسلينه للعميلة بالواتساب.
هذا يغطي المرحلة الأولى من الفوترة الإلكترونية. كل فاتورة محفوظ معها UUID وعدّاد وبصمة الفاتورة السابقة، وهي الأساس اللي تحتاجه المرحلة الثانية (الربط مع منصة فاتورة): ملف XML، والختم الإلكتروني، والإرسال للهيئة خلال 24 ساعة.

### النسخة التجريبية
`/demo` يدخلك صالون تجريبي بدون رمز، وتختارين الدور: الاستقبال، المختصة، صاحبة الصالون. وتبدّلين بينهم من الشريط اللي فوق. البيانات ترجع جديدة كل يوم، وزر "بيانات جديدة" يرجعها في أي وقت. لإيقافها: `DEMO_DISABLED=1`.

### المساعدة
صفحة المساعدة فيها خطوات قصيرة لكل دور. زر "راسلي الدعم" يطلع إذا ضفتي رقم واتساب الدعم في `SUPPORT_WHATSAPP`.

### كيف يمنع الحجز المزدوج
قاعدة البيانات نفسها ترفض أي حجزين متداخلين لنفس الموظفة (قيد `bookings_no_overlap` في `db/001_init.sql`).
الوقت المحجوز يشمل مدة الخدمة + وقت التجهيز بعدها + وقت التنقّل للخدمة المنزلية. حتى لو ضغطت موظفتين "تأكيد" بنفس اللحظة على نفس الوقت، ينحفظ حجز واحد والثاني يطلع له "هذا الوقت انحجز قبل لحظات".

### الدخول
برقم الجوال ورمز من 6 أرقام. بدون مزوّد رسائل (وضع التطوير) يظهر الرمز على الشاشة. للتشغيل الفعلي اربطي مزوّد رسائل سعودي في `lib/sms.ts`.

---

## Running it (developers)

Requirements: Node.js 20+ and PostgreSQL 14+ with the `btree_gist` extension (available on every major managed Postgres).

```bash
npm install
cp .env.example .env.local        # set DATABASE_URL and AUTH_SECRET
npm run db:migrate                # creates the schema (npm run build also does this)
npm run db:seed                   # optional: demo salon "صالون روز" with 6 weeks of data
npm run dev                       # http://localhost:3000
```

Demo logins after seeding (the code is shown on screen while `SMS_PROVIDER` is empty):

| Role | Phone |
| --- | --- |
| Owner (المالكة) | 0500000001 |
| Reception (الاستقبال) | 0500000002 |
| Accountant (المحاسبة) | 0500000003 |
| Staff · Mona (موظفة) | 0500000011 |
| Staff · Reem (موظفة) | 0500000013 |

End-to-end check (needs Python Playwright and a running server with the seed): `python3 scripts/e2e.py`

### Project layout
- `db/` SQL migrations, applied in order by `scripts/migrate.mjs`
- `lib/` server code: `auth.ts` (OTP, sessions, role permissions in `CAN`), `availability.ts` (free-slot search), `data.ts` (queries), `time.ts` (salon-local time; each salon has its own time zone)
- `app/actions.ts` every write goes through these server actions: each checks the role, validates input, runs in a transaction and writes `audit_log`
- `app/(app)/*` the pages; `components/` shared UI (booking form, booking sheet, schedule pieces)

### Put it online for testing (about 15 minutes, free tiers)
1. Put this folder in a GitHub repository.
2. On vercel.com: **Add New → Project →** import the repository → **Deploy** (the first build fails: no database yet — that's expected).
3. In the project: **Storage → Create Database → Neon (Postgres)** → connect it to the project. This adds `DATABASE_URL` for you.
4. **Settings → Environment Variables**: add `AUTH_SECRET` (a long random string) and `TEST_ACCESS_CODE` (6 digits you choose and share only with testers).
5. **Deployments → Redeploy.** The build creates the tables by itself.
6. Open the site: the first visit shows **إعداد الصالون** — enter the salon and the owner's phone (tick sample data if you want to explore). After that, everyone logs in with their phone number + `TEST_ACCESS_CODE`.

### Going live
1. **Database**: a managed PostgreSQL. Customer data falls under Saudi Arabia's Personal Data Protection Law (PDPL); hosting the database in a Saudi region keeps you on the safe side — confirm the requirements with a legal advisor.
2. **App**: any Node host (Vercel, Render, Railway, or your own server with `npm run build && npm start`). Set `DATABASE_URL`, a long random `AUTH_SECRET`, and run `npm run db:migrate` once per release.
3. **SMS**: register a sender name with a Saudi provider (Unifonic, Taqnyat, Msegat…) and complete `lib/sms.ts`; then set `SMS_PROVIDER`.
4. **First salon**: the first visit to an empty database opens `/setup`, which creates the salon and its owner. It closes itself once a salon exists.

### Not in this version yet
Online card payments inside the app (Moyasar / Tap / HyperPay), automatic SMS / WhatsApp reminders (today a reminder is one tap that opens WhatsApp with the message written), waitlist, multi-branch, product stock, ZATCA phase 2 (Fatoora integration: UBL XML, cryptographic stamp, reporting), and the customer & freelancer apps.
