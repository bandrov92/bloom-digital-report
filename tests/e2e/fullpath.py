"""Full learner path 01 -> 28: elements, test at the 60 boundary, pass, return cycle.

Optional browser checks (not part of the site). Requirements: Python 3 and
`pip install playwright` then `python -m playwright install chromium`.
Run from the repository root: python tests/e2e/fullpath.py
"""
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
import sys, json
from playwright.sync_api import sync_playwright

SITE = (ROOT / 'trainee.html').as_uri()
fails = []
def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)
def st(pg): return pg.evaluate("JSON.parse(localStorage.getItem('bloomLearning.v1') || 'null')")
def done(pg): return sorted(k for k, v in (st(pg) or {}).get('elements', {}).items() if v.get('at'))
def go(pg, n): pg.goto(f'{SITE}#screen-{n}'); pg.wait_for_timeout(150)
def fill(pg, sel, text): pg.fill(sel, text)
def review(pg, path, val='yes'): pg.locator(f'input[data-field="{path}"][value="{val}"]').check()
def complete(pg, el): pg.click(f'[data-action="complete"][data-element="{el}"]'); pg.wait_for_timeout(150)
def chk(pg, cid, answers):
    f = pg.locator(f'[data-check-form="{cid}"]')
    for part, val in answers.items():
        sel = f.locator(f'[data-part="{part}"] select')
        if sel.count(): sel.select_option(val)
        else: f.locator(f'[data-part="{part}"] input[value="{val}"]').check()
    f.locator('button[type=submit]').click(); pg.wait_for_timeout(150)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 900})
    pg = ctx.new_page()
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'font' not in m.text and 'ERR_FAILED' not in m.text else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    reqs = []
    pg.on('request', lambda r: reqs.append(r.url))
    pg.goto(SITE); pg.wait_for_timeout(300)
    check(not any('test-forms' in u or 'test-keys' in u for u in reqs), 'test files not loaded on page open')
    # 01
    go(pg, '01'); pg.locator('input[data-field="s01.context"][value="own"]').check(); fill(pg, '#s01-title', 'مقارنة مصدرين في درس العلوم')
    # 02 diagnostic: leave one empty first
    go(pg, '02')
    ans = {'q1': 'f', 'q2': 'a', 'q3': 'b', 'q4': 'b', 'q5': 'b'}
    for q, v in ans.items(): pg.locator(f'input[data-field="s02.{q}"][value="{v}"]').check()
    pg.click('#diag-submit'); pg.wait_for_timeout(100)
    check('لم تُجب عن' in pg.inner_text('#diag-warning'), 'diagnostic warns about unanswered item')
    check(pg.evaluate('document.activeElement.name') == 's02-q6', 'focus moves to unanswered item')
    pg.locator('input[data-field="s02.q6"][value="f"]').check(); pg.click('#diag-submit'); pg.wait_for_timeout(150)
    check(pg.is_visible('#diagnostic-report'), 'diagnostic report shown')
    check('t01' in done(pg), 't01 complete after all answered + report')
    check(st(pg)['test']['attempts'] == [], 'diagnostic does not create test attempt')
    # 03
    go(pg, '03')
    check(pg.input_value('#s03-title') == 'مقارنة مصدرين في درس العلوم', 'need card title prefilled from screen 01')
    complete(pg, 't02')
    check('أكمل وصف ما يفعله المتعلم' in pg.inner_text('#screen-03'), 'custom required message for current performance')
    pg.locator('input[data-field="s03.status"][value="planned"]').check()
    fill(pg, '#s03-current', 'يعيد الطلاب كتابة ما ورد في مصدرين.'); fill(pg, '#s03-need', 'أريد أن يحكموا على المصدرين بمعيار.')
    complete(pg, 't02'); check('t02' in done(pg), 't02 complete')
    fill(pg, '#s03-need', 'أريد أن يحكموا على المصدرين بمعيارين.'); complete(pg, 't02')
    check(len(st(pg)['elements']['t02'].get('revisions', [])) == 1, 'need card edit kept as revision')
    # 04
    go(pg, '04'); check(pg.locator('#s04-review li').count() >= 1, 'path shows review places from diagnostic')
    check(pg.get_attribute('#s04-review-link', 'href') == '#screen-09', 'review link goes to first error screen (09)')
    # 09
    go(pg, '09'); fill(pg, '#s09-performance', 'يختار المتعلم المصدر الأنسب'); fill(pg, '#s09-conditions', 'عرض مصدرين عن الموضوع نفسه'); fill(pg, '#s09-criterion', 'ملاءمة المصدر وإمكانية تتبعه')
    pg.click('[data-action="compose-goal"]'); pg.wait_for_timeout(100)
    check(pg.input_value('#s09-statement').startswith('عند عرض مصدرين'), 'goal draft composed from parts')
    for i in range(1, 5): review(pg, f's09.rv{i}', 'partly')
    complete(pg, 't07'); check('t07' in done(pg), 't07 complete')
    # 10
    go(pg, '10'); pg.select_option('#s10-priority', 'n2'); fill(pg, '#s10-step', 'أعدل هدف المهمة'); fill(pg, '#s10-return', 'قبل الدرس المقبل')
    complete(pg, 't08'); check('t08' not in done(pg), 't08 waits for specific-step confirmation')
    pg.locator('input[data-field="s10.specific"]').check(); complete(pg, 't08'); check('t08' in done(pg), 't08 complete')
    check(len(st(pg)['history']['plan']) == 1, 'initial plan stored in history')
    # 05-08
    go(pg, '05'); chk(pg, 's05', {'judge': 'no', 'reason': 'act'})
    go(pg, '06'); chk(pg, 's06', {'m1': 'remember', 'm2': 'understand', 'm3': 'apply'})
    go(pg, '07'); chk(pg, 's07', {'m1': 'analyze', 'm2': 'evaluate', 'm3': 'create'}); fill(pg, '#s07-paraphrase', 'يحكم المتعلم على مصدرين بمعيارين.')
    for i in (1, 2, 3): review(pg, f's07.rv{i}')
    complete(pg, 't05')
    go(pg, '08'); chk(pg, 's08', {'fn': 'compare'}); fill(pg, '#s08-means', 'جدول مقارنة في مستند'); fill(pg, '#s08-alternative', 'ورقة مطبوعة')
    review(pg, 's08.rv1'); review(pg, 's08.rv2'); complete(pg, 't06')
    check(all(e in done(pg) for e in ['t03', 't04', 't05', 't06']), 't03–t06 complete')
    # 11 (no element)
    go(pg, '11'); pg.locator('input[data-field="s11.means"][value="need"]').check(); pg.wait_for_timeout(100)
    check(pg.is_visible('#screen-11 [data-show-when="s11.means=need"]'), 'alternative-function hint shown when means unavailable')
    # 12 plan revision
    go(pg, '12'); check('أعدل هدف المهمة' in pg.inner_text('#s12-current'), 'current plan shown')
    pg.locator('input[data-field="s12.decision"][value="modify"]').check(); fill(pg, '#s12-step', 'أجرب المهمة في محاكاة'); fill(pg, '#s12-reason', 'أخطأت في بند الهدف')
    pg.click('[data-action="plan-preview"]'); pg.wait_for_timeout(100)
    check(pg.locator('#s12-compare .compare-col').count() == 2, 'old and new plan shown before saving')
    pg.click('[data-action="plan-cancel"]'); pg.wait_for_timeout(100)
    check(st(pg)['drafts']['s10']['step'] == 'أعدل هدف المهمة', 'cancel keeps previous plan')
    pg.click('[data-action="plan-preview"]'); pg.click('[data-action="plan-save"]'); pg.wait_for_timeout(150)
    s = st(pg); check(s['drafts']['s10']['step'] == 'أجرب المهمة في محاكاة' and len(s['history']['plan']) == 2, 'plan revision saved with history')
    before = len(done(pg))
    # 13
    go(pg, '13'); chk(pg, 's13', {'pick': 'b', 'link1': 'resp', 'link2': 'track'}); check('t09' in done(pg), 't09 complete')
    # 14
    go(pg, '14'); pg.click('#s14-open'); pg.wait_for_timeout(100)
    check(not pg.is_visible('#s14-compare'), 'example locked before first attempt')
    fill(pg, '#s14-v1', 'اكتب عن الخطتين.'); fill(pg, '#s14-v1evidence', 'نص مكتوب'); pg.click('#s14-open'); pg.wait_for_timeout(150)
    check(pg.is_visible('#s14-compare') and pg.evaluate("document.getElementById('s14-v1').readOnly"), 'example opens and first attempt is kept read-only')
    for c, v in [('c1', 'missing'), ('c2', 'missing'), ('c3', 'present')]: pg.locator(f'input[data-field="s14.{c}"][value="{v}"]').check()
    complete(pg, 't10'); check('t10' not in done(pg), 't10 needs fix or reason')
    fill(pg, '#s14-v2', 'قارن الخطتين وفق المعيارين واحكم بشاهد.'); complete(pg, 't10'); check('t10' in done(pg), 't10 complete')
    # 15
    go(pg, '15')
    check(pg.input_value('#s15-goal').startswith('عند عرض مصدرين'), 'goal carried into workshop 3')
    check(pg.input_value('#s15-alternative') == 'ورقة مطبوعة', 'alternative carried from screen 08')
    fill(pg, '#s15-action', 'يقارن المصدرين ويختار الأنسب مع التعليل'); fill(pg, '#s15-evidence', 'جدول مقارنة وتعليل'); fill(pg, '#s15-function', 'جدول مشترك')
    pg.select_option('#s15-level', 'evaluate'); fill(pg, '#s15-reason', 'الهدف يطلب حكمًا بمعيار'); review(pg, 's15.rv1'); review(pg, 's15.rv2'); fill(pg, '#s15-changed', 'صار المطلوب حكمًا')
    complete(pg, 't11'); check('t11' in done(pg), 't11 complete')
    # 16
    go(pg, '16'); check(pg.input_value('#s16-before').startswith('يعيد الطلاب'), 'before prefilled from need card')
    fill(pg, '#s16-explain', 'تغير المطلوب من نقل إلى حكم.'); pg.locator('input[data-field="s16.kind"][value="display"]').check(); pg.wait_for_timeout(100)
    check(pg.is_visible('#screen-16 [data-show-when="s16.kind=display"]'), 'display-only message shown')
    pg.locator('input[data-field="s16.deficits"][value="tool"]').check(); pg.wait_for_timeout(100)
    check(pg.is_visible('#screen-16 [data-show-when="s16.deficits=tool"]'), 'deficit message shown on selection')
    complete(pg, 't12'); check('t12' in done(pg), 't12 complete')
    # 17
    go(pg, '17'); check(pg.input_value('#s17-goal').startswith('عند عرض مصدرين'), 'goal prefilled in project')
    fill(pg, '#s17-audience', 'طلاب المرحلة المتوسطة'); pg.select_option('[data-field="s17.prereqStatus"]', 'tbd'); pg.select_option('[data-field="s17.constraintsStatus"]', 'na')
    pg.locator('input[data-field="s17.goalReview"][value="improve"]').check(); complete(pg, 't13'); check('t13' in done(pg), 't13 complete with tbd/na')
    # 18
    go(pg, '18'); check(pg.input_value('#s18-means') == 'جدول مشترك', 'means prefilled from screen 15')
    fill(pg, '#s18-sources', 'مصدران مطبوعان'); fill(pg, '#s18-rationale', 'الجدول يظهر المقارنة'); fill(pg, '#s18-processQuote', 'اختر الأنسب وعلل')
    check('مصدران مطبوعان' in pg.inner_text('#s18-preview'), 'student preview updates')
    pg.locator('input[data-field="s18.previewChecked"]').check(); complete(pg, 't14'); check('t14' in done(pg), 't14 complete')
    # 19
    go(pg, '19'); complete(pg, 't15'); check('t15' not in done(pg), 't15 needs a full row')
    for k, v in [('desc', 'يطبق المعيارين'), ('evidence', 'جدول'), ('remedy', 'أضف المعيار الثاني'), ('next', 'أعيد قراءة الجدول')]: fill(pg, f'#s19-0-{k}', v)
    pg.wait_for_timeout(800); pg.locator('input[data-field="s19.compared"]').check(); complete(pg, 't15'); check('t15' in done(pg), 't15 complete')
    # 20
    go(pg, '20'); pg.click('[data-action="save-version"][data-kind="review"]'); pg.wait_for_timeout(150)
    check(st(pg)['project']['versions'] == [], 'no version saved without rubric evidence')
    for cid in ['goal', 'alignment', 'clarity', 'digital', 'feedback', 'sources', 'trial']:
        pg.locator(f'input[data-field="s20.level_{cid}"][value="{"na" if cid=="sources" else "improve"}"]').check()
        fill(pg, f'#s20-evidence-{cid}', 'شاهد من عملي' if cid != 'sources' else 'لم أستخدم مصادر خارجية بعد')
    pg.click('[data-action="save-version"][data-kind="review"]'); pg.wait_for_timeout(150)
    res = pg.inner_text('[data-result="t16"]')
    check('اكتملت مراجعتك الذاتية لهذه النسخة' in res and 'إتقان' not in res, 'self-review message without mastery claim')
    check('t16' in done(pg) and len(st(pg)['project']['versions']) == 1, 't16 complete with a saved version')
    # 25-27 before test
    go(pg, '25'); pg.click('#source-form button[type=submit]'); pg.wait_for_timeout(100)
    check('t18' not in done(pg) and pg.locator('#source-form .field-error').count() > 0, 'empty source card rejected with errors')
    for k, v in [('title', 'دليل المعلم'), ('author', 'جهة تعليمية'), ('locator', 'ملف PDF في مجلد المدرسة'), ('location', 'ص12'), ('purpose', 'معايير اختيار المصدر')]: fill(pg, f'#s25-{k}', v)
    pg.fill('#s25-accessed', '2026-10-20'); pg.select_option('#s25-use', 'summary'); pg.select_option('#s25-part', 'task')
    pg.click('#source-form button[type=submit]'); pg.wait_for_timeout(150)
    s = st(pg); check('t18' in done(pg) and s['sources'][0]['license'] == 'غير معلوم', 't18 complete; unknown licence recorded as unknown')
    go(pg, '26'); chk(pg, 's26', {'judge': 'context'}); fill(pg, '#s26-use', 'أستخدم معاييره في جدول المقارنة'); fill(pg, '#s26-limit', 'عينته طلاب لا معلمون')
    pg.locator('input[data-field="s26.reviewed"]').check(); complete(pg, 't19')
    go(pg, '27'); pg.locator('input[data-field="s27.type"][value="sim"]').check(); pg.wait_for_timeout(50)
    check(pg.is_visible('#screen-27 [data-show-when="s27.type=sim"]'), 'simulation limit message shown')
    for k, v in [('context', 'أنفذ المهمة بنفسي'), ('evidence', 'مواضع الغموض'), ('criterion', 'أي تعليمات احتجت تفسيرها'), ('return', 'الأسبوع المقبل')]: fill(pg, f'#s27-{k}', v)
    complete(pg, 't20')
    check(len(done(pg)) == 19, f'19 elements before test ({len(done(pg))})')
    # dashboard: content met, test missing
    pg.goto(SITE + '#dashboard'); pg.wait_for_timeout(150)
    check('اكتمل شرط المحتوى' in pg.inner_text('#dash-summary'), 'dashboard: content-only message')
    # 24 before test is gated
    go(pg, '24'); fill(pg, '#s24-conclusion', 'x'); complete(pg, 't17')
    check('t17' not in done(pg) and 'أرسل محاولة الاختبار' in pg.inner_text('[data-result="t17"]'), 't17 blocked before test attempt')
    # 21-23 test
    go(pg, '21'); pg.click('#test-start'); pg.wait_for_timeout(500)
    check(pg.evaluate('location.hash') == '#screen-22' and pg.locator('#test-player fieldset').count() == 10, 'test player shows 10 items')
    check(any('test-forms.js' in u for u in reqs) and not any('test-keys.js' in u for u in reqs), 'forms loaded on demand, keys not yet')
    keys = json.loads(pg.evaluate("""(() => { return '{}' })()"""))
    import re
    A = {'A1':'b','A2':'c','A3':'a','A4':'b','A5':'c','A6':'a','A7':'b','A8':'c','A9':'a','A10':'b'}
    wrong = {'A2', 'A7', 'A9', 'A10'}  # 6 correct -> 60
    for item, a in A.items():
        if item == 'A10': continue
        v = a if item not in wrong else ('a' if a != 'a' else 'b')
        pg.locator(f'input[name="test-{item}"][value="{v}"]').check(); pg.wait_for_timeout(30)
    pg.reload(); pg.wait_for_timeout(400)
    check(pg.locator('#test-player input:checked').count() == 9, 'unsubmitted answers restored after reload')
    pg.click('[data-action="test-submit"]'); pg.wait_for_timeout(150)
    check('السؤال 10' in pg.inner_text('#test-player-msg') and st(pg)['test']['attempts'] == [], 'empty question blocks submission and is named')
    pg.locator('input[name="test-A10"][value="a"]').check(); pg.wait_for_timeout(50)
    pg.click('[data-action="test-submit"]'); pg.wait_for_timeout(800)
    s = st(pg); a = s['test']['attempts'][0]
    check(a['total'] == 60 and s['test']['draft'] is None, f'attempt scored 60 and locked ({a["total"]})')
    check(pg.evaluate('location.hash') == '#screen-23' and pg.locator('#test-report .diag-item').count() == 10, 'report lists 10 explained items')
    check(st(pg)['test']['reportViewedAt'] is not None, 'report opening recorded')
    check('استوفيت شروط اجتياز الدورة' in pg.inner_text('#test-report'), '19/20 (95%) and score 60 -> passed (boundary score)')
    go(pg, '21'); check(not pg.is_visible('#test-start'), 'no retake button (single approved attempt)')
    check('محاولة مرسلة واحدة' in pg.inner_text('#test-status'), 'single-attempt message')
    # 24
    go(pg, '24'); pg.wait_for_timeout(300)
    opts = pg.locator('#s24-concept option').count()
    check(opts == 5, f'concepts from 4 wrong items ({opts - 1})')
    pg.select_option('#s24-concept', index=1); fill(pg, '#s24-conclusion', 'أراجع الربط بين الدليل والهدف'); fill(pg, '#s24-step', 'أعدل المحك في مشروعي')
    complete(pg, 't17'); check('t17' in done(pg), 't17 complete after report')
    check(st(pg)['test']['attempts'][0]['total'] == 60 and len(st(pg)['test']['attempts']) == 1, 'reflection gives no new score')
    # 28 return cycle
    go(pg, '28'); pg.wait_for_timeout(150)
    check('خطتك جاهزة للعودة' in pg.inner_text('#s28-ready'), 'ready-to-return message without fabricated results')
    pg.locator('input[data-field="s28.type"][value="sim"]').check()
    for k, v in [('evidence', 'احتجت تفسير كلمة «معيار»'), ('observation', 'التعليمات غامضة في الخطوة الثانية'), ('alt', 'قد أكون متعبًا'), ('decision', 'أضيف مثالًا للمعيار')]: fill(pg, f'#s28-{k}', v)
    pg.click('#trial-form button[type=submit]'); pg.wait_for_timeout(200)
    s = st(pg); check(len(s['trials']) == 1 and s['trials'][0]['type'] == 'sim' and len(s['project']['versions']) == 2, 'trial logged as simulation with new version')
    check('محاكاة' in pg.inner_text('#trial-list'), 'simulation label on the record')
    pg.click('[data-action="compare-versions"]'); pg.wait_for_timeout(100)
    check(pg.locator('#version-compare .compare-col').count() == 2 and pg.locator('#version-compare dd.is-changed').count() >= 1, 'version comparison marks changes')
    # final pass status
    pg.goto(SITE + '#dashboard'); pg.wait_for_timeout(200)
    check('استوفيت شروط اجتياز الدورة' in pg.inner_text('#dash-summary'), 'dashboard: passed with 20 elements and 60')
    dash = pg.inner_text('#dash-project')
    check('محاكاة' in dash and 'النسخة 2' in dash, 'dashboard shows project version and simulation status separately')
    # continue alias
    go(pg, '26'); pg.goto(SITE.replace('trainee.html', 'trainee.html#continue')); pg.wait_for_timeout(300)
    check(pg.is_visible('#screen-26'), '#continue returns to last position')
    check(errors == [], f'no console errors: {errors[:3]}')
    b.close()
print('\nFAILED:', len(fails)); [print(' -', f) for f in fails]
raise SystemExit(1 if fails else 0)
