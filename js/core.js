/**
 * @file core.js — pure learning logic: element rules, content progress, scoring,
 * pass evaluation and the (deferred) retake policy.
 *
 * No DOM and no storage access here, so every rule can be unit tested in Node
 * (tests/core.test.js). The UI (js/learning.js) calls these functions and only
 * displays their results. Written with Claude Code (AI-assisted).
 *
 * State shape: see js/store.js -> createEmptyState().
 */
'use strict';

(function (root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else root.BloomCore = core;
})(typeof self !== 'undefined' ? self : this, () => {
  // ---------------------------------------------------------------------------
  // Generic helpers
  // ---------------------------------------------------------------------------

  /** @param {unknown} value @returns {boolean} true for missing or whitespace-only text. */
  const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

  /** Deep copy of plain JSON data. @template T @param {T} value @returns {T} */
  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

  /**
   * Reads a draft value by "sNN.field" path.
   * @param {object} state
   * @param {string} path
   * @returns {any}
   */
  function getField(state, path) {
    const [screen, field] = path.split('.');
    return state?.drafts?.[screen]?.[field];
  }

  // ---------------------------------------------------------------------------
  // Completion elements
  //
  // Each rule says what the learner must have DONE. Visiting a screen never
  // satisfies a rule. `fields` lists draft paths that must be non-blank; an
  // entry {path, allow} also accepts a companion "<field>Status" value in allow
  // (e.g. "tbd" = لم أحدده بعد, "na" = لا ينطبق). `checks` lists practice checks
  // that must be solved. `custom` handles rules that cannot be declared as lists.
  // ---------------------------------------------------------------------------

  /** @type {Record<string, {fields?: Array<string|{path: string, allow: string[]}>, checks?: string[], custom?: (state: object) => string[]}>} */
  const ELEMENT_RULES = {
    t01: { custom: diagnosticMissing },
    t02: { fields: ['s03.title', 's03.current', 's03.need', 's03.status'] },
    t03: { checks: ['s05'] },
    t04: { checks: ['s06'] },
    t05: { checks: ['s07'], fields: ['s07.paraphrase', 's07.rv1', 's07.rv2', 's07.rv3'] },
    t06: { checks: ['s08'], fields: ['s08.means', 's08.alternative', 's08.rv1', 's08.rv2'] },
    t07: { fields: ['s09.performance', 's09.conditions', 's09.criterion', 's09.statement', 's09.rv1', 's09.rv2', 's09.rv3', 's09.rv4'] },
    t08: { fields: ['s10.priority', 's10.step', 's10.return', 's10.specific'] },
    t09: { checks: ['s13', 's13b'] },
    t10: { custom: workshopTwoMissing },
    t11: { fields: ['s15.goal', 's15.action', 's15.evidence', 's15.function', 's15.level', 's15.reason', 's15.alternative', 's15.rv1', 's15.rv2', 's15.changed'] },
    t12: { fields: ['s16.before', 's16.after', 's16.explain', 's16.kind'] },
    t13: {
      fields: [
        { path: 's17.audience', allow: ['tbd', 'na'] },
        { path: 's17.prereq', allow: ['tbd', 'na'] },
        's17.goal',
        { path: 's17.constraints', allow: ['tbd', 'na'] },
        's17.goalReview',
      ],
    },
    t14: { fields: ['s18.task', 's18.sources', 's18.means', 's18.alternative', 's18.rationale', 's18.process', 's18.processQuote', 's18.previewChecked'] },
    t15: { custom: criteriaMissing },
    t16: { custom: projectReviewMissing },
    t17: { custom: remediationMissing },
    t18: { custom: sourceCardMissing },
    t19: { checks: ['s26'], fields: ['s26.use', 's26.limit', 's26.reviewed'] },
    t20: { custom: trialPlanMissing },
  };

  /** Rubric criterion ids (kept here so the rule does not depend on the data file). */
  const RUBRIC_IDS = ['goal', 'alignment', 'clarity', 'digital', 'feedback', 'sources', 'trial'];

  /** @returns {string[]} */
  function diagnosticMissing(state) {
    const attempts = state?.diagnostic?.attempts || [];
    const last = attempts[attempts.length - 1];
    if (!last) return ['diagnostic.submit'];
    const missing = [];
    const unanswered = (last.items || []).filter((id) => isBlank(last.answers?.[id]));
    if (!last.items || unanswered.length) missing.push('diagnostic.allAnswered');
    if (!last.reportViewedAt) missing.push('diagnostic.report');
    return missing;
  }

  /** Screen 14: version written, example opened, three criteria judged, gaps fixed or explained. */
  function workshopTwoMissing(state) {
    const missing = [];
    ['s14.v1', 's14.v1evidence'].forEach((p) => { if (isBlank(getField(state, p))) missing.push(p); });
    if (!getField(state, 's14.exampleOpened')) missing.push('s14.exampleOpened');
    const crit = ['s14.c1', 's14.c2', 's14.c3'];
    crit.forEach((p) => { if (isBlank(getField(state, p))) missing.push(p); });
    const anyMissing = crit.some((p) => getField(state, p) === 'missing');
    if (anyMissing && isBlank(getField(state, 's14.v2')) && isBlank(getField(state, 's14.keepReason'))) {
      missing.push('s14.v2|s14.keepReason');
    }
    return missing;
  }

  /** Screen 19: at least one complete criterion row and the comparison confirmed. */
  function criteriaMissing(state) {
    const rows = getField(state, 's19.rows');
    const complete = Array.isArray(rows) && rows.some((r) => r && ['desc', 'evidence', 'remedy', 'next'].every((k) => !isBlank(r[k])));
    const missing = complete ? [] : ['s19.rows'];
    if (!getField(state, 's19.compared')) missing.push('s19.compared');
    return missing;
  }

  /** Screen 20: every rubric criterion judged with evidence (or N/A with a reason) and a saved version. */
  function projectReviewMissing(state) {
    const missing = [];
    RUBRIC_IDS.forEach((id) => {
      const level = getField(state, `s20.level_${id}`);
      if (isBlank(level)) missing.push(`s20.level_${id}`);
      else if (isBlank(getField(state, `s20.evidence_${id}`))) missing.push(`s20.evidence_${id}`);
    });
    const versions = state?.project?.versions || [];
    if (!versions.some((v) => v && v.review)) missing.push('project.version');
    return missing;
  }

  /** Screen 24: needs a submitted test attempt whose report was opened. */
  function remediationMissing(state) {
    const missing = [];
    const attempts = state?.test?.attempts || [];
    if (!attempts.length) missing.push('test.attempt');
    else if (!state.test.reportViewedAt) missing.push('test.report');
    ['s24.concept', 's24.conclusion', 's24.step'].forEach((p) => { if (isBlank(getField(state, p))) missing.push(p); });
    return missing;
  }

  /** Fields a source card needs before it counts (screen 25). */
  const SOURCE_REQUIRED = ['title', 'author', 'locator', 'accessed', 'location', 'purpose', 'use'];

  /** @param {object} card @returns {boolean} */
  const isSourceCardComplete = (card) => !!card && SOURCE_REQUIRED.every((k) => !isBlank(card[k]));

  function sourceCardMissing(state) {
    return (state?.sources || []).some(isSourceCardComplete) ? [] : ['sources.card'];
  }

  /** Screen 27: an executable plan, or an obstacle with the step to resolve it. */
  function trialPlanMissing(state) {
    const plan = ['s27.type', 's27.context', 's27.evidence', 's27.criterion', 's27.return'];
    const planMissing = plan.filter((p) => isBlank(getField(state, p)));
    if (!planMissing.length) return [];
    const obstacle = ['s27.obstacle', 's27.obstacleStep'];
    const obstacleMissing = obstacle.filter((p) => isBlank(getField(state, p)));
    if (!obstacleMissing.length && !isBlank(getField(state, 's27.type'))) return [];
    return planMissing;
  }

  /**
   * Lists what is still missing for an element. An empty array means the rule is met.
   * @param {string} elementId e.g. "t05"
   * @param {object} state
   * @returns {string[]} Missing draft paths or rule keys.
   */
  function missingForElement(elementId, state) {
    const rule = ELEMENT_RULES[elementId];
    if (!rule) return [`unknown:${elementId}`];
    const missing = [];
    (rule.checks || []).forEach((id) => { if (!state?.checks?.[id]?.solvedAt) missing.push(`check:${id}`); });
    (rule.fields || []).forEach((spec) => {
      const path = typeof spec === 'string' ? spec : spec.path;
      const value = getField(state, path);
      if (!isBlank(value) && value !== false) return;
      if (typeof spec === 'object' && spec.allow.includes(getField(state, `${path}Status`))) return;
      missing.push(path);
    });
    if (rule.custom) missing.push(...rule.custom(state));
    return missing;
  }

  /**
   * Counts completed elements. A completion is a recorded action, so it is read
   * from state.elements (set once, never removed by later edits) and each id
   * counts once whatever the number of attempts.
   * @param {object} state
   * @param {string[]} elementIds
   * @returns {number}
   */
  function countCompleted(state, elementIds) {
    const done = state?.elements || {};
    return new Set(elementIds.filter((id) => done[id] && done[id].at)).size;
  }

  // ---------------------------------------------------------------------------
  // Pass evaluation (approved rule: content >= 80% AND score >= 60, both required)
  // ---------------------------------------------------------------------------

  /**
   * Content progress with integer arithmetic so no rounding can cross the threshold.
   * @param {number} completed
   * @param {number} total
   * @param {number} threshold Percent, e.g. 80.
   * @returns {{completed: number, total: number, percent: number, met: boolean, needed: number, remaining: number}}
   *   percent is floored for display (79.9 shows 79, never 80).
   */
  function contentProgress(completed, total, threshold) {
    const safeTotal = Math.max(1, total);
    const done = Math.min(Math.max(0, completed), safeTotal);
    const needed = Math.ceil((threshold * safeTotal) / 100);
    return {
      completed: done,
      total: safeTotal,
      percent: Math.floor((done * 100) / safeTotal),
      met: done * 100 >= threshold * safeTotal,
      needed,
      remaining: Math.max(0, needed - done),
    };
  }

  /**
   * Evaluates the two pass conditions independently.
   * @param {{completed: number, total: number, approvedScore: number|null, contentThreshold: number, scoreThreshold: number}} input
   * @returns {{content: ReturnType<typeof contentProgress>, testTaken: boolean, score: number|null, scoreMet: boolean, scoreGap: number|null, passed: boolean, status: 'passed'|'content-only'|'score-only'|'neither'}}
   */
  function evaluatePass({ completed, total, approvedScore, contentThreshold, scoreThreshold }) {
    const content = contentProgress(completed, total, contentThreshold);
    const testTaken = typeof approvedScore === 'number' && Number.isFinite(approvedScore);
    const scoreMet = testTaken && approvedScore >= scoreThreshold;
    let status = 'neither';
    if (content.met && scoreMet) status = 'passed';
    else if (content.met) status = 'content-only';
    else if (scoreMet) status = 'score-only';
    return {
      content,
      testTaken,
      score: testTaken ? approvedScore : null,
      scoreMet,
      scoreGap: testTaken ? Math.max(0, scoreThreshold - approvedScore) : null,
      passed: status === 'passed',
      status,
    };
  }

  // ---------------------------------------------------------------------------
  // Final test scoring and the deferred retake policy
  // ---------------------------------------------------------------------------

  /**
   * Scores one submitted attempt: each correct item earns `points`, wrong or
   * unanswered earns 0, no negative marking (sec. 19).
   * @param {Record<string, string>} answers itemId -> optionId
   * @param {Record<string, {answer: string}>} keys itemId -> key
   * @param {string[]} itemIds Items of the form, in form order.
   * @param {number} points
   * @returns {{itemScores: Record<string, number>, correct: Record<string, boolean>, total: number}}
   */
  function scoreAttempt(answers, keys, itemIds, points) {
    const itemScores = {};
    const correct = {};
    let total = 0;
    itemIds.forEach((id) => {
      const ok = !!keys[id] && answers?.[id] === keys[id].answer;
      correct[id] = ok;
      itemScores[id] = ok ? points : 0;
      total += itemScores[id];
    });
    return { itemScores, correct, total };
  }

  /**
   * Retake policy. Approved by the owner on 2026-10-23: one submitted attempt,
   * no retake button. With a single attempt no "highest or latest" rule is
   * needed. To allow retakes later, raise maxAttempts AND set scoreRule
   * ('highest' | 'latest'); without scoreRule several attempts give no score.
   * null means "not decided" (the functions below still handle it).
   * @type {null | {maxAttempts: number, scoreRule?: 'highest'|'latest', requireReview?: boolean}}
   */
  const RETAKE_POLICY = Object.freeze({ maxAttempts: 1 });

  /**
   * Whether a new attempt may start.
   * @param {Array<object>} attempts Submitted attempts.
   * @param {typeof RETAKE_POLICY} policy
   * @returns {{allowed: boolean, reason: 'first'|'policy-pending'|'limit'|'allowed'}}
   */
  function retakeStatus(attempts, policy) {
    const count = Array.isArray(attempts) ? attempts.length : 0;
    if (count === 0) return { allowed: true, reason: 'first' };
    if (!policy) return { allowed: false, reason: 'policy-pending' };
    if (count >= policy.maxAttempts) return { allowed: false, reason: 'limit' };
    return { allowed: true, reason: 'allowed' };
  }

  /**
   * The score used for the pass decision. With one attempt it is that attempt.
   * With several attempts and no approved policy it returns null rather than
   * guessing between highest and latest.
   * @param {Array<{total: number, id: string}>} attempts
   * @param {typeof RETAKE_POLICY} policy
   * @returns {{score: number|null, attemptId: string|null, reason: 'none'|'single'|'policy-pending'|'highest'|'latest'}}
   */
  function selectApprovedScore(attempts, policy) {
    const list = Array.isArray(attempts) ? attempts.filter((a) => a && Number.isFinite(a.total)) : [];
    if (!list.length) return { score: null, attemptId: null, reason: 'none' };
    if (list.length === 1) return { score: list[0].total, attemptId: list[0].id, reason: 'single' };
    if (!policy || !policy.scoreRule) return { score: null, attemptId: null, reason: 'policy-pending' };
    if (policy.scoreRule === 'highest') {
      const best = list.reduce((a, b) => (b.total > a.total ? b : a));
      return { score: best.total, attemptId: best.id, reason: 'highest' };
    }
    const latest = list[list.length - 1];
    return { score: latest.total, attemptId: latest.id, reason: 'latest' };
  }

  /**
   * Deterministic shuffle (mulberry32) so a saved attempt keeps its option order.
   * @template T @param {T[]} items @param {number} seed @returns {T[]}
   */
  function seededShuffle(items, seed) {
    let a = seed >>> 0;
    const random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Diagnostic and path guidance (never part of the pass decision)
  // ---------------------------------------------------------------------------

  /**
   * Per-item diagnostic results and the screens to review.
   * @param {Array<{id: string, answer: string, review: string[]}>} items
   * @param {Record<string, string>} answers
   * @returns {{results: Array<{id: string, answered: boolean, correct: boolean}>, reviewScreens: string[]}}
   */
  function diagnosticReview(items, answers) {
    const reviewScreens = [];
    const results = items.map((item) => {
      const answered = !isBlank(answers?.[item.id]);
      const correct = answered && answers[item.id] === item.answer;
      if (!correct) item.review.forEach((s) => { if (!reviewScreens.includes(s)) reviewScreens.push(s); });
      return { id: item.id, answered, correct };
    });
    return { results, reviewScreens };
  }

  /**
   * Suggests the next screen: the first screen on the recommended path whose
   * element is not complete; then the test; then the return cycle.
   * @param {object} state
   * @param {string[]} path Screen numbers in recommended order.
   * @param {Array<{id: string, screen: string}>} elements
   * @returns {string} Screen number.
   */
  function suggestNextScreen(state, path, elements) {
    const byScreen = Object.fromEntries(elements.map((e) => [e.screen, e.id]));
    const done = state?.elements || {};
    const hasTest = (state?.test?.attempts || []).length > 0;
    for (const screen of path) {
      const el = byScreen[screen];
      if (screen === '22' && !hasTest) return '21';
      if (el && !(done[el] && done[el].at)) {
        if (el === 't17' && !hasTest) continue;
        return screen;
      }
    }
    return hasTest ? '28' : '21';
  }

  return Object.freeze({
    isBlank, clone, getField,
    ELEMENT_RULES, RUBRIC_IDS, SOURCE_REQUIRED, isSourceCardComplete, missingForElement, countCompleted,
    contentProgress, evaluatePass,
    scoreAttempt, RETAKE_POLICY, retakeStatus, selectApprovedScore, seededShuffle,
    diagnosticReview, suggestNextScreen,
  });
});
