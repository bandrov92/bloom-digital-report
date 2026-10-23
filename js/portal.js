/**
 * @file portal.js — entry portal helper for index.html.
 *
 * AI usage note (Claude Code): written during the role-split refactor. Before the
 * split, index.html held the whole training kit, so links shared earlier point at
 * sections such as `index.html#map`. Those sections now live in trainee.html.
 * This script forwards such links there so they keep working. A bare visit to
 * index.html (no hash, or an unknown hash) stays on the portal.
 */
'use strict';

(() => {
  /** Section ids of the trainee page that old links may target. Keep in sync with trainee.html. */
  const LEGACY_SECTION_IDS = Object.freeze(['intro', 'map', 'plan', 'activities', 'template', 'check', 'resources', 'main-content']);

  /**
   * Returns the trainee.html URL for a legacy section hash, or null if the hash
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
    return LEGACY_SECTION_IDS.includes(id) ? `trainee.html#${encodeURIComponent(id)}` : null;
  };

  const target = legacyTarget(window.location.hash);
  if (target) {
    // replace() keeps the portal out of history, so Back does not loop.
    window.location.replace(target);
    return;
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
    resume.textContent = screen
      ? `في هذا المتصفح عمل محفوظ. آخر موضع: الشاشة ${screen}. العناصر المكتملة: ${done} من 20.`
      : 'لا يوجد عمل محفوظ في هذا المتصفح بعد. يُحفظ عملك على هذا الجهاز فقط.';
  } catch {
    resume.textContent = 'هذا المتصفح يمنع الحفظ المحلي الآن؛ اقرأ «كيف أحفظ عملي» قبل البدء.';
  }
})();
