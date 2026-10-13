/**
 * @file print-expand.js — shared by trainee.html and trainer.html.
 *
 * AI usage note (Claude Code): extracted from main.js during the role split so the
 * trainer guide prints complete too. Browsers print a closed <details> without its
 * content, so every element marked data-print-open is opened before printing and
 * only those opened here are closed again afterwards.
 */
'use strict';

(() => {
  /** @type {HTMLDetailsElement[]} */
  let openedForPrint = [];

  window.addEventListener('beforeprint', () => {
    openedForPrint = [...document.querySelectorAll('details[data-print-open]:not([open])')];
    openedForPrint.forEach((details) => { details.open = true; });
  });

  window.addEventListener('afterprint', () => {
    openedForPrint.forEach((details) => { details.open = false; });
    openedForPrint = [];
  });
})();
