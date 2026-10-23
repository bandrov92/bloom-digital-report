"""Screen length balance: every screen, part and page within 25% of the mean.

Measures the height of each learner view in trainee.html from the top of the
screen to its footer (collapsibles closed), at 375px and 1280px, and compares
it with the mean of all views at that width. Fails when a view differs from the
mean by more than MAX_DEVIATION; lists views beyond TARGET_DEVIATION as notes.

Which state is measured (docs/alignment-matrix.md, "طول الشاشات"):
  - Arrival state (empty storage) for screens whose content is written in the page.
  - The learner states in tests/e2e/fixtures/ for screens whose content is
    generated from earlier work (diagnostic report, path, plan, workshop example,
    student preview, rubric excerpts, test player, result, explanations, version
    comparison). Fixtures are produced by the full path (tests/e2e/fullpath.py flow).
  - Each page of a paged list (diagnostic, test, explanations) counts as one view.
  - Empty states are not measured: the test player before the test starts.

Optional browser checks (not part of the site). Requirements: Python 3 and
`pip install playwright` then `python -m playwright install chromium`.
Run from the repository root: python tests/e2e/lengths.py
"""
import json
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
SITE = (ROOT / 'trainee.html').as_uri()
FIXTURES = pathlib.Path(__file__).resolve().parent / 'fixtures'
WIDTHS = (375, 1280)
MAX_DEVIATION = 25   # percent; the approved ceiling
TARGET_DEVIATION = 15  # percent; the design target

# Screens measured with prior work (state-complete.json); the test player uses state-test-active.json.
WITH_WORK = {'02', '04', '12', '14-2', '18-2', '23', '23-2', '28-3'}
WITH_WORK_PREFIX = ('20',)
EMPTY_STATES = {'22'}
# Arrival state of a part measured with prior work: its own answers are removed
# first (the workshop 2 comparison opens before the learner judges the criteria).
ARRIVAL_STRIP = {'14-2': ['c1', 'c2', 'c3', 'v2', 'keepReason']}

HEIGHT = """(k) => {
  const s = document.getElementById(k);
  const foot = s.querySelector(':scope > .screen-foot');
  return Math.round((foot ? foot.getBoundingClientRect().top : s.getBoundingClientRect().bottom) - s.getBoundingClientRect().top);
}"""
PAGES = """(k) => [...document.getElementById(k).querySelectorAll('[data-pager-page]')].map((p) => p.parentElement.id + ':' + p.dataset.pagerPage)"""
REVEAL = """(ref) => { const [list, n] = ref.split(':');
  document.querySelector(`#${list} > [data-pager-page="${n}"] > *`).dispatchEvent(new CustomEvent('bloom:reveal', { bubbles: true })); }"""


def views_in(pg, key):
    """Height of a screen, or of each page when it holds a paged list."""
    pg.goto(f'{SITE}#screen-{key}'); pg.wait_for_timeout(250)
    if key == '28-3':
        pg.click('[data-action="compare-versions"]'); pg.wait_for_timeout(100)
    pages = pg.evaluate(PAGES, f'screen-{key}')
    if not pages:
        return [(key, pg.evaluate(HEIGHT, f'screen-{key}'))]
    out = []
    for ref in pages:
        pg.evaluate(REVEAL, ref); pg.wait_for_timeout(60)
        out.append((f"{key} p{int(ref.split(':')[1]) + 1}", pg.evaluate(HEIGHT, f'screen-{key}')))
    return out


def arrival(state_file, key):
    """The fixture without the part's own answers (ARRIVAL_STRIP)."""
    data = json.loads((FIXTURES / state_file).read_text(encoding='utf-8'))
    drafts = data.get('drafts', {}).get(f"s{key.split('-')[0]}", {})
    for field in ARRIVAL_STRIP.get(key, []):
        drafts.pop(field, None)
    return json.dumps(data, ensure_ascii=False)


def measure(browser, width, state_file=None, keys=None, strip_for=None):
    ctx = browser.new_context(viewport={'width': width, 'height': 900})
    if state_file:
        data = arrival(state_file, strip_for) if strip_for else (FIXTURES / state_file).read_text(encoding='utf-8')
        # Seed once per tab (sessionStorage flag), so a later edit of the state survives a reload.
        ctx.add_init_script(f"try {{ if (!sessionStorage.getItem('fixture')) {{ localStorage.setItem('bloomLearning.v1', {json.dumps(data)}); sessionStorage.setItem('fixture', '1'); }} }} catch (e) {{}}")
    pg = ctx.new_page()
    pg.on('dialog', lambda d: d.accept())
    pg.goto(SITE); pg.wait_for_timeout(500)
    all_keys = pg.evaluate("[...document.querySelectorAll('[data-screen]')].map((s) => s.dataset.screen)")
    out = []
    for key in (keys(all_keys) if keys else all_keys):
        out += views_in(pg, key)
    ctx.close()
    return out


def with_work(key):
    return key in WITH_WORK or key.split('-')[0] in WITH_WORK_PREFIX


with sync_playwright() as p:
    browser = p.chromium.launch()
    table = {}
    for w in WIDTHS:
        rows = measure(browser, w, keys=lambda ks: [k for k in ks if not with_work(k) and k not in EMPTY_STATES])
        rows += measure(browser, w, 'state-complete.json', keys=lambda ks: [k for k in ks if with_work(k) and k not in ARRIVAL_STRIP])
        for key in ARRIVAL_STRIP:
            rows += measure(browser, w, 'state-complete.json', keys=lambda ks, key=key: [key], strip_for=key)
        rows += measure(browser, w, 'state-test-active.json', keys=lambda ks: ['22'])
        for name, height in rows:
            table.setdefault(name, {})[w] = height
    browser.close()

order = list(table)
means = {w: sum(table[n][w] for n in order) / len(order) for w in WIDTHS}
fails, notes = [], []
print(f"views: {len(order)} | mean 375px: {means[375]:.0f} | mean 1280px: {means[1280]:.0f}")
print(f"{'view':10s} {'375px':>7s} {'dev':>6s} {'1280px':>7s} {'dev':>6s}")
for n in order:
    devs = {w: (table[n][w] - means[w]) / means[w] * 100 for w in WIDTHS}
    flag = ''
    if any(abs(d) > MAX_DEVIATION for d in devs.values()):
        flag = 'FAIL'; fails.append(n)
    elif any(abs(d) > TARGET_DEVIATION for d in devs.values()):
        flag = 'note'; notes.append(n)
    print(f"{n:10s} {table[n][375]:7d} {devs[375]:+5.0f}% {table[n][1280]:7d} {devs[1280]:+5.0f}%  {flag}")
for w in WIDTHS:
    worst = max(abs(table[n][w] - means[w]) / means[w] * 100 for n in order)
    print(f"{w}px: largest deviation {worst:.0f}%")
print(f"\nbeyond {TARGET_DEVIATION}% (notes): {len(notes)} {notes}")
print(f"FAILED (beyond {MAX_DEVIATION}%):", len(fails), fails)
raise SystemExit(1 if fails else 0)
