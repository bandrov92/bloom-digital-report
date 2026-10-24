"""Chunked screens: one small block at a time, each fitting the visible area.

Owner decision (2026-10-25): every knowledge chunk of a screen fits the screen
the trainee sees, with "متابعة" between chunks. For each screen of the units
that are written in chunks ([data-chunk]), this check opens every chunk with the
footer button and verifies, at a phone and a desktop viewport, that:
  - only one chunk is visible at a time;
  - the chunk ends above the footer (nothing hidden behind the sticky nav);
  - "متابعة" moves forward and the in-screen "السابق" moves back;
  - moving between chunks completes no element (no completion by visiting);
  - a deep link into a later chunk (#level-apply) opens that chunk;
  - print shows every chunk.
Unchunked screens of the same units are measured as one view.

Optional browser checks (not part of the site). Requirements: Python 3 and
`pip install playwright` then `python -m playwright install chromium`.
Run from the repository root: python tests/e2e/chunks.py
"""
import pathlib
import sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
SITE = (ROOT / 'learn' / 'index.html').as_uri()
VIEWPORTS = ((375, 720), (1280, 800))
UNITS = ('intro', 'map')  # units written in chunks so far
TOLERANCE = 4  # px
FAILED = []


def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond:
        FAILED.append(msg)


FIT = """(id) => {
  const s = document.getElementById(id);
  const chunks = [...s.querySelectorAll(':scope > [data-chunk]')];
  const visible = chunks.filter((c) => !c.hidden);
  const shown = visible[0] || s;
  const foot = s.querySelector(':scope > .screen-foot');
  const kids = [...shown.children].filter((n) => n.offsetParent && !n.matches('.screen-foot, .screen-nav-save'));
  const bottom = Math.max(...kids.map((n) => n.getBoundingClientRect().bottom), shown.getBoundingClientRect().top);
  // Unchunked screens: the footer is not sticky, so the limit is the viewport minus its height.
  const limit = chunks.length ? foot.getBoundingClientRect().top : innerHeight - (foot ? foot.offsetHeight : 0);
  return { count: chunks.length, visible: visible.length, bottom: Math.round(bottom), limit: Math.round(limit), index: Number(s.dataset.chunkIndex || 0) };
}"""

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, hgt in VIEWPORTS:
        ctx = b.new_context(viewport={'width': w, 'height': hgt})
        pg = ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(SITE); pg.wait_for_timeout(300)
        ids = pg.evaluate("(units) => units.flatMap((u) => [...document.querySelectorAll(`#${u} [data-screen]`)].map((s) => s.id))", list(UNITS))
        over = []
        for sid in ids:
            pg.goto(f'{SITE}#{sid}'); pg.wait_for_timeout(250)
            pg.evaluate('window.scrollTo(0, 0)'); pg.wait_for_timeout(50)
            r = pg.evaluate(FIT, sid)
            n = max(r['count'], 1)
            for k in range(n):
                if k:
                    pg.click(f'#{sid} [data-chunk-next]'); pg.wait_for_timeout(380)
                    pg.evaluate('window.scrollTo(0, 0)'); pg.wait_for_timeout(50)
                    r = pg.evaluate(FIT, sid)
                if r['count'] and r['visible'] != 1:
                    over.append(f'{sid}#{k + 1}: {r["visible"]} chunks visible')
                if r['bottom'] > r['limit'] + TOLERANCE:
                    over.append(f'{sid}#{k + 1}: +{r["bottom"] - r["limit"]}px')
            if r['count'] > 1:
                check(r['index'] == r['count'] - 1, f'{w}px {sid}: "متابعة" reaches the last of {r["count"]} chunks')
                pg.click(f'#{sid} [data-chunk-prev]'); pg.wait_for_timeout(380)
                check(pg.evaluate(FIT, sid)['index'] == r['count'] - 2, f'{w}px {sid}: in-screen "السابق" goes back one chunk')
        check(not over, f'{w}px: every chunk fits above the footer {over}')
        state = pg.evaluate("JSON.parse(localStorage.getItem('bloomLearning.v1') || '{}')")
        check(not state.get('elements'), f'{w}px: moving between chunks completed no element')
        pg.goto(f'{SITE}#screen-07-2'); pg.wait_for_timeout(200)
        pg.click('#screen-07-2 a[rel="prev"]'); pg.wait_for_timeout(300)
        r = pg.evaluate(FIT, 'screen-07')
        check(r['index'] == r['count'] - 1, f'{w}px: the previous-screen link opens that screen on its last chunk')
        pg.goto(f'{SITE}#level-apply'); pg.wait_for_timeout(300)
        check(pg.is_visible('#level-apply') and pg.evaluate("document.getElementById('level-apply').open"), f'{w}px: deep link #level-apply opens its chunk and the level')
        check(errors == [], f'{w}px: no page errors {errors}')
        ctx.close()
    q = b.new_page(); q.goto(SITE + '#screen-01'); q.emulate_media(media='print'); q.wait_for_timeout(200)
    hidden = q.evaluate("[...document.querySelectorAll('[data-chunk]')].filter((c) => getComputedStyle(c).display === 'none').length")
    check(hidden == 0, f'print shows every chunk ({hidden} hidden)')
    b.close()

print(f'\nFAILED: {len(FAILED)}')
sys.exit(1 if FAILED else 0)
