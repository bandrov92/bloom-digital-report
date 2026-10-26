"""Centered layout, drawer keyboard behavior, precise resume and portal states.

Run with Python Playwright and its Chromium browser installed:
    python tests/e2e/interface.py
Uses a temporary localhost server/profile; never touches a real learner record.
Set BLOOM_REVIEW_OUTPUT to save screenshots for visual review.
"""
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = os.environ.get('BLOOM_REVIEW_OUTPUT')


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


@contextmanager
def site():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    worker = Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}/'
    finally:
        server.shutdown()
        server.server_close()
        worker.join()


def shot(page, name):
    if OUTPUT:
        folder = Path(OUTPUT)
        folder.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(folder / f'{name}.png'), full_page=True, animations='disabled')


def center(page, selector):
    return page.locator(selector).evaluate('(el) => { const r = el.getBoundingClientRect(); return r.x + r.width / 2; }')


def fit(page):
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'horizontal overflow'


with site() as base, sync_playwright() as pw:
    browser = pw.chromium.launch()
    for width in (320, 375, 768, 1280, 1920):
        context = browser.new_context(viewport={'width': width, 'height': 800})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base)
        page.evaluate('document.fonts.ready')
        expect(page.locator('[data-portal-start]')).to_have_class('portal-btn portal-btn--primary')
        assert abs(center(page, '.portal-wrap') - width / 2) <= 2
        fit(page)
        if width in (375, 1280):
            shot(page, f'portal-{width}')

        page.goto(base + 'learn/#start')
        page.evaluate('document.fonts.ready')
        before = center(page, '#intro .lesson-body')
        assert abs(before - width / 2) <= 2
        if page.locator('#drawer-toggle').get_attribute('aria-expanded') == 'true':
            page.click('#drawer-toggle')
        page.click('#drawer-toggle')
        expect(page.locator('#drawer-toggle')).to_have_attribute('aria-expanded', 'true')
        assert abs(center(page, '#intro .lesson-body') - before) <= 1
        if width < 1440:
            expect(page.locator('#course-drawer')).to_have_attribute('aria-modal', 'true')
            assert page.locator('.player-main').evaluate('(el) => el.inert')
            page.locator('#drawer-close').focus()
            page.keyboard.press('Shift+Tab')
            assert page.evaluate('document.getElementById("course-drawer").contains(document.activeElement)')
        page.keyboard.press('Escape')
        expect(page.locator('#drawer-toggle')).to_be_focused()
        assert not page.locator('.player-main').evaluate('(el) => el.inert')
        assert abs(center(page, '#intro .lesson-body') - before) <= 1
        page.click('#drawer-toggle')
        page.click('[data-lesson-link][href="#map"]')
        expect(page.locator('#screen-05-title')).to_be_focused()
        if width < 1440:
            expect(page.locator('#drawer-toggle')).to_have_attribute('aria-expanded', 'false')
        fit(page)
        page.goto(base + 'learn/#screen-01')
        expect(page.locator('#screen-01 .chunk-label')).to_contain_text('1 من')
        page.click('#screen-01 [data-chunk-next]')
        expect(page.locator('#screen-01 .chunk-label')).to_contain_text('2 من')
        assert page.evaluate('Object.keys(BloomLearning.store.state.elements).length') == 0
        if width in (375, 1280):
            shot(page, f'learn-{width}')
        assert not errors, errors
        print(f'PASS {width}px: centered portal/lesson, stable drawer, keyboard, chunk position, no overflow/errors', flush=True)
        context.close()

    # Verify real web fonts over HTTP, including every chunk in the two pilot units.
    for width, height in ((375, 720), (1280, 800)):
        context = browser.new_context(viewport={'width': width, 'height': height})
        page = context.new_page()
        page.goto(base + 'learn/#start')
        page.evaluate('document.fonts.ready')
        screens = page.locator('#intro [data-screen], #map [data-screen]').evaluate_all('(els) => els.map(el => el.id)')
        overflow = []
        for screen in screens:
            page.goto(base + 'learn/#' + screen)
            expect(page.locator('#' + screen)).to_be_visible()
            count = page.locator(f'#{screen} > [data-chunk]').count()
            for index in range(count):
                if index:
                    page.click(f'#{screen} [data-chunk-next]')
                page.evaluate('scrollTo(0, 0)')
                foot = page.locator(f'#{screen} > .screen-foot').bounding_box()
                if foot['y'] + foot['height'] > height + 4:
                    overflow.append(f'{screen} chunk {index + 1}: {round(foot["y"] + foot["height"] - height)}px')
        assert not overflow, f'{width}px font-loaded chunks exceed viewport: {overflow}'
        context.close()
        print(f'PASS {width}px: every pilot chunk and its navigation fit with loaded web fonts', flush=True)

    context = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = context.new_page()
    page.goto(base + 'learn/#screen-03')
    page.fill('#s03-title', 'تجربة الاستئناف')
    page.click('#screen-03 [data-chunk-next]')
    page.fill('#s03-current', 'يقارن المتعلم بين مثالين ويشرح الفرق.')
    page.click('#screen-03 [data-action="save-stop"]')
    chunk = page.locator('#screen-03 > [data-chunk]:not([hidden])').get_attribute('id')
    assert chunk
    page.reload()
    expect(page.locator('#' + chunk)).to_be_visible()
    expect(page.locator('#s03-current')).to_have_value('يقارن المتعلم بين مثالين ويشرح الفرق.')
    page.goto(base)
    expect(page.locator('[data-portal-continue]')).to_have_class('portal-btn portal-btn--primary')
    expect(page.locator('#portal-resume')).to_contain_text('بطاقة حاجتي')
    page.click('[data-portal-continue]')
    expect(page.locator('#' + chunk)).to_be_visible()
    page.goto(base + 'learn/')
    expect(page.locator('#' + chunk)).to_be_visible()
    page.goto(base + 'learn/#start')
    expect(page.locator('#screen-01 > [data-chunk]').first).to_be_visible()
    assert page.evaluate('BloomLearning.store.state.drafts.s03.title') == 'تجربة الاستئناف'
    print('PASS resume: reload, portal and direct path restore exact chunk and answers; start preserves work', flush=True)

    # Old/deleted chunk identifiers fall back within the saved screen, not another lesson.
    page.evaluate("""() => {
      const s = BloomLearning.store.state;
      s.position = { screen: '03', chunk: 'removed-chunk', at: s.updatedAt };
      s.schema = 1;
      localStorage.setItem('bloomLearning.v1', JSON.stringify(s));
    }""")
    page.goto(base + 'learn/#continue')
    expect(page.locator('#screen-03 > [data-chunk]').first).to_be_visible()
    page.goto(base + 'learn/#level-apply')
    expect(page.locator('#level-apply')).to_be_visible()
    assert page.locator('#level-apply').evaluate('(el) => el.open')
    print('PASS old position fallback and deep link into a later chunk', flush=True)

    # A failed save must leave the answer visible and must not claim success.
    page.goto(base + 'learn/#screen-03')
    page.evaluate("() => { window.originalSet = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error('blocked'); }; }")
    page.fill('#s03-title', 'إجابة عند تعذر الحفظ')
    expect(page.locator('#save-alert')).to_be_visible()
    expect(page.locator('#save-indicator')).to_contain_text('لم')
    expect(page.locator('#s03-title')).to_have_value('إجابة عند تعذر الحفظ')
    page.evaluate('() => { Storage.prototype.setItem = window.originalSet; }')
    page.click('[data-action="retry-save"]')
    expect(page.locator('#save-alert')).to_be_hidden()
    print('PASS failure is visible and retry preserves the answer', flush=True)

    # Status updates do not move the centered learning frame.
    page.goto(base + 'learn/#screen-09')
    page.evaluate('document.fonts.ready')
    before = page.locator('#screen-09-title').evaluate('(el) => el.getBoundingClientRect().top + scrollY')
    page.click('#screen-09 [data-action="save-draft"]')
    after = page.locator('#screen-09-title').evaluate('(el) => el.getBoundingClientRect().top + scrollY')
    assert abs(before - after) <= 1
    page.emulate_media(reduced_motion='reduce')
    page.goto(base + 'learn/#screen-07-2')
    card = page.locator('#screen-07-2 [data-flip]').first
    for _ in range(5):
        card.click()
    expect(card).to_have_attribute('aria-pressed', 'true')
    assert page.evaluate('Object.keys(BloomLearning.store.state.elements).length') == 0
    print('PASS stable save feedback, reduced motion and rapid card toggles', flush=True)

    page.goto(base + 'learn/#screen-09-3')
    page.click('#screen-09-3 [data-action="complete"]')
    missing = page.locator('#screen-09-3 .missing-fields a').first
    target = missing.get_attribute('href')
    missing.click()
    expect(page.locator(target)).to_be_visible()
    expect(page.locator(target)).to_be_focused()
    print('PASS missing-field summary opens the correct part and focuses its control', flush=True)

    page.goto(base)
    page.evaluate('() => { navigator.clipboard.writeText = async (value) => { window.copiedLink = value; }; }')
    copy = page.locator('[data-copy-learn]')
    original_width = copy.bounding_box()['width']
    original_height = copy.bounding_box()['height']
    copy.click()
    expect(copy).to_have_text('تم النسخ')
    assert page.evaluate('window.copiedLink') == base + 'learn/'
    assert abs(copy.bounding_box()['width'] - original_width) <= 1
    assert abs(copy.bounding_box()['height'] - original_height) <= 1
    page.evaluate("() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; }")
    copy.click()
    expect(page.locator('#portal-copy-status')).to_contain_text('تعذر النسخ')
    assert page.evaluate('getSelection().toString()') == base + 'learn/'
    print('PASS fixed-width copy confirmation and truthful clipboard failure fallback', flush=True)

    page.set_viewport_size({'width': 375, 'height': 800})
    page.goto(base + 'learn/#screen-01')
    page.evaluate("document.documentElement.style.fontSize = '32px'")
    fit(page)
    expect(page.locator('#screen-01 [data-chunk-next]')).to_be_visible()
    assert page.locator('#screen-01 .screen-nav').evaluate('(el) => el.scrollWidth <= el.clientWidth + 1')
    shot(page, 'learn-text-200')
    print('PASS 200% text enlargement keeps content and navigation available', flush=True)
    context.close()
    browser.close()
