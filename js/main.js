/**
 * @file main.js — page structure for trainee.html: hash router, lesson drawer,
 * screens inside each unit, accordions, tabs and the video dialog.
 *
 * AI usage note (Claude Code): refactored from the original inline script, then
 * redesigned as a lesson player. Self-learning redesign (2026-10-23):
 *  - Each unit (<section data-lesson>) now holds screens (<section data-screen>);
 *    one screen is shown at a time and the URL names it (trainee.html#screen-05).
 *  - Completion is NOT given for reaching the end of a page any more; learning
 *    progress is recorded by js/learning.js when the learner performs an activity.
 *  - The old knowledge check, lesson template, reflections and Gemini suggestion
 *    were replaced by the scenario's screens (see docs/implementation-log.md).
 *
 * Load order (all deferred): core.js, course-data.js, store.js, learning.js, main.js.
 * learning.js may expose window.BloomLearning.resolveAlias() for #continue and #next.
 */
'use strict';

(() => {
  /** @param {string} id @returns {HTMLElement|null} */
  const byId = (id) => document.getElementById(id);

  // ---------------------------------------------------------------------------
  // Accordions (library appendices)
  // ---------------------------------------------------------------------------

  /**
   * Expands or collapses one accordion panel and keeps its trigger's ARIA state in sync.
   * @param {string} id Suffix shared by "content-{id}" and data-accordion.
   * @param {boolean} [force] true to open, false to close, omitted to toggle.
   */
  function toggleAccordion(id, force) {
    const content = byId(`content-${id}`);
    const trigger = document.querySelector(`[data-accordion="${CSS.escape(id)}"]`);
    if (!content) return;
    const willOpen = typeof force === 'boolean' ? force : content.classList.contains('hidden');
    content.classList.toggle('hidden', !willOpen);
    if (trigger) trigger.setAttribute('aria-expanded', String(willOpen));
  }

  // ---------------------------------------------------------------------------
  // Views, units and screens
  // ---------------------------------------------------------------------------

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
  function buildSteppers() {
    lessons.forEach((lesson) => {
      const holder = lesson.querySelector('[data-stepper]');
      const screens = [...lesson.querySelectorAll('[data-screen]')];
      if (!holder || !screens.length) return;
      const list = document.createElement('ol');
      list.className = 'stepper-list';
      screens.forEach((screen) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${screen.id}`;
        a.className = 'stepper-link';
        a.dataset.stepLink = screen.dataset.screen;
        const n = document.createElement('span');
        n.className = 'stepper-n';
        n.textContent = screen.dataset.screen;
        const t = document.createElement('span');
        t.className = 'stepper-title';
        t.textContent = screen.querySelector('.screen-title')?.textContent.trim() || '';
        const s = document.createElement('span');
        s.className = 'sr-only';
        s.dataset.stepState = screen.dataset.screen;
        a.append(n, t, s);
        li.append(a);
        list.append(li);
      });
      holder.append(list);
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
    if (!element) return fallback;
    if (element.matches('[data-view]')) return { view: element, screen: null, target: null };
    const view = element.closest('[data-view]');
    if (!view) return { view: null, screen: null, target: null }; // e.g. #main-content
    const screen = element.closest('[data-screen]');
    return { view, screen, target: element.matches('[data-screen]') ? null : element };
  }

  /**
   * Opens every <details> around an element, selects its tab or accordion, then scrolls to it.
   * @param {HTMLElement} target
   */
  function revealTarget(target) {
    let details = target.closest('details');
    while (details) {
      details.open = true;
      details = details.parentElement?.closest('details') || null;
    }
    const panel = target.closest('[role="tabpanel"]');
    if (panel) {
      const tab = document.querySelector(`[role="tab"][aria-controls="${CSS.escape(panel.id)}"]`);
      if (tab) selectTab(tab);
    }
    const accordionPanel = target.closest('[id^="content-"]');
    if (accordionPanel) toggleAccordion(accordionPanel.id.replace(/^content-/, ''), true);
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
      if (link.dataset.stepLink === chosen.dataset.screen) link.setAttribute('aria-current', 'step');
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
  // Tabs (WAI-ARIA tabs pattern, automatic activation)
  // ---------------------------------------------------------------------------

  /**
   * Selects a tab, shows its panel and hides the sibling panels (roving tabindex).
   * @param {HTMLElement} tab
   */
  function selectTab(tab) {
    const list = tab.closest('[role="tablist"]');
    if (!list) return;
    list.querySelectorAll('[role="tab"]').forEach((item) => {
      const selected = item === tab;
      const panel = byId(item.getAttribute('aria-controls') || '');
      item.setAttribute('aria-selected', String(selected));
      /** @type {HTMLElement} */ (item).tabIndex = selected ? 0 : -1;
      if (panel) panel.hidden = !selected;
    });
  }

  /** Click selects; arrows follow the reading direction; Home/End jump. */
  function initTabs() {
    document.querySelectorAll('[role="tablist"]').forEach((list) => {
      const tabs = /** @type {HTMLElement[]} */ ([...list.querySelectorAll('[role="tab"]')]);
      list.addEventListener('click', (event) => {
        const tab = /** @type {HTMLElement} */ (event.target).closest('[role="tab"]');
        if (tab) selectTab(/** @type {HTMLElement} */ (tab));
      });
      list.addEventListener('keydown', (event) => {
        const index = tabs.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        if (index < 0) return;
        const rtl = getComputedStyle(list).direction === 'rtl';
        const step = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1 }[event.key];
        let next = null;
        if (step) next = (index + step + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        if (next === null) return;
        event.preventDefault();
        selectTab(tabs[next]);
        tabs[next].focus();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Video dialog (the only optional external media; loaded on request)
  // ---------------------------------------------------------------------------

  /** Element that had focus before the dialog opened. */
  let modalOpener = null;

  /**
   * @param {string} videoId 11-character YouTube id.
   * @param {HTMLElement|null} opener
   */
  function openVideoModal(videoId, opener) {
    const modal = byId('video-modal');
    const iframe = byId('video-iframe');
    if (!modal || !iframe || !/^[\w-]{11}$/.test(videoId)) return;
    modalOpener = opener;
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
    iframe.setAttribute('allowfullscreen', '');
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    byId('video-modal-close')?.focus();
  }

  function closeVideoModal() {
    const modal = byId('video-modal');
    const iframe = byId('video-iframe');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    if (iframe) iframe.removeAttribute('src');
    document.body.classList.remove('modal-open');
    modalOpener?.focus();
    modalOpener = null;
  }

  /** Keeps Tab inside the open dialog and closes it on Escape. @param {KeyboardEvent} event */
  function handleModalKeydown(event) {
    const modal = byId('video-modal');
    if (!modal || modal.hidden) return;
    if (event.key === 'Escape') {
      closeVideoModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('button, iframe, [href], [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = /** @type {HTMLElement} */ (focusable[0]);
    const last = /** @type {HTMLElement} */ (focusable[focusable.length - 1]);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  document.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const accordionTrigger = target.closest('[data-accordion]');
    if (accordionTrigger) {
      toggleAccordion(/** @type {HTMLElement} */ (accordionTrigger).dataset.accordion || '');
      return;
    }
    const videoButton = target.closest('[data-video-id]');
    if (videoButton) {
      openVideoModal(/** @type {HTMLElement} */ (videoButton).dataset.videoId || '', /** @type {HTMLElement} */ (videoButton));
      return;
    }
    if (target.closest('#video-modal-close') || target.id === 'video-modal') closeVideoModal();
  });

  document.addEventListener('keydown', handleModalKeydown);

  // Escape closes the overlay drawer (phones/tablets) when no dialog is open.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || desktopQuery.matches) return;
    if (!byId('video-modal')?.hidden) return;
    if (document.querySelector('dialog[open]')) return;
    if (!document.body.classList.contains('drawer-open')) return;
    setDrawer(false);
    byId('drawer-toggle')?.focus();
  });

  initTabs();
  initPlayer();
})();
