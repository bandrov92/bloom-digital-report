/**
 * @file main.js — page structure for trainee.html: hash router, lesson drawer
 * and the screens inside each unit.
 *
 * AI usage note (Claude Code): refactored from the original inline script, then
 * redesigned as a lesson player. Self-learning redesign (2026-10-23):
 *  - Each unit (<section data-lesson>) now holds screens (<section data-screen>);
 *    one screen is shown at a time and the URL names it (trainee.html#screen-05).
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
   * such as trainee.html#content-res-tools are forwarded there.
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

  /**
   * Builds the step list at the top of each unit from its screens' titles, so
   * every screen is one action away (click budget in CLAUDE.md).
   */
  /** Part letters for screens split into short parts (أ، ب، ج). */
  const PART_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي'];

  /** @param {HTMLElement} screen @returns {string} The design-document screen number ("07" for "07-2"). */
  const groupOf = (screen) => screen.dataset.group || screen.dataset.screen || '';

  /**
   * Builds the step list at the top of each unit: one step per design-document
   * screen (parts open from inside the screen), so the list stays at four steps.
   * Screens split into parts get a small parts bar under their kicker.
   * Click budget (CLAUDE.md): unit 2 actions, screen +1, part +1.
   */
  function buildSteppers() {
    lessons.forEach((lesson) => {
      const holder = lesson.querySelector('[data-stepper]');
      const screens = /** @type {HTMLElement[]} */ ([...lesson.querySelectorAll('[data-screen]')]);
      if (!holder || !screens.length) return;
      const groups = new Map();
      screens.forEach((screen) => {
        const g = groupOf(screen);
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(screen);
      });
      const list = document.createElement('ol');
      list.className = 'stepper-list';
      groups.forEach((parts, g) => {
        const first = parts[0];
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${first.id}`;
        a.className = 'stepper-link';
        a.dataset.stepLink = g;
        const n = document.createElement('span');
        n.className = 'stepper-n';
        n.textContent = g;
        const t = document.createElement('span');
        t.className = 'stepper-title';
        t.textContent = first.dataset.stepTitle || first.querySelector('.screen-title')?.textContent.trim() || '';
        const s = document.createElement('span');
        s.className = 'sr-only';
        s.dataset.stepState = g;
        a.append(n, t, s);
        li.append(a);
        list.append(li);
        if (parts.length > 1) buildPartsBar(parts);
      });
      holder.append(list);
    });
  }

  /**
   * Adds "الجزء أ · ب · ج" links to every part of a split screen.
   * @param {HTMLElement[]} parts
   */
  function buildPartsBar(parts) {
    parts.forEach((part, index) => {
      const nav = document.createElement('nav');
      nav.className = 'parts-bar';
      nav.setAttribute('aria-label', `أجزاء الشاشة ${groupOf(part)}`);
      const label = document.createElement('span');
      label.className = 'parts-label';
      label.textContent = `الجزء ${index + 1} من ${parts.length}`;
      nav.append(label);
      parts.forEach((target, k) => {
        const link = document.createElement('a');
        link.href = `#${target.id}`;
        link.className = 'parts-link';
        link.textContent = PART_LETTERS[k] || String(k + 1);
        const title = target.querySelector('.screen-title')?.textContent.trim() || '';
        link.setAttribute('aria-label', `الجزء ${PART_LETTERS[k]}: ${title}`);
        link.title = title;
        if (k === index) link.setAttribute('aria-current', 'step');
        nav.append(link);
      });
      part.querySelector('.screen-kicker')?.after(nav);
    });
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
    const alias = window.BloomLearning?.resolveAlias?.(id);
    if (alias) id = alias;
    const fallback = { view: lessons[0] || null, screen: null, target: null };
    if (!id) return fallback;
    const element = byId(id);
    if (!element && MOVED_TO_TRAINER.includes(id)) {
      window.location.replace(`trainer.html#${encodeURIComponent(id)}`);
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
    view.dataset.activeScreen = chosen.id;
    view.querySelectorAll('[data-step-link]').forEach((link) => {
      if (link.dataset.stepLink === groupOf(chosen)) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
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
  }

  /**
   * Applies the current URL hash. Called on load and on every hashchange.
   * @param {{initial?: boolean}} [options]
   */
  function route({ initial = false } = {}) {
    const { view, screen, target } = resolveHash(window.location.hash);
    if (view) showView(view, screen, { focus: !initial && !target });
    if (target) revealTarget(target);
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
