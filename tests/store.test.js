/**
 * Unit tests for js/store.js: saving, honest failure, recovery, migration from the
 * previous site's keys, and export/import. Run: npm test
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore, STORAGE_KEY, BACKUP_KEY, LEGACY_KEYS } = require('../js/store.js');

/** Minimal in-memory Storage with an optional write failure switch. */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    failWrites: false,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) {
      if (this.failWrites) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

let tick = 0;
const clock = () => new Date(Date.UTC(2026, 9, 23, 10, 0, tick++)).toISOString();

test('saves and restores a draft after a reload', () => {
  const storage = memoryStorage();
  const a = createStore({ storage, now: clock });
  a.load();
  assert.equal(a.update((s) => { s.drafts.s07 = { paraphrase: 'نص' }; }), true);
  const b = createStore({ storage, now: clock });
  b.load();
  assert.equal(b.state.drafts.s07.paraphrase, 'نص');
});

test('a failed write reports failure, keeps the text in memory and retries later', () => {
  const storage = memoryStorage();
  const store = createStore({ storage, now: clock });
  store.load();
  store.update((s) => { s.drafts.s03 = { title: 'أول' }; });
  storage.failWrites = true;
  const ok = store.update((s) => { s.drafts.s03.title = 'ثانٍ'; });
  assert.equal(ok, false);
  assert.equal(store.status.ok, false);
  assert.equal(store.status.error, 'quota');
  assert.equal(store.status.dirty, true);
  assert.equal(store.state.drafts.s03.title, 'ثانٍ'); // still visible
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).drafts.s03.title, 'أول'); // no false success
  storage.failWrites = false;
  assert.equal(store.save(), true);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).drafts.s03.title, 'ثانٍ');
});

test('no storage at all is reported, not hidden', () => {
  const store = createStore({ storage: null, now: clock });
  store.load();
  assert.equal(store.status.available, false);
  assert.equal(store.save(), false);
});

test('an unreadable record is backed up, never silently overwritten', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: '{broken' });
  const store = createStore({ storage, now: clock });
  store.load();
  assert.equal(store.status.recovered, true);
  assert.equal(storage.getItem(BACKUP_KEY), '{broken');
});

test('partial or older records are completed, unknown fields kept', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ drafts: { s09: { statement: 'هدف' } }, extra: 1, test: {} }) });
  const store = createStore({ storage, now: clock });
  store.load();
  assert.equal(store.state.drafts.s09.statement, 'هدف');
  assert.deepEqual(store.state.test.attempts, []);
  assert.deepEqual(store.state.project.versions, []);
  assert.equal(store.state.extra, 1);
});

test('migration copies legacy data, pre-fills only empty unambiguous fields and leaves old keys untouched', () => {
  const lessonDraft = { 'lt-teacher-name': 'معلم', 'lt-subject': 'العلوم', 'lt-lesson-title': 'الدورة المائية', 'lt-original-goal': 'أن يفهم' };
  const reflections = { 'reflection-ws1': 'تأمل' };
  const progress = ['intro', 'map'];
  const initial = {
    [LEGACY_KEYS.lessonDraft]: JSON.stringify(lessonDraft),
    [LEGACY_KEYS.reflections]: JSON.stringify(reflections),
    [LEGACY_KEYS.progress]: JSON.stringify(progress),
  };
  const storage = memoryStorage(initial);
  const store = createStore({ storage, now: clock });
  store.load();
  assert.equal(store.status.migrated, true);
  assert.equal(store.state.drafts.s03.title, 'الدورة المائية');
  assert.equal(store.state.drafts.s03.subject, 'العلوم');
  assert.deepEqual(store.state.legacy.progress, ['intro', 'map']);
  assert.equal(store.state.legacy.progressCounted, false);
  assert.deepEqual(store.state.elements, {}); // old page marks are not completions
  // Old keys are byte-for-byte unchanged.
  Object.entries(initial).forEach(([k, v]) => assert.equal(storage.getItem(k), v));
  // A second load does not migrate again or overwrite later edits.
  store.update((s) => { s.drafts.s03.title = 'عنوان جديد'; });
  const again = createStore({ storage, now: clock });
  again.load();
  assert.equal(again.state.drafts.s03.title, 'عنوان جديد');
});

test('migration with empty legacy values does nothing', () => {
  const storage = memoryStorage({ [LEGACY_KEYS.lessonDraft]: JSON.stringify({ 'lt-subject': '  ' }), [LEGACY_KEYS.progress]: '[]' });
  const store = createStore({ storage, now: clock });
  store.load();
  assert.equal(store.state.legacy, null);
});

test('export then import restores the record and keeps a backup of the replaced one', () => {
  const storage = memoryStorage();
  const a = createStore({ storage, now: clock });
  a.load();
  a.update((s) => { s.elements.t01 = { at: 'x' }; s.drafts.s03 = { title: 'مهمة' }; });
  const file = a.exportData();

  const other = memoryStorage();
  const b = createStore({ storage: other, now: clock });
  b.load();
  b.update((s) => { s.drafts.s03 = { title: 'قديم' }; });
  const parsed = b.parseImport(file);
  assert.equal(parsed.ok, true);
  assert.equal(b.applyImport(parsed.data), true);
  assert.equal(b.state.drafts.s03.title, 'مهمة');
  assert.equal(JSON.parse(other.getItem(BACKUP_KEY)).drafts.s03.title, 'قديم');
  assert.deepEqual(b.parseImport('not json'), { ok: false, reason: 'json' });
  assert.deepEqual(b.parseImport('{"app":"other","data":{}}'), { ok: false, reason: 'format' });
});
