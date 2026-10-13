/**
 * @file main.js — interactivity for حقيبة هرم بلوم الرقمية.
 *
 * AI usage note: this module was refactored with Claude Code (AI-assisted) from the
 * original inline <script>. Changes made by the AI refactor:
 *  - All inline on* handlers replaced by delegated addEventListener calls (data-* hooks).
 *  - Accordions, Bloom map and modal made keyboard/screen-reader accessible (ARIA state).
 *  - Tool cards rendered with DOM APIs instead of innerHTML string templates.
 *  - Storage access wrapped in safe helpers; trainee reflections now auto-save.
 *  - The AI suggestion flow asks before overwriting the trainee's work and reports
 *    a clear message when no API key is available (e.g. on GitHub Pages).
 *  - LMS redesign: the Bloom levels moved from JS-rendered cards to static
 *    <details> in trainee.html; this module now tracks the course index
 *    (initCourseIndex); printing is handled by js/print-expand.js.
 *
 * Data compatibility: the lesson draft is still stored under "lessonTemplateDraft"
 * with the original field ids as keys, so drafts saved by the old page still load.
 */
'use strict';

(() => {
  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  /** localStorage keys. Do not rename: users' saved work lives under them. */
  const STORAGE_KEYS = Object.freeze({
    lessonDraft: 'lessonTemplateDraft',
    reflections: 'reflectionsDraft',
  });

  /** Lesson template field ids; also the keys inside the saved draft object. */
  const TEMPLATE_FIELDS = Object.freeze([
    'lt-teacher-name', 'lt-subject', 'lt-lesson-title', 'lt-original-goal',
    'lt-level1', 'lt-task1', 'lt-tool1',
    'lt-level2', 'lt-task2', 'lt-tool2',
    'lt-level3', 'lt-task3', 'lt-tool3',
    'lt-justification',
  ]);

  /** Fields the AI suggestion fills (and may overwrite). */
  const AI_FILLED_FIELDS = Object.freeze([
    'lt-level1', 'lt-task1', 'lt-tool1',
    'lt-level2', 'lt-task2', 'lt-tool2',
    'lt-level3', 'lt-task3', 'lt-tool3',
    'lt-justification',
  ]);

  const REFLECTION_FIELDS = Object.freeze(['reflection-ws1', 'reflection-ws2', 'reflection-ws3']);

  // Gemini API. The key is intentionally empty: the Gemini Canvas environment injects it.
  // Never commit a real key here — anything in this file is public on GitHub Pages.
  const GEMINI_API_KEY = '';
  const GEMINI_MODEL = 'gemini-2.5-flash-preview-09-2025';
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  /** @param {string} id @returns {HTMLElement|null} */
  const byId = (id) => document.getElementById(id);

  /**
   * Reads and parses a JSON value from localStorage without ever throwing
   * (storage can be blocked in private mode or by browser settings).
   * @param {string} key
   * @returns {Record<string, string>|null} The parsed object, or null if missing/unreadable.
   */
  function readStorage(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error(`Could not read "${key}" from localStorage:`, error);
      return null;
    }
  }

  /**
   * Serialises a value to localStorage without throwing.
   * @param {string} key
   * @param {unknown} value
   * @returns {boolean} true when the value was stored.
   */
  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Could not write "${key}" to localStorage:`, error);
      return false;
    }
  }

  const statusTimers = new WeakMap();

  /**
   * Shows a transient message in a live region and clears it after a delay.
   * A newer message cancels the pending clear of an older one.
   * @param {HTMLElement|null} element
   * @param {string} message
   * @param {number} [durationMs=3000]
   */
  function flashMessage(element, message, durationMs = 3000) {
    if (!element) return;
    clearTimeout(statusTimers.get(element));
    element.textContent = message;
    statusTimers.set(element, setTimeout(() => { element.textContent = ''; }, durationMs));
  }

  /**
   * Returns a debounced version of fn that runs after `wait` ms of inactivity.
   * @template {(...args: any[]) => void} F
   * @param {F} fn
   * @param {number} wait
   * @returns {(...args: Parameters<F>) => void}
   */
  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  // ---------------------------------------------------------------------------
  // Accordions
  // ---------------------------------------------------------------------------

  /**
   * Expands or collapses one accordion panel and keeps its trigger's ARIA state,
   * its arrow icon and the panel visibility in sync.
   * @param {string} id Suffix shared by "content-{id}", "icon-{id}" and data-accordion.
   */
  function toggleAccordion(id) {
    const content = byId(`content-${id}`);
    const icon = byId(`icon-${id}`);
    const trigger = document.querySelector(`[data-accordion="${CSS.escape(id)}"]`);
    if (!content) {
      console.error('Accordion panel not found for id:', id);
      return;
    }
    const willOpen = content.classList.contains('hidden');
    content.classList.toggle('hidden', !willOpen);
    if (icon) icon.textContent = willOpen ? '▲' : '▼';
    if (trigger) trigger.setAttribute('aria-expanded', String(willOpen));
  }

  // ---------------------------------------------------------------------------
  // Mobile menu
  // ---------------------------------------------------------------------------

  /**
   * Opens or closes the mobile navigation.
   * @param {boolean} [force] true to open, false to close, omitted to toggle.
   */
  function toggleMenu(force) {
    const menu = byId('mobile-menu');
    const button = byId('menu-toggle');
    if (!menu || !button) return;
    const open = typeof force === 'boolean' ? force : menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
  }

  // ---------------------------------------------------------------------------
  // Course index (LMS sidebar) and Bloom levels
  // ---------------------------------------------------------------------------

  /**
   * Marks the course-index link of the section being read with aria-current="true".
   * The link styles react to that attribute through Tailwind aria-[current=true]
   * variants, so this function only manages state, never classes.
   *
   * AI-assisted (Claude Code): an IntersectionObserver watches a band just below the
   * sticky header; the first observed section inside the band (in document order)
   * wins, and the last active link stays highlighted while no section is inside it.
   */
  function initCourseIndex() {
    const links = [...document.querySelectorAll('[data-course-link]')];
    if (links.length === 0 || !('IntersectionObserver' in window)) return;

    const linkFor = new Map();
    links.forEach((link) => {
      const section = byId(decodeURIComponent(link.hash.slice(1)));
      if (section) linkFor.set(section, link);
    });
    const sections = [...linkFor.keys()];
    const inBand = new Set();

    /** @param {HTMLAnchorElement} active */
    const setActive = (active) => {
      links.forEach((link) => {
        if (link === active) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) inBand.add(entry.target);
        else inBand.delete(entry.target);
      });
      const current = sections.find((section) => inBand.has(section));
      if (current) setActive(linkFor.get(current));
    }, { rootMargin: '-96px 0px -55% 0px' });

    // Above the first section (over the hero) the first unit is the natural "you are here".
    setActive(linkFor.get(sections[0]));
    sections.forEach((section) => observer.observe(section));
  }

  // ---------------------------------------------------------------------------
  // Video modal
  // ---------------------------------------------------------------------------

  /** Element that had focus before the modal opened; focus returns there on close. */
  let modalOpener = null;

  /**
   * Opens the YouTube video dialog.
   * @param {string} videoId 11-character YouTube id.
   * @param {HTMLElement|null} opener The control that opened it.
   */
  function openVideoModal(videoId, opener) {
    const modal = byId('video-modal');
    const iframe = byId('video-iframe');
    if (!modal || !iframe || !/^[\w-]{11}$/.test(videoId)) return;
    modalOpener = opener;
    // Permissions are granted only when a video is actually loaded (avoids policy warnings on an empty frame).
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
    iframe.setAttribute('allowfullscreen', '');
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    byId('video-modal-close')?.focus();
  }

  /** Closes the video dialog, stops playback and restores focus. */
  function closeVideoModal() {
    const modal = byId('video-modal');
    const iframe = byId('video-iframe');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    if (iframe) iframe.removeAttribute('src'); // stops the video
    document.body.classList.remove('modal-open');
    modalOpener?.focus();
    modalOpener = null;
  }

  /**
   * Keeps Tab / Shift+Tab inside the open dialog and closes it on Escape.
   * @param {KeyboardEvent} event
   */
  function handleModalKeydown(event) {
    const modal = byId('video-modal');
    if (!modal || modal.hidden) return;
    if (event.key === 'Escape') {
      closeVideoModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...modal.querySelectorAll('button, iframe, [href], [tabindex]:not([tabindex="-1"])')];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // ---------------------------------------------------------------------------
  // Lesson template draft (localStorage key: "lessonTemplateDraft")
  // ---------------------------------------------------------------------------

  /** Saves every lesson template field to localStorage and reports the result. */
  function saveLessonTemplate() {
    const saveStatus = byId('save-status');
    /** @type {Record<string, string>} */
    const templateData = {};
    TEMPLATE_FIELDS.forEach((id) => {
      const element = byId(id);
      if (element) templateData[id] = element.value;
    });
    if (writeStorage(STORAGE_KEYS.lessonDraft, templateData)) {
      flashMessage(saveStatus, 'تم حفظ المسودة بنجاح!');
    } else {
      flashMessage(saveStatus, 'خطأ: لم يتم حفظ المسودة (قد تكون السعة ممتلئة أو التخزين محظوراً).', 5000);
    }
  }

  /**
   * Restores the saved lesson draft into the form.
   * @param {{silent?: boolean}} [options] silent: no message when nothing is saved (used on page load).
   */
  function loadLessonTemplate({ silent = false } = {}) {
    const saveStatus = byId('save-status');
    const templateData = readStorage(STORAGE_KEYS.lessonDraft);
    if (!templateData || typeof templateData !== 'object') {
      if (!silent) flashMessage(saveStatus, 'لا توجد مسودة محفوظة.');
      return;
    }
    TEMPLATE_FIELDS.forEach((id) => {
      const element = byId(id);
      if (element && typeof templateData[id] === 'string') element.value = templateData[id];
    });
    if (!silent) flashMessage(saveStatus, 'تم استعادة المسودة.');
  }

  // ---------------------------------------------------------------------------
  // Trainee reflections (auto-saved, localStorage key: "reflectionsDraft")
  // ---------------------------------------------------------------------------

  /** Restores saved reflections and auto-saves them while the trainee types. */
  function initReflections() {
    const saved = readStorage(STORAGE_KEYS.reflections) || {};
    const saveAll = debounce(() => {
      /** @type {Record<string, string>} */
      const data = {};
      REFLECTION_FIELDS.forEach((id) => {
        const element = byId(id);
        if (element) data[id] = element.value;
      });
      writeStorage(STORAGE_KEYS.reflections, data);
    }, 400);

    REFLECTION_FIELDS.forEach((id) => {
      const element = byId(id);
      if (!element) return;
      if (typeof saved[id] === 'string') element.value = saved[id];
      element.addEventListener('input', saveAll);
    });
  }

  // ---------------------------------------------------------------------------
  // AI lesson suggestions (Gemini)
  // ---------------------------------------------------------------------------

  /**
   * Turns an HTTP status from the Gemini API into an Arabic message for the trainee.
   * @param {number} status
   * @returns {string}
   */
  function describeApiError(status) {
    if ([400, 401, 403].includes(status)) {
      return 'ميزة الاقتراح بالذكاء الاصطناعي غير مفعّلة في هذه النسخة من الموقع (لا يوجد مفتاح API). يمكنك تعبئة القالب يدوياً.';
    }
    if (status === 429) return 'تم تجاوز عدد الطلبات المسموح. حاول مرة أخرى بعد قليل.';
    if (status >= 500) return 'خدمة الذكاء الاصطناعي غير متاحة حالياً. حاول لاحقاً.';
    return `تعذر الاتصال بخدمة الذكاء الاصطناعي (رمز ${status}).`;
  }

  /**
   * Sends a prompt to Gemini and returns the parsed JSON answer.
   * Retries HTTP 429 with exponential backoff (1s, 2s, 4s).
   * @param {string} prompt User prompt.
   * @param {object} schema Gemini responseSchema describing the expected JSON.
   * @param {number} [retries=3] Remaining retries for HTTP 429.
   * @param {number} [delay=1000] Current backoff delay in ms.
   * @returns {Promise<any>} Parsed JSON returned by the model.
   * @throws {Error} With an Arabic, user-facing message.
   */
  async function callGeminiApi(prompt, schema, retries = 3, delay = 1000) {
    const systemInstruction = 'أنت خبير في التصميم التعليمي وتطبيقات هرم بلوم الرقمي. مهمتك هي مساعدة المعلمين على إنشاء خطط دروس مبتكرة. قدم إجابات باللغة العربية.';
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature: 0.8,
      },
    };

    let response;
    try {
      response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (networkError) {
      console.error('Network error calling Gemini API:', networkError);
      throw new Error('تعذر الاتصال بالإنترنت أو بخدمة الذكاء الاصطناعي.');
    }

    if (!response.ok) {
      if (response.status === 429 && retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return callGeminiApi(prompt, schema, retries - 1, delay * 2);
      }
      throw new Error(describeApiError(response.status));
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('Unexpected Gemini response structure:', result);
      throw new Error('لم يتمكن الذكاء الاصطناعي من توليد استجابة صالحة.');
    }
    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.error('Gemini returned invalid JSON:', text);
      throw new Error('لم يتمكن الذكاء الاصطناعي من توليد استجابة صالحة.');
    }
  }

  /**
   * Fills the redesign table with three AI-suggested activities.
   * Asks for confirmation first if the trainee has already written in those fields.
   */
  async function suggestLessonIdeas() {
    const loader = byId('gemini-loader');
    const button = byId('gemini-suggest-button');
    const errorEl = byId('gemini-error');
    const saveStatus = byId('save-status');

    const lessonTitle = byId('lt-lesson-title')?.value.trim() || '';
    const originalGoal = byId('lt-original-goal')?.value.trim() || '';
    if (errorEl) errorEl.textContent = '';

    if (!lessonTitle || !originalGoal) {
      if (errorEl) errorEl.textContent = 'خطأ: الرجاء إدخال (عنوان الدرس) و (الهدف التقليدي) أولاً.';
      return;
    }

    const hasWork = AI_FILLED_FIELDS.some((id) => byId(id)?.value.trim());
    if (hasWork && !window.confirm('سيستبدل الاقتراح ما كتبته في جدول إعادة التصميم والتبرير. هل تريد المتابعة؟')) {
      return;
    }

    loader?.classList.remove('hidden');
    if (button) button.disabled = true;
    if (saveStatus) saveStatus.textContent = '';

    const userQuery = `بالنسبة لدرس بعنوان "${lessonTitle}" وهدفه التقليدي هو "${originalGoal}"، قم بإنشاء خطة درس من 3 أنشطة تغطي المستويات التالية: 1. التذكر (Remembering)، 2. التطبيق (Applying)، 3. الإبداع (Creating). لكل نشاط، قدم وصفاً للمهمة من جملة واحدة، واقترح أداة رقمية مناسبة.`;
    const schema = {
      type: 'ARRAY',
      maxItems: 3,
      items: {
        type: 'OBJECT',
        properties: {
          level: { type: 'STRING' },
          task: { type: 'STRING' },
          tool: { type: 'STRING' },
        },
        required: ['level', 'task', 'tool'],
      },
    };

    try {
      const activities = await callGeminiApi(userQuery, schema);
      const valid = Array.isArray(activities) && activities.length === 3 &&
        activities.every((a) => a && typeof a.level === 'string' && typeof a.task === 'string' && typeof a.tool === 'string');
      if (!valid) throw new Error('الاستجابة المستلمة من الذكاء الاصطناعي غير مكتملة.');

      activities.forEach((activity, index) => {
        const row = index + 1;
        byId(`lt-level${row}`).value = activity.level;
        byId(`lt-task${row}`).value = activity.task;
        byId(`lt-tool${row}`).value = activity.tool;
      });
      byId('lt-justification').value = 'تم إنشاء هذه الخطة بواسطة Gemini. الرجاء مراجعتها وتبرير الاختيارات.';
    } catch (error) {
      if (errorEl) errorEl.textContent = `خطأ: ${error.message}`;
    } finally {
      loader?.classList.add('hidden');
      if (button) button.disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Wiring (single delegated click listener instead of inline onclick attributes)
  // ---------------------------------------------------------------------------

  document.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);

    const accordionTrigger = target.closest('[data-accordion]');
    if (accordionTrigger) {
      toggleAccordion(accordionTrigger.dataset.accordion);
      return;
    }

    const videoButton = target.closest('[data-video-id]');
    if (videoButton) {
      openVideoModal(videoButton.dataset.videoId, videoButton);
      return;
    }

    if (target.closest('#menu-toggle')) {
      toggleMenu();
      return;
    }

    if (target.closest('#mobile-menu a')) {
      toggleMenu(false);
      return;
    }

    if (target.closest('#video-modal-close') || target.id === 'video-modal') {
      closeVideoModal(); // close button or click on the dark backdrop
    }
  });

  document.addEventListener('keydown', handleModalKeydown);

  byId('save-draft-button')?.addEventListener('click', saveLessonTemplate);
  byId('load-draft-button')?.addEventListener('click', () => loadLessonTemplate());
  byId('gemini-suggest-button')?.addEventListener('click', suggestLessonIdeas);

  // Restore saved work on load (the script is deferred, so the DOM is ready).
  loadLessonTemplate({ silent: true });
  initReflections();
  initCourseIndex();
})();
