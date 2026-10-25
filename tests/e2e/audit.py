"""Console, external requests, ids, links, accessible names, 375/1280 overflow, print.

Optional browser checks (not part of the site). Requirements: Python 3 and
`pip install playwright` then `python -m playwright install chromium`.
Run from the repository root: python tests/e2e/audit.py
"""
import pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
import subprocess, sys, time
from playwright.sync_api import sync_playwright
ROOT = str(ROOT)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8722', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
B = 'http://localhost:8722/'
SCREENS = 65  # screen sections and parts in learn/index.html (28 design-document screens)
fails = []
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b = p.chromium.launch()
    for page in ['index.html', 'learn/', 'trainer.html']:
        pg = b.new_page(); errs = []; ext = []
        pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('request', lambda r: ext.append(r.url) if not r.url.startswith(B) and not r.url.startswith('data:') else None)
        pg.goto(B + page); pg.wait_for_timeout(500)
        check(errs == [], f'{page}: no console errors/warnings {errs[:2]}')
        check(ext == [], f'{page}: no external requests {ext[:2]}')
        dup = pg.evaluate("(() => { const ids=[...document.querySelectorAll('[id]')].map(e=>e.id); return ids.filter((x,i)=>ids.indexOf(x)!==i); })()")
        check(dup == [], f'{page}: no duplicate ids {dup}')
        broken = pg.evaluate("[...document.querySelectorAll('a[href^=\"#\"]')].map(a=>a.getAttribute('href').slice(1)).filter(h=>h && !['continue','next','start'].includes(h) && !document.getElementById(h))")
        check(broken == [], f'{page}: in-page links resolve {sorted(set(broken))[:5]}')
        unnamed = pg.evaluate("""[...document.querySelectorAll('input:not([type=hidden]), select, textarea, button')].filter(el => {
            if (el.closest('[hidden]') && false) return false;
            const lab = el.labels && el.labels.length; const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
            const txt = el.tagName==='BUTTON' && el.textContent.trim();
            return !(lab || aria || txt);
          }).map(el => el.outerHTML.slice(0,90))""")
        check(unnamed == [], f'{page}: every control has an accessible name {unnamed[:3]}')
        pg.close()
    # cross-page links from trainer/index into trainee
    pg = b.new_page(); pg.goto(B + 'trainer.html')
    links = pg.evaluate("[...document.querySelectorAll('a[href^=\"learn/#\"]')].map(a=>a.getAttribute('href').split('#')[1])")
    check(len(links) > 0, f'trainer page links into the trainee path ({len(links)})')
    pg.goto(B + 'learn/'); pg.wait_for_timeout(300)
    missing = [l for l in links if not pg.evaluate(f"!!document.getElementById('{l}')")]
    check(missing == [], f'trainer -> trainee deep links exist {missing}')
    for l in links:
        pg.goto(B + 'learn/#' + l); pg.wait_for_timeout(200)
        vis = pg.evaluate(f"(() => {{ const e=document.getElementById('{l}'); return !!e && e.getClientRects().length>0; }})()")
        check(vis, f'deep link #{l} visible after navigation')
    for moved in ['content-res-tools', 'content-foundation', 'library']:
        for start in ('learn/#', 'trainee.html#'):
            pg.goto(B + start + moved); pg.wait_for_timeout(500)
            check(pg.url.endswith('trainer.html#' + moved) and pg.locator('#' + moved).count() == 1, f'{start}{moved} forwards to the trainer library')
    pg.goto(B + 'index.html#map'); pg.wait_for_timeout(400)
    check(pg.url.endswith('learn/#map') and pg.is_visible('#map'), 'legacy index.html#map forwards to the unit')
    pg.goto(B + 'trainee.html#screen-09'); pg.wait_for_timeout(400)
    check(pg.url.endswith('learn/#screen-09') and pg.is_visible('#screen-09'), 'old trainee.html links forward to learn/ with their hash')
    pg.goto(B + 'learn/'); pg.wait_for_timeout(300)
    check(pg.locator('a[href$="index.html"], a[href="../"], a[href="../index.html"]').count() == 0, 'trainee path has no link back to the portal')
    check(pg.locator('a[href^="../trainer.html"]').count() == 1, 'trainee path keeps one link, to the library')
    # 375 and 1280 overflow for every view/screen
    for w in (375, 1280):
        c = b.new_context(viewport={'width': w, 'height': 800}); q = c.new_page()
        bad = []
        q.goto(f'{B}learn/'); q.wait_for_timeout(200)
        targets = q.evaluate("[...document.querySelectorAll('[data-screen]')].map(s => s.id)") + ['dashboard']
        check(len(targets) == SCREENS + 1, f'all {len(targets) - 1} screens and parts measured')
        for t in targets:
            q.goto(f'{B}learn/#{t}'); q.wait_for_timeout(120)
            # Open every collapsible so hidden long content is measured too.
            q.evaluate("document.querySelectorAll('details').forEach(d => { d.open = true; }); document.querySelectorAll('.acc-panel').forEach(a => a.classList.remove('hidden'))")
            ov = q.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
            if ov > 0: bad.append((t, ov))
        for pgname in ['index.html', 'trainer.html']:
            q.goto(B + pgname); q.wait_for_timeout(150)
            ov = q.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
            if ov > 0: bad.append((pgname, ov))
        check(bad == [], f'{w}px: no horizontal page scroll {bad}')
        c.close()
    # print media shows all screens
    q = b.new_page(); q.goto(B + 'learn/'); q.emulate_media(media='print'); q.wait_for_timeout(200)
    shown = q.evaluate("[...document.querySelectorAll('[data-screen]')].filter(s=>getComputedStyle(s).display!=='none').length")
    check(shown == SCREENS, f'print shows all {SCREENS} screens and parts ({shown})')
    b.close()
finally:
    srv.terminate()
print('\nFAILED:', len(fails)); [print(' -', f) for f in fails]
raise SystemExit(1 if fails else 0)
