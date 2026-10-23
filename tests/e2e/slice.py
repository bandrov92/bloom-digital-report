"""Unit 2 slice: checks, open responses, save failure, deep links, 375px, legacy migration.

Optional browser checks (not part of the site). Requirements: Python 3 and
`pip install playwright` then `python -m playwright install chromium`.
Run from the repository root: python tests/e2e/slice.py
"""
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
import json, sys
from playwright.sync_api import sync_playwright, expect

SITE = (ROOT / 'trainee.html').as_uri()
fails = []
def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

def state(pg):
    return pg.evaluate("JSON.parse(localStorage.getItem('bloomLearning.v1') || 'null')")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 900})
    pg = ctx.new_page()
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'font' not in m.text and 'ERR_FAILED' not in m.text else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(SITE + '#screen-05'); pg.wait_for_timeout(300)
    check(pg.is_visible('#screen-05') and not pg.is_visible('#screen-06'), 'only screen 05 visible')
    check(pg.locator('#map [data-step-link]').count() == 4, 'stepper has 4 screens')
    # visiting all screens completes nothing
    for n in ['06', '07', '08', '05']:
        pg.goto(SITE + f'#screen-{n}'); pg.wait_for_timeout(100)
        pg.mouse.wheel(0, 5000); pg.wait_for_timeout(100)
    st = state(pg)
    check(st and st['elements'] == {}, 'visiting/scrolling completes no element')
    check(st['position']['screen'] == '05', 'position saved on screen change')
    # s05 wrong then right
    f = pg.locator('[data-check-form="s05"]')
    f.locator('input[value="yes"]').check(); f.locator('input[value="file"]').check()
    f.locator('button[type=submit]').click(); pg.wait_for_timeout(100)
    st = state(pg)
    check(len(st['checks']['s05']['attempts']) == 1 and not st['checks']['s05']['solvedAt'], 'wrong attempt stored, not solved')
    check('t03' not in st['elements'], 'wrong answer does not complete t03')
    check(pg.locator('[data-check-feedback="s05"] mark').count() >= 2, 'wrong feedback highlights verbs')
    f.locator('input[value="no"]').check(); f.locator('input[value="act"]').check()
    f.locator('button[type=submit]').click(); pg.wait_for_timeout(100)
    st = state(pg)
    check(st['elements'].get('t03', {}).get('at'), 't03 completed by correct check')
    check(st['checks']['s05']['attempts'][0]['allCorrect'] is False, 'first attempt preserved as wrong')
    # s06 partial wrong
    pg.goto(SITE + '#screen-06'); pg.wait_for_timeout(100)
    f6 = pg.locator('[data-check-form="s06"]')
    f6.locator('select').nth(0).select_option('remember'); f6.locator('select').nth(1).select_option('apply'); f6.locator('select').nth(2).select_option('apply')
    f6.locator('button[type=submit]').click(); pg.wait_for_timeout(100)
    check(f6.locator('select').nth(0).is_disabled() and not f6.locator('select').nth(1).is_disabled(), 'only the wrong item reopens')
    check(f6.locator('[data-part="m2"] .part-hint').is_visible(), 'hint shown under wrong item')
    f6.locator('select').nth(1).select_option('understand'); f6.locator('button[type=submit]').click(); pg.wait_for_timeout(100)
    check(state(pg)['elements'].get('t04'), 't04 completed after correction')
    # s07: check + open response
    pg.goto(SITE + '#screen-07'); pg.wait_for_timeout(100)
    f7 = pg.locator('[data-check-form="s07"]')
    f7.locator('select').nth(0).select_option('evaluate'); f7.locator('select').nth(1).select_option('analyze'); f7.locator('select').nth(2).select_option('create')
    f7.locator('button[type=submit]').click(); pg.wait_for_timeout(100)
    check('تفسير العلاقات يختلف' in pg.inner_text('[data-check-feedback="s07"]'), 'analysis/evaluation confusion message')
    f7.locator('select').nth(0).select_option('analyze'); f7.locator('select').nth(1).select_option('evaluate'); f7.locator('button[type=submit]').click(); pg.wait_for_timeout(100)
    check(not state(pg)['elements'].get('t05'), 't05 not complete with check only')
    go_part = pg.goto(SITE + '#screen-07-4'); pg.wait_for_timeout(100)
    pg.click('[data-action="complete"][data-element="t05"]'); pg.wait_for_timeout(100)
    check(pg.evaluate("document.activeElement.id") == 's07-paraphrase', 'focus moves to first missing field')
    check(pg.get_attribute('#s07-paraphrase', 'aria-invalid') == 'true', 'missing field marked aria-invalid')
    check(pg.locator('#err-s07-paraphrase').is_visible(), 'inline error shown')
    pg.fill('#s07-paraphrase', 'في مهمة التقييم يحكم المتعلم على خطتين وفق معيارين ويستشهد بالنص.')
    for i in (1, 2, 3):
        pg.locator(f'input[data-field="s07.rv{i}"][value="partly"]').check()
    pg.click('[data-action="complete"][data-element="t05"]'); pg.wait_for_timeout(100)
    check(state(pg)['elements'].get('t05'), 't05 completed after field + review')
    check('لا حكمًا على جودة عملك' in pg.inner_text('[data-result="t05"]'), 'completion message avoids mastery claim')
    # reload restores
    pg.reload(); pg.wait_for_timeout(300)
    pg.goto(SITE + '#screen-07-4'); pg.wait_for_timeout(100)
    check(pg.input_value('#s07-paraphrase').startswith('في مهمة'), 'draft restored after reload')
    pg.goto(SITE + '#screen-07'); pg.wait_for_timeout(100)
    check(pg.locator('[data-check-form="s07"] .feedback.is-correct').is_visible(), 'solved check restored after reload')
    # editing after completion does not remove completion
    pg.goto(SITE + '#screen-07-4'); pg.wait_for_timeout(100); pg.fill('#s07-paraphrase', ''); pg.wait_for_timeout(900)
    check(state(pg)['elements'].get('t05'), 'clearing a field later keeps the recorded element')
    pg.fill('#s07-paraphrase', 'نص جديد'); pg.wait_for_timeout(900)
    # save failure
    pg.goto(SITE + '#screen-08-2'); pg.wait_for_timeout(100)
    pg.evaluate("() => { window.__orig = Storage.prototype.setItem; Storage.prototype.setItem = function(){ const e = new Error('full'); e.name='QuotaExceededError'; throw e; }; }")
    pg.fill('#s08-means', 'جدول في مستند'); pg.wait_for_timeout(1000)
    check(pg.is_visible('#save-alert'), 'failure banner shown')
    check('لم يُحفظ' in pg.inner_text('#save-indicator'), 'indicator shows failure, not success')
    check(pg.input_value('#s08-means') == 'جدول في مستند', 'text stays visible after failed save')
    pg.goto(SITE + '#screen-07'); pg.wait_for_timeout(100)
    check(pg.input_value('#s08-means') == 'جدول في مستند', 'response kept when navigating after failure')
    pg.evaluate("() => { Storage.prototype.setItem = window.__orig; }")
    pg.click('[data-action="retry-save"]'); pg.wait_for_timeout(100)
    check(not pg.is_visible('#save-alert'), 'banner hidden after successful retry')
    check(state(pg)['drafts']['s08']['means'] == 'جدول في مستند', 'retried save persisted')
    # deep link into reference
    pg.goto(SITE + '#level-apply'); pg.wait_for_timeout(300)
    check(pg.is_visible('#screen-08-3') and pg.evaluate("document.getElementById('level-apply').open"), 'deep link #level-apply opens screen 08 ج and the level')
    # keyboard: focus stepper link and Enter
    pg.goto(SITE + '#screen-05'); pg.wait_for_timeout(100)
    pg.focus('#map [data-step-link="06"]'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
    check(pg.is_visible('#screen-06') and pg.evaluate("document.activeElement.id") == 'screen-06-title', 'keyboard step link moves focus to screen title')
    # dashboard
    pg.goto(SITE + '#dashboard'); pg.wait_for_timeout(200)
    txt = pg.inner_text('#dash-conditions')
    check('15%' in txt, f'dashboard shows 15% (3 of 20): {txt[:60]!r}')
    check('لم تُرسل محاولة' in txt, 'dashboard shows no test attempt')
    check(errors == [], f'no console errors: {errors}')
    # mobile
    m = b.new_context(viewport={'width': 375, 'height': 800}); mp = m.new_page()
    for h in ['#screen-05', '#screen-06', '#screen-07', '#screen-07-2', '#screen-07-3', '#screen-07-4', '#screen-08', '#screen-08-2', '#screen-08-3', '#dashboard', '#intro']:
        mp.goto(SITE + h); mp.wait_for_timeout(150)
        ov = mp.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        check(ov <= 0, f'375px no horizontal scroll at {h} ({ov})')
    m.close()
    # legacy migration in a fresh context
    lg = b.new_context(); lp = lg.new_page()
    lp.goto(SITE); lp.evaluate("""localStorage.clear(); localStorage.setItem('lessonTemplateDraft', JSON.stringify({'lt-lesson-title':'الدورة المائية','lt-subject':'العلوم'})); localStorage.setItem('lessonProgress', JSON.stringify(['intro','map','plan']));""")
    lp.reload(); lp.wait_for_timeout(300)
    s = state(lp)
    check(s['legacy'] and s['legacy']['progress'] == ['intro','map','plan'] and s['elements'] == {}, 'legacy migrated, old marks not counted')
    check(lp.evaluate("localStorage.getItem('lessonProgress')") == '["intro","map","plan"]', 'legacy key untouched')
    lp.goto(SITE + '#dashboard'); lp.wait_for_timeout(200)
    check(lp.is_visible('#legacy-note'), 'legacy note visible on dashboard')
    b.close()
print('\nFAILED:', len(fails)); [print(' -', f) for f in fails]
raise SystemExit(1 if fails else 0)
