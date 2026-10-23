/**
 * Unit tests for js/core.js and the rule tables in js/course-data.js.
 * Run: npm test   (Node's built-in test runner; no dependencies)
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');
const data = require('../js/course-data.js');

const ELEMENT_IDS = data.ELEMENTS.map((e) => e.id);
const RULE = { contentThreshold: data.PASS_RULE.contentThreshold, scoreThreshold: data.PASS_RULE.scoreThreshold };

/** Builds a state with the first n elements recorded as complete. */
function stateWith(n) {
  const elements = {};
  ELEMENT_IDS.slice(0, n).forEach((id) => { elements[id] = { at: '2026-10-23T10:00:00Z' }; });
  return { elements };
}

test('there are exactly 20 elements, each with a rule and a distinct id', () => {
  assert.equal(ELEMENT_IDS.length, 20);
  assert.equal(new Set(ELEMENT_IDS).size, 20);
  ELEMENT_IDS.forEach((id) => assert.ok(core.ELEMENT_RULES[id], `rule for ${id}`));
});

test('pass cases from the design document (sec. 27)', () => {
  const cases = [
    { n: 15, score: 100, passed: false, status: 'score-only', percent: 75 },
    { n: 16, score: 60, passed: true, status: 'passed', percent: 80 },
    { n: 20, score: 50, passed: false, status: 'content-only', percent: 100 },
    { n: 16, score: null, passed: false, status: 'content-only', percent: 80 },
  ];
  cases.forEach(({ n, score, passed, status, percent }) => {
    const r = core.evaluatePass({ completed: core.countCompleted(stateWith(n), ELEMENT_IDS), total: 20, approvedScore: score, ...RULE });
    assert.equal(r.passed, passed, `${n} elements / ${score}`);
    assert.equal(r.status, status);
    assert.equal(r.content.percent, percent);
  });
});

test('boundaries: 59 fails, 60 passes; 15 of 20 fails, 16 of 20 passes', () => {
  const at = (n, s) => core.evaluatePass({ completed: n, total: 20, approvedScore: s, ...RULE });
  assert.equal(at(20, 59).passed, false);
  assert.equal(at(20, 59).scoreGap, 1);
  assert.equal(at(20, 60).passed, true);
  assert.equal(at(15, 100).content.remaining, 1);
  assert.equal(at(16, 100).passed, true);
  assert.equal(at(0, null).status, 'neither');
  assert.equal(at(0, null).testTaken, false);
});

test('no rounding crosses the threshold (79.x% is not 80%)', () => {
  // 79 of 100 equal elements = 79%; 3 of 4 = 75%; 7 of 9 = 77.7% -> floor 77, not met.
  assert.equal(core.contentProgress(79, 100, 80).met, false);
  assert.equal(core.contentProgress(7, 9, 80).percent, 77);
  assert.equal(core.contentProgress(7, 9, 80).met, false);
  assert.equal(core.contentProgress(8, 10, 80).met, true);
});

test('an element counts once and only when recorded as completed', () => {
  const state = { elements: { t01: { at: 'x' }, t02: { at: null }, t03: {} } };
  assert.equal(core.countCompleted(state, ELEMENT_IDS), 1);
  // Repeating an id in the list does not double count.
  assert.equal(core.countCompleted(state, ['t01', 't01']), 1);
});

test('visiting or typing partially never satisfies a rule', () => {
  const empty = { drafts: {}, checks: {}, elements: {} };
  ELEMENT_IDS.forEach((id) => assert.ok(core.missingForElement(id, empty).length > 0, `${id} must not be met by an empty state`));
  const partial = { drafts: { s03: { title: 'مهمة', current: '', need: 'x', status: 'planned' } } };
  assert.deepEqual(core.missingForElement('t02', partial), ['s03.current']);
});

test('checks must be solved; a wrong first attempt stays in history', () => {
  const state = { drafts: {}, checks: { s05: { attempts: [{ allCorrect: false }], solvedAt: null } } };
  assert.deepEqual(core.missingForElement('t03', state), ['check:s05']);
  state.checks.s05.attempts.push({ allCorrect: true });
  state.checks.s05.solvedAt = 'now';
  assert.deepEqual(core.missingForElement('t03', state), []);
  assert.equal(state.checks.s05.attempts[0].allCorrect, false);
});

