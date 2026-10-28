/**
 * 官方计分 T 分注入存储（official-scores-v1）。
 *
 * 用途：当某访视存在 NAB 官方计分软件 / 授权人工计分的 AGT T 分时，
 * 研究者可注入该访视的 9 个综合分 + 9 个测验项 T 分。
 * 报告与导出时，官方分优先于同队列参考 T（origin 标记为 'official'）。
 *
 * 存储：localStorage 'mccb-official-scores-v1'
 * 结构：{ [participantId]: { visits: [ {date, agt:{9}, testAgt:{9}, source, note, recordedAt} ] } }
 * 口径声明：注入的官方分来自外部计分系统，psy-exp 仅存储与展示，不验证其常模来源；
 * 展示时保留 source 备注以便溯源。
 */
(function(root, factory){
  const api = factory(root || globalThis);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OfficialScores = api;
})(typeof window !== 'undefined' ? window : globalThis, function(root){
  'use strict';
  const STORE_VERSION = 'official-scores-v1';
  const KEY = 'mccb-official-scores-v1';
  const COMP_BASES = ['SoP','AV','WM','Vrbl Lrng','Vis Lrng','RPS','SC','Overall Comp','Neurocog Comp'];
  const TEST_AGT = ['TMT','BACS SC','HVLT-R','WMS-III SS','NAB Mazes','BVMT-R','Fluency','MSCEIT ME','CPT-IP'];
  const VALID_GENDERS = ['male','female','unspecified'];

  const ls = () => (root && root.localStorage) || null;
  function readJson(){ try { const s = ls(); const raw = s && s.getItem(KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; } }
  function writeJson(v){ try { const s = ls(); if (!s) return false; s.setItem(KEY, JSON.stringify(v)); return true; } catch { return false; } }
  function now(){ return new Date().toISOString(); }
  const clone = v => { try { return JSON.parse(JSON.stringify(v)); } catch { return null; } };
  const safePid = v => { const s = String(v==null?'':v).trim(); return /^[A-Za-z0-9._-]{1,64}$/.test(s) ? s : null; };
  const safeDate = v => { const s = String(v==null?'':v).trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };

  function numOrNull(v){
    if (v === '' || v == null) return null;
    const x = Number(v);
    return Number.isFinite(x) && x >= 1 && x <= 99 ? Math.round(x*10)/10 : null;
  }
  function pickAgt(obj, bases){
    const out = {};
    for (const b of bases){ const v = numOrNull(obj && obj[b]); if (v != null) out[b] = v; }
    return out;
  }

  function getStore(){ return clone(readJson()) || {}; }
  function listPids(){ return Object.keys(getStore()); }
  function getVisits(pid){
    const store = readJson();
    const p = store[safePid(pid)];
    if (!p || !Array.isArray(p.visits)) return [];
    return clone(p.visits).sort((a,b)=>a.date.localeCompare(b.date));
  }
  function getVisit(pid, date){
    const d = safeDate(date); if (!d) return null;
    return getVisits(pid).find(v=>v.date===d) || null;
  }
  function addVisit(pid, {date, agt, testAgt, source, note} = {}){
    const pid2 = safePid(pid); if (!pid2) throw new Error('PID_INVALID');
    const d = safeDate(date); if (!d) throw new Error('DATE_INVALID');
    const a = pickAgt(agt, COMP_BASES);
    const t = pickAgt(testAgt, TEST_AGT);
    if (!Object.keys(a).length && !Object.keys(t).length) throw new Error('NO_SCORES_PROVIDED');
    const visit = {date: d, agt: a, testAgt: t, source: String(source||'').trim().slice(0,120) || null, note: String(note||'').trim().slice(0,300) || null, recordedAt: now()};
    const store = readJson();
    const p = store[pid2] || {visits: []};
    p.visits = (p.visits||[]).filter(v=>v.date!==d);
    p.visits.push(visit);
    p.visits.sort((x,y)=>x.date.localeCompare(y.date));
    store[pid2] = p;
    if (!writeJson(store)) throw new Error('STORE_WRITE_FAILED');
    return clone(visit);
  }
  function removeVisit(pid, date){
    const pid2 = safePid(pid); if (!pid2) return false;
    const d = safeDate(date); if (!d) return false;
    const store = readJson();
    if (!store[pid2]) return false;
    const before = store[pid2].visits.length;
    store[pid2].visits = store[pid2].visits.filter(v=>v.date!==d);
    if (store[pid2].visits.length === before) return false;
    if (store[pid2].visits.length === 0) delete store[pid2];
    return writeJson(store);
  }
  function clearParticipant(pid){
    const pid2 = safePid(pid); if (!pid2) return false;
    const store = readJson();
    if (!store[pid2]) return false;
    delete store[pid2];
    return writeJson(store);
  }
  // 解析某访视某综合分/测验 T：官方分优先；否则返回 null（由调用方回落队列 T）
  function resolve(pid, date, kind, base){
    const v = getVisit(pid, date);
    if (!v) return null;
    const pool = kind === 'testAgt' ? v.testAgt : v.agt;
    const val = pool && pool[base];
    if (val == null) return null;
    return {value: val, origin: 'official', source: v.source, visitDate: v.date};
  }

  return {
    STORE_VERSION, KEY, COMP_BASES, TEST_AGT, VALID_GENDERS,
    getStore, listPids, getVisits, getVisit, addVisit, removeVisit, clearParticipant, resolve
  };
});
