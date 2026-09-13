/**
 * mccb-participant.js — participant storage + research session QC
 *
 * The browser tasks in this repository are research adaptations. This module owns
 * participant-scoped persistence and now also records a conservative session
 * quality envelope so interrupted runs cannot silently look like valid data.
 */

const RESULT_SCHEMA_VERSION = 2;
const PARTICIPANT_SCHEMA_VERSION = 2;
const DEFAULT_TASK_VERSION = 'research-web-0.2.0';
const VALID_TEST_KEYS = new Set([
  'tmt', 'bacs', 'fluency', 'cpt', 'spatial-span', 'lns', 'hvlt', 'bvmt', 'mazes', 'msceit'
]);
const VALID_QC_STATUSES = new Set([
  'valid', 'aborted', 'interrupted', 'timing_violation', 'technical_failure', 'unverified'
]);

const TEST_ORDER = [
  { key: 'tmt',          name: 'TMT 连线测验',        file: 'pages/mccb-tmt.html' },
  { key: 'bacs',         name: 'BACS 符号编码',       file: 'pages/mccb-bacs.html' },
  { key: 'fluency',      name: '语义流畅性',          file: 'pages/mccb-fluency.html' },
  { key: 'cpt',          name: 'CPT-IP 持续操作',     file: 'pages/mccb-cpt.html' },
  { key: 'spatial-span', name: 'WMS-III 空间广度',    file: 'pages/mccb-spatial-span.html' },
  { key: 'lns',          name: '字母-数字广度',       file: 'pages/mccb-lns.html' },
  { key: 'hvlt',         name: 'HVLT-R 言语学习',     file: 'pages/mccb-hvlt.html' },
  { key: 'bvmt',         name: 'BVMT-R 视觉空间记忆', file: 'pages/mccb-bvmt.html' },
  { key: 'mazes',        name: 'NAB 迷宫',            file: 'pages/mccb-mazes.html' },
  { key: 'msceit',       name: 'MSCEIT 情绪管理',     file: 'pages/mccb-msceit.html' },
];

const KEY_TO_RESULT = {
  tmt: 'mccb-tmt-result',
  bacs: 'mccb-bacs-result',
  fluency: 'mccb-fluency-result',
  cpt: 'mccb-cpt-result',
  'spatial-span': 'mccb-spatial-span-result',
  lns: 'mccb-lns-result',
  hvlt: 'mccb-hvlt-result',
  bvmt: 'mccb-bvmt-result',
  mazes: 'mccb-mazes-result',
  msceit: 'mccb-msceit-result',
};

const RESULT_TO_KEY = Object.fromEntries(
  Object.entries(KEY_TO_RESULT).map(([k, v]) => [v, k])
);

const _ls = {
  get(key) {
    try { return localStorage.getItem(key); }
    catch { return null; }
  },
  set(key, val) {
    try { localStorage.setItem(key, val); return true; }
    catch (err) {
      console.warn('localStorage 写入失败（可能已满或不可用）:', key, err && err.message ? err.message : err);
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); return true; }
    catch { return false; }
  },
  json(key) {
    try {
      const value = this.get(key);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  },
  length() {
    try { return localStorage.length; }
    catch { return 0; }
  },
  key(i) {
    try { return localStorage.key(i); }
    catch { return null; }
  },
};

function monotonicNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function safeClone(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return null; }
}

function normalizeCohortId(value) {
  return String(value == null ? '' : value).trim();
}

function isValidCohortId(value) {
  const id = normalizeCohortId(value);
  return id.length >= 1 && id.length <= 64 && /^[A-Za-z0-9._-]+$/.test(id);
}

/**
 * ExperimentRuntime keeps a monotonic session clock and a machine-readable QC
 * state. Existing pages can keep their own task logic; ParticipantManager hooks
 * into markInProgress/saveResult so every newly saved result gets this metadata.
 */
