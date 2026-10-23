"""Unsaved-exit dialog, export/import, legacy panels, keyboard-only check.

Optional browser checks (not part of the site). Requirements: Python 3 and
`pip install playwright` then `python -m playwright install chromium`.
Run from the repository root: python tests/e2e/extra.py
"""
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
import json
from playwright.sync_api import sync_playwright
SITE = (ROOT / 'trainee.html').as_uri()
fails = []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
with sync_playwright() as p:
    b = p.chromium.launch()
    # 1 unsaved exit dialog
    c = b.new_context(); pg = c.new_page(); pg.goto(SITE + '#screen-09'); pg.wait_for_timeout(300)
    pg.evaluate("() => { window.__o = Storage.prototype.setItem; Storage.prototype.setItem = function(){ throw new Error('x'); }; }")
    pg.fill('#s09-performance', 'نص لم يُحفظ'); pg.wait_for_timeout(900)
    pg.click('.drawer-portal'); pg.wait_for_timeout(200)
    check(pg.evaluate("document.getElementById('unsaved-dialog').open") and pg.url.endswith('#screen-09'), 'leaving with unsaved text opens the dialog and stays')
    pg.click('[data-unsaved="save"]'); pg.wait_for_timeout(100)
    check('ما زال الحفظ متعذرًا' in pg.inner_text('#unsaved-msg'), 'save in dialog reports continued failure honestly')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    check(not pg.evaluate("document.getElementById('unsaved-dialog').open"), 'Escape closes the dialog')
    pg.click('.drawer-portal'); pg.wait_for_timeout(100); pg.click('[data-unsaved="stay"]'); pg.wait_for_timeout(100)
    check(pg.input_value('#s09-performance') == 'نص لم يُحفظ', 'return to editing keeps the text')
    pg.evaluate("() => { Storage.prototype.setItem = window.__o; }")
    pg.click('.drawer-portal'); pg.wait_for_timeout(500)
    check(pg.url.endswith('index.html'), 'leaves normally once saving works')
    check('الشاشة 09' in pg.inner_text('#portal-resume'), 'portal reports saved position honestly')
    # 2 export / import
    pg.goto(SITE + '#dashboard'); pg.wait_for_timeout(300)
    with pg.expect_download() as dl: pg.click('[data-action="export"]')
    path = dl.value.path(); data = json.load(open(path))
    check(data['app'] == 'bloom-digital-learning' and data['data']['drafts']['s09']['performance'] == 'نص لم يُحفظ', 'export contains the saved work')
    c2 = b.new_context(); q = c2.new_page(); q.on('dialog', lambda d: d.accept())
    q.goto(SITE + '#dashboard'); q.wait_for_timeout(300)
    q.set_input_files('#import-file', path); q.wait_for_timeout(1500)
    q.goto(SITE + '#screen-09'); q.wait_for_timeout(300)
    check(q.input_value('#s09-performance') == 'نص لم يُحفظ', 'import restores work in another browser profile')
    bad = str(pathlib.Path(__import__('tempfile').gettempdir()) / 'bloom-bad.json'); open(bad, 'w').write('{"x":1}')
    q.goto(SITE + '#dashboard'); q.wait_for_timeout(200); q.set_input_files('#import-file', bad); q.wait_for_timeout(500)
    check('ليس نسخة احتياطية من هذا الموقع' in q.inner_text('#backup-status'), 'foreign file rejected without changes')
    # 3 legacy panel
    c3 = b.new_context(); r = c3.new_page(); r.goto(SITE); r.evaluate("""() => { localStorage.clear();
      localStorage.setItem('lessonTemplateDraft', JSON.stringify({'lt-lesson-title':'الدورة المائية','lt-original-goal':'أن يفهم الطالب الدورة','lt-task3':'تصميم ملصق'}));
      localStorage.setItem('reflectionsDraft', JSON.stringify({'reflection-ws2':'تعلمت الفرق بين المستويات'})); }""")
    r.reload(); r.goto(SITE + '#screen-17'); r.wait_for_timeout(300)
    txt = r.inner_text('#screen-17 [data-legacy-panel]')
    check('أن يفهم الطالب الدورة' in txt and 'تعلمت الفرق' in txt, 'old template and reflections shown read-only on screen 17')
    r.goto(SITE + '#screen-03'); r.wait_for_timeout(200)
    check(r.input_value('#s03-title') == 'الدورة المائية', 'old lesson title pre-filled on need card')
    # 4 keyboard-only check
    k = b.new_context(); kp = k.new_page(); kp.goto(SITE + '#screen-05'); kp.wait_for_timeout(300)
    kp.focus('[data-check-form="s05"] input[value="yes"]'); kp.keyboard.press('ArrowDown'); kp.wait_for_timeout(50)
    check(kp.evaluate("document.querySelector('[data-check-form=\"s05\"] input[value=\"no\"]').checked"), 'arrow keys move within a choice group')
    kp.keyboard.press('Tab'); kp.keyboard.press('ArrowDown'); kp.keyboard.press('Tab'); kp.keyboard.press('Enter'); kp.wait_for_timeout(200)
    st = kp.evaluate("JSON.parse(localStorage.getItem('bloomLearning.v1'))")
    check(st['elements'].get('t03'), 'check answered and submitted with keyboard only')
    b.close()
print('\nFAILED:', len(fails)); [print(' -', f) for f in fails]
raise SystemExit(1 if fails else 0)
