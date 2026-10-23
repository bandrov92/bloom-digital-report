/**
 * @file learning.js — the learner's activity on trainee.html: saved fields,
 * honest save status, practice checks, element completion, screen navigation,
 * the dashboard and the screen-specific behaviour of the scenario.
 *
 * Depends on (loaded before it): js/core.js (BloomCore), js/course-data.js
 * (BloomData), js/store.js (BloomStore). js/main.js loads after it and calls
 * window.BloomLearning.resolveAlias() for #continue and #next.
 *
 * Conventions in trainee.html:
 *  - data-field="s07.paraphrase"     a saved control (input, textarea, select, radios, checkbox).
 *  - data-review="s07.rv1"           a self-review question rendered with the نعم/جزئيًا/ليس بعد scale.
 *  - data-check="s05"                a practice check rendered from BloomData.CHECKS.
 *  - data-show-when="s16.kind=display|other"  shown only while the field has one of the values.
 *  - data-action="complete" data-element="t05"  records the element if its rule is met.
 *  - data-element-status="t05"       filled with the element's status.
 * Learner text is only ever inserted with textContent.
 * Written with Claude Code (AI-assisted).
 */
'use strict';

(() => {
  const D = window.BloomData;
  const C = window.BloomCore;
  const S = window.BloomStore;
  if (!D || !C || !S) {
    console.error('learning.js: core.js, course-data.js and store.js must load first.');
    return;
  }

  // ---------------------------------------------------------------------------
  // Setup and small helpers
  // ---------------------------------------------------------------------------

  /** @returns {Storage|null} localStorage, or null when the browser blocks it. */
  function safeStorage() {
    try {
      const storage = window.localStorage;
      storage.getItem('bloomLearning.probe');
      return storage;
    } catch {
      return null;
    }
  }

  const store = S.createStore({ storage: safeStorage() });
  store.load();
  const pageLoadedAt = new Date().toISOString();

  /** @param {string} id @returns {HTMLElement|null} */
  const byId = (id) => document.getElementById(id);
  /** @param {string} sel @param {ParentNode} [root] @returns {HTMLElement[]} */
  const $$ = (sel, root = document) => /** @type {HTMLElement[]} */ ([...root.querySelectorAll(sel)]);

  /**
   * Tiny DOM builder. Children may be strings (inserted as text) or nodes.
   * @param {string} tag
   * @param {Record<string, any>} [attrs]
   * @param {Array<Node|string|null|undefined|false>|Node|string} [children]
   * @returns {HTMLElement}
   */
  function h(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : String(value));
    });
    (Array.isArray(children) ? children : [children]).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.append(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  /** Gregorian date and time with Western digits, matching the rest of the site. */
  const dateTimeFormat = new Intl.DateTimeFormat('ar', {
    dateStyle: 'medium', timeStyle: 'short', calendar: 'gregory', numberingSystem: 'latn',
  });
  const timeFormat = new Intl.DateTimeFormat('ar', { timeStyle: 'short', numberingSystem: 'latn' });
  /** @param {string|null|undefined} iso */
  const fmtDateTime = (iso) => (iso ? dateTimeFormat.format(new Date(iso)) : '');
  /** @param {string|null|undefined} iso */
  const fmtTime = (iso) => (iso ? timeFormat.format(new Date(iso)) : '');

  const nowIso = () => new Date().toISOString();
  /** @param {string} n Screen number "05". */
  const screenEl = (n) => byId(`screen-${n}`);
  /** @param {string} n */
  /** Title of a screen; a design-document number ("20") gives the whole screen's title, not its first part's. */
  const screenTitle = (n) => {
    const el = screenEl(n);
    return (!n.includes('-') && el?.dataset.stepTitle) || el?.querySelector('.screen-title')?.textContent.trim() || `الشاشة ${n}`;
  };
  /** @param {string} n @returns {string} */
  const screenHref = (n) => `#screen-${n}`;
  /** @param {string} elementId */
  const elementDef = (elementId) => D.ELEMENTS.find((e) => e.id === elementId);
  /** @param {string} n @returns {string|undefined} */
  const elementForScreen = (n) => D.ELEMENTS.find((e) => e.screen === n)?.id;
  /**
   * "t05" -> «ت05» for display. Guillemets keep the code visibly apart from the
   * preceding word: with the Thmanyah word space, «عنصر ت05» read as one word.
   */
  const elementLabel = (id) => `«ت${id.slice(1)}»`;
  /** Percent as plain text; Arabic bidi shows it as in the static pages of the site. */
  const pct = (n) => `${n}%`;
  const isDone = (id) => !!store.state.elements[id]?.at;

  /** All screen numbers in page order. */
  const SCREEN_ORDER = $$('[data-screen]').map((s) => s.dataset.screen || '');

  /** @param {string} key Screen key ("07" or "07-2") @returns {string} Design-document screen number. */
  const groupOfKey = (key) => key.split('-')[0];
  /** @param {string} group @returns {string[]} Screen keys of a document screen, in order. */
  const partsOf = (group) => SCREEN_ORDER.filter((k) => groupOfKey(k) === group);
  const PART_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي'];
  /**
   * Display label of a screen key: "07" stays "07"; a split screen shows its part ("07 ب").
   * @param {string} key
   */
  function screenLabel(key) {
    const parts = partsOf(groupOfKey(key));
    return parts.length > 1 ? `${groupOfKey(key)} ${PART_LETTERS[parts.indexOf(key)]}` : key;
  }

  /** Unit (lesson id) of a screen. @param {string} n */
  const unitOf = (n) => screenEl(n)?.closest('[data-lesson]')?.id || '';

  /** Short link to a screen with its number and title. @param {string} n */
  const screenLink = (n, label) => h('a', { href: screenHref(n), class: 'inline-link' }, label || `الشاشة ${n}: ${screenTitle(n)}`);

  /**
   * Shows a long generated list (diagnostic items, test questions, explanations)
   * a few items at a time, so a screen keeps a length close to the others.
   * Every item stays in the DOM: answers keep their state, print shows all pages,
   * and a link or focus to a hidden item opens its page (event "bloom:reveal").
   * @param {HTMLElement} list Container whose element children are the items.
   * @param {{perPage: number, label: string, lastOnly?: Array<HTMLElement|null>, start?: number, lastPage?: number}} opts
   *   perPage: the most items on a page; pages are filled evenly (10 items, 3 per page: 3, 3, 2, 2).
   *   lastPage: at most this many items on the last page, which also shows lastOnly.
   *   lastOnly: nodes shown only on the last page (for example the submit button).
   * @returns {{show: (page: number) => void, showItem: (node: Element|null) => void, pages: number}}
   */
  function paginate(list, { perPage, label, lastOnly = [], start = 0, lastPage = perPage }) {
    list.parentElement?.querySelector(`:scope > .pager[data-pager-for="${list.id}"]`)?.remove();
    const items = [...list.children].filter((n) => !n.matches('[data-pager-page]'));
    // Page sizes: a short last page when it carries extra content, the rest filled evenly.
    const tail = items.length > perPage ? Math.min(lastPage, perPage) : items.length;
    const restCount = items.length - tail;
    const restPages = Math.ceil(restCount / perPage);
    const sizes = Array.from({ length: restPages }, (_, i) => Math.floor(restCount / restPages) + (i < restCount % restPages ? 1 : 0));
    sizes.push(tail);
    const pages = sizes.length;
    const groups = [];
    let from = 0;
    sizes.forEach((size, p) => {
      const page = h('div', { class: 'pager-page', dataset: { pagerPage: String(p) } });
      items.slice(from, from + size).forEach((item) => page.append(item));
      from += size;
      groups.push(page);
    });
    list.replaceChildren(...groups);
    const status = h('span', { class: 'pager-status', role: 'status' });
    const prev = h('button', { type: 'button', class: 'btn btn-secondary pager-btn' }, 'السابق');
    const next = h('button', { type: 'button', class: 'btn btn-secondary pager-btn' }, 'التالي');
    const nav = h('nav', { class: 'pager', 'aria-label': `صفحات ${label}`, dataset: { pagerFor: list.id || '' } }, [prev, status, next]);
    let current = 0;
    const show = (page, { focus = false } = {}) => {
      current = Math.min(Math.max(page, 0), pages - 1);
      groups.forEach((g, i) => { g.hidden = i !== current; });
      status.textContent = `${label}: الصفحة ${current + 1} من ${pages}`;
      prev.disabled = current === 0;
      next.disabled = current === pages - 1;
      lastOnly.forEach((node) => { if (node) node.hidden = current !== pages - 1; });
      if (focus) {
        /** @type {HTMLElement|null} */ (groups[current].querySelector('legend, .diag-head, h4, p'))?.setAttribute('tabindex', '-1');
        /** @type {HTMLElement|null} */ (groups[current].querySelector('[tabindex="-1"]'))?.focus({ preventScroll: true });
        list.scrollIntoView({ block: 'start' });
      }
    };
    prev.addEventListener('click', () => show(current - 1, { focus: true }));
    next.addEventListener('click', () => show(current + 1, { focus: true }));
    list.addEventListener('bloom:reveal', (event) => {
      const page = /** @type {HTMLElement} */ (event.target).closest('[data-pager-page]');
      if (page) show(Number(page.getAttribute('data-pager-page')));
    });
    list.after(nav);
    nav.hidden = pages < 2;
    show(start);
    const showItem = (node) => {
      const page = node?.closest('[data-pager-page]');
      if (page) show(Number(page.getAttribute('data-pager-page')));
    };
    return { show, showItem, pages };
  }

  // ---------------------------------------------------------------------------
  // Save status (never shows success when saving failed)
  // ---------------------------------------------------------------------------

  const indicator = byId('save-indicator');
  const alertBox = byId('save-alert');

  /** Repaints the top-bar indicator and the failure banner from store.status. */
  function renderSaveStatus() {
    const st = store.status;
    if (indicator) {
      indicator.classList.toggle('is-failed', !st.ok);
      if (!st.available) indicator.textContent = 'الحفظ غير متاح في هذا المتصفح';
      else if (!st.ok) indicator.textContent = 'لم يُحفظ آخر تعديل';
      else if (st.dirty) indicator.textContent = 'جارٍ الحفظ…';
      else if (st.at) indicator.textContent = `حُفظ ${fmtTime(st.at)}`;
      else indicator.textContent = 'لا يوجد عمل محفوظ بعد';
    }
    if (alertBox) {
      const failed = !st.ok;
      alertBox.hidden = !failed;
      if (failed) {
        const text = alertBox.querySelector('[data-save-alert-text]');
        if (text) {
          text.textContent = st.available
            ? D.MESSAGES.saveFailed
            : 'هذا المتصفح يمنع الحفظ المحلي (قد تكون نافذة خاصة أو إعدادًا يحظر التخزين). يبقى ما تكتبه ظاهرًا في هذه الصفحة فقط؛ انسخ عملك قبل المغادرة.';
        }
      }
    }
  }
  store.onStatus(renderSaveStatus);

  let appStatusTimer = 0;
  /** Short message under the top bar (cleared after a while). @param {string} text */
  function appStatus(text) {
    const node = byId('app-status');
    if (!node) return;
    clearTimeout(appStatusTimer);
    node.textContent = text;
    appStatusTimer = window.setTimeout(() => { node.textContent = ''; }, 8000);
  }

  let saveTimer = 0;
  /** Debounced save after typing. */
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => store.save(), 700);
  }
  /** Saves now (used before navigation and by "احفظ"). @returns {boolean} */
  function flushSave() {
    clearTimeout(saveTimer);
    return store.status.dirty ? store.save() : store.status.ok;
  }

  // ---------------------------------------------------------------------------
  // Saved fields
  // ---------------------------------------------------------------------------

  /**
   * Writes one draft value in memory and schedules a save.
   * @param {string} path "sNN.field"
   * @param {any} value
   * @param {{now?: boolean}} [options] now: save immediately (choices) instead of debouncing (typing).
   */
  function setDraft(path, value, { now = false } = {}) {
    const [screen, field] = path.split('.');
    store.stage((st) => {
      st.drafts[screen] = st.drafts[screen] || {};
      st.drafts[screen][field] = value;
    });
    if (now) flushSave();
    else scheduleSave();
    refreshConditionals();
    document.dispatchEvent(new CustomEvent('bloom:draft', { detail: { path, value } }));
  }

  /**
   * Reads a control's value: radios -> checked value, multi checkboxes -> array,
   * single checkbox -> boolean, others -> string.
   * @param {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} control
   */
  function controlValue(control) {
    const path = control.dataset.field || '';
    if (control instanceof HTMLInputElement && control.type === 'radio') {
      const checked = /** @type {HTMLInputElement|null} */ (document.querySelector(`input[type="radio"][data-field="${CSS.escape(path)}"]:checked`));
      return checked ? checked.value : '';
    }
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      if (control.hasAttribute('data-multi')) {
        return $$(`input[type="checkbox"][data-field="${CSS.escape(path)}"]`)
          .filter((c) => /** @type {HTMLInputElement} */ (c).checked)
          .map((c) => /** @type {HTMLInputElement} */ (c).value);
      }
      return control.checked;
    }
    return control.value;
  }

  /** Puts saved values back into every [data-field] control. */
  /** @param {ParentNode} [root] */
  function restoreFields(root = document) {
    $$('[data-field]', root).forEach((control) => {
      const value = C.getField(store.state, control.dataset.field || '');
      if (value === undefined) return;
      if (control instanceof HTMLInputElement && control.type === 'radio') control.checked = control.value === value;
      else if (control instanceof HTMLInputElement && control.type === 'checkbox') {
        control.checked = control.hasAttribute('data-multi') ? Array.isArray(value) && value.includes(control.value) : value === true;
      } else if ('value' in control && typeof value === 'string') /** @type {HTMLInputElement} */ (control).value = value;
    });
  }

  /** Wires input/change on every saved control (delegated). */
  function initFields() {
    document.addEventListener('input', (event) => {
      const control = /** @type {HTMLElement} */ (event.target);
      if (!control.matches?.('[data-field]')) return;
      if (control instanceof HTMLInputElement && (control.type === 'radio' || control.type === 'checkbox')) return;
      clearFieldError(control);
      setDraft(control.dataset.field || '', controlValue(/** @type {HTMLInputElement} */ (control)));
    });
    document.addEventListener('change', (event) => {
      const control = /** @type {HTMLElement} */ (event.target);
      if (!control.matches?.('[data-field]')) return;
      clearFieldError(control);
      const immediate = control instanceof HTMLSelectElement || control instanceof HTMLInputElement && (control.type === 'radio' || control.type === 'checkbox' || control.type === 'date');
      setDraft(control.dataset.field || '', controlValue(/** @type {HTMLInputElement} */ (control)), { now: immediate });
    });
  }

  /**
   * @param {string} rule "sNN.field=a|b"
   * @returns {boolean} true when the field currently has one of the values.
   */
  function conditionMet(rule) {
    const [path, values] = rule.split('=');
    const current = C.getField(store.state, path);
    const wanted = (values || '').split('|');
    return Array.isArray(current) ? current.some((v) => wanted.includes(v)) : wanted.includes(String(current ?? ''));
  }

  /**
   * Shows elements whose data-show-when matches the current drafts, and
   * elements whose data-show-when-any ("a=x;b=y") matches at least one rule.
   */
  function refreshConditionals() {
    $$('[data-show-when]').forEach((node) => { node.hidden = !conditionMet(node.dataset.showWhen || ''); });
    $$('[data-show-when-any]').forEach((node) => {
      node.hidden = !(node.dataset.showWhenAny || '').split(';').some(conditionMet);
    });
  }

  /** Renders self-review questions from data-review placeholders. */
  /** @param {ParentNode} [root] */
  function renderReviews(root = document) {
    $$('[data-review]', root).forEach((node) => {
      const path = node.dataset.review || '';
      const name = path.replace('.', '-');
      const legend = node.textContent.trim();
      const fieldset = h('fieldset', { class: 'review-q', dataset: { reviewGroup: path } }, [
        h('legend', { class: 'review-q-legend' }, legend),
        h('div', { class: 'review-scale' }, D.REVIEW_SCALE.map((opt) => h('label', { class: 'review-opt' }, [
          h('input', { type: 'radio', name, value: opt.id, dataset: { field: path } }),
          h('span', {}, opt.text),
        ]))),
      ]);
      node.replaceWith(fieldset);
    });
  }

  // ---------------------------------------------------------------------------
  // Validation messages for missing work
  // ---------------------------------------------------------------------------

  /** Messages for rule keys that are not plain fields. */
  const MISSING_TEXT = {
    'diagnostic.submit': 'أرسل إجاباتك عن بنود التشخيص.',
    'diagnostic.allAnswered': 'أجب عن جميع بنود التشخيص ثم اعرض التوجيه.',
    'diagnostic.report': 'افتح تقرير التشخيص.',
    's14.exampleOpened': 'اكتب محاولتك ثم افتح المثال للمقارنة.',
    's14.v2|s14.keepReason': 'لكل محك ناقص: اكتب نسختك المعدلة، أو سجّل سبب إبقائه للمراجعة.',
    's19.rows': 'أكمل محكًا واحدًا على الأقل: الوصف والدليل ورسالة العلاج والمحاولة التالية.',
    'project.version': 'احفظ نسخة من المشروع بعد إكمال المراجعة.',
    'test.attempt': 'أرسل محاولة الاختبار الختامي أولًا؛ هذه الخطوة تعتمد على تقريره.',
    'test.report': 'افتح تقرير نتيجتك في الشاشة 23.',
    'sources.card': 'أضف بطاقة مصدر واحدة على الأقل بحقولها المطلوبة.',
  };

  /** Screen key holding the work behind a non-field rule key (for "ما زال ناقصًا في"). */
  const MISSING_WHERE = {
    'diagnostic.submit': '02', 'diagnostic.allAnswered': '02', 'diagnostic.report': '02',
    's14.exampleOpened': '14', 's19.rows': '19', 'test.attempt': '21', 'test.report': '23', 'sources.card': '25-2',
  };

  /** @param {HTMLElement} control */
  function clearFieldError(control) {
    const wrap = control.closest('.field, .review-q, .check-part, [data-field-wrap]');
    if (!wrap) return;
    wrap.classList.remove('has-error');
    wrap.querySelector('.field-error')?.remove();
    $$('[aria-invalid="true"]', wrap).forEach((c) => c.removeAttribute('aria-invalid'));
  }

  /**
   * Marks a field as missing with a message linked through aria-describedby.
   * @param {string} path
   * @returns {HTMLElement|null} The control to focus.
   */
  function markFieldMissing(path) {
    const controls = $$(`[data-field="${CSS.escape(path)}"]`);
    if (!controls.length) return null;
    const first = controls[0];
    const wrap = first.closest('.field, .review-q, [data-field-wrap]') || first.parentElement;
    if (!wrap) return first;
    wrap.classList.add('has-error');
    if (!wrap.querySelector('.field-error')) {
      const errorId = `err-${path.replace('.', '-')}`;
      const message = first.dataset.requiredMsg || (wrap.matches('.review-q') ? 'اختر وصفًا لمراجعتك.' : 'هذا الحقل مطلوب لتسجيل الإنجاز.');
      wrap.append(h('p', { class: 'field-error', id: errorId }, message));
      controls.forEach((c) => {
        c.setAttribute('aria-invalid', 'true');
        const described = (c.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
        if (!described.includes(errorId)) c.setAttribute('aria-describedby', [...described, errorId].join(' '));
      });
    }
    return first;
  }

  // ---------------------------------------------------------------------------
  // Elements (completion is recorded only by an action that meets the rule)
  // ---------------------------------------------------------------------------

  /**
   * Records an element as complete with a snapshot of the work that met the
   * rule. Later edits never remove it; a resubmission adds a revision.
   * @param {string} id
   * @returns {boolean} Save result.
   */
  function recordElement(id) {
    const def = elementDef(id);
    if (!def) return false;
    const screenKey = `s${def.screen}`;
    const ok = store.update((st) => {
      const evidence = C.clone({ draft: st.drafts[screenKey] || {}, check: st.checks[screenKey] || null });
      const existing = st.elements[id];
      if (existing && existing.at) {
        existing.revisions = (existing.revisions || []).slice(-9);
        existing.revisions.push({ at: nowIso(), evidence });
      } else {
        st.elements[id] = { at: nowIso(), version: D.CONTENT_VERSION, screen: def.screen, evidence };
      }
    });
    renderProgress();
    return ok;
  }

  /**
   * Tries to complete an element; shows what is missing in the screen otherwise.
   * @param {string} id
   * @param {{silent?: boolean}} [options] silent: do not show missing fields (used after a check).
   * @returns {boolean} true when the element is (now) complete.
   */
  function tryComplete(id, { silent = false } = {}) {
    const def = elementDef(id);
    if (!def) return false;
    // The result line sits in the part where the element is recorded; its fields
    // may sit in earlier parts of the same document screen.
    const result = /** @type {HTMLElement|null} */ (document.querySelector(`[data-result="${id}"]`));
    const screen = /** @type {HTMLElement|null} */ (result?.closest('[data-screen]') || screenEl(def.screen));
    partsOf(def.screen).forEach((key) => {
      $$('.has-error', screenEl(key) || document).forEach((w) => {
        w.classList.remove('has-error');
        w.querySelector('.field-error')?.remove();
      });
    });
    // Parts not opened yet have no widgets; build them so their gaps can be marked.
    partsOf(def.screen).forEach((key) => buildScreen(screenEl(key)));
    /** Screen keys (other than this one) that hold missing work. */
    const elsewhere = new Set();
    const noteElsewhere = (node) => {
      const host = /** @type {HTMLElement|null} */ (node?.closest('[data-screen]') || null);
      if (host && host !== screen) elsewhere.add(host.dataset.screen || '');
    };
    const missing = C.missingForElement(id, store.state);
    if (missing.length) {
      if (silent) return false;
      let focusTarget = null;
      const notes = [];
      missing.forEach((key) => {
        if (key.startsWith('check:')) {
          notes.push('أجب عن سؤال التحقق حتى تصل إلى الإجابة الصحيحة.');
          const checkMount = document.querySelector(`[data-check="${key.slice(6)}"]`);
          noteElsewhere(checkMount);
          if (checkMount && checkMount.closest('[data-screen]') === screen) focusTarget = focusTarget || checkMount.querySelector('input, select');
          return;
        }
        if (MISSING_TEXT[key]) {
          notes.push(MISSING_TEXT[key]);
          if (MISSING_WHERE[key]) noteElsewhere(screenEl(MISSING_WHERE[key]));
          return;
        }
        const control = markFieldMissing(key);
        noteElsewhere(control);
        if (control && control.closest('[data-screen]') === screen) focusTarget = focusTarget || control;
      });
      if (result) {
        result.className = 'result is-missing';
        result.replaceChildren(notes.length ? `لم يُسجَّل بعد. ${[...new Set(notes)].join(' ')}` : 'لم يُسجَّل بعد. أكمل الحقول المشار إليها.');
        if (elsewhere.size) {
          result.append(' ما زال ناقصًا في: ', ...[...elsewhere].flatMap((key, k) => [k ? '، ' : '', h('a', { href: screenHref(key), class: 'inline-link' }, `الشاشة ${screenLabel(key)}`)]), '.');
        }
      }
      /** @type {HTMLElement|null} */ (focusTarget)?.focus();
      return false;
    }
    const wasDone = isDone(id);
    const saved = recordElement(id);
    if (result) {
      result.className = saved ? 'result is-done' : 'result is-missing';
      if (!saved) result.textContent = 'سُجّل عملك في هذه الصفحة لكن تعذر حفظه؛ راجع تنبيه الحفظ أعلى الصفحة.';
      else result.textContent = wasDone
        ? `حُفظت مراجعتك الجديدة. يبقى عنصر ${elementLabel(id)} مكتملًا، وسجله الأول محفوظ.`
        : `سُجّل عنصر ${elementLabel(id)} مكتملًا. يعني ذلك أنك نفذت نشاط الشاشة، لا حكمًا على جودة عملك.`;
    }
    document.dispatchEvent(new CustomEvent('bloom:element', { detail: { id } }));
    return true;
  }

  // ---------------------------------------------------------------------------
  // Practice checks (closed items with keys in course-data.js)
  // ---------------------------------------------------------------------------

  /** @param {string} checkId @param {string} partId */
  const partName = (checkId, partId) => `chk-${checkId}-${partId}`;

  /**
   * Renders a practice check into its placeholder.
   * @param {HTMLElement} mount
   */
  function renderCheck(mount) {
    const id = mount.dataset.check || '';
    const def = D.CHECKS[id];
    if (!def) return;
    const form = h('form', { class: 'check', novalidate: true, dataset: { checkForm: id } });
    def.parts.forEach((part) => {
      const name = partName(id, part.id);
      if (part.type === 'select') {
        const selectId = `${name}-select`;
        form.append(h('div', { class: 'check-part', dataset: { part: part.id } }, [
          h('label', { class: 'check-prompt', for: selectId }, part.prompt),
          h('select', { id: selectId, class: 'input', name }, [
            h('option', { value: '' }, 'اختر…'),
            ...part.options.map((o) => h('option', { value: o.id }, o.text)),
          ]),
          h('p', { class: 'part-hint', hidden: true }),
        ]));
      } else {
        form.append(h('fieldset', { class: 'check-part', dataset: { part: part.id } }, [
          h('legend', { class: 'check-prompt' }, part.prompt),
          h('div', { class: 'choice-list' }, part.options.map((o) => h('label', { class: 'choice' }, [
            h('input', { type: 'radio', name, value: o.id }),
            h('span', {}, o.text),
          ]))),
          h('p', { class: 'part-hint', hidden: true }),
        ]));
      }
    });
    form.append(
      h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, 'تحقق')),
      h('div', { class: 'feedback', role: 'status', hidden: true, dataset: { checkFeedback: id } }),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitCheck(id, form);
    });
    mount.append(form);
    restoreCheck(id, form);
  }

  /**
   * Reads the current answer of every part.
   * @param {string} id @param {HTMLFormElement} form
   * @returns {Record<string, string>}
   */
  function readCheck(id, form) {
    const answers = {};
    D.CHECKS[id].parts.forEach((part) => {
      const name = partName(id, part.id);
      if (part.type === 'select') answers[part.id] = /** @type {HTMLSelectElement} */ (form.querySelector(`select[name="${name}"]`)).value;
      else answers[part.id] = /** @type {HTMLInputElement|null} */ (form.querySelector(`input[name="${name}"]:checked`))?.value || '';
    });
    return answers;
  }

  /**
   * Paints a check from an attempt: locks correct parts, opens wrong ones with hints.
   * @param {string} id @param {HTMLFormElement} form
   * @param {{answers: Record<string,string>, correct: Record<string,boolean>, allCorrect: boolean}} attempt
   */
  function paintCheck(id, form, attempt) {
    const def = D.CHECKS[id];
    const messages = [];
    def.parts.forEach((part) => {
      const wrap = /** @type {HTMLElement} */ (form.querySelector(`[data-part="${part.id}"]`));
      const ok = !!attempt.correct[part.id];
      wrap.classList.toggle('is-correct', ok);
      wrap.classList.toggle('is-wrong', !ok);
      $$('input, select', wrap).forEach((c) => { /** @type {HTMLInputElement} */ (c).disabled = ok; });
      const hint = /** @type {HTMLElement} */ (wrap.querySelector('.part-hint'));
      const chosen = attempt.answers[part.id];
      const targeted = !ok && part.wrongBy && part.wrongBy[chosen];
      if (targeted && !messages.includes(targeted)) messages.push(targeted);
      hint.hidden = ok || !part.hint;
      hint.textContent = ok ? '' : part.hint || '';
      wrap.querySelector('.part-state')?.remove();
      wrap.prepend(h('span', { class: 'part-state' }, ok ? 'صحيح' : 'راجع هذا الجزء'));
    });
    const feedback = /** @type {HTMLElement} */ (form.querySelector('[data-check-feedback]'));
    feedback.hidden = false;
    feedback.className = `feedback ${attempt.allCorrect ? 'is-correct' : 'is-wrong'}`;
    feedback.replaceChildren();
    if (attempt.allCorrect) {
      feedback.append(h('p', { class: 'feedback-title' }, 'إجابة صحيحة.'), h('p', {}, def.feedback.correct));
      const submit = form.querySelector('button[type="submit"]');
      if (submit) /** @type {HTMLButtonElement} */ (submit).hidden = true;
    } else {
      feedback.append(h('p', { class: 'feedback-title' }, 'لم تكتمل الإجابة الصحيحة بعد.'));
      if (def.feedback.wrongHtml) {
        const p = h('p');
        p.innerHTML = def.feedback.wrongHtml; // authored constant from course-data.js, never learner input
        feedback.append(p);
      } else if (def.feedback.wrong) feedback.append(h('p', {}, def.feedback.wrong));
      messages.forEach((m) => feedback.append(h('p', {}, m)));
    }
  }

  /** @param {string} id @param {HTMLFormElement} form */
  function restoreCheck(id, form) {
    const record = store.state.checks[`${id}`];
    const last = record?.attempts?.[record.attempts.length - 1];
    if (!last) return;
    D.CHECKS[id].parts.forEach((part) => {
      const name = partName(id, part.id);
      const value = last.answers[part.id];
      if (part.type === 'select') /** @type {HTMLSelectElement} */ (form.querySelector(`select[name="${name}"]`)).value = value || '';
      else $$(`input[name="${name}"]`, form).forEach((r) => { /** @type {HTMLInputElement} */ (r).checked = /** @type {HTMLInputElement} */ (r).value === value; });
    });
    paintCheck(id, form, last);
  }

  /**
   * Scores a check, stores the attempt (the first attempt is never replaced)
   * and completes the element when its whole rule is met.
   * @param {string} id @param {HTMLFormElement} form
   */
  function submitCheck(id, form) {
    const def = D.CHECKS[id];
    const answers = readCheck(id, form);
    const record = store.state.checks[id];
    const lastCorrect = record?.attempts?.[record.attempts.length - 1]?.correct || {};
    const open = def.parts.filter((p) => !lastCorrect[p.id]);
    const unanswered = open.filter((p) => !answers[p.id]);
    const feedback = /** @type {HTMLElement} */ (form.querySelector('[data-check-feedback]'));
    if (unanswered.length) {
      feedback.hidden = false;
      feedback.className = 'feedback is-wrong';
      feedback.replaceChildren(h('p', {}, 'أجب عن جميع الأجزاء قبل التحقق.'));
      const first = form.querySelector(`[data-part="${unanswered[0].id}"] input, [data-part="${unanswered[0].id}"] select`);
      /** @type {HTMLElement|null} */ (first)?.focus();
      return;
    }
    const correct = Object.fromEntries(def.parts.map((p) => [p.id, answers[p.id] === p.answer]));
    const allCorrect = def.parts.every((p) => correct[p.id]);
    const attempt = { answers, correct, allCorrect, at: nowIso() };
    store.update((st) => {
      const rec = st.checks[id] || { attempts: [], solvedAt: null };
      rec.attempts.push(attempt);
      if (allCorrect && !rec.solvedAt) rec.solvedAt = attempt.at;
      st.checks[id] = rec;
    });
    paintCheck(id, form, attempt);
    feedback.focus?.();
    if (allCorrect && def.element) {
      // Completes at once when the check is the whole rule (e.g. t03); otherwise waits for "سجّل عملي".
      if (tryComplete(def.element, { silent: true })) {
        feedback.append(h('p', { class: 'feedback-note' }, `سُجّل عنصر ${elementLabel(def.element)} مكتملًا.`));
      } else {
        // The element needs another check on a later part (screen 13): say where.
        const parts = C.missingForElement(def.element, store.state)
          .filter((k) => k.startsWith('check:'))
          .map((k) => /** @type {HTMLElement|null} */ (document.querySelector(`[data-check="${k.slice(6)}"]`)?.closest('[data-screen]') || null))
          .filter((sc) => sc && sc !== form.closest('[data-screen]'));
        if (parts.length) {
          feedback.append(h('p', { class: 'feedback-note' }, [`يكتمل عنصر ${elementLabel(def.element)} بعد سؤال التحقق في `,
            ...parts.flatMap((sc, k) => [k ? '، ' : '', h('a', { href: `#${sc.id}`, class: 'inline-link' }, `الشاشة ${screenLabel(sc.dataset.screen || '')}`)]), '.']));
        }
      }
    }
    renderProgress();
  }

  // ---------------------------------------------------------------------------
  // Screen navigation footers and "save and stop"
  // ---------------------------------------------------------------------------

  /** Adds element status, previous/next links and the save buttons to every screen. */
  /** @param {ParentNode} [root] */
  function buildScreenFooters(root = document) {
    $$('[data-screen]', root).concat(root instanceof HTMLElement && root.matches('[data-screen]') ? [root] : []).forEach((screen) => {
      const n = screen.dataset.screen || '';
      const i = SCREEN_ORDER.indexOf(n);
      const prev = SCREEN_ORDER[i - 1];
      // A document-level "next" (e.g. 20 -> 21) applies after the screen's last part.
      const parts = partsOf(groupOfKey(n));
      const isLastPart = parts[parts.length - 1] === n;
      const next = (isLastPart && D.NEXT_OVERRIDES[groupOfKey(n)]) || SCREEN_ORDER[i + 1];
      const stopPanel = h('div', { class: 'stop-panel', role: 'status', hidden: true, dataset: { stopPanel: n } });
      const nav = h('nav', { class: 'screen-nav', 'aria-label': `التنقل من الشاشة ${screenLabel(n)}` }, [
        prev ? h('a', { href: screenHref(prev), class: 'btn btn-ghost', rel: 'prev' }, `السابق: ${screenLabel(prev)}`) : h('span'),
        h('div', { class: 'screen-nav-save' }, [
          h('button', { type: 'button', class: 'btn btn-secondary', dataset: { action: 'save-draft' } }, 'احفظ المسودة'),
          h('button', { type: 'button', class: 'btn btn-secondary', dataset: { action: 'save-stop', stopScreen: n } }, 'احفظ وتوقف'),
        ]),
        next ? h('a', { href: screenHref(next), class: 'btn btn-primary', rel: 'next' }, `التالي: ${screenLabel(next)}`) : h('a', { href: '#dashboard', class: 'btn btn-primary' }, 'لوحتي'),
      ]);
      screen.append(h('div', { class: 'screen-foot' }, [nav, stopPanel]));
    });
  }

  /** @param {string} n Screen number. */
  function saveAndStop(n) {
    const ok = flushSave() && store.update((st) => { st.position = { screen: n, at: nowIso() }; });
    const panel = document.querySelector(`[data-stop-panel="${n}"]`);
    if (!panel) return;
    panel.hidden = false;
    panel.className = `stop-panel ${ok ? 'is-ok' : 'is-failed'}`;
    panel.replaceChildren(
      h('p', { class: 'stop-title' }, ok ? `حُفظ عملك في هذا المتصفح الساعة ${fmtTime(store.status.at)}.` : 'لم يُحفظ عملك.'),
      h('p', {}, ok
        ? 'للعودة: افتح الموقع على هذا الجهاز وفي المتصفح نفسه، ثم اختر «تابع تعلمي» من البوابة. مسح بيانات المتصفح أو استخدام جهاز آخر لا ينقل عملك؛ صدّر نسخة احتياطية إن احتجت.'
        : D.MESSAGES.saveFailed),
      h('p', { class: 'stop-links' }, [
        h('a', { href: '#save-help', class: 'inline-link' }, 'تصدير نسخة احتياطية'),
        ' · ',
        h('a', { href: 'index.html', class: 'inline-link', dataset: { leave: '' } }, 'العودة إلى البوابة'),
      ]),
    );
    /** @type {HTMLElement} */ (panel).setAttribute('tabindex', '-1');
    /** @type {HTMLElement} */ (panel).focus();
  }

  // ---------------------------------------------------------------------------
  // Progress: drawer, steppers, element badges
  // ---------------------------------------------------------------------------

  const ELEMENT_IDS = D.ELEMENTS.map((e) => e.id);

  /** @returns {ReturnType<typeof C.evaluatePass>} */
  function passState() {
    const approved = C.selectApprovedScore(store.state.test.attempts, C.RETAKE_POLICY);
    return C.evaluatePass({
      completed: C.countCompleted(store.state, ELEMENT_IDS),
      total: ELEMENT_IDS.length,
      approvedScore: approved.score,
      contentThreshold: D.PASS_RULE.contentThreshold,
      scoreThreshold: D.PASS_RULE.scoreThreshold,
    });
  }

  /** Repaints every progress indicator from the saved elements. */
  function renderProgress() {
    const pass = passState();
    const percent = pass.content.percent;
    const label = byId('progress-percent');
    if (label) label.textContent = pct(percent);
    byId('progress-bar')?.setAttribute('aria-valuenow', String(percent));
    const fill = byId('progress-fill');
    if (fill) fill.style.width = `${percent}%`;
    const topFill = byId('topbar-progress-fill');
    if (topFill) topFill.style.width = `${percent}%`;
    const testLine = byId('progress-test');
    if (testLine) testLine.textContent = pass.testTaken ? `الاختبار: ${pass.score} من 100` : 'الاختبار: لم تُرسل محاولة';

    $$('[data-lesson-link]').forEach((link) => {
      const unit = /** @type {HTMLAnchorElement} */ (link).hash.slice(1);
      const ids = D.ELEMENTS.filter((e) => unitOf(e.screen) === unit).map((e) => e.id);
      const done = ids.filter(isDone).length;
      const meta = link.querySelector('[data-unit-meta]');
      if (meta) meta.textContent = ids.length ? `${done} من ${ids.length} عناصر` : 'لا عناصر محتسبة';
      const all = ids.length > 0 && done === ids.length;
      link.toggleAttribute('data-complete', all);
      const sr = link.querySelector('[data-status-text]');
      if (sr) sr.textContent = all ? ' (عناصرها مكتملة)' : '';
    });
    $$('[data-step-link]').forEach((link) => {
      const el = elementForScreen(link.dataset.stepLink || '');
      const done = !!el && isDone(el);
      link.toggleAttribute('data-done', done);
      const sr = link.querySelector('[data-step-state]');
      if (sr) sr.textContent = done ? ' (عنصر مكتمل)' : '';
    });
    $$('[data-element-status]').forEach((node) => {
      const id = node.dataset.elementStatus || '';
      const rec = store.state.elements[id];
      node.classList.toggle('is-done', !!rec?.at);
      node.textContent = rec?.at
        ? `عنصر ${elementLabel(id)} مكتمل منذ ${fmtDateTime(rec.at)}`
        : `عنصر ${elementLabel(id)} لم يكتمل بعد: ${elementDef(id)?.condition || ''}`;
    });
    $$('[data-no-element]').forEach((node) => {
      node.textContent = 'لا تضيف هذه الشاشة عنصر استكمال؛ تساعدك على التنظيم والمتابعة.';
    });
    renderDashboard();
  }

  // ---------------------------------------------------------------------------
  // Dashboard (#dashboard) and save help (#save-help)
  // ---------------------------------------------------------------------------

  /** Text for the overall pass status (screen 23 wording). @param {ReturnType<typeof passState>} pass */
  function passSummary(pass) {
    if (pass.status === 'passed') return D.MESSAGES.passed;
    if (pass.status === 'content-only') {
      return pass.testTaken
        ? `اكتمل شرط المحتوى. يتبقى تحقيق 60 من 100 فأكثر في الاختبار الختامي؛ درجتك الحالية ${pass.score}.`
        : D.MESSAGES.contentOnly;
    }
    if (pass.status === 'score-only') {
      return `${D.MESSAGES.scoreOnly} أكملت ${pass.content.completed} من ${pass.content.total} عنصرًا (${pct(pass.content.percent)})، ويلزم ${pass.content.remaining} عنصر إضافي على الأقل.`;
    }
    const parts = [`المحتوى: ${pct(pass.content.percent)} (يلزم ${pct(80)} على الأقل، أي ${pass.content.remaining} عنصر إضافي).`];
    parts.push(pass.testTaken ? `الاختبار: ${pass.score} من 100 (يلزم 60 فأكثر).` : 'الاختبار: لم تُرسل محاولة بعد (يلزم 60 من 100 فأكثر).');
    return `لم يكتمل شرطا الاجتياز بعد. ${parts.join(' ')}`;
  }

  /** @returns {string} Learner-facing status of the trial/application record. */
  function applicationStatus() {
    const trials = store.state.trials || [];
    if (trials.some((t) => t.type === 'class')) return 'وُثّق تطبيق صفي.';
    if (trials.some((t) => t.type === 'sim')) return 'وُثّقت محاكاة؛ لا تُعد دليلًا على تعلم طلاب حقيقيين.';
    if (isDone('t20')) return 'خطة التجربة جاهزة؛ لم يُسجَّل تطبيق بعد.';
    return 'لم تُسجَّل خطة تجربة بعد.';
  }

  /** Renders the dashboard sections that depend on saved data. */
  function renderDashboard() {
    const root = byId('dashboard');
    if (!root) return;
    const pass = passState();

    const cond = byId('dash-conditions');
    if (cond) {
      cond.replaceChildren(
        h('div', { class: `cond ${pass.content.met ? 'is-met' : ''}` }, [
          h('p', { class: 'cond-label' }, 'شرط المحتوى (80% فأكثر)'),
          h('p', { class: 'cond-value' }, pct(pass.content.percent)),
          h('p', { class: 'cond-note' }, `${pass.content.completed} من ${pass.content.total} عنصرًا · ${pass.content.met ? 'متحقق' : `يلزم ${pass.content.remaining} عنصر إضافي`}`),
        ]),
        h('div', { class: `cond ${pass.scoreMet ? 'is-met' : ''}` }, [
          h('p', { class: 'cond-label' }, 'شرط الاختبار (60 من 100 فأكثر)'),
          h('p', { class: 'cond-value' }, pass.testTaken ? `${pass.score}` : '—'),
          h('p', { class: 'cond-note' }, pass.testTaken ? (pass.scoreMet ? 'متحقق' : `ينقص ${pass.scoreGap} درجة`) : 'لم تُرسل محاولة'),
        ]),
      );
    }
    const summary = byId('dash-summary');
    if (summary) {
      summary.textContent = passSummary(pass);
      summary.className = `dash-summary ${pass.passed ? 'is-passed' : ''}`;
    }

    const next = byId('dash-next');
    if (next) {
      const n = C.suggestNextScreen(store.state, D.RECOMMENDED_PATH, D.ELEMENTS);
      next.replaceChildren(h('a', { href: screenHref(n), class: 'btn btn-primary' }, `الخطوة المقترحة: الشاشة ${n} — ${screenTitle(n)}`));
    }

    const list = byId('dash-elements');
    if (list) {
      const groups = [];
      $$('[data-lesson]').forEach((lesson) => {
        const ids = D.ELEMENTS.filter((e) => unitOf(e.screen) === lesson.id);
        if (!ids.length) return;
        groups.push(h('li', { class: 'dash-unit' }, [
          h('p', { class: 'dash-unit-title' }, lesson.querySelector('.lesson-title')?.textContent.trim() || lesson.id),
          h('ul', { class: 'dash-items' }, ids.map((e) => h('li', { class: `dash-item ${isDone(e.id) ? 'is-done' : ''}` }, [
            h('span', { class: 'dash-item-state' }, isDone(e.id) ? 'مكتمل' : 'لم يكتمل'),
            h('span', {}, [screenLink(e.screen, `${elementLabel(e.id)} · الشاشة ${e.screen}: ${screenTitle(e.screen)}`), h('span', { class: 'dash-item-cond' }, e.condition)]),
          ]))),
        ]));
      });
      list.replaceChildren(...groups);
    }

    const project = byId('dash-project');
    if (project) {
      const versions = store.state.project.versions || [];
      const last = versions[versions.length - 1];
      project.replaceChildren(
        h('li', {}, [h('strong', {}, 'نسخة المشروع: '), last ? `${last.label} (${fmtDateTime(last.at)})` : 'لم تُحفظ نسخة بعد.']),
        h('li', {}, [h('strong', {}, 'المراجعة الذاتية: '), last?.review ? 'مكتملة لهذه النسخة. المراجعة الذاتية ليست تقييمًا خارجيًا.' : 'لم تكتمل بعد.']),
        h('li', {}, [h('strong', {}, 'التطبيق الفعلي: '), applicationStatus()]),
      );
    }

    const review = byId('dash-review');
    if (review) {
      const screens = reviewList();
      review.replaceChildren(...(screens.length
        ? screens.map((n) => h('li', {}, screenLink(n)))
        : [h('li', {}, 'لا توجد مواضع مراجعة مسجلة. تظهر هنا بعد التشخيص أو الاختبار.')]));
    }

    const saveInfo = byId('save-info');
    if (saveInfo) {
      const st = store.status;
      saveInfo.textContent = !st.available
        ? 'هذا المتصفح يمنع الحفظ المحلي الآن؛ لن يبقى عملك بعد إغلاق الصفحة.'
        : st.at ? `آخر حفظ ناجح: ${fmtDateTime(st.at)}.` : 'لم يُحفظ عمل بعد.';
    }
    const legacyNote = byId('legacy-note');
    if (legacyNote) {
      const legacy = store.state.legacy;
      legacyNote.hidden = !legacy;
      if (legacy) {
        legacyNote.textContent = `نقلنا بيانات من النسخة السابقة من الموقع في ${fmtDateTime(legacy.importedAt)} دون حذفها من متصفحك. علامات «مكتمل» القديمة كانت تُمنح عند الوصول إلى نهاية الدرس، لذلك لا تُحتسب ضمن عناصر الاستكمال.`;
      }
    }
  }

  /**
   * Screens the learner should review: wrong diagnostic items, then wrong test
   * items, without duplicates. Screens whose element is complete stay listed
   * (review is about understanding, not about the counter) but are marked.
   * @returns {string[]}
   */
  function reviewList() {
    const out = [];
    const add = (n) => { if (n && !out.includes(n)) out.push(n); };
    const diag = store.state.diagnostic.attempts;
    const lastDiag = diag[diag.length - 1];
    if (lastDiag) C.diagnosticReview(D.DIAGNOSTIC, lastDiag.answers).reviewScreens.forEach(add);
    const lastTest = store.state.test.attempts[store.state.test.attempts.length - 1];
    if (lastTest?.review) lastTest.review.forEach(add);
    return out;
  }

  /** Export: downloads a JSON backup of the record. */
  function exportBackup() {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `bloom-learning-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const status = byId('backup-status');
    if (status) status.textContent = 'أُنشئ ملف النسخة الاحتياطية. احفظه في موضع تعرفه؛ يمكنك استيراده في هذا المتصفح أو غيره.';
  }

  /** Import: validates the chosen file, shows what it contains and asks before replacing. */
  function importBackup(file) {
    const status = byId('backup-status');
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = store.parseImport(String(reader.result || ''));
      if (!parsed.ok) {
        if (status) status.textContent = parsed.reason === 'json' ? 'تعذرت قراءة الملف؛ ليس ملف نسخة احتياطية صالحًا.' : 'هذا الملف ليس نسخة احتياطية من هذا الموقع.';
        return;
      }
      const done = Object.values(parsed.data.elements || {}).filter((e) => e && e.at).length;
      const message = `يحتوي الملف على ${done} عنصرًا مكتملًا و${(parsed.data.project.versions || []).length} نسخة مشروع${parsed.exportedAt ? `، صُدّر في ${fmtDateTime(parsed.exportedAt)}` : ''}. سيحل محل العمل المحفوظ في هذا المتصفح، مع الاحتفاظ بنسخة من الحالي. هل تريد المتابعة؟`;
      if (!window.confirm(message)) {
        if (status) status.textContent = 'أُلغي الاستيراد؛ لم يتغير شيء.';
        return;
      }
      if (store.applyImport(parsed.data)) {
        if (status) status.textContent = 'استُورد عملك. ستُعاد الصفحة لعرضه.';
        setTimeout(() => window.location.reload(), 600);
      } else if (status) status.textContent = 'تعذر حفظ البيانات المستوردة؛ بقي عملك السابق كما هو.';
    };
    reader.onerror = () => { if (status) status.textContent = 'تعذرت قراءة الملف.'; };
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------------------
  // Leaving with unsaved work
  // ---------------------------------------------------------------------------

  /** @type {string|null} */
  let pendingLeave = null;

  /**
   * Intercepts links that leave the page while the last change is not saved.
   * @param {MouseEvent} event @param {HTMLAnchorElement} link
   */
  function guardLeave(event, link) {
    if (flushSave()) return;
    const dialog = /** @type {HTMLDialogElement|null} */ (byId('unsaved-dialog'));
    if (!dialog || typeof dialog.showModal !== 'function') return;
    event.preventDefault();
    pendingLeave = link.href;
    dialog.showModal();
  }

  function initLeaveGuard() {
    window.addEventListener('beforeunload', (event) => {
      if (!store.status.dirty) return;
      if (flushSave()) return;
      event.preventDefault();
      event.returnValue = '';
    });
    const dialog = /** @type {HTMLDialogElement|null} */ (byId('unsaved-dialog'));
    dialog?.addEventListener('click', (event) => {
      const action = /** @type {HTMLElement} */ (event.target).closest('[data-unsaved]')?.getAttribute('data-unsaved');
      if (!action) return;
      if (action === 'save') {
        if (flushSave()) {
          dialog.close();
          if (pendingLeave) window.location.href = pendingLeave;
        } else {
          const msg = byId('unsaved-msg');
          if (msg) msg.textContent = 'ما زال الحفظ متعذرًا. انسخ نصك قبل المغادرة.';
        }
      } else if (action === 'stay') {
        dialog.close();
      } else if (action === 'leave') {
        if (window.confirm('ستفقد التعديل غير المحفوظ. هل تغادر فعلًا؟')) {
          dialog.close();
          if (pendingLeave) window.location.href = pendingLeave;
        }
      }
    });
  }

  /** Copies the visible text of the current screen's fields to the clipboard. */
  async function copyWork() {
    const screen = $$('[data-screen]').find((s) => !s.hidden && !s.closest('[hidden]'));
    const lines = [];
    $$('textarea[data-field], input[type="text"][data-field]', screen || document).forEach((c) => {
      const value = /** @type {HTMLInputElement} */ (c).value.trim();
      if (!value) return;
      const label = (c.id && document.querySelector(`label[for="${CSS.escape(c.id)}"]`)?.textContent.trim()) || c.dataset.field;
      lines.push(`${label}:\n${value}`);
    });
    const text = lines.join('\n\n') || 'لا يوجد نص في هذه الشاشة.';
    try {
      await navigator.clipboard.writeText(text);
      appStatus('نُسخ نص هذه الشاشة. الصقه في مستند خارجي.');
    } catch {
      appStatus('تعذر النسخ التلقائي. حدد النص في الحقول وانسخه يدويًا.');
    }
  }

  // ---------------------------------------------------------------------------
  // Screen-specific behaviour (registered by screen number)
  // ---------------------------------------------------------------------------

  /** @type {Record<string, (screen: HTMLElement) => void>} */
  const screenInits = {};
  /** @type {Record<string, (target: HTMLElement) => void>} */
  const actions = {
    complete: (target) => tryComplete(target.dataset.element || ''),
    'save-draft': () => {
      const ok = store.save();
      appStatus(ok ? `${D.MESSAGES.saved} (${fmtTime(store.status.at)})` : D.MESSAGES.saveFailed);
    },
    'save-stop': (target) => saveAndStop(target.dataset.stopScreen || ''),
    'retry-save': () => { store.save(); },
    'copy-work': () => { copyWork(); },
    export: () => exportBackup(),
  };

  // ---------------------------------------------------------------------------
  // Shared widgets built from data before values are restored
  // ---------------------------------------------------------------------------

  /** Fills <select data-level-options> with the six processes. */
  function renderLevelOptions() {
    $$('select[data-level-options]').forEach((select) => {
      select.replaceChildren(h('option', { value: '' }, 'اختر…'), ...D.LEVELS.map((l) => h('option', { value: l.id }, l.text)));
    });
    $$('select[data-copy-options]').forEach((select) => {
      const source = byId(select.dataset.copyOptions || '');
      if (source) select.replaceChildren(...[...source.querySelectorAll('option')].map((o) => o.cloneNode(true)));
    });
  }

  /** Screen 16: deficit choices, each with its message and next step (sec. 15). */
  /** @param {ParentNode} [root] */
  function renderDeficits(root = document) {
    $$('[data-deficits]', root).forEach((holder) => {
      D.DEFICITS.forEach((d) => {
        holder.append(
          h('label', { class: 'choice' }, [h('input', { type: 'checkbox', value: d.id, dataset: { field: 's16.deficits', multi: '' } }), h('span', {}, d.text)]),
          h('div', { class: 'feedback', hidden: true, dataset: { showWhen: `s16.deficits=${d.id}` } }, [
            h('p', {}, d.message), h('p', {}, screenLink(d.link)),
          ]),
        );
      });
    });
  }

  /** Screen 20: the seven-criterion rubric as one fieldset per criterion (readable on phones). */
  /** @param {ParentNode} [root] */
  function renderRubric(root = document) {
    $$('[data-rubric]', root).forEach((holder) => renderRubricInto(holder));
  }

  /** @param {HTMLElement} holder Mount whose data-rubric lists the criterion ids to show. */
  function renderRubricInto(holder) {
    const ids = (holder.dataset.rubric || '').split(/\s+/).filter(Boolean);
    D.RUBRIC.filter((c) => !ids.length || ids.includes(c.id)).forEach((c) => {
      const name = `s20-level-${c.id}`;
      const evidenceId = `s20-evidence-${c.id}`;
      holder.append(h('fieldset', { class: 'rubric-item', dataset: { fieldWrap: '' } }, [
        h('legend', { class: 'rubric-name' }, c.name),
        h('div', { class: 'choice-list' }, D.RUBRIC_LEVELS.map((lv) => h('label', { class: 'choice' }, [
          h('input', { type: 'radio', name, value: lv.id, dataset: { field: `s20.level_${c.id}` } }),
          h('span', {}, [h('strong', {}, lv.text), lv.id === 'na' ? ': مع ذكر السبب في حقل الشاهد.' : `: ${c[lv.id]}`]),
        ]))),
        h('div', { class: 'field' }, [
          h('label', { class: 'field-label', for: evidenceId }, 'الشاهد من عملك (أو سبب «لا ينطبق»)'),
          h('textarea', { id: evidenceId, class: 'input', dataset: { field: `s20.evidence_${c.id}` } }),
        ]),
      ]));
    });
  }

  /**
   * Copies an earlier answer into an empty field so the learner does not type it
   * twice (sec. 7 production note). Only fills empty fields, once, and says so.
   * @param {HTMLElement} screen
   */
  function applyPrefill(screen) {
    $$('[data-prefill-from]', screen).forEach((control) => {
      const path = control.dataset.field || '';
      if (!C.isBlank(C.getField(store.state, path))) return;
      const sources = (control.dataset.prefillFrom || '').split('|');
      const from = sources.find((src) => !C.isBlank(C.getField(store.state, src)) && typeof C.getField(store.state, src) === 'string');
      if (!from) return;
      const value = C.getField(store.state, from);
      /** @type {HTMLInputElement} */ (control).value = value;
      setDraft(path, value);
      const wrap = control.closest('.field');
      if (wrap && !wrap.querySelector('.prefill-note')) {
        wrap.append(h('p', { class: 'field-hint prefill-note' }, `استُعيد من إجابتك في الشاشة ${from.slice(1, 3)}؛ عدّله إن احتجت.`));
      }
    });
  }

  /** Read-only view of what the previous site saved, on screens 03 and 17. */
  function renderLegacyPanels() {
    const legacy = store.state.legacy;
    const draft = legacy?.lessonDraft || {};
    const reflections = legacy?.reflections || {};
    const labels = {
      'lt-teacher-name': 'اسم المعلم', 'lt-subject': 'المادة', 'lt-lesson-title': 'عنوان الدرس', 'lt-original-goal': 'الهدف التقليدي',
      'lt-level1': 'المستوى 1', 'lt-task1': 'المهمة 1', 'lt-tool1': 'الأداة 1', 'lt-level2': 'المستوى 2', 'lt-task2': 'المهمة 2', 'lt-tool2': 'الأداة 2',
      'lt-level3': 'المستوى 3', 'lt-task3': 'المهمة 3', 'lt-tool3': 'الأداة 3', 'lt-justification': 'التبرير',
      'reflection-ws1': 'تأمل الورشة 1', 'reflection-ws2': 'تأمل الورشة 2', 'reflection-ws3': 'تأمل الورشة 3',
    };
    const rows = Object.entries({ ...draft, ...reflections }).filter(([, v]) => typeof v === 'string' && v.trim());
    $$('[data-legacy-panel]').forEach((panel) => {
      panel.hidden = !rows.length;
      if (!rows.length) return;
      panel.replaceChildren(
        h('p', { class: 'feedback-title' }, 'عملك المحفوظ من النسخة السابقة (للقراءة والنسخ)'),
        h('p', { class: 'field-hint' }, 'نُقل من متصفحك دون حذف. انسخ منه ما يفيدك إلى الحقول؛ لا يُحتسب ضمن العناصر.'),
        h('dl', { class: 'legacy-list' }, rows.flatMap(([k, v]) => [h('dt', {}, labels[k] || k), h('dd', {}, v)])),
      );
    });
  }

  /** Lists dated revisions: the need card (element t02) or the plan history. */
  function renderHistories() {
    $$('[data-history]').forEach((holder) => {
      const kind = holder.dataset.history;
      let items = [];
      if (kind === 'needCard') {
        const rec = store.state.elements.t02;
        if (rec?.at) items = [`سُجلت البطاقة المرجعية في ${fmtDateTime(rec.at)}.`, ...(rec.revisions || []).map((r) => `عُدلت في ${fmtDateTime(r.at)} (حُفظت النسخة السابقة).`)];
      } else if (kind === 'plan') {
        items = store.state.history.plan.map((p) => `${fmtDateTime(p.at)}: ${p.kept ? 'راجعت الخطة دون تعديل' : `الأولوية ${priorityText(p.priority)}؛ الخطوة: ${p.step}؛ العودة: ${p.return}`}${p.reason ? ` — السبب: ${p.reason}` : ''}`);
      }
      holder.replaceChildren(...(items.length ? [h('h4', { class: 'section-title' }, 'سجل التعديلات'), h('ul', { class: 'dash-list prose' }, items.map((t) => h('li', {}, t)))] : []));
    });
  }

  /** @param {string} id e.g. "n2" @returns {string} */
  function priorityText(id) {
    const option = byId('s10-priority')?.querySelector(`option[value="${CSS.escape(id || '')}"]`);
    return option ? option.textContent.trim() : (id || '—');
  }

  // ---------------------------------------------------------------------------
  // Screen 02: diagnostic (never part of the pass decision) and save self-test
  // ---------------------------------------------------------------------------

  /** @param {ParentNode} [root] */
  function renderDiagnostic(root = document) {
    const mount = root.querySelector('[data-diagnostic]');
    if (!mount) return;
    const form = h('form', { class: 'check', novalidate: true, id: 'diagnostic-form' });
    const list = h('div', { id: 'diag-items' });
    form.append(list);
    D.DIAGNOSTIC.forEach((item, i) => {
      list.append(h('fieldset', { class: 'check-part', id: `diag-${item.id}`, dataset: { fieldWrap: '' } }, [
        h('legend', { class: 'check-prompt' }, `ق${i + 1}. ${item.stem}${item.hint ? ` ${item.hint}` : ''}`),
        h('div', { class: 'choice-list' }, item.options.map((o) => h('label', { class: 'choice' }, [
          h('input', { type: 'radio', name: `s02-${item.id}`, value: o.id, dataset: { field: `s02.${item.id}` } }),
          h('span', {}, o.text),
        ]))),
      ]));
    });
    const submitBar = h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'btn btn-primary', id: 'diag-submit' }, 'اعرض التوجيه'));
    form.append(h('p', { id: 'diag-warning', class: 'result is-missing', role: 'alert' }), submitBar);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitDiagnostic(form);
    });
    mount.append(form);
    diagPager = paginate(list, { perPage: PAGE_SIZE.diagnostic, label: 'بنود التشخيص', lastOnly: [submitBar] });
  }

  /** Items per page in generated lists (keeps screens of comparable length). */
  const PAGE_SIZE = { diagnostic: 2, diagnosticReport: 2, test: 2, testReport: 3 };
  /** @type {ReturnType<typeof paginate>|null} */
  let diagPager = null;
  /** @type {ReturnType<typeof paginate>|null} */
  let testPager = null;

  /** @param {HTMLFormElement} form */
  function submitDiagnostic(form) {
    const answers = Object.fromEntries(D.DIAGNOSTIC.map((q) => [q.id, C.getField(store.state, `s02.${q.id}`) || '']));
    const empty = D.DIAGNOSTIC.map((q, i) => ({ q, i })).filter(({ q }) => !answers[q.id]);
    const warning = byId('diag-warning');
    if (empty.length && form.dataset.warned !== '1') {
      form.dataset.warned = '1';
      if (warning) warning.textContent = `لم تُجب عن: ${empty.map(({ i }) => `ق${i + 1}`).join('، ')}. أجب عنها، أو أرسل كما هي؛ لن يكتمل عنصر التشخيص إلا بالإجابة عن جميع البنود.`;
      const button = byId('diag-submit');
      if (button) button.textContent = 'أرسل رغم البنود الفارغة';
      const firstEmpty = byId(`diag-${empty[0].q.id}`);
      diagPager?.showItem(firstEmpty);
      /** @type {HTMLElement|null} */ (firstEmpty?.querySelector('input'))?.focus();
      return;
    }
    store.update((st) => {
      st.diagnostic.attempts.push({ items: D.DIAGNOSTIC.map((q) => q.id), answers, submittedAt: nowIso(), reportViewedAt: null });
    });
    form.dataset.warned = '';
    if (warning) warning.textContent = '';
    showDiagnosticReport({ focus: true });
  }

  /** Renders the report of the last attempt and records that it was opened. */
  function showDiagnosticReport({ focus = false } = {}) {
    const report = byId('diagnostic-report');
    const form = byId('diagnostic-form');
    const attempts = store.state.diagnostic.attempts;
    const last = attempts[attempts.length - 1];
    if (!report || !last) return;
    const { results, reviewScreens } = C.diagnosticReview(D.DIAGNOSTIC, last.answers);
    const items = D.DIAGNOSTIC.map((q, i) => {
      const r = results[i];
      const chosen = q.options.find((o) => o.id === last.answers[q.id]);
      const right = q.options.find((o) => o.id === q.answer);
      const state = !r.answered ? 'لم تُجب' : r.correct ? 'إجابتك صحيحة' : 'تحتاج مراجعة';
      return h('li', { class: `diag-item ${r.correct ? 'is-correct' : 'is-wrong'}` }, [
        h('p', { class: 'diag-head' }, [h('span', { class: 'part-state' }, state), ` ق${i + 1}. ${q.stem}`]),
        r.answered ? h('p', {}, `اخترت: ${chosen ? chosen.text : '—'}`) : null,
        r.correct ? null : h('p', {}, `الإجابة الأنسب: ${right ? right.text : ''}`),
        h('p', {}, `التفسير: ${q.explain}`),
        r.correct
          ? h('p', {}, h('a', { href: screenHref(q.review[0]), class: 'inline-link' }, `أريد مثالًا آخر (الشاشة ${q.review[0]})`))
          : h('p', {}, ['راجع: ', ...q.review.flatMap((n, k) => [k ? '، ثم ' : '', screenLink(n)])]),
      ]);
    });
    const list = h('ol', { class: 'diag-list', id: 'diag-report-list' }, items);
    const closing = h('div', {}, [
      h('h4', { class: 'section-title' }, 'أحتاج أن أراجع'),
      reviewScreens.length
        ? h('ul', { class: 'dash-list prose' }, reviewScreens.map((n) => h('li', {}, screenLink(n))))
        : h('p', {}, 'لا مواضع مراجعة من هذا التشخيص. اختر الخطوة التي تناسبك في الشاشة 04.'),
      h('div', { class: 'actions' }, [
        h('a', { href: '#screen-04', class: 'btn btn-primary' }, 'التالي: مساري ونقطة العودة'),
        h('button', { type: 'button', class: 'btn btn-secondary', dataset: { action: 'diag-again' } }, 'أجب مرة أخرى'),
      ]),
    ]);
    report.replaceChildren(
      h('h4', { class: 'section-title' }, 'تقرير التشخيص'),
      h('p', { class: 'field-hint' }, `أُرسل في ${fmtDateTime(last.submittedAt)}. هذا التقرير يوجه مراجعتك، ولا يقيس مستواك قياسًا شاملًا، ولا يدخل في درجة الاجتياز ولا يعفيك من قاعدة الاستكمال.`),
      list,
      closing,
    );
    paginate(list, { perPage: PAGE_SIZE.diagnosticReport, lastPage: 1, label: 'تقرير التشخيص', lastOnly: [closing] });
    report.hidden = false;
    if (form) form.hidden = true;
    if (!last.reportViewedAt) {
      store.update((st) => { st.diagnostic.attempts[st.diagnostic.attempts.length - 1].reportViewedAt = nowIso(); });
      if (tryComplete('t01', { silent: true })) report.prepend(h('p', { class: 'result is-done' }, `سُجّل عنصر ${elementLabel('t01')} مكتملًا.`));
    }
    renderProgress();
    if (focus) report.focus();
  }

  // ---------------------------------------------------------------------------
  // Screens 09–12: goal draft, plan and plan revisions
  // ---------------------------------------------------------------------------

  /** Builds a draft sentence from the three goal parts, asking before replacing text. */
  function composeGoal() {
    const get = (f) => (C.getField(store.state, `s09.${f}`) || '').trim().replace(/[.،]$/, '');
    const parts = ['conditions', 'performance', 'criterion'].map(get);
    if (parts.some((p) => !p)) {
      const res = document.querySelector('[data-result="t07"]');
      if (res) { res.className = 'result is-missing'; res.textContent = 'اكتب الأداء والشروط ومعيار الحكم أولًا.'; }
      return;
    }
    const current = (C.getField(store.state, 's09.statement') || '').trim();
    if (current && !window.confirm('ستستبدل المسودة ما كتبته في حقل العبارة. هل تريد المتابعة؟')) return;
    const text = `عند ${parts[0]}، ${parts[1]}، وفق ${parts[2]}.`;
    const control = /** @type {HTMLTextAreaElement|null} */ (byId('s09-statement'));
    if (control) control.value = text;
    setDraft('s09.statement', text, { now: true });
    control?.focus();
  }

  /** @returns {{priority: string, step: string, return: string}|null} The plan in force. */
  function currentPlan() {
    const d = store.state.drafts.s10 || {};
    if (C.isBlank(d.step) && C.isBlank(d.priority)) return null;
    return { priority: d.priority || '', step: d.step || '', return: d.return || '' };
  }

  /** @param {object|null} plan @param {string} title */
  function planColumn(plan, title) {
    return h('div', { class: 'compare-col' }, [
      h('h4', {}, title),
      plan ? h('dl', {}, [
        h('dt', {}, 'الأولوية'), h('dd', {}, priorityText(plan.priority)),
        h('dt', {}, 'الخطوة التالية'), h('dd', {}, plan.step || '—'),
        h('dt', {}, 'شرط العودة'), h('dd', {}, plan.return || '—'),
      ]) : h('p', { class: 'compare-empty' }, 'لم تُسجل خطة بعد. ابدأ من الشاشة 10.'),
    ]);
  }

  function renderCurrentPlan() {
    const holder = byId('s12-current');
    if (holder) holder.replaceWith(Object.assign(planColumn(currentPlan(), 'خطتي الحالية'), { id: 's12-current' }));
  }

  /** @returns {{priority: string, step: string, return: string}} */
  function proposedPlan() {
    const d = store.state.drafts.s12 || {};
    const cur = currentPlan() || { priority: '', step: '', return: '' };
    return { priority: d.priority || cur.priority, step: (d.step || '').trim() || cur.step, return: (d.return || '').trim() || cur.return };
  }

  const setResult = (id, text, ok = true) => {
    const node = byId(id);
    if (!node) return;
    node.className = `result ${ok ? 'is-done' : 'is-missing'}`;
    node.textContent = text;
  };

  /** Writes the new plan into screen 10's fields so the plan in force stays in one place. */
  function applyPlan(plan) {
    ['priority', 'step', 'return'].forEach((k) => {
      setDraft(`s10.${k}`, plan[k]);
      const control = /** @type {HTMLInputElement|null} */ (byId(`s10-${k}`));
      if (control) control.value = plan[k];
    });
  }

  // ---------------------------------------------------------------------------
  // Screens 17–20 and 28: project versions
  // ---------------------------------------------------------------------------

  /** Project fields shown in previews and version comparisons. */
  const PROJECT_FIELDS = [
    ['title', 'عنوان المهمة'], ['audience', 'الجمهور'], ['prereq', 'المتطلبات السابقة'], ['goal', 'الهدف'], ['constraints', 'القيود'],
    ['task', 'نص المهمة'], ['sources', 'المصادر المتاحة'], ['means', 'وسيلة الاستجابة'], ['alternative', 'البديل'],
    ['rationale', 'مبرر الوسيلة'], ['process', 'العملية المستهدفة'], ['criteria', 'المحكات والتغذية الراجعة'], ['change', 'التعديل في هذه النسخة'],
  ];

  /** @param {string} id @param {string} status */
  const statusOrValue = (value, status) => (status === 'tbd' ? 'لم أحدده بعد' : status === 'na' ? 'لا ينطبق' : value || '');

  /** @returns {Record<string, string>} A text snapshot of the project as it stands now. */
  function projectSnapshot(change = '') {
    const d = store.state.drafts;
    const s17 = d.s17 || {};
    const s18 = d.s18 || {};
    const rows = Array.isArray(d.s19?.rows) ? d.s19.rows : [];
    const level = D.LEVELS.find((l) => l.id === s18.process);
    return {
      title: d.s03?.title || d.s01?.title || '',
      audience: statusOrValue(s17.audience, s17.audienceStatus),
      prereq: statusOrValue(s17.prereq, s17.prereqStatus),
      goal: s17.goal || '',
      constraints: statusOrValue(s17.constraints, s17.constraintsStatus),
      task: s18.task || '',
      sources: s18.sources || '',
      means: s18.means || '',
      alternative: s18.alternative || '',
      rationale: s18.rationale || '',
      process: level ? `${level.text}${s18.processQuote ? ` — «${s18.processQuote}»` : ''}` : '',
      criteria: rows.filter((r) => r && !C.isBlank(r.desc)).map((r, i) => `${i + 1}) ${r.desc} | الدليل: ${r.evidence || '—'} | العلاج: ${r.remedy || '—'} | المحاولة التالية: ${r.next || '—'}`).join('\n'),
      change,
    };
  }

  /**
   * Saves a dated project version. Earlier versions are never overwritten.
   * @param {'review'|'trial'|'cycle'} kind
   * @param {{review?: object, change?: string}} [extra]
   * @returns {object|null} The new version, or null if saving failed.
   */
  function addVersion(kind, extra = {}) {
    const n = store.state.project.versions.length + 1;
    const labels = { review: 'للمراجعة', trial: 'جاهزة لتجربة', cycle: 'بعد تجربة' };
    const version = { id: `v${n}`, n, label: `النسخة ${n} (${labels[kind]})`, kind, at: nowIso(), contentVersion: D.CONTENT_VERSION, data: projectSnapshot(extra.change || ''), review: extra.review || null };
    const ok = store.update((st) => { st.project.versions.push(version); });
    renderVersions();
    return ok ? version : null;
  }

  function renderVersions() {
    const versions = store.state.project.versions;
    const list = byId('s20-versions');
    if (list) {
      list.replaceChildren(...(versions.length
        ? versions.map((v) => h('li', {}, `${v.label} — ${fmtDateTime(v.at)}${v.review ? ' — مع مراجعة ذاتية' : ''}`))
        : [h('li', {}, 'لم تُحفظ نسخة بعد.')]));
    }
    $$('select[data-version-select]').forEach((select, i) => {
      // Keep the learner's own choice; otherwise default to the two latest versions.
      const keep = select.dataset.userSet ? /** @type {HTMLSelectElement} */ (select).value : '';
      select.replaceChildren(...(versions.length ? versions.map((v) => h('option', { value: v.id }, v.label)) : [h('option', { value: '' }, 'لا توجد نسخ بعد')]));
      if (keep && versions.some((v) => v.id === keep)) /** @type {HTMLSelectElement} */ (select).value = keep;
      else if (versions.length) /** @type {HTMLSelectElement} */ (select).value = versions[Math.max(0, versions.length - 2 + i)]?.id || versions[0].id;
    });
  }

  /**
   * Comparison of two versions: the changed fields side by side (the point of the
   * comparison), then the unchanged fields once, in a collapsible list.
   */
  function compareVersions() {
    const out = byId('version-compare');
    const a = store.state.project.versions.find((v) => v.id === /** @type {HTMLSelectElement} */ (byId('compare-a'))?.value);
    const b = store.state.project.versions.find((v) => v.id === /** @type {HTMLSelectElement} */ (byId('compare-b'))?.value);
    if (!out) return;
    if (!a || !b) {
      out.replaceChildren(h('p', { class: 'compare-empty' }, 'تحتاج نسختين محفوظتين على الأقل للمقارنة.'));
      return;
    }
    const val = (v, k) => v.data?.[k] || '';
    const used = PROJECT_FIELDS.filter(([k]) => val(a, k) || val(b, k));
    const changed = used.filter(([k]) => val(a, k) !== val(b, k));
    const same = used.filter(([k]) => val(a, k) === val(b, k));
    const col = (v) => h('div', { class: 'compare-col' }, [
      h('h4', {}, `${v.label} — ${fmtDateTime(v.at)}`),
      changed.length
        ? h('dl', {}, changed.flatMap(([k, label]) => [h('dt', {}, label), h('dd', { class: 'is-changed' }, val(v, k) || '—')]))
        : h('p', { class: 'compare-empty' }, 'لا فرق في الحقول بين النسختين.'),
    ]);
    out.replaceChildren(
      h('p', { class: 'field-hint', style: 'grid-column: 1 / -1' }, `تغير ${changed.length} من ${used.length} حقلًا بين النسختين؛ تظهر الحقول المتغيرة هنا بخط جانبي.`),
      col(a),
      col(b),
      same.length ? h('details', { class: 'hint', style: 'grid-column: 1 / -1' }, [
        h('summary', {}, h('span', {}, `الحقول التي لم تتغير (${same.length})`)),
        h('div', { class: 'hint-body' }, h('dl', { class: 'legacy-list' }, same.flatMap(([k, label]) => [h('dt', {}, label), h('dd', {}, val(a, k))]))),
      ]) : null,
    );
  }

  /** Text view of the current project for review or copying (screen 20). */
  function previewProject() {
    const box = byId('project-preview');
    if (!box) return;
    const snap = projectSnapshot();
    const lines = PROJECT_FIELDS.filter(([k]) => k !== 'change').map(([k, label]) => [label, snap[k] || 'لم يُكتب بعد']);
    box.hidden = false;
    box.replaceChildren(
      h('span', { class: 'example-label' }, 'معاينة المشروع الحالية (ليست نسخة محفوظة)'),
      h('dl', { class: 'legacy-list' }, lines.flatMap(([l, v]) => [h('dt', {}, l), h('dd', {}, v)])),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-secondary', dataset: { action: 'copy-project' } }, 'انسخ نص المشروع')),
    );
  }

  // Screen 19 criterion rows (array draft; not plain fields).
  const ROW_KEYS = [['desc', 'وصف قابل للملاحظة لما يميز الاستجابة المقبولة'], ['evidence', 'الدليل الذي ستبحث عنه'], ['remedy', 'رسالة العلاج لمن لم يحقق المحك'], ['next', 'المحاولة التالية: كيف ستتحقق من التحسن']];

  /** @returns {Array<Record<string, any>>} */
  function criterionRows() {
    const rows = C.getField(store.state, 's19.rows');
    return Array.isArray(rows) && rows.length ? rows : [{}];
  }

  function renderCriterionRows() {
    const holder = byId('s19-rows');
    if (!holder) return;
    const rows = criterionRows();
    holder.replaceChildren(...rows.map((row, i) => h('fieldset', { class: 'rubric-item', dataset: { rowIndex: String(i) } }, [
      h('legend', { class: 'rubric-name' }, `المحك ${i + 1}`),
      ...ROW_KEYS.map(([key, label]) => {
        const id = `s19-${i}-${key}`;
        return h('div', { class: 'field' }, [
          h('label', { class: 'field-label', for: id }, label),
          h('textarea', { id, class: 'input', dataset: { rowKey: key } }, row[key] || ''),
        ]);
      }),
      h('label', { class: 'choice' }, [h('input', { type: 'checkbox', checked: !!row.reword, dataset: { rowKey: 'reword' } }), h('span', {}, 'يحتاج هذا المحك إعادة صياغة')]),
      rows.length > 1 ? h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-ghost', dataset: { action: 'remove-criterion', index: String(i) } }, `احذف المحك ${i + 1}`)) : null,
    ])));
    $$('textarea', holder).forEach((t) => { /** @type {HTMLTextAreaElement} */ (t).value = rows[Number(t.closest('[data-row-index]')?.getAttribute('data-row-index'))]?.[t.dataset.rowKey || ''] || ''; });
  }

  /** Saves edits made inside the criterion rows. @param {Event} event */
  function onRowEdit(event) {
    const control = /** @type {HTMLInputElement} */ (event.target);
    const key = control.dataset?.rowKey;
    const wrap = control.closest?.('[data-row-index]');
    if (!key || !wrap || !control.closest('#s19-rows')) return;
    const index = Number(wrap.getAttribute('data-row-index'));
    const rows = criterionRows().map((r) => ({ ...r }));
    rows[index] = { ...rows[index], [key]: control.type === 'checkbox' ? control.checked : control.value };
    setDraft('s19.rows', rows, { now: control.type === 'checkbox' });
  }

  // ---------------------------------------------------------------------------
  // Screens 21–24: final test (items and keys load on demand)
  // ---------------------------------------------------------------------------

  /** @type {Record<string, Promise<void>>} */
  const loadedScripts = {};
  /**
   * Loads a classic script once (works when the page is opened from file://).
   * @param {string} src
   * @returns {Promise<void>}
   */
  function loadScript(src) {
    if (!loadedScripts[src]) {
      loadedScripts[src] = new Promise((resolve, reject) => {
        const s = h('script', { src });
        s.addEventListener('load', () => resolve());
        s.addEventListener('error', () => { delete loadedScripts[src]; reject(new Error(src)); });
        document.head.append(s);
      });
    }
    return loadedScripts[src];
  }
  const loadForms = () => (window.BloomTestForms ? Promise.resolve() : loadScript('js/test-forms.js'));
  const loadKeys = () => (window.BloomTestKeys ? Promise.resolve() : loadScript('js/test-keys.js'));
  const LETTERS = ['أ', 'ب', 'ج', 'د'];

  function renderTestStatus() {
    const status = byId('test-status');
    const start = /** @type {HTMLButtonElement|null} */ (byId('test-start'));
    if (!status || !start) return;
    const { attempts, draft } = store.state.test;
    const retake = C.retakeStatus(attempts, C.RETAKE_POLICY);
    if (attempts.length) {
      const last = attempts[attempts.length - 1];
      status.className = 'result';
      status.replaceChildren(`أرسلت محاولة في ${fmtDateTime(last.submittedAt)} ودرجتها ${last.total} من 100. `, h('a', { href: '#screen-23', class: 'inline-link' }, 'اعرض التقرير'), retake.allowed ? '' : ` ${D.MESSAGES.singleAttempt}`);
      start.hidden = !retake.allowed;
    } else if (draft) {
      status.className = 'result';
      status.textContent = `لديك محاولة غير مرسلة بدأتها في ${fmtDateTime(draft.startedAt)}؛ أجبت عن ${Object.keys(draft.answers || {}).length} من ${D.TEST_CONFIG.itemsPerForm}.`;
      start.textContent = 'تابع الاختبار';
      start.hidden = false;
    } else {
      status.textContent = '';
      start.hidden = false;
    }
  }

  async function startTest() {
    const retake = C.retakeStatus(store.state.test.attempts, C.RETAKE_POLICY);
    if (!retake.allowed) {
      renderTestStatus();
      return;
    }
    if (!store.state.test.draft) {
      store.update((st) => {
        st.test.draft = { form: D.TEST_CONFIG.firstForm, contentVersion: D.CONTENT_VERSION, seed: Math.floor(Math.random() * 2 ** 31), startedAt: nowIso(), answers: {} };
      });
    }
    try {
      await loadForms();
    } catch {
      setResult('test-status', 'تعذر تحميل أسئلة الاختبار. تأكد أن ملف js/test-forms.js موجود ثم أعد المحاولة.', false);
      return;
    }
    window.location.hash = '#screen-22';
  }

  /** @returns {Array<{id: string, stem: string, options: Array<{id: string, text: string}>}>} Items of the draft's form in display order. */
  function draftItems(draft) {
    const items = window.BloomTestForms?.FORMS?.[draft.form] || [];
    return items.map((item, i) => ({
      ...item,
      options: D.TEST_CONFIG.shuffleOptions ? C.seededShuffle(item.options, draft.seed + i) : item.options,
    }));
  }

  async function renderTestPlayer() {
    const player = byId('test-player');
    const actionsBar = byId('test-actions');
    const msg = byId('test-player-msg');
    if (!player || !actionsBar) return;
    const { draft, attempts } = store.state.test;
    if (!draft) {
      player.replaceChildren();
      player.parentElement?.querySelector(':scope > .pager[data-pager-for="test-player"]')?.remove();
      actionsBar.hidden = true;
      if (msg) {
        msg.className = 'result';
        msg.replaceChildren(attempts.length
          ? h('span', {}, ['أُرسلت محاولتك. ', h('a', { href: '#screen-23', class: 'inline-link' }, 'اعرض نتيجتك')])
          : h('span', {}, ['لم تبدأ الاختبار بعد. ', h('a', { href: '#screen-21', class: 'inline-link' }, 'اقرأ التعليمات وابدأ من الشاشة 21')]));
      }
      byId('test-count')?.replaceChildren();
      return;
    }
    if (msg) msg.textContent = '';
    player.setAttribute('aria-busy', 'true');
    try {
      await loadForms();
    } catch {
      if (msg) msg.textContent = 'تعذر تحميل أسئلة الاختبار.';
      return;
    }
    const items = draftItems(draft);
    player.replaceChildren(...items.map((item, i) => h('fieldset', { class: 'check-part test-item', id: `test-item-${item.id}`, dataset: { fieldWrap: '' } }, [
      h('legend', { class: 'check-prompt' }, [h('span', { class: 'kc-count' }, `السؤال ${i + 1} من ${items.length}`), h('span', { class: 'test-stem' }, item.stem)]),
      h('div', { class: 'choice-list' }, item.options.map((o, k) => h('label', { class: 'choice' }, [
        h('input', { type: 'radio', name: `test-${item.id}`, value: o.id, checked: draft.answers?.[item.id] === o.id, dataset: { testItem: item.id } }),
        h('span', {}, `${LETTERS[k]}) ${o.text}`),
      ]))),
    ])));
    player.setAttribute('aria-busy', 'false');
    // Open on the page of the first unanswered question (all pages when printing).
    const firstOpen = items.findIndex((item) => !draft.answers?.[item.id]);
    testPager = paginate(player, { perPage: PAGE_SIZE.test, label: 'أسئلة الاختبار', lastOnly: [actionsBar] });
    if (firstOpen > 0) testPager.showItem(player.querySelector(`#test-item-${items[firstOpen].id}`));
    renderTestCount();
  }

  function renderTestCount() {
    const draft = store.state.test.draft;
    const count = byId('test-count');
    if (!draft || !count) return;
    const answered = Object.values(draft.answers || {}).filter(Boolean).length;
    count.textContent = `أجبت عن ${answered} من ${D.TEST_CONFIG.itemsPerForm}، وتبقى ${D.TEST_CONFIG.itemsPerForm - answered}. تُحفظ إجاباتك قبل الإرسال.`;
  }

  /** Locks the attempt, scores it with keys loaded only now, and opens the report. */
  async function submitTest() {
    const draft = store.state.test.draft;
    if (!draft) return;
    const items = draftItems(draft);
    const missing = items.filter((item) => !draft.answers?.[item.id]);
    const msg = byId('test-player-msg');
    if (missing.length) {
      if (msg) {
        msg.className = 'result is-missing';
        msg.replaceChildren('أجب عن جميع الأسئلة قبل الإرسال. الأسئلة الفارغة: ', ...missing.flatMap((item, k) => [k ? '، ' : '', h('a', { href: `#test-item-${item.id}`, class: 'inline-link' }, `السؤال ${items.indexOf(item) + 1}`)]));
      }
      const firstMissing = byId(`test-item-${missing[0].id}`);
      testPager?.showItem(firstMissing);
      firstMissing?.querySelector('input')?.focus();
      return;
    }
    if (!window.confirm('للاختبار محاولة مرسلة واحدة. بعد الإرسال تُقفل إجاباتك وتُحسب الدرجة، ولا تتاح إعادة. هل تريد الإرسال؟')) return;
    try {
      await loadKeys();
    } catch {
      if (msg) { msg.className = 'result is-missing'; msg.textContent = 'تعذر تحميل مفاتيح التصحيح؛ لم تُرسل المحاولة وبقيت إجاباتك محفوظة. أعد المحاولة.'; }
      return;
    }
    const keys = window.BloomTestKeys.KEYS;
    const ids = items.map((i) => i.id);
    const scored = C.scoreAttempt(draft.answers, keys, ids, D.TEST_CONFIG.pointsPerItem);
    const review = [];
    ids.forEach((id) => { if (!scored.correct[id] && !review.includes(keys[id].review)) review.push(keys[id].review); });
    const attempt = {
      id: `a${store.state.test.attempts.length + 1}`,
      form: draft.form,
      contentVersion: draft.contentVersion,
      seed: draft.seed,
      order: Object.fromEntries(items.map((i) => [i.id, i.options.map((o) => o.id)])),
      answers: { ...draft.answers },
      itemScores: scored.itemScores,
      correct: scored.correct,
      total: scored.total,
      review,
      startedAt: draft.startedAt,
      submittedAt: nowIso(),
    };
    const ok = store.update((st) => {
      st.test.attempts.push(attempt);
      st.test.draft = null;
      st.test.reportViewedAt = null;
    });
    if (!ok && msg) { msg.className = 'result is-missing'; msg.textContent = 'حُسبت المحاولة لكن تعذر حفظها؛ راجع تنبيه الحفظ قبل مغادرة الصفحة.'; }
    renderProgress();
    window.location.hash = '#screen-23';
  }

  /**
   * Screen 23: part أ shows the two pass conditions and what is missing; part ب
   * explains every answer (paged, a few items at a time).
   */
  async function renderTestReport() {
    const holder = byId('test-report');
    const explain = byId('test-explain');
    if (!holder) return;
    const attempts = store.state.test.attempts;
    const pass = passState();
    const conditions = h('div', { class: 'dash-grid' }, byId('dash-conditions') ? [...byId('dash-conditions').children].map((n) => n.cloneNode(true)) : []);
    const summary = h('p', { class: `dash-summary ${pass.passed ? 'is-passed' : ''}` }, passSummary(pass));
    const notSent = () => h('p', {}, ['لم تُرسل محاولة بعد. ', h('a', { href: '#screen-21', class: 'inline-link' }, 'ابدأ من تعليمات الاختبار')]);
    if (!attempts.length) {
      holder.replaceChildren(conditions, summary, notSent());
      explain?.replaceChildren(notSent());
      return;
    }
    try {
      await Promise.all([loadForms(), loadKeys()]);
    } catch {
      holder.replaceChildren(conditions, summary, h('p', { class: 'result is-missing' }, 'تعذر تحميل تفاصيل التقرير.'));
      return;
    }
    const last = attempts[attempts.length - 1];
    const forms = window.BloomTestForms.FORMS;
    const keys = window.BloomTestKeys.KEYS;
    const items = forms[last.form] || [];
    const missingEls = D.ELEMENTS.filter((e) => !isDone(e.id));
    const retake = C.retakeStatus(attempts, C.RETAKE_POLICY);
    const wrongCount = items.filter((item) => !last.correct[item.id]).length;
    holder.replaceChildren(
      conditions,
      summary,
      !pass.content.met ? h('div', {}, [
        h('h4', { class: 'section-title' }, 'العناصر الناقصة'),
        h('ul', { class: 'dash-list prose' }, missingEls.map((e) => h('li', {}, [screenLink(e.screen, `${elementLabel(e.id)} · الشاشة ${e.screen}: ${screenTitle(e.screen)}`), ` — ${e.condition}`]))),
      ]) : null,
      h('p', {}, `أُرسلت المحاولة في ${fmtDateTime(last.submittedAt)} (النموذج ${last.form === 'A' ? 'أ' : 'ب'}). أجبت إجابة صحيحة عن ${items.length - wrongCount} من ${items.length} أسئلة.`),
      h('p', { class: 'note' }, 'لا يُستنتج من بند واحد مستوى ثابت لك؛ البند الخاطئ إشارة إلى موضع يحتاج مراجعة. لا تمنح هذه النتيجة شهادة اعتماد أو حكمًا بالإتقان المهني.'),
      retake.allowed ? null : h('p', { class: 'note' }, D.MESSAGES.singleAttempt),
      h('div', { class: 'actions' }, h('a', { href: '#screen-23-2', class: 'btn btn-primary' }, 'التالي: تفسير كل إجابة')),
    );
    if (explain) {
      const list = h('ol', { class: 'diag-list', id: 'test-explain-list' }, items.map((item) => {
        const key = keys[item.id];
        const ok = last.correct[item.id];
        const chosen = item.options.find((o) => o.id === last.answers[item.id]);
        const right = item.options.find((o) => o.id === key.answer);
        return h('li', { class: `diag-item ${ok ? 'is-correct' : 'is-wrong'}` }, [
          h('p', { class: 'diag-head' }, [h('span', { class: 'part-state' }, ok ? `صحيح · ${last.itemScores[item.id]} درجات` : 'تحتاج مراجعة · 0'), ` ${item.stem}`]),
          h('p', {}, `اخترت: ${chosen ? chosen.text : '—'}`),
          ok ? null : h('p', {}, `الإجابة الصحيحة: ${right ? right.text : ''}`),
          h('p', {}, `لماذا: ${key.feedback} (الناتج ${key.outcome})`),
          h('p', {}, ['موضع المراجعة: ', screenLink(key.review)]),
        ]);
      }));
      const closing = h('div', { class: 'actions' }, h('a', { href: '#screen-24', class: 'btn btn-primary' }, 'التالي: من النتيجة إلى خطوة تعلم'));
      explain.replaceChildren(
        h('h4', { class: 'section-title' }, `تفسير الإجابات — النموذج ${last.form === 'A' ? 'أ' : 'ب'}`),
        list,
        closing,
      );
      paginate(list, { perPage: PAGE_SIZE.testReport, lastPage: 2, label: 'تفسير الإجابات', lastOnly: [closing] });
    }
    if (!store.state.test.reportViewedAt) store.update((st) => { st.test.reportViewedAt = nowIso(); });
  }

  /** Screen 24: concepts from the wrong items, or all outcomes when every answer was right. */
  async function renderRemediation() {
    const select = /** @type {HTMLSelectElement|null} */ (byId('s24-concept'));
    const gate = byId('s24-gate');
    if (!select) return;
    const attempts = store.state.test.attempts;
    const last = attempts[attempts.length - 1];
    const options = [h('option', { value: '' }, 'اختر…')];
    if (!last) {
      if (gate) gate.replaceChildren('تعتمد هذه الشاشة على تقرير الاختبار. ', h('a', { href: '#screen-21', class: 'inline-link' }, 'أرسل محاولة الاختبار أولًا'), '.');
    } else {
      if (gate) gate.textContent = store.state.test.reportViewedAt ? '' : 'افتح تقرير نتيجتك في الشاشة 23 أولًا.';
      try { await loadKeys(); } catch { /* keys unavailable: fall back to outcomes */ }
      const keys = window.BloomTestKeys?.KEYS || {};
      const wrong = Object.keys(last.correct || {}).filter((id) => !last.correct[id] && keys[id]);
      if (wrong.length) {
        wrong.forEach((id) => options.push(h('option', { value: id }, `${keys[id].outcome}: ${keys[id].feedback} (مراجعة الشاشة ${keys[id].review})`)));
      } else {
        [...(byId('s10-priority')?.querySelectorAll('option[value]:not([value=""])') || [])].forEach((o) => options.push(h('option', { value: o.getAttribute('value') }, `${o.textContent} — أطبقه في سياق جديد`)));
      }
    }
    const keep = C.getField(store.state, 's24.concept') || '';
    select.replaceChildren(...options);
    select.value = keep;
  }

  // ---------------------------------------------------------------------------
  // Screen 25: source cards; screen 28: trial log
  // ---------------------------------------------------------------------------

  const USE_TEXT = { quote: 'نقل نص', summary: 'تلخيص', own: 'مثال من بنائي' };
  const PART_TEXT = { goal: 'الهدف', task: 'المهمة', sources: 'مصادر المتعلم', assessment: 'المحك والتغذية الراجعة', trial: 'التجربة', other: 'جزء آخر' };

  /**
   * For a form split over two parts: focuses the first missing control on this
   * part, and links the other parts that still hold missing controls.
   * @param {string} resultId @param {Array<HTMLElement|null>} controls
   */
  function focusOrLinkMissing(resultId, controls) {
    const result = byId(resultId);
    const here = result?.closest('[data-screen]');
    const local = controls.find((c) => c && c.closest('[data-screen]') === here);
    const others = [...new Set(controls.map((c) => /** @type {HTMLElement|null} */ (c?.closest('[data-screen]') || null)).filter((sc) => sc && sc !== here).map((sc) => sc.dataset.screen || ''))];
    if (result && others.length) {
      result.append(' ما زال ناقصًا في: ', ...others.flatMap((key, k) => [k ? '، ' : '', h('a', { href: screenHref(key), class: 'inline-link' }, `الشاشة ${screenLabel(key)}`)]), '.');
    }
    /** @type {HTMLElement|undefined|null} */ (local)?.focus();
  }

  function renderSources() {
    const list = byId('source-list');
    if (!list) return;
    const cards = store.state.sources;
    list.replaceChildren(...(cards.length ? cards.map((c) => h('li', { class: 'source-card' }, [
      h('p', { class: 'source-title' }, [h('bdi', {}, c.title), ' — ', h('bdi', {}, c.author)]),
      h('p', {}, ['الموضع: ', h('bdi', {}, c.locator), ` · الاستناد: ${c.location} · الاطلاع: ${c.accessed}`]),
      h('p', {}, `الاستخدام: ${USE_TEXT[c.use] || c.use} · الجزء: ${PART_TEXT[c.part] || 'غير محدد'} · الغرض: ${c.purpose} · الترخيص: ${c.license || 'غير معلوم'}`),
      h('button', { type: 'button', class: 'btn btn-ghost', dataset: { action: 'remove-source', id: c.id } }, 'احذف البطاقة'),
    ])) : [h('li', { class: 'compare-empty' }, 'لا توجد بطاقات بعد.')]));
  }

  /** @param {SubmitEvent} event */
  function addSource(event) {
    event.preventDefault();
    const d = store.state.drafts.s25 || {};
    $$('[data-field^="s25."]').forEach((c) => clearFieldError(c));
    const missing = C.SOURCE_REQUIRED.filter((k) => C.isBlank(d[k]));
    if (missing.length) {
      const controls = missing.map((k) => markFieldMissing(`s25.${k}`));
      setResult('source-result', 'أكمل الحقول المشار إليها؛ تحتاج البطاقة ما يسمح بالرجوع إلى المادة.', false);
      focusOrLinkMissing('source-result', controls);
      return;
    }
    const card = { id: `src${Date.now()}`, title: d.title, author: d.author, locator: d.locator, accessed: d.accessed, location: d.location, purpose: d.purpose, use: d.use, part: d.part || '', license: C.isBlank(d.license) ? 'غير معلوم' : d.license, createdAt: nowIso() };
    const ok = store.update((st) => { st.sources.push(card); st.drafts.s25 = {}; });
    $$('[data-source]').forEach((c) => { /** @type {HTMLInputElement} */ (c).value = ''; });
    renderSources();
    const done = tryComplete('t18', { silent: true });
    setResult('source-result', ok ? `أُضيفت البطاقة إلى مصادر مشروعك.${done ? ` عنصر ${elementLabel('t18')} مكتمل.` : ''}` : 'لم تُحفظ البطاقة؛ راجع تنبيه الحفظ.', ok);
  }

  function renderTrials() {
    const list = byId('trial-list');
    const ready = byId('s28-ready');
    const trials = store.state.trials;
    if (list) {
      list.replaceChildren(...(trials.length ? trials.map((t) => h('li', {}, [
        h('strong', {}, t.type === 'sim' ? 'محاكاة' : 'تطبيق صفي'), ` — ${fmtDateTime(t.at)}: ${t.observation}`,
        h('span', { class: 'dash-item-cond' }, `قرار التعديل: ${t.decision} · تفسير بديل: ${t.alt}`),
      ])) : [h('li', { class: 'compare-empty' }, 'لم تُسجل تجربة بعد.')]));
    }
    if (ready) {
      ready.hidden = trials.length > 0;
      ready.textContent = isDone('t20')
        ? 'خطتك جاهزة للعودة. سجل هنا ما حدث بعد أن تجرب تصميمك؛ لا تُعرض نتائج قبل ذلك.'
        : 'لم تُسجل خطة تجربة بعد. ابدأ من الشاشة 27، ثم عد إلى هنا بعد التجربة.';
    }
  }

  /** @param {SubmitEvent} event */
  function addTrial(event) {
    event.preventDefault();
    const d = store.state.drafts.s28 || {};
    $$('[data-field^="s28."]').forEach((c) => clearFieldError(c));
    const required = ['type', 'evidence', 'observation', 'alt', 'decision'];
    const missing = required.filter((k) => C.isBlank(d[k]));
    if (missing.length) {
      const controls = missing.map((k) => markFieldMissing(`s28.${k}`));
      setResult('trial-result', 'أكمل الحقول المشار إليها.', false);
      focusOrLinkMissing('trial-result', controls);
      return;
    }
    const version = addVersion('cycle', { change: d.decision });
    const trial = { id: `tr${Date.now()}`, type: d.type, evidence: d.evidence, observation: d.observation, alt: d.alt, decision: d.decision, at: nowIso(), versionId: version?.id || null };
    const ok = store.update((st) => { st.trials.push(trial); st.drafts.s28 = {}; });
    $$('[data-field^="s28."]').forEach((c) => {
      if (/** @type {HTMLInputElement} */ (c).type === 'radio') /** @type {HTMLInputElement} */ (c).checked = false;
      else /** @type {HTMLInputElement} */ (c).value = '';
    });
    renderTrials();
    renderVersions();
    renderProgress();
    setResult('trial-result', ok && version
      ? `سُجلت ${trial.type === 'sim' ? 'المحاكاة' : 'التجربة'} وأُنشئت ${version.label}. عدّل مشروعك في الشاشات 17–19، ثم قارن النسختين في الجزء ج من هذه الشاشة.`
      : 'لم يُحفظ السجل؛ راجع تنبيه الحفظ.', ok && !!version);
  }

  // ---------------------------------------------------------------------------
  // Actions and per-screen refresh
  // ---------------------------------------------------------------------------

  Object.assign(actions, {
    'play-video': (target) => playVideo(target),
    'diag-again': () => {
      store.update((st) => { st.drafts.s02 = {}; });
      $$('#diagnostic-form input').forEach((r) => { /** @type {HTMLInputElement} */ (r).checked = false; });
      const form = byId('diagnostic-form');
      const report = byId('diagnostic-report');
      if (report) report.hidden = true;
      diagPager?.show(0);
      if (form) { form.hidden = false; /** @type {HTMLElement|null} */ (form.querySelector('input'))?.focus(); }
      const button = byId('diag-submit');
      if (button) button.textContent = 'اعرض التوجيه';
    },
    'probe-save': () => {
      const input = /** @type {HTMLInputElement|null} */ (byId('probe-text'));
      const text = input?.value.trim() || '';
      if (!text) { setResult('probe-status', 'اكتب عنوانًا أولًا.', false); return; }
      const ok = store.update((st) => { st.probe = { text, savedAt: nowIso() }; });
      setResult('probe-status', ok
        ? 'حُفظ العنوان. أعد تحميل الصفحة ثم عد إلى هذه الشاشة: إذا ظهر «استعدنا مسودتك» فالحفظ يعمل في هذا المتصفح.'
        : 'لم يُحفظ العنوان. يبدو أن هذا المتصفح يمنع الحفظ المحلي؛ اقرأ «كيف أحفظ عملي» وصدّر نسخة احتياطية أو انسخ عملك قبل المغادرة.', ok);
    },
    'compose-goal': () => composeGoal(),
    'plan-preview': () => {
      const next = proposedPlan();
      const cur = currentPlan();
      const preview = byId('s12-preview');
      const holder = byId('s12-compare');
      if (!preview || !holder) return;
      if (!cur) { setResult('s12-result', 'سجّل خطتك الأولى في الشاشة 10 قبل تعديلها.', false); return; }
      if (cur.priority === next.priority && cur.step === next.step && cur.return === next.return) {
        setResult('s12-result', 'لم تغير شيئًا بعد؛ عدّل الأولوية أو الخطوة أو شرط العودة.', false);
        return;
      }
      holder.replaceChildren(planColumn(cur, 'الخطة الحالية'), planColumn(next, 'الخطة بعد التعديل'));
      preview.hidden = false;
      setResult('s12-result', 'راجع القديم والجديد، ثم احفظ التعديل أو ألغه.');
    },
    'plan-save': () => {
      const next = proposedPlan();
      const reason = (C.getField(store.state, 's12.reason') || '').trim();
      applyPlan(next);
      const ok = store.update((st) => {
        st.history.plan.push({ ...next, reason, at: nowIso() });
        st.drafts.s12 = {};
      });
      $$('#screen-12 [data-field]').forEach((c) => {
        if (/** @type {HTMLInputElement} */ (c).type === 'radio') /** @type {HTMLInputElement} */ (c).checked = false;
        else /** @type {HTMLInputElement} */ (c).value = '';
      });
      const preview = byId('s12-preview');
      if (preview) preview.hidden = true;
      refreshConditionals();
      renderCurrentPlan();
      renderHistories();
      setResult('s12-result', ok ? `حُفظ تعديل خطتك في ${fmtDateTime(nowIso())}، وبقيت الخطة السابقة في السجل. لا يغير ذلك نسبة الإنجاز.` : D.MESSAGES.saveFailed, ok);
    },
    'plan-cancel': () => {
      const preview = byId('s12-preview');
      if (preview) preview.hidden = true;
      setResult('s12-result', 'أُلغي التعديل؛ بقيت خطتك السابقة كما هي.');
    },
    'plan-keep': () => {
      const cur = currentPlan();
      if (!cur) { setResult('s12-result', 'سجّل خطتك الأولى في الشاشة 10 أولًا.', false); return; }
      const ok = store.update((st) => { st.history.plan.push({ ...cur, kept: true, reason: (st.drafts.s12?.reason || '').trim(), at: nowIso() }); });
      renderHistories();
      setResult('s12-result', ok ? 'سُجلت مراجعتك لخطتك دون تعديل.' : D.MESSAGES.saveFailed, ok);
    },
    'open-example': () => {
      const v1 = C.getField(store.state, 's14.v1');
      const ev = C.getField(store.state, 's14.v1evidence');
      if (C.isBlank(v1) || C.isBlank(ev)) {
        setResult('s14-gate', 'اكتب التعليمات والدليل أولًا، ثم افتح المثال؛ المقارنة تفيد بعد محاولتك.', false);
        /** @type {HTMLElement|null} */ (byId(C.isBlank(v1) ? 's14-v1' : 's14-v1evidence'))?.focus();
        return;
      }
      setDraft('s14.exampleOpened', true, { now: true });
      showWorkshopTwoCompare();
      window.location.hash = '#screen-14-2';
    },
    'add-criterion': () => {
      const rows = criterionRows().map((r) => ({ ...r }));
      rows.push({});
      setDraft('s19.rows', rows, { now: true });
      renderCriterionRows();
      /** @type {HTMLElement|null} */ (byId(`s19-${rows.length - 1}-desc`))?.focus();
    },
    'remove-criterion': (target) => {
      const index = Number(target.dataset.index);
      if (!window.confirm(`سيُحذف المحك ${index + 1} من مسودتك. هل تريد المتابعة؟`)) return;
      const rows = criterionRows().filter((_, i) => i !== index);
      setDraft('s19.rows', rows, { now: true });
      renderCriterionRows();
    },
    'save-version': (target) => {
      const kind = target.dataset.kind === 'trial' ? 'trial' : 'review';
      const missing = C.missingForElement('t16', store.state).filter((m) => m !== 'project.version');
      if (missing.length) {
        tryComplete('t16'); // marks the criteria that still need a level or evidence, with links to their parts
        const res = document.querySelector('[data-result="t16"]');
        if (res) {
          const links = [...res.querySelectorAll('a')];
          res.replaceChildren('لم تُحفظ النسخة بعد. لكل محك اختر وصفًا وأرفق شاهدًا من عملك (أو سبب «لا ينطبق»).');
          if (links.length) res.append(' ما زال ناقصًا في: ', ...links.flatMap((link, k) => [k ? '، ' : '', link]), '.');
        }
        return;
      }
      const d = store.state.drafts.s20 || {};
      const review = {
        levels: Object.fromEntries(C.RUBRIC_IDS.map((id) => [id, d[`level_${id}`]])),
        evidence: Object.fromEntries(C.RUBRIC_IDS.map((id) => [id, d[`evidence_${id}`]])),
        unresolved: d.unresolved || '',
      };
      const version = addVersion(kind, { review });
      if (!version) return;
      tryComplete('t16');
      const weak = D.RUBRIC.filter((c) => ['improve', 'absent'].includes(review.levels[c.id])).map((c) => c.name);
      const res = document.querySelector('[data-result="t16"]');
      if (res) {
        res.className = 'result is-done';
        res.replaceChildren(
          `${D.MESSAGES.selfReviewDone} حُفظت ${version.label}.`,
          weak.length ? ` محكات وصفتها بأنها تحتاج تحسينًا أو غير ظاهرة: ${weak.join('، ')}.` : '',
          kind === 'trial' ? h('span', {}, [' ', h('a', { href: '#screen-27', class: 'inline-link' }, 'خطط لتجربتك في الشاشة 27')]) : '',
        );
      }
      renderProgress();
    },
    'project-preview': () => previewProject(),
    'copy-project': async () => {
      const snap = projectSnapshot();
      const text = PROJECT_FIELDS.filter(([k]) => k !== 'change').map(([k, l]) => `${l}:\n${snap[k] || 'لم يُكتب بعد'}`).join('\n\n');
      try {
        await navigator.clipboard.writeText(text);
        appStatus('نُسخ نص المشروع.');
      } catch {
        appStatus('تعذر النسخ التلقائي؛ حدد النص في المعاينة وانسخه يدويًا.');
      }
    },
    'test-start': () => { startTest(); },
    'test-submit': () => { submitTest(); },
    'remove-source': (target) => {
      if (!window.confirm('ستُحذف هذه البطاقة من مصادر مشروعك. هل تريد المتابعة؟')) return;
      store.update((st) => { st.sources = st.sources.filter((c) => c.id !== target.dataset.id); });
      renderSources();
    },
    'compare-versions': () => compareVersions(),
  });

  /**
   * Replaces the play button with the YouTube player. Nothing is requested from
   * YouTube until the learner presses play (privacy-enhanced domain).
   * @param {HTMLElement} button
   */
  function playVideo(button) {
    const figure = button.closest('[data-video]');
    const id = figure?.getAttribute('data-video') || '';
    if (!figure || !/^[\w-]{11}$/.test(id)) return;
    const iframe = h('iframe', {
      src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
      title: figure.getAttribute('data-video-title') || 'YouTube',
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      referrerpolicy: 'strict-origin-when-cross-origin',
      allowfullscreen: true,
    });
    button.replaceWith(iframe);
    iframe.focus();
  }

  /** Screen 14: reveals the example and criteria once the first attempt exists, and keeps that attempt unchanged. */
  function showWorkshopTwoCompare({ focus = false } = {}) {
    if (!C.getField(store.state, 's14.exampleOpened')) return;
    const box = byId('s14-compare');
    if (box) box.hidden = false;
    ['s14-v1', 's14-v1evidence'].forEach((id) => {
      const control = /** @type {HTMLTextAreaElement|null} */ (byId(id));
      if (control) {
        control.readOnly = true;
        control.setAttribute('aria-readonly', 'true');
      }
    });
    setResult('s14-gate', 'حُفظت محاولتك الأولى كما كتبتها قبل فتح المثال. اكتب أي تعديل في «نسختي بعد إصلاح النقص» في الجزء ب.');
    const open = byId('s14-open');
    if (open) open.hidden = true;
    const gate = byId('s14-gate');
    if (gate && !gate.querySelector('a')) gate.append(' ', h('a', { href: '#screen-14-2', class: 'inline-link' }, 'انتقل إلى الجزء ب'));
    if (focus) /** @type {HTMLElement|null} */ (box?.querySelector('.example'))?.scrollIntoView({ block: 'start' });
  }

  /** Screen 18 preview: what the learner's students would read (text only). */
  function renderTaskPreview() {
    const box = byId('s18-preview');
    if (!box) return;
    const d = store.state.drafts.s18 || {};
    const row = (label, value) => h('p', {}, [h('strong', {}, `${label}: `), value && value.trim() ? value : h('span', { class: 'compare-empty' }, 'لم يُكتب بعد')]);
    box.replaceChildren(h('span', { class: 'example-label' }, 'ما سيقرأه الطالب'), row('المهمة', d.task), row('المصادر المتاحة', d.sources), row('طريقة تقديم الاستجابة', d.means));
  }

  /** Screen 04: review places from the diagnostic and the "review" path target. */
  function renderPath() {
    const list = byId('s04-review');
    const diag = store.state.diagnostic.attempts;
    const last = diag[diag.length - 1];
    const screens = last ? C.diagnosticReview(D.DIAGNOSTIC, last.answers).reviewScreens : [];
    if (list) {
      list.replaceChildren(...(last
        ? (screens.length ? screens.map((n) => h('li', {}, screenLink(n))) : [h('li', {}, 'لا مواضع مراجعة من تشخيصك.')])
        : [h('li', {}, ['لم تُرسل التشخيص بعد. ', screenLink('02', 'أجب عنه في الشاشة 02')])]));
    }
    const reviewLink = /** @type {HTMLAnchorElement|null} */ (byId('s04-review-link'));
    if (reviewLink) reviewLink.href = screenHref(screens[0] || '05');
  }

  /**
   * Screen 04: the seven units with their screens and the learner's completed
   * elements, built from the unit banners so it never drifts from the page.
   */
  function renderProgramMap() {
    const list = byId('program-map');
    if (!list) return;
    list.replaceChildren(...$$('[data-lesson]').map((lesson) => {
      const kicker = lesson.querySelector('.lesson-kicker')?.textContent.trim() || '';
      const title = lesson.querySelector('.lesson-title')?.textContent.trim() || lesson.id;
      const sub = lesson.querySelector('.lesson-sub')?.textContent.trim() || '';
      const els = D.ELEMENTS.filter((e) => unitOf(e.screen) === lesson.id);
      const done = els.filter((e) => isDone(e.id)).length;
      const screens = kicker.split('·')[1]?.trim() || '';
      return h('li', { title: sub }, [
        h('a', { href: `#${lesson.id}`, class: 'inline-link' }, title),
        h('span', { class: 'dash-item-cond' }, [screens, els.length ? `عناصر الوحدة: ${done} من ${els.length} مكتملة` : ''].filter(Boolean).join(' · ')),
      ]);
    }));
  }

  /**
   * Screen 20: a read-only excerpt of the learner's own work next to each rubric
   * criterion, so the evidence can be cited without leaving the screen.
   */
  function renderWorkExcerpts() {
    const snap = projectSnapshot();
    const s27 = store.state.drafts.s27 || {};
    const sources = store.state.sources;
    /** @type {Record<string, Array<[string, string]>>} */
    const map = {
      goal: [['الهدف', snap.goal]],
      alignment: [['الهدف', snap.goal], ['نص المهمة', snap.task], ['العملية المستهدفة', snap.process]],
      clarity: [['نص المهمة', snap.task], ['المصادر المتاحة', snap.sources]],
      digital: [['وسيلة الاستجابة', snap.means], ['مبرر الوسيلة', snap.rationale], ['البديل', snap.alternative]],
      feedback: [['المحكات والتغذية الراجعة', snap.criteria]],
      sources: [['بطاقات المصادر', sources.map((c) => `${c.title} — ${c.author}`).join('\n')]],
      trial: [['نوع التجربة', s27.type === 'sim' ? 'محاكاة موثقة' : s27.type === 'class' ? 'تطبيق صفي' : ''], ['الدليل المتوقع', s27.evidence || ''], ['محك المراجعة', s27.criterion || '']],
    };
    $$('[data-work-excerpt]').forEach((box) => {
      const rows = map[box.dataset.workExcerpt || ''] || [];
      box.replaceChildren(
        h('span', { class: 'example-label' }, 'من عملك (للقراءة فقط)'),
        h('dl', { class: 'legacy-list' }, rows.flatMap(([label, value]) => [h('dt', {}, label), h('dd', {}, value && value.trim() ? value : 'لم يُكتب بعد')])),
      );
    });
  }

  /** Screen 20 ح: the learner's judgment on each criterion before saving a version. */
  function renderRubricSummary() {
    $$('[data-rubric-summary]').forEach((list) => {
      list.replaceChildren(...D.RUBRIC.map((c) => {
        const level = D.RUBRIC_LEVELS.find((lv) => lv.id === C.getField(store.state, `s20.level_${c.id}`));
        const host = /** @type {HTMLElement|null} */ (document.querySelector(`[data-rubric~="${c.id}"]`)?.closest('[data-screen]') || null);
        return h('li', {}, [
          host ? h('a', { href: `#${host.id}`, class: 'inline-link' }, c.name) : c.name,
          `: ${level ? level.text : 'لم تحدد وصفًا بعد'}`,
        ]);
      }));
    });
  }

  /**
   * Per-screen refresh when a screen becomes visible, keyed by what the screen
   * contains (not by its number), so moving a block to another part keeps it working.
   * @type {Array<[string, () => void]>}
   */
  const ON_SHOW = [
    ['[data-diagnostic]', () => {
      if (store.state.diagnostic.attempts.length && byId('diagnostic-report')?.hidden) showDiagnosticReport();
      const probe = store.state.probe;
      if (probe && probe.savedAt < pageLoadedAt) {
        const input = /** @type {HTMLInputElement|null} */ (byId('probe-text'));
        if (input && !input.value) input.value = probe.text;
        setResult('probe-status', `استعدنا مسودتك: «${probe.text}» (حُفظت في ${fmtDateTime(probe.savedAt)}). الحفظ يعمل في هذا المتصفح.`);
      }
    }],
    ['#s04-review', renderPath],
    ['#program-map', renderProgramMap],
    ['#s12-current', () => { renderCurrentPlan(); renderHistories(); }],
    ['#s14-open, #s14-compare', () => showWorkshopTwoCompare()],
    ['#s18-preview', renderTaskPreview],
    ['#s19-rows', renderCriterionRows],
    ['[data-work-excerpt]', renderWorkExcerpts],
    ['[data-rubric-summary]', renderRubricSummary],
    ['#s20-versions', renderVersions],
    ['#test-start', renderTestStatus],
    ['#test-player', () => { renderTestPlayer(); }],
    ['#test-report, #test-explain', () => { renderTestReport(); }],
    ['#s24-concept', () => { renderRemediation(); }],
    ['#source-list', renderSources],
    ['#trial-list, #s28-ready', () => { renderTrials(); }],
    ['[data-version-select]', () => { renderVersions(); }],
  ];

  document.addEventListener('bloom:screen', (event) => {
    const n = /** @type {CustomEvent} */ (event).detail.screen;
    if (!n) return;
    const screen = screenEl(n);
    buildScreen(screen); // widgets first, then prefill and per-screen refresh
    if (!screen) return;
    applyPrefill(screen);
    ON_SHOW.forEach(([selector, refresh]) => { if (screen.querySelector(selector)) refresh(); });
  });

  document.addEventListener('bloom:draft', (event) => {
    const path = /** @type {CustomEvent} */ (event).detail.path || '';
    if (path.startsWith('s18.')) renderTaskPreview();
  });

  document.addEventListener('bloom:element', (event) => {
    const id = /** @type {CustomEvent} */ (event).detail.id;
    if (id === 't02') renderHistories();
    if (id === 't08' && !store.state.history.plan.length) {
      const plan = currentPlan();
      if (plan) store.update((st) => { st.history.plan.push({ ...plan, reason: 'الخطة الأولى', at: nowIso() }); });
    }
  });

  document.addEventListener('input', onRowEdit);
  document.addEventListener('change', (event) => {
    const control = /** @type {HTMLInputElement} */ (event.target);
    if (control.matches?.('#s19-rows input[type="checkbox"]')) onRowEdit(event);
    if (control.dataset?.testItem) {
      const item = control.dataset.testItem;
      store.update((st) => { if (st.test.draft) st.test.draft.answers = { ...st.test.draft.answers, [item]: control.value }; });
      renderTestCount();
    }
  });
  document.addEventListener('click', (event) => {
    const choice = /** @type {HTMLElement} */ (event.target).closest('[data-path-choice]');
    if (choice) store.update((st) => { st.drafts.s04 = { ...(st.drafts.s04 || {}), path: choice.getAttribute('data-path-choice') }; });
  });
  $$('select[data-version-select]').forEach((select) => select.addEventListener('change', () => { select.dataset.userSet = '1'; }));
  byId('source-form')?.addEventListener('submit', addSource);
  byId('trial-form')?.addEventListener('submit', addTrial);

  // ---------------------------------------------------------------------------
  // Lazy widget building: a screen's generated widgets are built the first time
  // it is shown (or before printing), so page load does not build all 28 screens.
  // ---------------------------------------------------------------------------

  const builtScreens = new Set();

  /** @param {HTMLElement|null} screen */
  function buildScreen(screen) {
    if (!screen || builtScreens.has(screen.id)) return;
    builtScreens.add(screen.id);
    renderReviews(screen);
    renderDeficits(screen);
    renderRubric(screen);
    renderDiagnostic(screen);
    $$('[data-check]', screen).forEach(renderCheck);
    buildScreenFooters(screen);
    restoreFields(screen);
    refreshConditionals();
  }

  window.addEventListener('beforeprint', () => $$('[data-screen]').forEach(buildScreen));

  // ---------------------------------------------------------------------------
  // Public hooks for main.js and boot
  // ---------------------------------------------------------------------------

  window.BloomLearning = Object.freeze({
    /**
     * Maps friendly hashes to element ids.
     * @param {string} id
     * @returns {string|null}
     */
    resolveAlias(id) {
      if (id === 'continue') {
        const pos = store.state.position?.screen;
        return pos && screenEl(pos) ? `screen-${pos}` : 'screen-01';
      }
      if (id === 'next') return `screen-${C.suggestNextScreen(store.state, D.RECOMMENDED_PATH, D.ELEMENTS)}`;
      if (id === 'start') return 'screen-01';
      return null;
    },
    /** Extension point for screen modules in this file. */
    store,
  });

  document.addEventListener('bloom:screen', (event) => {
    const n = /** @type {CustomEvent} */ (event).detail.screen;
    if (!n) return;
    store.stage((st) => { st.position = { screen: n, at: nowIso() }; });
    flushSave();
  });

  document.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const actionEl = /** @type {HTMLElement|null} */ (target.closest('[data-action]'));
    if (actionEl && actions[actionEl.dataset.action || '']) {
      event.preventDefault();
      actions[actionEl.dataset.action || ''](actionEl);
      return;
    }
    const link = /** @type {HTMLAnchorElement|null} */ (target.closest('a[href]'));
    if (link && link.origin === window.location.origin && link.pathname !== window.location.pathname) guardLeave(event, link);
    else if (link && link.protocol === 'file:' && link.pathname !== window.location.pathname) guardLeave(event, link);
  });

  byId('import-file')?.addEventListener('change', (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target);
    const file = input.files?.[0];
    if (file) importBackup(file);
    input.value = '';
  });

  // Boot. Order matters: build widgets, then restore values, then paint state.
  renderLevelOptions();
  restoreFields();
  initFields();
  initLeaveGuard();
  Object.entries(screenInits).forEach(([n, init]) => { const s = screenEl(n); if (s) init(s); });
  renderLegacyPanels();
  renderHistories();
  renderTaskPreview();
  refreshConditionals();
  renderSaveStatus();
  renderProgress();
  if (store.status.recovered) appStatus('تعذرت قراءة السجل المحفوظ؛ احتفظنا بنسخة منه وبدأنا سجلًا جديدًا.');
  else if (window.location.hash === '#continue' && store.status.at) appStatus(`${D.MESSAGES.restored} تاريخ آخر حفظ: ${fmtDateTime(store.status.at)}.`);
  window.addEventListener('pageshow', () => renderSaveStatus());
  void pageLoadedAt;
})();