const ExperimentRuntime = (() => {
  const sessions = new Map();

  function createSession(testKey) {
    return {
      testKey,
      taskVersion: DEFAULT_TASK_VERSION,
      status: 'valid',
      startedAt: new Date().toISOString(),
      completedAt: null,
      startedPerfMs: monotonicNow(),
      elapsedMs: null,
      clock: (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? 'performance.now'
        : 'Date.now',
      qc: {
        visibilityInterruptions: 0,
        timingViolation: false,
        technicalFailure: false,
        reasons: [],
      },
      events: [],
    };
  }

  function ensure(testKey) {
    if (!VALID_TEST_KEYS.has(testKey)) return null;
    if (!sessions.has(testKey)) sessions.set(testKey, createSession(testKey));
    return sessions.get(testKey);
  }

  function start(testKey) {
    if (!VALID_TEST_KEYS.has(testKey)) return null;
    const session = createSession(testKey);
    sessions.set(testKey, session);
    return snapshot(testKey);
  }

  function event(testKey, type, detail) {
    const session = ensure(testKey);
    if (!session) return null;
    session.events.push({
      type,
      at: new Date().toISOString(),
      elapsedMs: Math.max(0, Math.round(monotonicNow() - session.startedPerfMs)),
      detail: detail || null,
    });
    return snapshot(testKey);
  }

  function invalidate(testKey, status, reason) {
    const session = ensure(testKey);
    if (!session) return null;
    const nextStatus = VALID_QC_STATUSES.has(status) ? status : 'technical_failure';

    // Once invalid, a later normal completion must not silently restore validity.
    if (session.status === 'valid' || session.status === 'unverified') {
      session.status = nextStatus;
    } else if (nextStatus === 'technical_failure') {
      session.status = nextStatus;
    } else if (nextStatus === 'timing_violation' && session.status === 'interrupted') {
      // Preserve interruption as the more directly observable protocol violation.
    }

    if (nextStatus === 'interrupted') session.qc.visibilityInterruptions += 1;
    if (nextStatus === 'timing_violation') session.qc.timingViolation = true;
    if (nextStatus === 'technical_failure') session.qc.technicalFailure = true;
    if (reason && !session.qc.reasons.includes(reason)) session.qc.reasons.push(reason);
    return event(testKey, nextStatus, reason || null);
  }

  function invalidateAll(status, reason) {
    const result = [];
    for (const testKey of sessions.keys()) {
      const session = sessions.get(testKey);
      if (session && session.completedAt == null) result.push(invalidate(testKey, status, reason));
    }
    return result;
  }

  function complete(testKey) {
    const session = ensure(testKey);
    if (!session) {
      return {
        testKey,
        taskVersion: DEFAULT_TASK_VERSION,
        status: 'unverified',
        startedAt: null,
        completedAt: new Date().toISOString(),
        elapsedMs: null,
        clock: null,
        qc: {
          visibilityInterruptions: 0,
          timingViolation: false,
          technicalFailure: false,
          reasons: ['session_not_started_through_runtime'],
        },
        events: [],
      };
    }
    if (session.completedAt == null) {
      session.completedAt = new Date().toISOString();
      session.elapsedMs = Math.max(0, Math.round(monotonicNow() - session.startedPerfMs));
      event(testKey, 'complete', { finalStatus: session.status });
    }
    return snapshot(testKey);
  }

  function snapshot(testKey) {
    return safeClone(sessions.get(testKey)) || null;
  }

  function getActiveTestKeys() {
    return Array.from(sessions.entries())
      .filter(([, session]) => session && session.completedAt == null)
      .map(([key]) => key);
  }

  /**
   * Absolute-deadline scheduler for future task migrations.
   * setTimeout is used only to wake the loop; elapsed time is measured against a
   * monotonic deadline rather than by counting timer callbacks.
   */
  function deadline(durationMs, { onTick, onDone, tickMs = 100 } = {}) {
    const start = monotonicNow();
    const end = start + Math.max(0, Number(durationMs) || 0);
    let timer = null;
    let cancelled = false;

    function step() {
      if (cancelled) return;
      const now = monotonicNow();
      const remainingMs = Math.max(0, end - now);
      if (typeof onTick === 'function') onTick({ elapsedMs: now - start, remainingMs, deadlineMs: end });
      if (remainingMs <= 0) {
        if (typeof onDone === 'function') onDone({ elapsedMs: now - start, overshootMs: Math.max(0, now - end) });
        return;
      }
      timer = setTimeout(step, Math.min(tickMs, remainingMs));
    }

    step();
    return {
      cancel() {
        cancelled = true;
        if (timer) clearTimeout(timer);
      },
      startedPerfMs: start,
      deadlinePerfMs: end,
    };
  }

  return { start, event, invalidate, invalidateAll, complete, snapshot, getActiveTestKeys, deadline };
})();

const ParticipantManager = {
  getCurrent() {
    return _ls.get('mccb-current-participant') || '';
  },

  setCurrent(cohortId) {
    const normalized = normalizeCohortId(cohortId);
    if (!normalized) {
      _ls.remove('mccb-current-participant');
      return true;
    }
    if (!isValidCohortId(normalized)) {
      console.warn('无效被试编号。仅允许 1-64 位字母、数字、点、下划线和连字符。');
      return false;
    }
    if (!_ls.set('mccb-current-participant', normalized)) return false;

    const list = this.getAllParticipants();
    if (!list.includes(normalized)) {
      list.push(normalized);
      if (!_ls.set('mccb-participant-list', JSON.stringify(list))) return false;
    }
    if (!_ls.get('mccb-participant-' + normalized)) {
      return !!this._createParticipant(normalized);
    }
    return true;
  },

  getAllParticipants() {
    const list = _ls.json('mccb-participant-list');
    return Array.isArray(list) ? list.filter(isValidCohortId) : [];
  },

  logout() {
    _ls.remove('mccb-current-participant');
  },

  getData(cohortId) {
    const id = normalizeCohortId(cohortId || this.getCurrent());
    if (!isValidCohortId(id)) return null;
    return _ls.json('mccb-participant-' + id);
  },

  _saveData(cohortId, data) {
    const id = normalizeCohortId(cohortId || this.getCurrent());
    if (!isValidCohortId(id) || !data || typeof data !== 'object') return false;
    data.schemaVersion = PARTICIPANT_SCHEMA_VERSION;
    data.updatedAt = new Date().toISOString();
    return _ls.set('mccb-participant-' + id, JSON.stringify(data));
  },

  _createParticipant(cohortId) {
    if (!isValidCohortId(cohortId)) return null;
    const progress = {};
    TEST_ORDER.forEach(t => { progress[t.key] = 'not_started'; });
    const now = new Date().toISOString();
    const data = {
      schemaVersion: PARTICIPANT_SCHEMA_VERSION,
      cohortId,
      createdAt: now,
      updatedAt: now,
      progress,
      sessions: {},
      results: {},
    };
    return this._saveData(cohortId, data) ? data : null;
  },

  getProgress(testKey) {
    const data = this.getData();
    if (!data) return 'not_started';
    return (data.progress && data.progress[testKey]) || 'not_started';
  },

  setProgress(testKey, status) {
    if (!VALID_TEST_KEYS.has(testKey)) return false;
    const data = this.getData();
    if (!data) return false;
    if (!data.progress) data.progress = {};
    data.progress[testKey] = status;
    return this._saveData(data.cohortId, data);
  },

  markInProgress(testKey) {
    if (!VALID_TEST_KEYS.has(testKey)) return false;
    ExperimentRuntime.start(testKey);
    const data = this.getData();
    if (!data) return false;
    if (!data.progress) data.progress = {};
    if (!data.sessions) data.sessions = {};
    data.progress[testKey] = 'in_progress';
    data.sessions[testKey] = ExperimentRuntime.snapshot(testKey);
    return this._saveData(data.cohortId, data);
  },

  invalidateSession(testKey, status, reason) {
    if (!VALID_TEST_KEYS.has(testKey)) return false;
    ExperimentRuntime.invalidate(testKey, status, reason);
    return this._persistActiveSessionQc();
  },

  _persistActiveSessionQc() {
    const data = this.getData();
    if (!data) return false;
    if (!data.sessions) data.sessions = {};
    for (const testKey of VALID_TEST_KEYS) {
      const session = ExperimentRuntime.snapshot(testKey);
      if (session) data.sessions[testKey] = session;
    }
    return this._saveData(data.cohortId, data);
  },

  saveResult(testKey, resultData) {
    const cohortId = this.getCurrent();
    const resultKey = KEY_TO_RESULT[testKey];
    if (!isValidCohortId(cohortId) || !resultKey || !resultData || typeof resultData !== 'object') return false;

    const sessionQc = ExperimentRuntime.complete(testKey);
    const enriched = {
      ...resultData,
      _meta: {
        schemaVersion: RESULT_SCHEMA_VERSION,
        taskVersion: (sessionQc && sessionQc.taskVersion) || DEFAULT_TASK_VERSION,
        administration: 'digital_research_adaptation',
        mccbEquivalent: false,
        participantId: cohortId,
        recordedAt: new Date().toISOString(),
        sessionQc,
      },
    };

    const data = this.getData(cohortId);
    if (!data) return false;
    if (!data.progress) data.progress = {};
    if (!data.results) data.results = {};
    if (!data.sessions) data.sessions = {};

    data.sessions[testKey] = sessionQc;
    data.results[resultKey] = enriched;
    data.progress[testKey] = sessionQc && sessionQc.status === 'valid' ? 'completed' : 'completed_invalid';

    // Save the canonical participant record first. Do not claim completion if the
    // canonical write fails; the compatibility key is secondary.
    if (!this._saveData(cohortId, data)) {
      console.error('被试结果保存失败:', cohortId, testKey);
      return false;
    }

    _ls.set('mccb-participant-' + cohortId + '-' + resultKey, JSON.stringify(enriched));
    return true;
  },

  getResult(testKey) {
    const data = this.getData();
    if (!data || !data.results) return null;
    return data.results[KEY_TO_RESULT[testKey]] || null;
  },

  getSessionQc(testKey) {
    const result = this.getResult(testKey);
    if (result && result._meta && result._meta.sessionQc) return result._meta.sessionQc;
    const data = this.getData();
    return data && data.sessions ? data.sessions[testKey] || null : null;
  },

  getFirstIncomplete() {
    const data = this.getData();
    if (!data) return TEST_ORDER[0];
    for (const test of TEST_ORDER) {
      if (!data.progress || data.progress[test.key] !== 'completed') return test;
    }
    return null;
  },

  getProgressSummary() {
    const data = this.getData();
    if (!data) return { done: 0, invalid: 0, total: TEST_ORDER.length };
    const statuses = Object.values(data.progress || {});
    return {
      done: statuses.filter(s => s === 'completed').length,
      invalid: statuses.filter(s => s === 'completed_invalid').length,
      total: TEST_ORDER.length,
    };
  },

  getTestUrl(testKey, mode) {
    const test = TEST_ORDER.find(item => item.key === testKey);
    if (!test) return '#';
    const params = new URLSearchParams();
    if (mode) params.set('mode', mode);
    const cohortId = this.getCurrent();
    if (isValidCohortId(cohortId)) params.set('p', cohortId);
    const query = params.toString();
    return test.file + (query ? '?' + query : '');
  },

  getParticipantFromUrl() {
    if (typeof window === 'undefined' || !window.location) return '';
    const p = new URLSearchParams(window.location.search).get('p');
    return isValidCohortId(p) ? p : '';
  },

  initFromUrl() {
    const participantId = this.getParticipantFromUrl();
    if (participantId) this.setCurrent(participantId);
    return this.getCurrent();
  },

  deleteParticipant(cohortId) {
    const id = normalizeCohortId(cohortId);
    if (!isValidCohortId(id)) return false;
    _ls.remove('mccb-participant-' + id);
    const prefix = 'mccb-participant-' + id + '-';
    const keysToRemove = [];
    for (let i = 0; i < _ls.length(); i++) {
      const key = _ls.key(i);
      if (key && key.startsWith(prefix)) keysToRemove.push(key);
    }
    keysToRemove.forEach(key => _ls.remove(key));

    const list = this.getAllParticipants();
    const next = list.filter(item => item !== id);
    _ls.set('mccb-participant-list', JSON.stringify(next));
    if (this.getCurrent() === id) _ls.remove('mccb-current-participant');
    return true;
  },

  getAllSummaries() {
    return this.getAllParticipants().map(id => {
      const data = this.getData(id);
      if (!data) {
        return { id, done: 0, invalid: 0, total: TEST_ORDER.length, createdAt: null, updatedAt: null };
      }
      const statuses = Object.values(data.progress || {});
      return {
        id,
        done: statuses.filter(s => s === 'completed').length,
        invalid: statuses.filter(s => s === 'completed_invalid').length,
        total: TEST_ORDER.length,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        isCurrent: this.getCurrent() === id,
      };
    });
  },

  exportAllData() {
    const list = this.getAllParticipants();
    const participants = {};
    list.forEach(id => {
      const data = this.getData(id);
      if (data) participants[id] = data;
    });
    return {
      schemaVersion: PARTICIPANT_SCHEMA_VERSION,
      exportDate: new Date().toISOString(),
      participantCount: list.length,
      participants,
    };
  },
};

function installResearchSafetyUI() {
  if (typeof document === 'undefined') return;
  const SAFE_TEXT = '仅显示原始分与研究指标；未应用经验证的 MCCB 常模，不用于“正常/异常”判断或临床诊断解释。';

  function lockNormRef(container) {
    if (!container) return;
    const render = () => {
      if (container.textContent && container.textContent.includes(SAFE_TEXT)) return;
      container.textContent = '';
      const strong = document.createElement('strong');
      strong.textContent = '研究版提示：';
      const span = document.createElement('span');
      span.textContent = SAFE_TEXT;
      container.appendChild(strong);
      container.appendChild(span);
    };
    render();
    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(() => {
        if (!container.textContent.includes(SAFE_TEXT)) {
          observer.disconnect();
          render();
          observer.observe(container, { childList: true, subtree: true, characterData: true });
        }
      });
      observer.observe(container, { childList: true, subtree: true, characterData: true });
    }
  }

  document.querySelectorAll('.norm-ref').forEach(lockNormRef);

  // Add a visible prototype banner once on task pages and the landing page.
  if (!document.getElementById('research-prototype-banner')) {
    const banner = document.createElement('div');
    banner.id = 'research-prototype-banner';
    banner.setAttribute('role', 'note');
    banner.textContent = 'RESEARCH PROTOTYPE · 当前网页任务未经 MCCB 数字等效性验证；结果仅供研究/开发。';
    banner.style.cssText = [
      'position:fixed', 'left:12px', 'bottom:12px', 'z-index:99999',
      'max-width:min(560px,calc(100vw - 24px))', 'padding:8px 12px',
      'border:1px solid rgba(245,158,11,.45)', 'border-radius:10px',
      'background:rgba(255,251,235,.96)', 'color:#92400e', 'font-size:12px',
      'line-height:1.5', 'box-shadow:0 4px 18px rgba(0,0,0,.08)'
    ].join(';');
    document.body.appendChild(banner);
  }
}

function installRuntimeGuards() {
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        ExperimentRuntime.invalidateAll('interrupted', 'document_hidden_during_active_session');
        ParticipantManager._persistActiveSessionQc();
      }
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installResearchSafetyUI, { once: true });
    } else {
      installResearchSafetyUI();
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      ExperimentRuntime.invalidateAll('aborted', 'page_hidden_or_unloaded_before_completion');
      ParticipantManager._persistActiveSessionQc();
    });

    // The legacy comprehensive report assumes T-scores. Route it to the new
    // research-safe report without requiring a large brittle edit to that file.
    if (window.location && /\/comprehensive-report\.html$/.test(window.location.pathname)) {
      const next = 'research-report.html' + (window.location.search || '') + (window.location.hash || '');
      window.location.replace(next);
    }

    window.ParticipantManager = ParticipantManager;
    window.ExperimentRuntime = ExperimentRuntime;
  }
}

installRuntimeGuards();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ParticipantManager,
    ExperimentRuntime,
    TEST_ORDER,
    KEY_TO_RESULT,
    RESULT_TO_KEY,
    RESULT_SCHEMA_VERSION,
    PARTICIPANT_SCHEMA_VERSION,
    isValidCohortId,
  };
}
