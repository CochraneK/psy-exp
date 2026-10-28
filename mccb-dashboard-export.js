/**
 * Dashboard 兼容 CSV 导出（refresh.py 口径）+ 报告中心共享行构建。
 *
 * 数据源（全部来自浏览器本地，无网络）：
 *   - ParticipantManager（mccb-participant-{id}.attemptHistory → 访视重建，MCCBNorms.buildVisits）
 *   - ResearchData._load().participants（人口学 age/gender，v1.2 demographics）
 *   - MCCBNorms.cohortTForVisits（同队列参考 T，研究口径）
 *   - OfficialScores.resolve（官方计分 T 注入，官方分优先）
 *
 * CSV schema（与 analysis/refresh.py 的 .xls 读取器逐列对齐）：
 *   Respondent ID, Name, Gender(Male/Female), Start Date, Start Age, Assessment, Rater
 *   + 9 项核心测验原始主指标列（TMT..CPT-IP）
 *   + 9 项测验 AGT 列（base+" AGT"，refresh.py get_composite 按后缀精确匹配）
 *   + 9 项综合 AGT 列（SoP AGT..Neurocog Comp AGT）
 *   T 分列口径：官方注入分 || 同队列参考 T（研究口径，非 MCCB 官方常模）。
 *   文件带 UTF-8 BOM；Analysis 目录放入该 CSV 后直接可被 refresh.py 扫描入组。
 *
 * 导出：window.DashboardExport = {buildRows, toCsv, exportDashboardCsv, RAW_COLUMNS, COMP_BASES, TEST_AGT}
 *       window.exportDashboardCsv（供 index.html 工具栏内联 onclick）
 */