test('t09 needs both halves of the screen 13 check (parts أ and ب)', () => {
  const state = { drafts: {}, checks: { s13: { attempts: [{ allCorrect: true }], solvedAt: 'now' } } };
  assert.deepEqual(core.missingForElement('t09', state), ['check:s13b']);
  state.checks.s13b = { attempts: [{ allCorrect: true }], solvedAt: 'now' };
  assert.deepEqual(core.missingForElement('t09', state), []);
  assert.ok(data.CHECKS.s13 && data.CHECKS.s13b, 'both checks defined');
  assert.equal(data.CHECKS.s13.element, 't09');
  assert.equal(data.CHECKS.s13b.element, 't09');
});

test('t13 accepts "not decided yet" or "not applicable" only where allowed', () => {
  const state = { drafts: { s17: { goal: 'هدف', goalReview: 'met', audienceStatus: 'tbd', prereqStatus: 'na', constraintsStatus: 'tbd' } } };
  assert.deepEqual(core.missingForElement('t13', state), []);
  state.drafts.s17.goal = '';
  state.drafts.s17.goalStatus = 'tbd'; // goal itself has no such allowance
  assert.deepEqual(core.missingForElement('t13', state), ['s17.goal']);
});

test('t01 needs every diagnostic item answered and the report opened', () => {
  const items = data.DIAGNOSTIC.map((q) => q.id);
  const answers = Object.fromEntries(items.map((id) => [id, 'a']));
  const state = { diagnostic: { attempts: [{ items, answers: { ...answers, q6: '' }, reportViewedAt: 'x' }] } };
  assert.deepEqual(core.missingForElement('t01', state), ['diagnostic.allAnswered']);
  state.diagnostic.attempts[0].answers.q6 = 'f';
  state.diagnostic.attempts[0].reportViewedAt = null;
  assert.deepEqual(core.missingForElement('t01', state), ['diagnostic.report']);
  state.diagnostic.attempts[0].reportViewedAt = 'x';
  assert.deepEqual(core.missingForElement('t01', state), []);
});

test('t10: a declared gap needs a revised version or a recorded reason', () => {
  const s14 = { v1: 'تعليمات', v1evidence: 'دليل', exampleOpened: true, c1: 'present', c2: 'missing', c3: 'present' };
  const state = { drafts: { s14 } };
  assert.deepEqual(core.missingForElement('t10', state), ['s14.v2|s14.keepReason']);
  s14.keepReason = 'أحتاج مراجعة المثال';
  assert.deepEqual(core.missingForElement('t10', state), []);
});

test('t16 does not require claiming every criterion is met', () => {
  const s20 = {};
  core.RUBRIC_IDS.forEach((id) => { s20[`level_${id}`] = 'improve'; s20[`evidence_${id}`] = 'شاهد'; });
  const state = { drafts: { s20 }, project: { versions: [] } };
  assert.deepEqual(core.missingForElement('t16', state), ['project.version']);
  state.project.versions.push({ id: 'v1', review: {} });
  assert.deepEqual(core.missingForElement('t16', state), []);
});

test('t17 cannot be completed before a submitted test attempt and opened report', () => {
  const state = { drafts: { s24: { concept: 'x', conclusion: 'y', step: 'z' } }, test: { attempts: [] } };
  assert.deepEqual(core.missingForElement('t17', state), ['test.attempt']);
  state.test.attempts.push({ total: 40 });
  assert.deepEqual(core.missingForElement('t17', state), ['test.report']);
  state.test.reportViewedAt = 'now';
  assert.deepEqual(core.missingForElement('t17', state), []);
});

test('t20: a full plan, or an obstacle with its next step', () => {
  const plan = { type: 'sim', context: 'c', evidence: 'e', criterion: 'k', return: 'r' };
  assert.deepEqual(core.missingForElement('t20', { drafts: { s27: plan } }), []);
  const obstacle = { type: 'class', obstacle: 'لا تتوفر حصة', obstacleStep: 'أطلب حصة' };
  assert.deepEqual(core.missingForElement('t20', { drafts: { s27: obstacle } }), []);
  assert.ok(core.missingForElement('t20', { drafts: { s27: { type: 'class' } } }).length > 0);
});

