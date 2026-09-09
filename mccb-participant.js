/**
 * mccb-participant.js — MCCB 被试管理系统
 *
 * 每个被试分配一个队列编号（cohort ID），系统自动追踪：
 * - 已完成/进行中/未开始的测验
 * - 中断后可续做（输入编号 → 显示进度 → 继续）
 * - 所有结果按被试隔离存储
 *
 * 存储结构（localStorage）：
 *   mccb-participant-list   = ["ABC-001", ...]          // 所有被试列表
 *   mccb-current-participant = "ABC-001"                 // 当前登录被试
 *   mccb-participant-ABC-001 = { ... }                   // 被试完整数据
 *   mccb-participant-ABC-001-tmt-result = { ... }        // 单测验结果（向后兼容保留）
 */

const TEST_ORDER = [
  { key: 'tmt',        name: 'TMT 连线测验',             file: 'pages/mccb-tmt.html' },
  { key: 'bacs',       name: 'BACS 符号编码',            file: 'pages/mccb-bacs.html' },
  { key: 'fluency',    name: '语义流畅性',               file: 'pages/mccb-fluency.html' },
  { key: 'cpt',        name: 'CPT-IP 持续操作',          file: 'pages/mccb-cpt.html' },
  { key: 'spatial-span', name: 'WMS-III 空间广度',       file: 'pages/mccb-spatial-span.html' },
  { key: 'lns',        name: '字母-数字广度',            file: 'pages/mccb-lns.html' },
  { key: 'hvlt',       name: 'HVLT-R 言语学习',          file: 'pages/mccb-hvlt.html' },
  { key: 'bvmt',       name: 'BVMT-R 视觉空间记忆',      file: 'pages/mccb-bvmt.html' },
  { key: 'mazes',      name: 'NAB 迷宫',                 file: 'pages/mccb-mazes.html' },
  { key: 'msceit',     name: 'MSCEIT 情绪管理',          file: 'pages/mccb-msceit.html' },
];

// localStorage key 映射
const KEY_TO_RESULT = {
  tmt:        'mccb-tmt-result',
  bacs:       'mccb-bacs-result',
  fluency:    'mccb-fluency-result',
  cpt:        'mccb-cpt-result',
  'spatial-span': 'mccb-spatial-span-result',
  lns:        'mccb-lns-result',
  hvlt:       'mccb-hvlt-result',
  bvmt:       'mccb-bvmt-result',
  mazes:      'mccb-mazes-result',
  msceit:     'mccb-msceit-result',
};

const RESULT_TO_KEY = Object.fromEntries(
  Object.entries(KEY_TO_RESULT).map(([k, v]) => [v, k])
);

/** localStorage 安全封装（静默捕获异常） */
const _ls = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, val); return true; } catch { console.warn('localStorage 写入失败（可能已满）:', key); return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch {} },
  json(key) { try { const v = this.get(key); return v ? JSON.parse(v) : null; } catch { return null; } },
  length() { try { return localStorage.length; } catch { return 0; } },
  key(i) { try { return localStorage.key(i); } catch { return null; } },
};

