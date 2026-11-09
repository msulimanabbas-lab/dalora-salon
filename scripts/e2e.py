"""End-to-end check of the main flows against a running server with the demo seed.
Usage: python3 scripts/e2e.py  (expects http://localhost:3000)"""
import asyncio, re, os, datetime
from playwright.async_api import async_playwright

BASE = os.environ.get('BASE', 'http://localhost:3000')
OUT = os.environ.get('OUT', '/home/claude/dalora-salon/test-shots')
os.makedirs(OUT, exist_ok=True)
results = []
def check(name, ok, info=''):
    results.append((name, ok, info)); print(('PASS ' if ok else 'FAIL ') + name + (f' · {info}' if info else ''))

async def login(page, phone):
    await page.goto(BASE + '/login')
    await page.click('button:has-text("الدخول برقم الجوال")')
    await page.fill('#phone', phone)
    await page.click('button:has-text("أرسلي رمز الدخول")')
    await page.wait_for_selector('#code')
    note = await page.text_content('.notice.info')
    code = re.search(r'(\d{6})', note).group(1)
    await page.fill('#code', code)
    await page.click('button:has-text("دخول")')
    await page.wait_for_url(re.compile(r'/(schedule|my-day|money)'))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errors = []
        def watch(page):
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

        # ---- reception on desktop ----
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
        page = await ctx.new_page(); watch(page)
        await login(page, '0500000002')
        check('reception lands on schedule', '/schedule' in page.url)
        await page.wait_for_selector('.blk')
        await page.screenshot(path=f'{OUT}/01-schedule.png')

        # new booking via the form
        await page.click('button:has-text("حجز جديد")')
        await page.fill('#cust-q', 'نورة')
        await page.click('.results button >> nth=0')
        await page.click('.svc-opt:has-text("أظافر جل")')
        tomorrow_btn = page.locator('button[aria-label="اليوم التالي"]')
        import datetime
        d = (datetime.datetime.utcnow() + datetime.timedelta(hours=3) + datetime.timedelta(days=9)).strftime('%Y-%m-%d')
        await page.fill('#f-day', d)
        await page.wait_for_selector('.slot')
        await page.click('.slot >> nth=0')
        await page.screenshot(path=f'{OUT}/02-new-booking.png')
        await page.click('button:has-text("تأكيد الحجز")')
        await page.wait_for_selector('.sheet h2#sheet-title:has-text("نورة")', timeout=8000)
        check('booking created and opened', True)
        await page.screenshot(path=f'{OUT}/03-booking-sheet.png')

        # status flow + payment on that booking
        for label in ['وصلت العميلة', 'بدء الخدمة', 'انتهت الخدمة']:
            await page.click(f'.sheet-foot button:has-text("{label}")')
            await page.wait_for_timeout(700)
        st = await page.text_content('.steps .on')
        check('status flow reaches done, each step timed', st.strip().startswith('انتهت') and len(await page.locator('.steps small').all()) == 3, st)
        if await page.locator('button:has-text("تسجيل دفع")').count():
            await page.click('button:has-text("تسجيل دفع")')
            await page.click('.seg button:has-text("شبكة")')
            await page.click('button:has-text("تأكيد")')
            await page.wait_for_timeout(800)
        paid_ok = await page.locator('.sheet .kv:has-text("المتبقي")').count() == 0
        check('payment clears the balance', paid_ok)

        # ---- tax invoice: issued automatically on full payment, QR carries the five phase-1 fields ----
        await page.wait_for_selector('.inv-row', timeout=5000)
        href = await page.get_attribute('.inv-row a:has-text("عرض")', 'href')
        ip = await ctx.new_page(); watch(ip)
        await ip.goto(BASE + href); await ip.wait_for_selector('.inv-qr svg')
        txt = await ip.inner_text('.inv')
        check('invoice issued with number, VAT and QR', 'فاتورة ضريبية مبسطة' in txt and 'INV-' in txt and '300000000000003' in txt)
        await ip.screenshot(path=f'{OUT}/05-invoice.png')
        await ip.close()
        await page.keyboard.press('Escape')

        # ---- race: two desks book the same free slot at once ----
        ctx2 = await b.new_context(viewport={'width': 1440, 'height': 900})
        p2 = await ctx2.new_page(); watch(p2)
        await login(p2, '0500000001')
        far = (datetime.datetime.utcnow() + datetime.timedelta(hours=3) + datetime.timedelta(days=10)).strftime('%Y-%m-%d')
        async def prepare(pg, cname):
            await pg.goto(BASE + f'/schedule?d={far}')
            await pg.click('button:has-text("حجز جديد")')
            await pg.fill('#cust-q', cname)
            await pg.click('.results button >> nth=0')
            await pg.click('.svc-opt:has-text("سشوار")')
            await pg.select_option('#f-staff', label='سارة')
            await pg.wait_for_selector('.slot')
            await pg.click('.slot >> nth=-1')   # same last slot on both desks
        await prepare(page, 'هند'); await prepare(p2, 'أمل')
        await asyncio.gather(page.click('button:has-text("تأكيد الحجز")'), p2.click('button:has-text("تأكيد الحجز")'))
        await page.wait_for_timeout(2500)
        a_ok = await page.locator('.sheet h2#sheet-title:has-text("هند")').count() > 0
        b_ok = await p2.locator('.sheet h2#sheet-title:has-text("أمل")').count() > 0
        a_err = await page.locator('.notice.bad').count() > 0
        b_err = await p2.locator('.notice.bad').count() > 0
        check('same slot from two desks → exactly one booking', (a_ok ^ b_ok) and (a_err ^ b_err), f'A ok={a_ok} err={a_err} · B ok={b_ok} err={b_err}')
        await (p2 if b_err else page).screenshot(path=f'{OUT}/04-race-loser.png')

        # ---- money + close day (owner) ----
        await p2.goto(BASE + '/money'); await p2.wait_for_selector('h1')
        await p2.screenshot(path=f'{OUT}/05-money.png', full_page=True)
        exp = await p2.text_content('.kv:has-text("الكاش حسب النظام") b')
        expected = float(re.sub(r'[^\d.]', '', exp) or 0)
        await p2.fill('#counted', str(expected))
        await p2.click('button:has-text("إقفال اليوم")'); await p2.click('button:has-text("متأكدة")')
        await p2.wait_for_selector('.tag.ok:has-text("مقفل")', timeout=6000)
        check('day close records and locks the till', True)
        # payments are now refused for today
        await page.goto(BASE + '/money'); await page.wait_for_selector('h1')
        check('closed day visible to reception', await page.locator('.tag.ok:has-text("مقفل")').count() > 0)
        # reopen so the demo stays usable
        await p2.click('button:has-text("إعادة فتح الصندوق")'); await p2.click('button:has-text("تأكيد فتح الصندوق")')
        await p2.wait_for_timeout(800)

        for path, name in [('/reports', '06-reports'), ('/customers', '07-customers'), ('/services', '09-services'), ('/team', '10-team'), ('/settings', '11-settings')]:
            await p2.goto(BASE + path); await p2.wait_for_selector('h1'); await p2.wait_for_timeout(300)
            await p2.screenshot(path=f'{OUT}/{name}.png', full_page=True)
        await p2.goto(BASE + '/customers'); await p2.click('table a >> nth=0'); await p2.wait_for_selector('h2:has-text("السجل")')
        await p2.screenshot(path=f'{OUT}/08-customer.png', full_page=True)

        # reception may not open reports/settings
        await page.goto(BASE + '/settings'); await page.wait_for_load_state()
        check('reception blocked from settings', '/settings' not in page.url, page.url)

        # ---- staff on a phone ----
        ph = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        sp = await ph.new_page(); watch(sp)
        await login(sp, '0500000011')
        check('staff lands on my day', '/my-day' in sp.url)
        await sp.screenshot(path=f'{OUT}/12-staff-myday.png')
        await sp.goto(BASE + '/schedule'); await sp.wait_for_load_state()
        check('staff blocked from full schedule', '/schedule' not in sp.url, sp.url)
        sw = await sp.evaluate('document.documentElement.scrollWidth')
        check('no sideways scroll on phone', sw <= 390, str(sw))

        # ---- owner on a phone: agenda ----
        op = await ph.new_page(); watch(op)
        await ph.clear_cookies()
        await login(op, '0500000001')
        await op.wait_for_selector('.agenda')
        await op.screenshot(path=f'{OUT}/13-owner-phone.png')
        await op.click('.ag-item >> nth=0'); await op.wait_for_selector('.sheet')
        await op.screenshot(path=f'{OUT}/14-owner-phone-sheet.png')
        sw = await op.evaluate('document.documentElement.scrollWidth')
        check('owner phone has no sideways scroll', sw <= 390, str(sw))

        # ---- accounts: owner makes a reception login, she signs in with username + password and must pick her own ----
        await p2.goto(BASE + '/team'); await p2.click('button:has-text("إضافة حساب")')
        uname = 'e2e.r' + str(int(datetime.datetime.now().timestamp()))[-6:]
        await p2.fill('#m-name', 'استقبال تجربة'); await p2.fill('#m-user', uname)
        await p2.click('.sheet-foot button:has-text("إضافة")'); await p2.wait_for_selector('.cred')
        pw = (await p2.inner_text('.cred .kv:has-text("كلمة المرور") b')).strip()
        check('owner gets a one-time password for the new account', len(pw) == 9, pw)
        lc = await b.new_context(viewport={'width': 1440, 'height': 900}); lp = await lc.new_page(); watch(lp)
        await lp.goto(BASE + '/login'); await lp.fill('#username', uname); await lp.fill('#password', 'wrong-pass')
        await lp.click('button:has-text("دخول")'); await lp.wait_for_selector('.notice.bad')
        await lp.fill('#password', pw); await lp.click('button:has-text("دخول")'); await lp.wait_for_url(re.compile(r'/account'))
        check('generated password forces a new one', 'first=1' in lp.url)
        await lp.goto(BASE + '/schedule'); await lp.wait_for_url(re.compile(r'/account'))
        await lp.fill('#pw-current', pw); await lp.fill('#pw-next', 'NewPass123'); await lp.fill('#pw-again', 'NewPass123')
        await lp.click('button:has-text("حفظ")'); await lp.wait_for_url(re.compile(r'/schedule'))
        check('after choosing her password she reaches the schedule', '/schedule' in lp.url, lp.url)
        await lc.close()

        # ---- demo: step in without a code, switch roles from the bar ----
        dctx = await b.new_context(viewport={'width': 1440, 'height': 900}); dp = await dctx.new_page(); watch(dp)
        await dp.goto(BASE + '/demo')
        await dp.click('.demo-role:has-text("الاستقبال")'); await dp.wait_for_url(re.compile(r'/schedule'))
        check('demo: reception lands on schedule with the demo bar', await dp.locator('.demo-bar').count() == 1)
        await dp.click('.demo-bar button:has-text("المختصة")'); await dp.wait_for_url(re.compile(r'/my-day'))
        check('demo: switch to the specialist', '/my-day' in dp.url)
        await dp.click('.demo-bar button:has-text("صاحبة الصالون")'); await dp.wait_for_url(re.compile(r'/schedule'))
        await dp.click('.demo-bar button:has-text("بيانات جديدة")'); await dp.wait_for_timeout(2500)
        check('demo: fresh data keeps you signed in', '/schedule' in dp.url and await dp.locator('.demo-bar').count() == 1, dp.url)
        await dp.goto(BASE + '/services'); await dp.click('button:has-text("من القائمة الجاهزة")')
        await dp.click('.sheet h3:has-text("حناء") >> xpath=.. >> button:has-text("اختيار الكل")')
        await dp.click('.sheet-foot button'); await dp.wait_for_selector('h2:has-text("حناء")')
        check('ready list adds services without a price', await dp.locator('tr:has-text("حناء يدين") .tag.warn').count() >= 1)
        await dp.goto(BASE + '/help'); await dp.wait_for_selector('.help-item')
        check('help page lists guides for the role', await dp.locator('.help-item').count() >= 5)
        await dctx.close()

        errs = [e for e in errors if 'favicon' not in e]
        check('no browser errors', not errs, ' | '.join(errs[:3]))
        await b.close()
    print(f"\n{sum(1 for r in results if r[1])}/{len(results)} passed")

asyncio.run(main())