test('scoring: 10 points per correct item, no negative marking, unanswered = 0', () => {
  const ids = ['A1', 'A2', 'A3'];
  const keys = { A1: { answer: 'b' }, A2: { answer: 'c' }, A3: { answer: 'a' } };
  const r = core.scoreAttempt({ A1: 'b', A2: 'a' }, keys, ids, 10);
  assert.equal(r.total, 10);
  assert.deepEqual(r.itemScores, { A1: 10, A2: 0, A3: 0 });
});

test('approved policy: one attempt, no retake; undecided rules are not invented', () => {
  assert.deepEqual(core.RETAKE_POLICY, { maxAttempts: 1 });
  assert.deepEqual(core.retakeStatus([], core.RETAKE_POLICY), { allowed: true, reason: 'first' });
  assert.deepEqual(core.retakeStatus([{ total: 40 }], core.RETAKE_POLICY), { allowed: false, reason: 'limit' });
  assert.equal(core.selectApprovedScore([{ id: 'a', total: 70 }], core.RETAKE_POLICY).score, 70);
  // Several attempts without a score rule never get a guessed score.
  assert.equal(core.selectApprovedScore([{ id: 'a', total: 40 }, { id: 'b', total: 80 }], { maxAttempts: 2 }).score, null);
  assert.deepEqual(core.retakeStatus([], null), { allowed: true, reason: 'first' });
  assert.deepEqual(core.retakeStatus([{ total: 40 }], null), { allowed: false, reason: 'policy-pending' });
  assert.deepEqual(core.selectApprovedScore([{ id: 'a', total: 70 }], null), { score: 70, attemptId: 'a', reason: 'single' });
  assert.equal(core.selectApprovedScore([{ id: 'a', total: 40 }, { id: 'b', total: 80 }], null).score, null);
  // When a policy is approved later, both rules are ready.
  const two = [{ id: 'a', total: 80 }, { id: 'b', total: 50 }];
  assert.equal(core.selectApprovedScore(two, { maxAttempts: 2, scoreRule: 'highest' }).score, 80);
  assert.equal(core.selectApprovedScore(two, { maxAttempts: 2, scoreRule: 'latest' }).score, 50);
});

test('seeded shuffle is stable for a seed and keeps every option', () => {
  const opts = ['a', 'b', 'c'];
  assert.deepEqual(core.seededShuffle(opts, 42), core.seededShuffle(opts, 42));
  assert.deepEqual(core.seededShuffle(opts, 7).slice().sort(), opts);
});

test('diagnostic results never produce a pass score and list review screens once', () => {
  const answers = { q1: 't', q2: 'b', q3: 'a', q4: 'b', q5: 'b', q6: 'f' };
  const r = core.diagnosticReview(data.DIAGNOSTIC, answers);
  assert.deepEqual(r.reviewScreens, ['05', '08', '15']);
  assert.equal(r.results.filter((x) => x.correct).length, 4);
  // The pass evaluation ignores the diagnostic: no test attempt means no score.
  const pass = core.evaluatePass({ completed: 20, total: 20, approvedScore: null, ...RULE });
  assert.equal(pass.passed, false);
});

test('test forms: 10 items each, keys cover every item, coverage matches the map', () => {
  const forms = require('../js/test-forms.js');
  const keys = require('../js/test-keys.js');
  ['A', 'B'].forEach((form) => {
    const items = forms.FORMS[form];
    assert.equal(items.length, 10);
    const count = {};
    items.forEach((item) => {
      const key = keys.KEYS[item.id];
      assert.ok(key, `key for ${item.id}`);
      assert.ok(item.options.some((o) => o.id === key.answer), `answer option exists for ${item.id}`);
      count[key.outcome] = (count[key.outcome] || 0) + 1;
    });
    assert.deepEqual(count, { 'ن1': 2, 'ن2': 1, 'ن3': 2, 'ن4': 1, 'ن5': 2, 'ن6': 1, 'ن7': 1 });
  });
});

test('suggested next screen follows the recommended path', () => {
  assert.equal(core.suggestNextScreen({ elements: {} }, data.RECOMMENDED_PATH, data.ELEMENTS), '02');
  const s = stateWith(0);
  ['t01', 't02', 't07', 't08'].forEach((id) => { s.elements[id] = { at: 'x' }; });
  assert.equal(core.suggestNextScreen(s, data.RECOMMENDED_PATH, data.ELEMENTS), '05');
});