(function(root, factory){
  const api = factory(root || globalThis);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DashboardExport = api;
})(typeof window !== 'undefined' ? window : globalThis, function(root){
  'use strict';

  const STUDY_FILE = 'psy-exp-study';
  const DIAG_NAME = 'psy-exp 队列';
  const RATER = 'browser-research';
  // 与 analysis/refresh.py CORE_TESTS / TEST_AGT / COMP_BASES 完全一致（顺序一致）
  const RAW_COLUMNS = ['TMT', 'BACS SC', 'HVLT-R', 'WMS-III SS', 'NAB Mazes', 'BVMT-R', 'Fluency', 'MSCEIT ME', 'CPT-IP'];
  const CORE_TO_KEY = {
    'TMT': 'tmt', 'BACS SC': 'bacs', 'HVLT-R': 'hvlt', 'WMS-III SS': 'spatial-span',
    'NAB Mazes': 'mazes', 'BVMT-R': 'bvmt', 'Fluency': 'fluency', 'MSCEIT ME': 'msceit', 'CPT-IP': 'cpt'
  };
  const COMP_BASES = ['SoP', 'AV', 'WM', 'Vrbl Lrng', 'Vis Lrng', 'RPS', 'SC', 'Overall Comp', 'Neurocog Comp'];

  function deps(){
    const pm = root && root.ParticipantManager;
    const norms = root && root.MCCBNorms;
    const rd = root && root.ResearchData;
    const off = root && root.OfficialScores;
    if (!pm || !norms) throw new Error('DEPS_MISSING: ParticipantManager/MCCBNorms 未加载');
    return {pm, norms, rd, off};
  }

  function genderLabel(g){
    return g === 'male' ? 'Male' : (g === 'female' ? 'Female' : '');
  }

  function round1(v){
    return v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;
  }

  /**
   * 构建全队列行（每被试每访视一行，按 pid/date 升序）。
   * row = {pid, date, phase, gender, age, testsRaw:{coreName:raw|null}, tests:[coreName...],
   *        sc:{base:T|null}, tc:{coreName:T|null}, scOrigin, tcOrigin, cohortN}
   */
  function buildRows(){
    const {pm, norms, rd, off} = deps();
    const pids = (typeof pm.getAllParticipants === 'function') ? pm.getAllParticipants() : [];
    const allVisits = {};
    const visitsByPid = {};
    for (const pid of pids){
      const pmData = (typeof pm.getData === 'function') ? pm.getData(pid) : null;
      const visits = norms.buildVisits(pmData);
      visitsByPid[pid] = visits;
      if (visits.length) allVisits[pid] = visits;
    }
    const cohortMap = norms.cohortTForVisits(allVisits);
    let demo = {};
    try { if (rd && typeof rd._load === 'function') demo = (rd._load() || {}).participants || {}; } catch (e) { demo = {}; }

    const rows = [];
    for (const pid of pids){
      const visits = visitsByPid[pid];
      if (!visits.length) continue;
      const p = demo[pid] || {};
      const age = (p.age != null && Number.isFinite(Number(p.age))) ? Math.round(Number(p.age) * 10) / 10 : null;
      const gender = genderLabel(p.gender);
      visits.forEach((v, i) => {
        const uid = pid + '|' + v.date;
        const ct = cohortMap.get(uid) || {sc: {}, tc: {}, n: {}, cohortN: 0};
        const testsRaw = {};
        const tests = [];
        const sc = {};
        const tc = {};
        let scOfficial = 0, scCohort = 0, tcOfficial = 0, tcCohort = 0;
        for (const coreName of RAW_COLUMNS){
          const key = CORE_TO_KEY[coreName];
          const raw = v.primary ? v.primary[key] : null;
          const okRaw = raw != null && Number.isFinite(raw);
          testsRaw[coreName] = okRaw ? round1(raw) : null;
          if (okRaw) tests.push(coreName);
          // 测验级 AGT：官方优先 || 队列 T
          let tVal = null, tOrigin = null;
          if (off && typeof off.resolve === 'function'){
            const r = off.resolve(pid, v.date, 'testAgt', coreName);
            if (r) { tVal = r.value; tOrigin = 'official'; }
          }
          if (tVal == null && ct.tc[coreName] != null){ tVal = ct.tc[coreName]; tOrigin = 'cohort'; }
          tc[coreName] = tVal;
          if (tVal != null) (tOrigin === 'official' ? tcOfficial++ : tcCohort++);
        }
        for (const base of COMP_BASES){
          let val = null, origin = null;
          if (off && typeof off.resolve === 'function'){
            const r = off.resolve(pid, v.date, 'agt', base);
            if (r) { val = r.value; origin = 'official'; }
          }
          if (val == null && ct.sc[base] != null){ val = ct.sc[base]; origin = 'cohort'; }
          sc[base] = val;
          if (val != null) (origin === 'official' ? scOfficial++ : scCohort++);
        }
        rows.push({
          pid, date: v.date, phase: i + 1, gender, age,
          testsRaw, tests, sc, tc,
          scOrigin: (scOfficial && scCohort) ? 'official+cohort' : (scOfficial ? 'official' : (scCohort ? 'cohort' : 'none')),
          tcOrigin: (tcOfficial && tcCohort) ? 'official+cohort' : (tcOfficial ? 'official' : (tcCohort ? 'cohort' : 'none')),
          cohortN: ct.cohortN || 0
        });
      });
    }
    rows.sort((a, b) => a.pid.localeCompare(b.pid) || a.date.localeCompare(b.date));
    return rows;
  }

  /** CSV 转义：含逗号/引号/换行的字段加引号，引号翻倍。 */
  function csvCell(v){
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  const HEADERS = [
    'Respondent ID', 'Name', 'Gender', 'Start Date', 'Start Age', 'Assessment', 'Rater'
  ].concat(RAW_COLUMNS)
    .concat(RAW_COLUMNS.map(c => c + ' AGT'))
    .concat(COMP_BASES.map(b => b + ' AGT'));

  function toCsv(rows){
    const lines = [HEADERS.map(csvCell).join(',')];
    for (const r of rows){
      const cells = [
        r.pid, r.pid, r.gender, r.date, r.age == null ? '' : r.age, r.phase, RATER
      ];
      for (const c of RAW_COLUMNS) cells.push(r.testsRaw[c] == null ? '' : r.testsRaw[c]);
      for (const c of RAW_COLUMNS) cells.push(r.tc[c] == null ? '' : r.tc[c]);
      for (const b of COMP_BASES) cells.push(r.sc[b] == null ? '' : r.sc[b]);
      lines.push(cells.map(csvCell).join(','));
    }
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  /* ============ Kruskal-Wallis（自包含；与 scipy.stats.kruskal 同口径：平均秩 + 结校正 + χ² 分布 p 值） ============ */
  // ln Γ(x)，Lanczos 近似（|相对误差| < 1e-9，x>0）
  function gammaLn(x){
    const c=[76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
    let y=x, tmp=x+5.5;
    tmp-=(x+0.5)*Math.log(tmp);
    let ser=1.000000000190015;
    for(let j=0;j<6;j++) ser+=c[j]/++y;
    return -tmp+Math.log(2.5066282746310005*ser/x);
  }
  // 正则化下不完全伽马 P(a,x)（x<a+1 级数 / 否则连分式，300 轮收敛 1e-12）
  function gammp(a,x){
    if(x<=0) return 0;
    if(x < a+1){
      let ap=a, sum=1/a, del=sum;
      for(let n=0;n<300;n++){
        ap++; del*=x/ap; sum+=del;
        if(Math.abs(del)<Math.abs(sum)*1e-12) break;
      }
      return sum*Math.exp(-x+a*Math.log(x)-gammaLn(a));
    }
    let b=x+1-a, c=1e300, d=1/b, h=d;
    for(let i=1;i<300;i++){
      const an=-i*(i-a);
      b+=2;
      d=an*d+b; if(Math.abs(d)<1e-300)d=1e-300;
      c=b+an/c; if(Math.abs(c)<1e-300)c=1e-300;
      d=1/d; const del=d*c; h*=del;
      if(Math.abs(del-1)<1e-12) break;
    }
    return 1-Math.exp(-x+a*Math.log(x)-gammaLn(a))*h;
  }
  // 卡方生存函数 P(X>x)，df 为正整数
  function chi2Sf(x,df){
    if(x<=0) return 1;
    return 1-gammp(df/2, x/2);
  }
  // Kruskal-Wallis：arrays=各组的数值数组；返回 {H,p,eta2,k,N}（与 refresh.py kw_group_sig 同算法）
  function kwTest(arrays){
    const items=[];
    arrays.forEach((a,g)=>{ for(const v of a) items.push({v, g}); });
    const N=items.length, k=arrays.length;
    if(N<3 || k<2) return null;
    const order=items.map((x,i)=>i).sort((a,b)=>items[a].v-items[b].v);
    const ranks=new Array(N);
    let i=0;
    while(i<N){
      let j=i+1;
      while(j<N && items[order[j]].v===items[order[i]].v) j++;
      const avg=(i+j+1)/2; // 1 基平均秩（结）
      for(let q=i;q<j;q++) ranks[order[q]]=avg;
      i=j;
    }
    const rsum=arrays.map(()=>0);
    for(let m=0;m<N;m++) rsum[items[m].g]+=ranks[m];
    let sumR2=0;
    for(let g2=0;g2<k;g2++){
      const n2=arrays[g2].length;
      if(n2>0) sumR2 += rsum[g2]*rsum[g2]/n2;
    }
    let H=12/(N*(N+1))*sumR2 - 3*(N+1);
    const freq={};
    for(const it of items) freq[it.v]=(freq[it.v]||0)+1;
    let tie=0;
    for(const v2 of Object.keys(freq)){ const c2=freq[v2]; if(c2>1) tie+=c2*c2*c2-c2; }
    if(tie>0){ const denom=1-tie/(N*N*N-N); if(denom>0) H/=denom; }
    const p=chi2Sf(H, k-1);
    const eta2 = N>k ? Math.max(0,(H-k+1)/(N-k)) : null;
    return {H, p, eta2, k, N};
  }
  // 组间显著性：records=refresh.py record 形状数组；返回 {all:{diag,gender},formal:{diag,gender}}
  // 单诊断组 → diag 空（无组间可比）；gender 按 Male/Female/未标注 分组，与 refresh.py _gender_key 一致
  function buildSig(records){
    const genderKey = r => r.gender==='Male' ? '男' : (r.gender==='Female' ? '女' : '未标注');
    function kwBy(keyFn, order){
      const out={};
      for(const base of COMP_BASES){
        const groups={};
        for(const r of records){
          const v=(r.sc||{})[base];
          if(v==null) continue;
          const g=keyFn(r);
          if(!g) continue;
          (groups[g]=groups[g]||[]).push(v);
        }
        const gs = order ? order.filter(g=>groups[g]) : Object.keys(groups).sort();
        if(gs.length<2) continue;
        const arrays=gs.map(g=>groups[g]);
        const N=arrays.reduce((s,a)=>s+a.length,0);
        if(N<3) continue;
        const res=kwTest(arrays);
        if(!res) continue;
        const n={};
        gs.forEach(g=>{ n[g]=groups[g].length; });
        out[base]={
          H:Math.round(res.H*100)/100,
          p:res.p,
          eta2: res.eta2==null ? null : Math.round(res.eta2*1000)/1000,
          k:res.k, N, n
        };
      }
      return out;
    }
    const sigGender=kwBy(genderKey, ['男','女','未标注']);
    return { all:{diag:{}, gender:sigGender}, formal:{diag:{}, gender:sigGender} };
  }

  function studyId(){
    try {
      const rd = root && root.ResearchData;
      if (rd && typeof rd._load === 'function'){
        const d = rd._load() || {};
        if (d.study && d.study.id) return d.study.id;
      }
    } catch (e) { /* 回落默认 */ }
    return 'psy-exp';
  }

  function exportDashboardCsv(){
    const rows = buildRows();
    if (!rows.length) throw new Error('NO_DATA: 尚无带完成测验的访视');
    const csv = toCsv(rows);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = studyId() + '-dashboard-export-' + stamp + '.csv';
    if (root && root.document){
      const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return {filename, rows: rows.length, bytes: csv.length};
    }
    return {filename, rows: rows.length, csv};
  }

  const api = {STUDY_FILE, DIAG_NAME, RATER, RAW_COLUMNS, CORE_TO_KEY, COMP_BASES, HEADERS,
    buildRows, toCsv, exportDashboardCsv,
    gammaLn, gammp, chi2Sf, kwTest, buildSig};
  if (root && root.window) root.window.exportDashboardCsv = exportDashboardCsv;
  return api;
});
