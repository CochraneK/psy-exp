/**
 * Research norm extensions for psy-exp (research-scoring-0.5.0).
 *
 * 提供「同队列参考 T」（cohort-t）：
 *   T = 50 + 10 * Φ⁻¹(rank/100)
 *   - rank：每个测验项在同协议队列池内的并列均排名（0-100，与 MCCBScoring.rankWithTies 同定义）
 *   - 域分：域内全部测验项 rank 的均值（缺任一测验项则该域不给 T）
 *   - pool：全研究所有参与者所有访视（visit 级横断面），或 MCCBScoring 管线内的 participant 级 profile
 *
 * ⚠️ 口径声明（必须随结果展示）：
 *   这是同队列内部的相对参考（研究口径），需要 N≥5 的队列池；
 *   不是 MCCB 官方常模 T 分，不能继承 MCCB 常模解释，不用于临床诊断判断。
 *   若参与者注入了官方计分 T 分（mccb-official-scores.js），官方分优先于队列 T。
 */
(function(root, factory){
  const api = factory(root || globalThis);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MCCBNorms = api;
})(typeof window !== 'undefined' ? window : globalThis, function(root){
  'use strict';
  const NORM_VERSION = 'cohort-t-0.1.0';
  const SCORING_BUNDLE = 'research-scoring-0.5.0';
  const MIN_COHORT_N = 5;      // 每个测验项的队列池最小样本数
  const P_CLAMP = 1e-4;        // Φ⁻¹ 输入裁剪（T 实际范围约 12.8-87.2）

  // ---- 映射表（与 mccb-scoring.js / analysis/refresh.py 保持同步） ----
  const DOMAIN_TEST_KEYS = {
    speed_processing:['bacs','fluency','tmt'],
    attention:['cpt'],
    working_memory:['lns','spatial-span'],
    verbal_learning:['hvlt'],
    visual_learning:['bvmt'],
    reasoning:['mazes'],
    social_cognition:['msceit']
  };
  const DOMAIN_TO_COMP = {
    speed_processing:'SoP', attention:'AV', working_memory:'WM',
    verbal_learning:'Vrbl Lrng', visual_learning:'Vis Lrng',
    reasoning:'RPS', social_cognition:'SC'
  };
  const COMP_TO_DOMAIN = Object.fromEntries(Object.entries(DOMAIN_TO_COMP).map(([k,v])=>[v,k]));
  const COMPS_WITH_SOCIAL = ['SoP','AV','WM','Vrbl Lrng','Vis Lrng','RPS','SC','Overall Comp','Neurocog Comp'];
  const COMPS_NEUROCOG = ['SoP','AV','WM','Vrbl Lrng','Vis Lrng','RPS']; // Neurocog Comp = 除社会认知外 6 域
  const CORE_TO_KEY = {'TMT':'tmt','BACS SC':'bacs','HVLT-R':'hvlt','WMS-III SS':'spatial-span','NAB Mazes':'mazes','BVMT-R':'bvmt','Fluency':'fluency','MSCEIT ME':'msceit','CPT-IP':'cpt'};
  const KEY_TO_CORE = Object.fromEntries(Object.entries(CORE_TO_KEY).map(([k,v])=>[v,k]));

  // 主绩效指标（与 mccb-scoring.js PERFORMANCE 同源）；HIGHER_BETTER：-1 = 越小越好
  const PRIMARY = {
    bacs: r => Number(r.correct) || 0,
    fluency: r => Number((r.unique != null ? r.unique : r.total) || 0),
    tmt: r => { const t = Number((r.partA || {}).time); return Number.isFinite(t) ? t : Infinity; },
    cpt: r => Number(r.dPrime) || 0,
    'spatial-span': r => Number(r.totalCorrect) || 0,
    lns: r => Number(r.totalCorrect) || 0,
    hvlt: r => [r.trial1,r.trial2,r.trial3,r.trial4,r.trial5].reduce((a,x)=>a+(Number.isFinite(Number(x))?Number(x):0),0),
    bvmt: r => { const ts = Array.isArray(r.trials) ? r.trials : (Array.isArray(r.trialScores) ? r.trialScores : []); let s=0; for (const x of ts){ const v = Number(typeof x==='object'&&x!=null ? x.score : x); if (Number.isFinite(v)) s+=v; } return s; },
    mazes: r => Number(r.totalScore) || 0,
    msceit: r => { const s = r.scoring || {}; const raw = Number(r.rawScore != null ? r.rawScore : s.rawScore); return Number.isFinite(raw) ? raw : (Number(r.correct != null ? r.correct : s.correct) || 0); }
  };
  const HIGHER_BETTER = { bacs:1, fluency:1, cpt:1, 'spatial-span':1, lns:1, hvlt:1, bvmt:1, mazes:1, msceit:1, tmt:-1 };

  // ---- 数学工具 ----
  // 标准正态分位函数 Φ⁻¹（Acklam 有理近似，|误差| < 1.15e-9）
  function normInv(p){
    if (!(p > 0 && p < 1)) throw new Error('normInv: p out of (0,1)');
    const a=[-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00];
    const b=[-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01];
    const c=[-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00];
    const d=[7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00];
    const pl=0.02425;
    let q,r;
    if (p < pl){ q = Math.sqrt(-2*Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
    if (p <= 1-pl){ q = p-0.5; r = q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
    q = Math.sqrt(-2*Math.log(1-p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  // 并列均排名（与 MCCBScoring.rankWithTies 同定义：升序、并列取平均位次、N=1→50、0-100 标度）
  function rankPool(values){
    const idx = values.map((v,i)=>({v,i})).filter(x=>Number.isFinite(x.v));
    if (!idx.length) return values.map(()=>null);
    idx.sort((x,y)=>x.v-y.v);
    const N = idx.length, out = new Array(values.length).fill(null);
    let i = 0;
    while (i < N){
      let j = i+1;
      while (j < N && Math.abs(idx[j].v-idx[i].v) < 1e-12) j++;
      const avg = (i+j-1)/2, rank = N === 1 ? 50 : Math.round(avg/(N-1)*1000)/10;
      for (let k=i;k<j;k++) out[idx[k].i] = rank;
      i = j;
    }
    return out;
  }
  function rankToT(rank){
    if (rank == null || !Number.isFinite(rank)) return null;
    const p = Math.min(1-P_CLAMP, Math.max(P_CLAMP, rank/100));
    return Math.round((50 + 10*normInv(p))*10)/10;
  }
  // 池级 N 守卫：每个测验项池样本数都要 ≥ MIN_COHORT_N，否则该池不给 T
  function poolOk(counts, tests){
    return tests.every(t=>(counts[t]||0) >= MIN_COHORT_N);
  }

  // ---- 访视重建（participant 级数据 → visit 列表） ----
  // 口径：一个历次日期 = 一个访视；同日多次作答取该测验当日最后一次。
  // 仅使用 ParticipantManager 数据（mccb-participant-{id}.attemptHistory），不依赖 ResearchData 同步。
  function buildVisits(pmData){
    if (!pmData || typeof pmData !== 'object') return [];
    const history = pmData.attemptHistory || {};
    const perTest = []; // {key, date, recordedAt, result} 按 recordedAt 升序
    for (const [resultKey, items] of Object.entries(history)){
      const m = resultKey.match(/^mccb-(.+)-result$/);
      if (!m || !PRIMARY[m[1]]) continue;
      const key = m[1];
      for (const it of (Array.isArray(items) ? items : [])){
        const rec = it && it._meta && it._meta.recordedAt;
        if (!rec) continue;
        perTest.push({key, recordedAt: rec, date: String(rec).slice(0,10), result: it});
      }
    }
    perTest.sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt));
    const visits = new Map();
    for (const x of perTest){
      let v = visits.get(x.date);
      if (!v){ v = {date: x.date, tests: {}}; visits.set(x.date, v); }
      v.tests[x.key] = x; // 同日后作答覆盖先作答
    }
    return [...visits.values()].sort((a,b)=>a.date.localeCompare(b.date))
      .map(v=>({date: v.date, tests: v.tests, primary: Object.fromEntries(Object.entries(v.tests).map(([k,x])=>[k, PRIMARY[k](x.result)]))}));
  }

  // ---- 队列 T 计算（visit 池） ----
  // allVisitsByPid: {pid: [{date, tests, primary}]}
  // 返回 Map: "pid|date" -> {sc:{SoP..,Overall Comp,Neurocog Comp}, tc:{TMT..,CPT-IP}, n:{test:N}}
  function cohortTForVisits(allVisitsByPid){
    const units = []; // {uid, pid, date, primary:{}}
    for (const [pid, visits] of Object.entries(allVisitsByPid)){
      for (const v of (visits||[])) units.push({uid: pid+'|'+v.date, pid, date: v.date, primary: v.primary||{}});
    }
    const out = new Map(units.map(u=>[u.uid, {sc: {}, tc: {}, n: {}, cohortN: units.length}]));
    const testPool = {}; // test -> {values[], uids[]}
    for (const t of Object.keys(PRIMARY)){
      const vals = [], uids = [];
      for (const u of units){
        let p = u.primary[t];
        if (p == null || !Number.isFinite(p)) continue;
        vals.push(HIGHER_BETTER[t] * p);
        uids.push(u);
      }
      testPool[t] = {vals, uids};
    }
    const ranks = {}; // test -> uid -> rank
    for (const [t, pool] of Object.entries(testPool)){
      const rk = rankPool(pool.vals);
      ranks[t] = new Map(pool.uids.map((u,i)=>[u.uid, rk[i]]));
      for (const u of pool.uids){
        const o = out.get(u.uid); o.n[t] = pool.uids.length;
      }
    }
    for (const u of units){
      const o = out.get(u.uid);
      const domainT = {};
      for (const [dom, tests] of Object.entries(DOMAIN_TEST_KEYS)){
        if (!poolOk(o.n, tests)) continue;
        const rs = tests.map(t=>ranks[t].get(u.uid));
        if (rs.some(r=>r==null)) continue;
        const mean = rs.reduce((a,b)=>a+b,0)/rs.length;
        domainT[dom] = rankToT(mean);
      }
      for (const [dom, T] of Object.entries(domainT)) o.sc[DOMAIN_TO_COMP[dom]] = T;
      for (const [coreName, t] of Object.entries(CORE_TO_KEY)){
        if ((o.n[t]||0) < MIN_COHORT_N) continue;
        const r = ranks[t].get(u.uid);
        if (r != null) o.tc[coreName] = rankToT(r);
      }
      const ts = COMPS_WITH_SOCIAL.slice(0,7).map(c=>o.sc[c]).filter(x=>x!=null);
      if (ts.length === 7) o.sc['Overall Comp'] = Math.round(ts.reduce((a,b)=>a+b,0)/7*10)/10;
      const ns = COMPS_NEUROCOG.map(c=>o.sc[c]).filter(x=>x!=null);
      if (ns.length === 6) o.sc['Neurocog Comp'] = Math.round(ns.reduce((a,b)=>a+b,0)/6*10)/10;
    }
    return out;
  }

  // ---- 注册常模（participant 级，接入 MCCBScoring 管线） ----
  const cohortTNorm = {
    name: 'cohort-t',
    version: NORM_VERSION,
    provenance: 'psy-exp 同队列参考 T：T=50+10*Φ⁻¹(rank/100)；rank=各测验项同协议队列内并列均排名；域分=域内测验 rank 均值；研究参考口径（每测验项 N≥5），非 MCCB 官方常模，不用于临床诊断判断。',
    kind: 'research',
    validated: true,
    label: '同队列参考 T（研究口径，非 MCCB 常模）',
    supportsTask(){ return true; },
    apply(profiles, domains){
      const units = profiles.map(p=>({p, primary: {}}));
      for (const u of units){
        for (const [t, task] of Object.entries(u.p.tests)){
          if (!PRIMARY[t]) continue;
          const x = task.extracted;
          if (x == null) continue;
          // 用 extract 后的字段重建主指标（与 PRIMARY 的 raw 读取同值）
          const probe = {
            correct: x.correct, unique: x.unique, total: x.total,
            partA: {time: x.mccbTime != null ? x.mccbTime : x.partATime},
            dPrime: x.dPrime, totalCorrect: x.totalCorrect,
            trial1: x.trial1, trial2: x.trial2, trial3: x.trial3, trial4: x.trial4, trial5: x.trial5,
            trials: x.trialScores ? x.trialScores.map(s=>({score:s})) : [],
            trialScores: x.trialScores ? x.trialScores.map(s=>({score:s})) : [],
            totalScore: x.totalScore, rawScore: x.rawScore
          };
          u.primary[t] = PRIMARY[t](probe);
        }
      }
      for (const [dom, domain] of Object.entries(domains)){
        const tests = domain.tests;
        const pool = {};
        for (const t of tests){
          const vals = [], idx = [];
          units.forEach((u,i)=>{
            if (Number.isFinite(u.primary[t])){ vals.push(HIGHER_BETTER[t]*u.primary[t]); idx.push(i); }
          });
          pool[t] = {vals, idx, N: vals.length};
        }
        const ok = tests.every(t=>pool[t].N >= MIN_COHORT_N);
        const rk = {};
        for (const t of tests) rk[t] = rankPool(pool[t].vals);
        units.forEach((u,i)=>{
          if (!ok) return;
          const rs = [];
          let okAll = true;
          for (const t of tests){
            const pos = pool[t].idx.indexOf(i);
            const r = pos < 0 ? null : rk[t][pos];
            if (r == null){ okAll = false; break; }
            rs.push(r);
          }
          if (!okAll) return;
          const T = rankToT(rs.reduce((a,b)=>a+b,0)/rs.length);
          if (T == null) return;
          u.p.domains[dom] = {
            tScore: T, indexScore: Math.round(rs.reduce((a,b)=>a+b,0)/rs.length*10)/10,
            cohortRankIndex: null, cohortPercentile: null,
            testCount: tests.length, requiredTestCount: tests.length,
            referenceN: Math.min(...tests.map(t=>pool[t].N)),
            referenceKey: 'cohort-pool',
            testRanks: tests.map(t=>({testKey: t, index: rk[t][pool[t].idx.indexOf(i)]})),
            scoreType: 'cohort-relative-t',
            scoringVersion: SCORING_BUNDLE,
            normVersion: NORM_VERSION
          };
        });
      }
    }
  };

  function register(){
    if (root.MCCBScoring && typeof root.MCCBScoring.registerNorm === 'function') root.MCCBScoring.registerNorm(cohortTNorm);
    return cohortTNorm;
  }

  return {
    NORM_VERSION, SCORING_BUNDLE, MIN_COHORT_N,
    DOMAIN_TEST_KEYS, DOMAIN_TO_COMP, COMP_TO_DOMAIN,
    COMPS_WITH_SOCIAL, COMPS_NEUROCOG, CORE_TO_KEY, KEY_TO_CORE,
    PRIMARY, HIGHER_BETTER, normInv, rankPool, rankToT,
    buildVisits, cohortTForVisits, cohortTNorm, register
  };
});