const ParticipantManager = {
  /** 获取当前登录被试 ID */
  getCurrent() {
    return _ls.get('mccb-current-participant') || '';
  },

  /** 设置当前登录被试 */
  setCurrent(cohortId) {
    if (!cohortId) {
      _ls.remove('mccb-current-participant');
      return;
    }
    _ls.set('mccb-current-participant', cohortId);
    // 自动注册到列表
    const list = this.getAllParticipants();
    if (!list.includes(cohortId)) {
      list.push(cohortId);
      _ls.set('mccb-participant-list', JSON.stringify(list));
    }
    // 确保数据对象存在
    if (!_ls.get('mccb-participant-' + cohortId)) {
      this._createParticipant(cohortId);
    }
  },

  /** 获取所有已知被试 */
  getAllParticipants() {
    return _ls.json('mccb-participant-list') || [];
  },

  /** 清除当前登录（登出） */
  logout() {
    _ls.remove('mccb-current-participant');
  },

  /** 获取被试完整数据 */
  getData(cohortId) {
    if (!cohortId) cohortId = this.getCurrent();
    if (!cohortId) return null;
    return _ls.json('mccb-participant-' + cohortId);
  },

  /** 保存被试数据 */
  _saveData(cohortId, data) {
    if (!cohortId) cohortId = this.getCurrent();
    if (!cohortId) return;
    data.updatedAt = new Date().toISOString();
    _ls.set('mccb-participant-' + cohortId, JSON.stringify(data));
  },

  /** 创建新被试记录 */
  _createParticipant(cohortId) {
    const progress = {};
    TEST_ORDER.forEach(t => { progress[t.key] = 'not_started'; });
    const data = {
      cohortId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress,
    };
    _ls.set('mccb-participant-' + cohortId, JSON.stringify(data));
    return data;
  },

  /** 获取测验进度状态 */
  getProgress(testKey) {
    const data = this.getData();
    if (!data) return 'not_started';
    return data.progress[testKey] || 'not_started';
  },

  /** 设置测验进度状态 */
  setProgress(testKey, status) {
    const data = this.getData();
    if (!data) return;
    data.progress[testKey] = status;
    this._saveData(data.cohortId, data);
  },

  /** 标记测验为进行中（在 startTest 中调用） */
  markInProgress(testKey) {
    this.setProgress(testKey, 'in_progress');
  },

  /** 保存测验结果并标记完成 */
  saveResult(testKey, resultData) {
    const cohortId = this.getCurrent();
    if (!cohortId) return;

    // 保存到被试专属结果键（向后兼容）
    const resultKey = KEY_TO_RESULT[testKey];
    if (resultKey) {
      _ls.set('mccb-participant-' + cohortId + '-' + resultKey, JSON.stringify(resultData));
    }

    // 更新进度
    const data = this.getData(cohortId);
    if (data) {
      data.progress[testKey] = 'completed';
      if (!data.results) data.results = {};
      data.results[resultKey] = resultData;
      this._saveData(cohortId, data);
    }
  },

  /** 获取测验结果 */
  getResult(testKey) {
    const data = this.getData();
    if (!data || !data.results) return null;
    return data.results[KEY_TO_RESULT[testKey]] || null;
  },

  /** 获取第一个未完成的测验 */
  getFirstIncomplete() {
    const data = this.getData();
    if (!data) return TEST_ORDER[0];
    for (const t of TEST_ORDER) {
      if (data.progress[t.key] !== 'completed') return t;
    }
    return null; // 全部完成
  },

  /** 获取已完成数 / 总数 */
  getProgressSummary() {
    const data = this.getData();
    if (!data) return { done: 0, total: TEST_ORDER.length };
    const done = Object.values(data.progress).filter(s => s === 'completed').length;
    return { done, total: TEST_ORDER.length };
  },

  /** 生成测验文件完整路径（含 mode+participant 参数） */
  getTestUrl(testKey, mode) {
    const t = TEST_ORDER.find(x => x.key === testKey);
    if (!t) return '#';
    const cohortId = this.getCurrent();
    let url = t.file + '?';
    if (mode) url += 'mode=' + mode + '&';
    if (cohortId) url += 'p=' + cohortId;
    // 确保不以 ? 或 & 结尾
    if (url.endsWith('?') || url.endsWith('&')) url = url.slice(0, -1);
    return url;
  },

  /** 获取当前 URL 中的被试 ID（从查询参数读取） */
  getParticipantFromUrl() {
    const p = new URLSearchParams(window.location.search).get('p');
    return p || '';
  },

  /** 从 URL 设置当前被试（在测验页加载时调用） */
  initFromUrl() {
    const p = this.getParticipantFromUrl();
    if (p) this.setCurrent(p);
    return this.getCurrent();
  },

  /** 删除指定被试及其所有数据 */
  deleteParticipant(cohortId) {
    if (!cohortId) return false;
    // 删除被试数据对象
    _ls.remove('mccb-participant-' + cohortId);
    // 删除所有该被试的结果键（向后兼容遗留数据）
    const prefix = 'mccb-participant-' + cohortId + '-';
    const keysToRemove = [];
    for (let i = 0; i < _ls.length(); i++) {
      const k = _ls.key(i);
      if (k && k.startsWith(prefix)) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => _ls.remove(k));
    // 从列表移除
    const list = this.getAllParticipants();
    const idx = list.indexOf(cohortId);
    if (idx !== -1) {
      list.splice(idx, 1);
      _ls.set('mccb-participant-list', JSON.stringify(list));
    }
    // 如果正好是当前登录，清除 current
    if (this.getCurrent() === cohortId) {
      _ls.remove('mccb-current-participant');
    }
    return true;
  },

  /** 获取所有被试的元数据摘要（不含详细结果，用于列表展示） */
  getAllSummaries() {
    const list = this.getAllParticipants();
    return list.map(id => {
      const data = this.getData(id);
      if (!data) {
        return { id, progress: {}, done: 0, total: TEST_ORDER.length, createdAt: null, updatedAt: null };
      }
      const done = Object.values(data.progress || {}).filter(s => s === 'completed').length;
      return {
        id,
        done,
        total: TEST_ORDER.length,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        isCurrent: this.getCurrent() === id,
      };
    });
  },

  /** 导出全部被试数据（JSON 格式） */
  exportAllData() {
    const list = this.getAllParticipants();
    const result = {};
    list.forEach(id => {
      const data = this.getData(id);
      if (data) result[id] = data;
    });
    return {
      exportDate: new Date().toISOString(),
      participantCount: list.length,
      participants: result,
    };
  },
};

// === 页面底部入口辅助 ===
if (typeof window !== 'undefined') {
  window.ParticipantManager = ParticipantManager;
}
