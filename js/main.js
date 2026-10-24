/**
 * @file main.js — page structure for learn/index.html: hash router, lesson drawer
 * and the screens inside each unit.
 *
 * AI usage note (Claude Code): refactored from the original inline script, then
 * redesigned as a lesson player. Self-learning redesign (2026-10-23):
 *  - Each unit (<section data-lesson>) now holds screens (<section data-screen>);
 *    one screen is shown at a time and the URL names it (learn/#screen-05).
 *  - Completion is NOT given for reaching the end of a page any more; learning
 *    progress is recorded by js/learning.js when the learner performs an activity.
 *  - The old knowledge check, lesson template, reflections and Gemini suggestion
 *    were replaced by the scenario's screens (see docs/implementation-log.md).
 *  - The library appendices moved to trainer.html#library; their old ids are
 *    forwarded there (MOVED_TO_TRAINER).
 *
 * Load order (all deferred): core.js, course-data.js, store.js, learning.js, main.js.
 * learning.js may expose window.BloomLearning.resolveAlias() for #continue and #next.
 */
'use strict';

(() => {
  /** @param {string} id @returns {HTMLElement|null} */
  const byId = (id) => document.getElementById(id);

  // ---------------------------------------------------------------------------
  // Views, units and screens
  // ---------------------------------------------------------------------------

  /**
   * Ids that moved to trainer.html (library appendices, 2026-10-23). Old links
   * such as learn/#content-res-tools (or the old trainee.html#…) are forwarded there.
   */
  const MOVED_TO_TRAINER = Object.freeze([
    'library', 'content-res-tools', 'content-res-case-studies', 'content-res-assessment',
    'content-res-challenges', 'content-res-further-learning', 'content-foundation',
  ]);

  /** Large-screen breakpoint (Tailwind lg). The drawer is a sidebar from here up. */
  const desktopQuery = window.matchMedia('(min-width: 1024px)');

  /** Every routable view: the seven units plus the learner dashboard. */
  const views = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('[data-view]')]);
  const lessons = views.filter((v) => v.hasAttribute('data-lesson'));
  const lessonLinks = /** @type {HTMLAnchorElement[]} */ ([...document.querySelectorAll('[data-lesson-link]')]);

  /** @type {HTMLElement|null} */
  let currentView = null;
  /** @type {HTMLElement|null} */
  let currentScreen = null;

  /** Part letters for screens split into short parts (أ، ب، ج). */
  const PART_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي'];

  /** @param {HTMLElement} screen @returns {string} The design-document screen number ("07" for "07-2"). */
  const groupOf = (screen) => screen.dataset.group || screen.dataset.screen || '';

  /**
   * Builds, under each unit link in the drawer, the list of its design-document
   * screens, with the parts of a split screen as small letter links (أ ب ج).
   * Only the current unit's list is shown (activateScreen). This replaces the
   * step cards and parts bar that sat above every screen (2026-10-25), so the
   * screen opens on its content.
   * Click budget (CLAUDE.md): desktop unit 1 + screen 1; phone menu 1 + unit 1 + menu 1 + screen 1.
   */
  function buildSteppers() {
    lessons.forEach((lesson) => {
      const link = lessonLinks.find((l) => l.hash === `#${lesson.id}`);
      const screens = /** @type {HTMLElement[]} */ ([...lesson.querySelectorAll('[data-screen]')]);
      if (!link || !screens.length) return;
      const groups = new Map();
      screens.forEach((screen) => {
        const g = groupOf(screen);
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(screen);
      });
      const list = document.createElement('ol');
      list.className = 'drawer-steps';
      list.dataset.stepsFor = lesson.id;
      list.hidden = true;
      list.setAttribute('aria-label', `شاشات ${link.querySelector('.lesson-link-title')?.textContent.trim() || ''}`);
      groups.forEach((parts, g) => {
        const first = parts[0];
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${first.id}`;
        a.className = 'drawer-step';
        a.dataset.stepLink = g;
        const n = document.createElement('span');
        n.className = 'drawer-step-n';
        n.textContent = g;
        const t = document.createElement('span');
        t.className = 'drawer-step-title';
        t.textContent = first.dataset.stepTitle || first.querySelector('.screen-title')?.textContent.trim() || '';
        const s = document.createElement('span');
        s.className = 'sr-only';
        s.dataset.stepState = g;
        a.append(n, t, s);
        li.append(a);
        if (parts.length > 1) {
          const bar = document.createElement('span');
          bar.className = 'drawer-parts';
          parts.forEach((part, k) => {
            const p = document.createElement('a');
            p.href = `#${part.id}`;
            p.className = 'drawer-part';
            p.dataset.partLink = part.id;
            p.textContent = PART_LETTERS[k] || String(k + 1);
            const title = part.querySelector('.screen-title')?.textContent.trim() || '';
            p.setAttribute('aria-label', `الجزء ${PART_LETTERS[k] || k + 1}: ${title}`);
            p.title = title;
            bar.append(p);
          });
          li.append(bar);
        }
        list.append(li);
      });
      link.after(list);
    });
  }

  /**
   * Folds each screen's purpose line and element status into one closed
   * "عن هذه الشاشة" disclosure, so the title is followed by content.
   * The nodes keep their attributes (learning.js still fills data-element-status).
   */
  function foldScreenHeads() {
    document.querySelectorAll('.screen-head').forEach((head) => {
      const parts = [...head.querySelectorAll(':scope > .screen-purpose, :scope > .element-status')];
      if (!parts.length) return;
      const details = document.createElement('details');
      details.className = 'screen-about';
      details.setAttribute('data-print-open', '');
      const summary = document.createElement('summary');
      summary.textContent = 'الغرض وعنصر الاستكمال';
      details.append(summary, ...parts);
      head.append(details);
    });
  }

  // ---------------------------------------------------------------------------
  // Chunks: one small block of a screen at a time (2026-10-25)
  // ---------------------------------------------------------------------------

  /** @param {HTMLElement} screen @returns {HTMLElement[]} */
  const chunksOf = (screen) => /** @type {HTMLElement[]} */ ([...screen.querySelectorAll(':scope > [data-chunk]')]);

  /** Set by a "previous screen" link, so the previous screen opens on its last chunk. */
  let enterAtEnd = false;

  /**
   * Shows one chunk of a screen. Chunks only change what is visible: no element
   * is completed by moving between them (CLAUDE.md: no completion by visiting).
   * @param {HTMLElement} screen
   * @param {number} index
   * @param {{focus?: boolean}} [options]
   */
  function showChunk(screen, index, { focus = false } = {}) {
    const chunks = chunksOf(screen);
    if (!chunks.length) return;
    const i = Math.min(Math.max(index, 0), chunks.length - 1);
    chunks.forEach((chunk, k) => { chunk.hidden = k !== i; });
    screen.dataset.chunkIndex = String(i);
    updateChunkNav(screen);
    if (focus) {
      const chunk = chunks[i];
      const heading = /** @type {HTMLElement|null} */ (chunk.querySelector('h4, h5, legend, .display-text p, p'));
      const target = heading || chunk;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      const top = screen.getBoundingClientRect().top + window.scrollY - 72;
      if (window.scrollY > top) window.scrollTo({ top, behavior: 'instant' });
    }
  }

  /**
   * Repaints the footer of a chunked screen: "متابعة" while chunks remain,
   * "السابق" inside the screen after the first chunk, and the chunk dots.
   * @param {HTMLElement} screen
   */
  function updateChunkNav(screen) {
    const nav = screen.querySelector('.screen-nav');
    const chunks = chunksOf(screen);
    if (!nav || !chunks.length) return;
    const i = Number(screen.dataset.chunkIndex || 0);
    const last = i === chunks.length - 1;
    const primary = /** @type {HTMLElement|null} */ (nav.querySelector('.btn-primary'));
    if (primary) {
      if (!primary.dataset.label) primary.dataset.label = primary.textContent || '';
      primary.textContent = last ? primary.dataset.label : 'متابعة';
      primary.toggleAttribute('data-chunk-next', !last);
    }
    const back = /** @type {HTMLElement|null} */ (nav.querySelector('[data-chunk-prev]'));
    const prevLink = /** @type {HTMLElement|null} */ (nav.querySelector('a[rel="prev"]'));
    if (back) back.hidden = i === 0;
    if (prevLink) prevLink.hidden = i > 0;
    const dots = /** @type {HTMLElement|null} */ (nav.querySelector('[data-chunk-dots]'));
    if (dots) {
      dots.hidden = chunks.length < 2;
      dots.replaceChildren(...chunks.map((_, k) => {
        const dot = document.createElement('span');
        dot.className = `chunk-dot${k === i ? ' is-current' : ''}${k < i ? ' is-seen' : ''}`;
        dot.setAttribute('aria-hidden', 'true');
        return dot;
      }));
      const label = document.createElement('span');
      label.className = 'sr-only';
      label.textContent = `الجزئية ${i + 1} من ${chunks.length}`;
      dots.append(label);
    }
  }

  /**
   * Opens the chunk that holds an element (deep link, missing field, paged item).
   * @param {Element|null} element
   * @returns {boolean} Whether a hidden chunk was opened.
   */
  function revealChunkOf(element) {
    const chunk = /** @type {HTMLElement|null} */ (element?.closest('[data-chunk]') || null);
    const screen = /** @type {HTMLElement|null} */ (chunk?.parentElement?.closest('[data-screen]') || null);
    if (!chunk || !screen || !chunk.hidden) return false;
    showChunk(screen, chunksOf(screen).indexOf(chunk));
    return true;
  }

  /**
   * Resolves a URL hash to the view, screen and element to show.
   * @param {string} hash
   * @returns {{view: HTMLElement|null, screen: HTMLElement|null, target: HTMLElement|null}}
   */
  function resolveHash(hash) {
    let id = '';
    try {
      id = decodeURIComponent(hash.replace(/^#/, ''));
    } catch {
      id = '';
    }
    // The trainee's direct link (learn/ with no hash) reopens the last saved
    // position; with nothing saved, the 'continue' alias falls back to screen 01.
    if (!id) id = 'continue';
    const alias = window.BloomLearning?.resolveAlias?.(id);
    if (alias) id = alias;
    const fallback = { view: lessons[0] || null, screen: null, target: null };
    if (!id) return fallback;
    const element = byId(id);
    if (!element && MOVED_TO_TRAINER.includes(id)) {
      window.location.replace(`../trainer.html#${encodeURIComponent(id)}`);
      return { view: null, screen: null, target: null };
    }
    if (!element) return fallback;
    if (element.matches('[data-view]')) return { view: element, screen: null, target: null };
    const view = element.closest('[data-view]');
    if (!view) return { view: null, screen: null, target: null }; // e.g. #main-content
    const screen = element.closest('[data-screen]');
    return { view, screen, target: element.matches('[data-screen]') ? null : element };
  }

  /**
   * Opens every <details> around an element, then scrolls to it.
   * @param {HTMLElement} target
   */
  function revealTarget(target) {
    // A target inside a paged list (js/learning.js paginate) opens its page first.
    if (target.closest('[data-pager-page]')) target.dispatchEvent(new CustomEvent('bloom:reveal', { bubbles: true }));
    revealChunkOf(target);
    let details = target.closest('details');
    while (details) {
      details.open = true;
      details = details.parentElement?.closest('details') || null;
    }
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }

  /**
   * Shows one screen of a unit and hides the others.
   * @param {HTMLElement} view
   * @param {HTMLElement|null} screen null = the unit's last active (or first) screen.
   * @returns {HTMLElement|null} The screen shown.
   */
  function activateScreen(view, screen) {
    const screens = [...view.querySelectorAll('[data-screen]')];
    if (!screens.length) return null;
    const remembered = view.dataset.activeScreen && byId(view.dataset.activeScreen);
    const chosen = screen || remembered || screens[0];
    screens.forEach((s) => { s.hidden = s !== chosen; });
    const changed = view.dataset.activeScreen !== chosen.id || chosen.dataset.chunkIndex === undefined;
    view.dataset.activeScreen = chosen.id;
    document.querySelectorAll('[data-steps-for]').forEach((list) => {
      /** @type {HTMLElement} */ (list).hidden = /** @type {HTMLElement} */ (list).dataset.stepsFor !== view.id;
    });
    document.querySelectorAll(`[data-steps-for="${view.id}"] [data-step-link]`).forEach((link) => {
      if (/** @type {HTMLElement} */ (link).dataset.stepLink === groupOf(chosen)) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    document.querySelectorAll(`[data-steps-for="${view.id}"] [data-part-link]`).forEach((link) => {
      if (/** @type {HTMLElement} */ (link).dataset.partLink === chosen.id) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    if (changed || enterAtEnd) showChunk(chosen, enterAtEnd ? chunksOf(chosen).length - 1 : 0);
    enterAtEnd = false;
    // The bar to the next unit only appears on the unit's last screen.
    const bar = view.querySelector('[data-next-lesson]');
    if (bar) bar.hidden = chosen !== screens[screens.length - 1];
    return chosen;
  }

  /**
   * Shows a view (unit or dashboard) and one of its screens, and updates the
   * drawer, counter, document title and focus.
   * @param {HTMLElement} view
   * @param {HTMLElement|null} screen
   * @param {{focus?: boolean}} [options]
   */
  function showView(view, screen, { focus = false } = {}) {
    const viewChanged = view !== currentView;
    if (viewChanged) {
      const firstView = currentView === null;
      views.forEach((item) => { item.hidden = item !== view; });
      if (!firstView) {
        // Restarting the entrance animation forces a synchronous layout; skip it on page load.
        view.classList.remove('is-entering');
        void view.offsetWidth;
        view.classList.add('is-entering');
      }
      currentView = view;
    }
    if (!view.hasAttribute('data-lesson')) document.querySelectorAll('[data-steps-for]').forEach((list) => { /** @type {HTMLElement} */ (list).hidden = true; });
    const shown = activateScreen(view, screen);
    const screenChanged = shown !== currentScreen;
    currentScreen = shown;
    if (viewChanged || screenChanged) window.scrollTo({ top: 0, behavior: 'instant' });

    lessonLinks.forEach((link) => {
      if (link.hash === `#${view.id}`) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const counter = byId('lesson-counter');
    const index = lessons.indexOf(view);
    if (counter) counter.textContent = index >= 0 ? `الوحدة ${index + 1} من ${lessons.length}` : '';
    const viewTitle = view.querySelector('.lesson-title')?.textContent.trim() || '';
    const screenTitle = shown?.querySelector('.screen-title')?.textContent.trim();
    document.title = `${screenTitle ? `${screenTitle} | ` : ''}${viewTitle} | حقيبة هرم بلوم الرقمية`;

    if (focus && (viewChanged || screenChanged)) {
      const heading = /** @type {HTMLElement|null} */ (shown?.querySelector('.screen-title') || view.querySelector('.lesson-title'));
      heading?.focus({ preventScroll: true });
    }
    document.dispatchEvent(new CustomEvent('bloom:screen', {
      detail: { view: view.id, screen: shown ? shown.dataset.screen : null },
    }));
    if (shown) updateChunkNav(shown);
  }

  /**
   * Applies the current URL hash. Called on load and on every hashchange.
   * @param {{initial?: boolean}} [options]
   */
  function route({ initial = false } = {}) {
    const { view, screen, target } = resolveHash(window.location.hash);
    if (view) showView(view, screen, { focus: !initial && !target });
    if (target) revealTarget(target);
    // The browser's own jump to #screen-NN would hide the unit banner: a screen
    // opens from the top of the page (a deep link to an inner element still scrolls to it).
    else if (view && initial) {
      const top = () => window.scrollTo({ top: 0, behavior: 'instant' });
      requestAnimationFrame(top);
      window.addEventListener('load', top, { once: true });
    }
    if (!desktopQuery.matches) setDrawer(false);
  }

  /** @returns {boolean} Whether the drawer is currently visible. */
  function isDrawerVisible() {
    return desktopQuery.matches
      ? !document.body.classList.contains('drawer-collapsed')
      : document.body.classList.contains('drawer-open');
  }

  /**
   * Opens or closes the drawer. Below lg it is an overlay; from lg a sidebar.
   * @param {boolean} [open] true to open, false to close, omitted to toggle.
   */
  function setDrawer(open) {
    const show = typeof open === 'boolean' ? open : !isDrawerVisible();
    if (desktopQuery.matches) {
      document.body.classList.toggle('drawer-collapsed', !show);
      document.body.classList.remove('drawer-open');
    } else {
      document.body.classList.toggle('drawer-open', show);
    }
    const backdrop = byId('drawer-backdrop');
    if (backdrop) backdrop.hidden = !(show && !desktopQuery.matches);
    const toggle = byId('drawer-toggle');
    toggle?.setAttribute('aria-expanded', String(show));
    toggle?.setAttribute('aria-label', show ? 'إخفاء قائمة الوحدات' : 'قائمة الوحدات');
  }

  /** Wires the drawer and the router. Interaction budget: unit = 2 actions, screen = +1. */
  function initPlayer() {
    if (!views.length) return;
    buildSteppers();
    foldScreenHeads();
    document.querySelectorAll('[data-screen]').forEach((screen) => {
      if (chunksOf(/** @type {HTMLElement} */ (screen)).length) /** @type {HTMLElement} */ (screen).dataset.chunked = '';
    });
    setDrawer(desktopQuery.matches);
    desktopQuery.addEventListener('change', () => setDrawer(desktopQuery.matches));

    byId('drawer-toggle')?.addEventListener('click', () => {
      const opening = !isDrawerVisible();
      setDrawer(opening);
      if (opening && !desktopQuery.matches) {
        const current = document.querySelector('[data-lesson-link][aria-current="page"]');
        /** @type {HTMLElement|null} */ (current || lessonLinks[0])?.focus();
      }
    });
    byId('drawer-close')?.addEventListener('click', () => {
      setDrawer(false);
      byId('drawer-toggle')?.focus();
    });
    byId('drawer-backdrop')?.addEventListener('click', () => setDrawer(false));

    // Picking the view already on screen does not fire hashchange: close and go to top.
    document.querySelectorAll('.drawer a[href^="#"]').forEach((link) => {
      link.addEventListener('click', () => {
        if (currentView && /** @type {HTMLAnchorElement} */ (link).hash === `#${currentView.id}`) {
          if (!desktopQuery.matches) setDrawer(false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });

    // Chunk footer: "متابعة" and the in-screen "السابق" move between chunks; the
    // link to the previous screen opens that screen on its last chunk.
    document.addEventListener('click', (event) => {
      const el = /** @type {HTMLElement} */ (event.target);
      const screen = /** @type {HTMLElement|null} */ (el.closest?.('[data-screen]') || null);
      if (!screen || !el.closest('.screen-nav')) return;
      const i = Number(screen.dataset.chunkIndex || 0);
      if (el.closest('[data-chunk-next]')) {
        event.preventDefault();
        showChunk(screen, i + 1, { focus: true });
      } else if (el.closest('[data-chunk-prev]')) {
        event.preventDefault();
        showChunk(screen, i - 1, { focus: true });
      } else if (el.closest('a[rel="prev"]')) {
        enterAtEnd = true;
      }
    });
    // A field, check or paged item inside a hidden chunk opens its chunk first.
    document.addEventListener('bloom:reveal', (event) => { revealChunkOf(/** @type {Element} */ (event.target)); });

    window.addEventListener('hashchange', () => route());
    route({ initial: true });
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  // Escape closes the overlay drawer (phones/tablets) when no dialog is open.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || desktopQuery.matches) return;
    if (document.querySelector('dialog[open]')) return;
    if (!document.body.classList.contains('drawer-open')) return;
    setDrawer(false);
    byId('drawer-toggle')?.focus();
  });

  initPlayer();
})();
