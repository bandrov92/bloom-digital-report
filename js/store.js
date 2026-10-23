/**
 * @file store.js — the learner's saved work: one versioned record in the
 * browser's localStorage, honest save status, migration from the previous
 * version of the site, and export/import of a backup file.
 *
 * Limits (shown to the learner too): the record lives in this browser on this
 * device only. Clearing site data, a private window or another device means it
 * is not there. There is no account and no sync.
 *
 * Migration: the previous site stored three keys. They are read once and copied
 * into `legacy`; they are never modified or deleted, so the old data stays
 * available if anything goes wrong. Written with Claude Code (AI-assisted).
 */
'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BloomStore = api;
})(typeof self !== 'undefined' ? self : this, () => {
  /** Current record key and schema. A new schema gets a new upgrade step, not a new key. */
  const STORAGE_KEY = 'bloomLearning.v1';
  const SCHEMA = 1;
  /** A copy of a record that could not be read, or that an import replaced. */
  const BACKUP_KEY = 'bloomLearning.backup';

  /** Keys written by the previous site (read only; see CLAUDE.md "الحفاظ على البيانات"). */
  const LEGACY_KEYS = Object.freeze({
    lessonDraft: 'lessonTemplateDraft',
    reflections: 'reflectionsDraft',
    progress: 'lessonProgress',
  });

  /** Marker written in exported files so an import can recognise them. */
  const EXPORT_APP = 'bloom-digital-learning';

  /**
   * A fresh record. Every field the UI reads exists, so partial or older
   * records are completed by upgrade() instead of breaking the page.
   * @param {string} now ISO time.
   */
  function createEmptyState(now) {
    return {
      schema: SCHEMA,
      createdAt: now,
      updatedAt: now,
      position: null, // { screen: '05', at }
      drafts: {}, // sNN -> { field: value }
      checks: {}, // check id -> { attempts: [{answers, correct, at}], solvedAt }
      diagnostic: { attempts: [] },
      elements: {}, // tNN -> { at, version, screen, evidence }
      history: { needCard: [], plan: [] },
      project: { versions: [] },
      sources: [],
      trials: [],
      test: { attempts: [], draft: null, reportViewedAt: null },
      probe: null, // optional save/restore self-test on screen 02
      legacy: null,
    };
  }

  /** @param {unknown} v @returns {v is Record<string, any>} */
  const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  /**
   * Fills missing parts of a record so older or partial data stays usable.
   * Never deletes fields it does not know.
   * @param {any} raw
   * @param {string} now
   * @returns {object}
   */
  function upgrade(raw, now) {
    const base = createEmptyState(now);
    if (!isObject(raw)) return base;
    const state = { ...base, ...raw };
    state.schema = SCHEMA;
    ['drafts', 'checks', 'elements'].forEach((k) => { if (!isObject(state[k])) state[k] = {}; });
    if (!isObject(state.diagnostic) || !Array.isArray(state.diagnostic.attempts)) state.diagnostic = { attempts: [] };
    if (!isObject(state.history)) state.history = { needCard: [], plan: [] };
    ['needCard', 'plan'].forEach((k) => { if (!Array.isArray(state.history[k])) state.history[k] = []; });
    if (!isObject(state.project) || !Array.isArray(state.project.versions)) state.project = { versions: [] };
    if (!Array.isArray(state.sources)) state.sources = [];
    if (!Array.isArray(state.trials)) state.trials = [];
    if (!isObject(state.test)) state.test = { attempts: [], draft: null, reportViewedAt: null };
    if (!Array.isArray(state.test.attempts)) state.test.attempts = [];
    return state;
  }

  /**
   * Reads the previous site's keys without changing them.
   * @param {Storage} storage
   * @returns {{lessonDraft: object|null, reflections: object|null, progress: string[]|null}}
   */
  function readLegacy(storage) {
    const read = (key) => {
      try {
        const rawValue = storage.getItem(key);
        return rawValue ? JSON.parse(rawValue) : null;
      } catch {
        return null;
      }
    };
    const lessonDraft = read(LEGACY_KEYS.lessonDraft);
    const reflections = read(LEGACY_KEYS.reflections);
    const progress = read(LEGACY_KEYS.progress);
    return {
      lessonDraft: isObject(lessonDraft) ? lessonDraft : null,
      reflections: isObject(reflections) ? reflections : null,
      progress: Array.isArray(progress) ? progress : null,
    };
  }

  /** @param {object|null} obj @returns {boolean} true when any string value has text. */
  const hasText = (obj) => isObject(obj) && Object.values(obj).some((v) => typeof v === 'string' && v.trim() !== '');

  /**
   * Copies the previous site's data into the record. Only unambiguous values are
   * pre-filled (task title and subject) and only into empty fields; everything
   * else is shown read-only on screens 03 and 17 so the learner decides.
   * Old lesson marks are kept for reference but never counted: they were given
   * for reaching the end of a page, which the new rule does not accept.
   * @param {object} state
   * @param {ReturnType<typeof readLegacy>} legacy
   * @param {string} now
   * @returns {boolean} true when something was imported.
   */
  function applyLegacy(state, legacy, now) {
    const found = hasText(legacy.lessonDraft) || hasText(legacy.reflections) || (legacy.progress && legacy.progress.length > 0);
    if (!found) return false;
    state.legacy = {
      importedAt: now,
      lessonDraft: legacy.lessonDraft,
      reflections: legacy.reflections,
      progress: legacy.progress,
      progressCounted: false,
    };
    const draft = legacy.lessonDraft || {};
    const fill = (screen, field, value) => {
      if (typeof value !== 'string' || !value.trim()) return;
      state.drafts[screen] = state.drafts[screen] || {};
      if (!state.drafts[screen][field]) state.drafts[screen][field] = value;
    };
    fill('s01', 'title', draft['lt-lesson-title']);
    fill('s03', 'title', draft['lt-lesson-title']);
    fill('s03', 'subject', draft['lt-subject']);
    return true;
  }

  /**
   * Creates the store bound to a Storage implementation.
   * @param {{storage?: Storage|null, now?: () => string}} [options]
   */
  function createStore({ storage = null, now = () => new Date().toISOString() } = {}) {
    /** @type {{ok: boolean, at: string|null, error: string|null, recovered: boolean, migrated: boolean, available: boolean}} */
    const status = { ok: true, at: null, error: null, recovered: false, migrated: false, available: !!storage };
    let state = createEmptyState(now());
    let dirty = false;
    const listeners = new Set();
    const notify = () => listeners.forEach((fn) => fn({ ...status, dirty }));

    /** Loads the record, recovering from unreadable data and migrating legacy keys. */
    function load() {
      if (!storage) {
        status.available = false;
        status.ok = false;
        status.error = 'unavailable';
        return state;
      }
      let raw = null;
      try {
        raw = storage.getItem(STORAGE_KEY);
      } catch (error) {
        status.available = false;
        status.ok = false;
        status.error = 'unavailable';
        return state;
      }
      if (raw) {
        try {
          state = upgrade(JSON.parse(raw), now());
          status.at = state.updatedAt || null;
        } catch {
          // Keep the unreadable text so nothing is lost, then start clean.
          try { storage.setItem(BACKUP_KEY, raw); } catch { /* reported by the next save */ }
          state = createEmptyState(now());
          status.recovered = true;
        }
      } else {
        state = createEmptyState(now());
      }
      if (!state.legacy) {
        const legacy = readLegacy(storage);
        if (applyLegacy(state, legacy, now())) {
          status.migrated = save();
          // Verify the migrated copy before relying on it; old keys stay untouched either way.
          if (status.migrated) {
            const check = readBack();
            status.migrated = !!check && !!check.legacy;
          }
        }
      }
      return state;
    }

    /** @returns {object|null} The record as stored now, or null if unreadable. */
    function readBack() {
      try {
        const raw = storage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }

    /**
     * Writes the whole record. On failure the in-memory state is kept (the text
     * stays on screen) and `dirty` stays true so the next save retries.
     * @returns {boolean}
     */
    function save() {
      if (!storage) {
        dirty = true;
        status.ok = false;
        status.error = 'unavailable';
        notify();
        return false;
      }
      const stamp = now();
      const previous = state.updatedAt;
      state.updatedAt = stamp;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
        dirty = false;
        status.ok = true;
        status.at = stamp;
        status.error = null;
        notify();
        return true;
      } catch (error) {
        state.updatedAt = previous;
        dirty = true;
        status.ok = false;
        status.error = error && error.name === 'QuotaExceededError' ? 'quota' : 'write';
        notify();
        return false;
      }
    }

    /**
     * Applies a change to the record, then saves.
     * @param {(s: object) => void} mutate
     * @returns {boolean} Save result.
     */
    function update(mutate) {
      mutate(state);
      dirty = true;
      return save();
    }

    /** Applies a change without saving (for typing; a debounced save follows). */
    function stage(mutate) {
      mutate(state);
      dirty = true;
      notify();
    }

    /** @returns {string} Pretty JSON backup of the record. */
    function exportData() {
      return JSON.stringify({ app: EXPORT_APP, schema: SCHEMA, exportedAt: now(), data: state }, null, 2);
    }

    /**
     * Validates a backup file without applying it.
     * @param {string} text
     * @returns {{ok: true, data: object, exportedAt: string|null} | {ok: false, reason: 'json'|'format'}}
     */
    function parseImport(text) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, reason: 'json' };
      }
      if (!isObject(parsed) || parsed.app !== EXPORT_APP || !isObject(parsed.data)) return { ok: false, reason: 'format' };
      return { ok: true, data: upgrade(parsed.data, now()), exportedAt: parsed.exportedAt || null };
    }

    /**
     * Replaces the record with an imported one after keeping a backup copy.
     * @param {object} data Result of parseImport().data
     * @returns {boolean}
     */
    function applyImport(data) {
      try { storage?.setItem(BACKUP_KEY, JSON.stringify(state)); } catch { /* the save below reports */ }
      const previous = state;
      state = upgrade(data, now());
      if (!save()) {
        state = previous;
        return false;
      }
      return true;
    }

    return {
      load,
      save,
      update,
      stage,
      get state() { return state; },
      get status() { return { ...status, dirty }; },
      onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      exportData,
      parseImport,
      applyImport,
    };
  }

  return Object.freeze({ STORAGE_KEY, BACKUP_KEY, LEGACY_KEYS, SCHEMA, EXPORT_APP, createEmptyState, upgrade, readLegacy, applyLegacy, createStore });
});
