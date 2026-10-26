/**
 * @file portal.js — entry portal helper for index.html.
 *
 * AI usage note (Claude Code): written during the role-split refactor. Before the
 * split, index.html held the whole training kit, so links shared earlier point at
 * sections such as `index.html#map`. Those sections now live in learn/ (the
 * trainee's own path since 2026-10-25; trainee.html forwards there too).
 * This script forwards such links there so they keep working. A bare visit to
 * index.html (no hash, or an unknown hash) stays on the portal.
 */
'use strict';

(() => {
  /** Section ids of the trainee page that old links may target. Keep in sync with learn/index.html. */
  const LEGACY_SECTION_IDS = Object.freeze(['intro', 'map', 'plan', 'activities', 'template', 'check', 'resources', 'main-content']);

  /**
   * Returns the learn/ URL for a legacy section hash, or null if the hash
   * does not name a known section.
   * @param {string} hash - window.location.hash, e.g. "#map".
   * @returns {string|null}
   */
  const legacyTarget = (hash) => {
    let id;
    try {
      id = decodeURIComponent(hash.replace(/^#/, ''));
    } catch {
      return null; // malformed escape such as "#%" — stay on the portal
    }
    return LEGACY_SECTION_IDS.includes(id) ? `learn/#${encodeURIComponent(id)}` : null;
  };

  const target = legacyTarget(window.location.hash);
  if (target) {
    // replace() keeps the portal out of history, so Back does not loop.
    window.location.replace(target);
    return;
  }

  /**
   * Shows the trainee's direct link (absolute, so it can be pasted into a message)
   * and copies it. Falls back to selecting the text where the clipboard API is
   * unavailable (file:// in some browsers, or a denied permission).
   */
  const urlEl = document.getElementById('portal-learn-url');
  const copyBtn = document.querySelector('[data-copy-learn]');
  const copyStatus = document.getElementById('portal-copy-status');
  const learnUrl = new URL('learn/', window.location.href).href;
  if (urlEl) urlEl.textContent = learnUrl;
  if (copyBtn && urlEl && copyStatus) {
    let feedbackTimer = 0;
    let request = 0;
    copyBtn.addEventListener('click', async () => {
      const current = ++request;
      clearTimeout(feedbackTimer);
      copyBtn.textContent = 'نسخ';
      copyBtn.removeAttribute('data-copied');
      try {
        await navigator.clipboard.writeText(learnUrl);
        if (current !== request) return;
        copyBtn.textContent = 'تم النسخ';
        copyBtn.setAttribute('data-copied', '');
        copyStatus.textContent = 'نُسخ الرابط. أرسله للمتدرب ليدخل مساره مباشرة.';
        feedbackTimer = window.setTimeout(() => {
          copyBtn.textContent = 'نسخ';
          copyBtn.removeAttribute('data-copied');
        }, 3000);
      } catch {
        if (current !== request) return;
        const range = document.createRange();
        range.selectNodeContents(urlEl);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        copyStatus.textContent = 'تعذر النسخ التلقائي؛ الرابط محدد الآن، انسخه يدويًا.';
      }
    });
  }

  /**
   * Says whether this browser holds saved work, so "تابع تعلمي" is honest about
   * what it will find. Reads only; the record is owned by js/store.js.
   */
  const resume = document.getElementById('portal-resume');
  if (!resume) return;
  try {
    const raw = window.localStorage.getItem('bloomLearning.v1');
    const record = raw ? JSON.parse(raw) : null;
    const screen = record && record.position && record.position.screen;
    const done = record && record.elements ? Object.values(record.elements).filter((e) => e && e.at).length : 0;
    // "20-5" is part 5 of screen 20: shown as "20 هـ", as on the screen itself.
    const letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي'];
    const [group, part] = String(screen || '').split('-');
    const label = part ? `${group} ${letters[Number(part) - 1] || part}` : group;
    const title = typeof record?.position?.title === 'string' ? record.position.title : '';
    const start = document.querySelector('[data-portal-start]');
    const follow = document.querySelector('[data-portal-continue]');
    if (screen && start && follow) {
      start.className = 'portal-btn portal-btn--light';
      follow.className = 'portal-btn portal-btn--primary';
      start.textContent = 'من البداية';
      start.title = 'يفتح بداية البرنامج مع الاحتفاظ بعملك المحفوظ';
    }
    resume.textContent = screen
      ? `تابع من: ${title || `الشاشة ${label}`} (الشاشة ${label}). العناصر المكتملة: ${done} من 20. فتح البداية يبقي عملك محفوظًا.`
      : 'لا يوجد عمل محفوظ في هذا المتصفح بعد. يُحفظ عملك على هذا الجهاز فقط.';
  } catch {
    resume.textContent = 'هذا المتصفح يمنع الحفظ المحلي الآن؛ اقرأ «كيف أحفظ عملي» قبل البدء.';
  }
})();
