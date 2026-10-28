'use strict';
/**
 * CSV 导出 → refresh.py 全回环测试（浏览器内建 CSV → 本地 Python 重跑分析 → 逐字段比对 + KW 交叉验证）。
 *
 * 流程：
 *   1. 本地 http 服务 + headless Chrome（CDP 直连，端口 8801/9301，避开 browser-smoke 8765/9222 与 reports-e2e 8799/9299）
 *   2. 宿主页 research-reports.html（5 个模块全加载）；种子 4 被试 × 2 访视 × 9 核心测验
 *      （2 男 / 1 女 / 1 未标注；RTA 第一访视注入官方分 SoP=77.7 / TMT AGT=62.3 验证官方优先）
 *   3. 浏览器内 buildRows + toCsv → CSV 文本回传 node，落盘 tmpdir/psy-exp-study.csv（UTF-8 BOM）
 *   4. Python 侧：importlib 加载 analysis/refresh.py（__main__ 守卫无副作用），
 *      monkeypatch HERE/CHART_JS/OUT_HTML 后跑 main()，花括号状态机提取 const DATA → data.json
 *   5. node 侧逐记录比对：8 记录 × (file/id/name/pkey/gender/age/phase/rater/tests/sc×9/tc×9/comp/diag)
 *   6. KW 交叉验证：data.sig.formal.gender（scipy kruskal）vs DashboardExport.buildSig(data.records)
 *      （自包含 JS 实现）——同输入两套实现，H/p/eta2/k/N/n 应一致
 *
 * 零 npm 依赖（Node 22 全局 WebSocket/fetch）。与 browser-smoke.cjs 同架构。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HOST = '127.0.0.1';
const PORT = 8801;
const CDP_PORT = 9301;
const BASE = `http://${HOST}:${PORT}`;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };
const REFRESH = path.join(ROOT, 'analysis', 'refresh.py');

/* 跨平台 Python 探测（CI ubuntu 有 python3；本机可用 PSY_EXP_PYTHON 指定）。
 * 不写死任何机器路径（CI 有 machine-path 守卫）。 */
function findPython() {
  if (process.env.PSY_EXP_PYTHON && fs.existsSync(process.env.PSY_EXP_PYTHON)) return process.env.PSY_EXP_PYTHON;
  for (const c of ['python3', 'python', 'py']) {
    try {
      const r = spawnSync(c, ['--version'], { encoding: 'utf8', timeout: 10000 });
      if (r.status === 0 && /Python 3\./.test((r.stdout || '') + (r.stderr || ''))) return c;
    } catch {}
  }
  return null;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function findChrome() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const env = process.env;
  const candidates = [
    env['ProgramFiles'] && path.join(env['ProgramFiles'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    env['ProgramFiles'] && path.join(env['ProgramFiles'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ];
  const home = env.USERPROFILE || env.HOME || '';
  if (home) {
    const abDir = path.join(home, '.agent-browser', 'browsers');
    if (fs.existsSync(abDir)) {
      for (const d of fs.readdirSync(abDir).sort().reverse()) {
        const c = path.join(abDir, d, 'chrome.exe');
        if (fs.existsSync(c)) candidates.push(c);
      }
    }
  }
  for (const c of candidates.filter(Boolean)) { try { if (fs.existsSync(c)) return c; } catch {} }
  for (const name of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']) {
    const r = spawnSync('which', [name], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

function makeServer() {
  return http.createServer((req, res) => {
    try {
      const url = new URL(req.url, BASE);
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const abs = path.resolve(ROOT, rel);
      if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) { res.writeHead(403); res.end('forbidden'); return; }
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(abs).pipe(res);
    } catch (err) { res.writeHead(500); res.end(String(err)); }
  });
}

async function pollJson(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const eventHandlers = new Map();
  let nextId = 1;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP websocket open timeout')), 5000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP websocket error')); }, { once: true });
  });
  ws.addEventListener('message', event => {
    const msg = JSON.parse(String(event.data));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message || 'CDP error'} (${msg.error.code || ''})`)) : resolve(msg.result);
      return;
    }
    if (msg.method && eventHandlers.has(msg.method)) for (const fn of eventHandlers.get(msg.method)) fn(msg.params || {});
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const on = (method, fn) => { if (!eventHandlers.has(method)) eventHandlers.set(method, new Set()); eventHandlers.get(method).add(fn); };
  return { ws, send, on };
}

/* ---- 种子：4 被试 × 2 访视 × 9 核心 + lns（确定性合成；2 男 / 1 女 / 1 未标注） ----
 * 主指标字段与 mccb-norms.js PRIMARY 读取对齐。
 * 注意：lns 不在 CSV 的 9 原始列内（refresh.py CORE_TESTS 口径，组内不施测），
 * 但工作记忆域分 = lns + spatial-span rank 均值，浏览器端队列 T 计算需要 lns 数据。
 * RTA 第一访视注入官方分（agt SoP / testAgt TMT）。 */
function seedScript() {
  const pids = ['RTA', 'RTB', 'RTC', 'RTD'];
  const dates = ['2026-01-10', '2026-03-10'];
  const tests = ['tmt', 'bacs', 'fluency', 'cpt', 'spatial-span', 'lns', 'hvlt', 'bvmt', 'mazes', 'msceit'];
  return `(function(){
localStorage.clear();
const pids=${JSON.stringify(pids)};const dates=${JSON.stringify(dates)};const tests=${JSON.stringify(tests)};
function resultFor(test,v){
  switch(test){
    case 'bacs':return{correct:v};case 'fluency':return{unique:v,total:v+2};
    case 'tmt':return{partA:{time:v,completed:true}};case 'cpt':return{dPrime:v};
    case 'spatial-span':return{totalCorrect:v};case 'lns':return{totalCorrect:v};
    case 'hvlt':return{trial1:v,trial2:v,trial3:v,trial4:v,trial5:v};
    case 'bvmt':return{trials:[{score:v},{score:v}]};
    case 'mazes':return{totalScore:v};case 'msceit':return{rawScore:v};
  }}
pids.forEach((pid,pi)=>{
  const h={};
  dates.forEach((date,di)=>{
    tests.forEach((t,ti)=>{
      const v=10+pi*5+di*3+ti*2;
      const rec=resultFor(t,v);
      rec._meta={recordedAt:date+'T09:0'+pi+':00.000Z'};
      (h['mccb-'+t+'-result']=h['mccb-'+t+'-result']||[]).push(rec);
    });
  });
  localStorage.setItem('mccb-participant-'+pid,JSON.stringify({cohortId:pid,progress:{},sessions:{},results:{},invalidResults:{},attemptHistory:h}));
});
localStorage.setItem('mccb-participant-list',JSON.stringify(pids));
const rd={study:{id:'psy-exp-default-study'},participants:{
  RTA:{age:30,gender:'male'},RTB:{age:42,gender:'male'},RTC:{age:35,gender:'female'},RTD:{}
}};
localStorage.setItem('psy-exp-research-data-v1',JSON.stringify(rd));
OfficialScores.addVisit('RTA',{date:'2026-01-10',agt:{'SoP':77.7},testAgt:{'TMT':62.3},source:'roundtrip-test',note:'verify-export-csv seed'});
return true;})()`;
}

/* ---- 标准 CSV 解析（引号/翻倍引号/CRLF；BOM 已先去） ---- */
function parseCsv(text) {
  const lines = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); lines.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); lines.push(row); }
  return lines;
}

const COMP_BASES = ['SoP', 'AV', 'WM', 'Vrbl Lrng', 'Vis Lrng', 'RPS', 'SC', 'Overall Comp', 'Neurocog Comp'];
const RAW_COLUMNS = ['TMT', 'BACS SC', 'HVLT-R', 'WMS-III SS', 'NAB Mazes', 'BVMT-R', 'Fluency', 'MSCEIT ME', 'CPT-IP'];
const EXPECT_AGE = { RTA: 30, RTB: 42, RTC: 35, RTD: null };
const EXPECT_GENDER = { RTA: 'Male', RTB: 'Male', RTC: 'Female', RTD: '' };

function expectEq(label, got, want) {
  if (got !== want) throw new Error(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
function expectClose(label, got, want, tol, dec) {
  if (typeof got !== 'number' || typeof want !== 'number' || Math.abs(got - want) > tol) {
    throw new Error(`${label}: got ${got}, want ${want} (tol ${tol})`);
  }
  // 两位/三位小数舍入边界：允许恰好一档的舍入差（如 2.675 落在 x.xx5 边界）
  const step = Math.pow(10, -dec);
  if (Math.abs(got - want) > 1e-12 && Math.abs(Math.abs(got - want) - step) > 1e-9) {
    throw new Error(`${label}: rounding-boundary tolerance exceeded: ${got} vs ${want}`);
  }
}

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chrome/Chromium executable found; set CHROME_BIN');
  if (!fs.existsSync(REFRESH)) throw new Error('refresh.py not found: ' + REFRESH);
  const py = findPython();
  if (!py) throw new Error('No Python 3 found (scipy needed for refresh.py roundtrip); set PSY_EXP_PYTHON');
  const EX = require(path.join(ROOT, 'mccb-dashboard-export.js'));

  const server = makeServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, HOST, resolve); });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-exp-rtprofile-'));
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-exp-rtcsv-'));
  const chromeProc = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeErr = '';
  const results = [];
  chromeProc.stderr.on('data', d => { chromeErr += String(d); if (chromeErr.length > 20000) chromeErr = chromeErr.slice(-20000); });
  let cdp = null;
  const exceptions = [];
  let csvText = '';
  try {
    let targets;
    try { targets = await pollJson(`http://${HOST}:${CDP_PORT}/json/list`); }
    catch (err) { throw new Error(`${err.message}\nChrome stderr:\n${chromeErr}`); }
    const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!page) throw new Error('No debuggable page target found');
    cdp = await connectCdp(page.webSocketDebuggerUrl);
    cdp.on('Runtime.exceptionThrown', p => exceptions.push(p.exceptionDetails && (p.exceptionDetails.text || (p.exceptionDetails.exception && p.exceptionDetails.exception.description)) || 'unknown runtime exception'));
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    async function evaluate(expression) {
      const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(`Evaluation failed: ${r.exceptionDetails.text}`);
      return r.result && r.result.value;
    }
    async function waitFor(expression, timeoutMs = 8000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        try { if (await evaluate(expression)) return true; } catch {}
        await sleep(120);
      }
      throw new Error(`Timed out waiting: ${expression.slice(0, 120)}`);
    }
    async function test(name, fn) {
      try { await fn(); results.push([name, true]); console.log('PASS', name); }
      catch (err) { results.push([name, false, err.message]); console.error('FAIL', name, '::', err.message); }
    }

    // 1. 宿主页加载（5 模块）
    await test('宿主页 research-reports.html：5 模块加载', async () => {
      await cdp.send('Page.navigate', { url: `${BASE}/research-reports.html` });
      await waitFor(`document.readyState === 'complete' && typeof DashboardExport !== 'undefined' && typeof OfficialScores !== 'undefined' && typeof MCCBNorms !== 'undefined' && typeof ResearchData !== 'undefined' && typeof ParticipantManager !== 'undefined'`, 10000);
    });

    // 2. 种子数据 + 官方分注入
    await test('种子 4 被试 × 2 访视 × 9 测验 + RTA 官方分（SoP 77.7 / TMT 62.3）', async () => {
      const ok = await evaluate(seedScript());
      if (ok !== true) throw new Error('seed script returned non-true');
    });

    // 3. 浏览器内 CSV 导出
    await test('浏览器内 buildRows + toCsv：8 行 / 34 列 / BOM / 官方分入列', async () => {
      const out = await evaluate(`(()=>{const rows=DashboardExport.buildRows();return {n:rows.length, csv:DashboardExport.toCsv(rows)};})()`);
      if (!out || !out.csv) throw new Error('no csv returned');
      csvText = out.csv;
      if (out.n !== 8) throw new Error('rows = ' + out.n + ' (want 8)');
      if (out.csv.charCodeAt(0) !== 0xFEFF) throw new Error('BOM missing');
      const lines = parseCsv(out.csv.replace(/^\uFEFF/, ''));
      if (lines.length !== 9) throw new Error('csv lines = ' + lines.length + ' (want 9 = 1 header + 8)');
      if (lines[0].length !== 34) throw new Error('header cols = ' + lines[0].length + ' (want 34)');
      expectEq('header[0]', lines[0][0], 'Respondent ID');
      expectEq('header[6]', lines[0][6], 'Rater');
      expectEq('header[7]', lines[0][7], 'TMT');
      expectEq('header[16]', lines[0][16], 'TMT AGT');
      expectEq('header[25]', lines[0][25], 'SoP AGT');
      expectEq('header[33]', lines[0][33], 'Neurocog Comp AGT');
      fs.writeFileSync(path.join(tmpdir, 'psy-exp-study.csv'), out.csv, 'utf8');
      fs.copyFileSync(path.join(ROOT, 'chart.min.js'), path.join(tmpdir, 'chart.min.js'));
    });

    // 4. Python 侧重跑 refresh.py
    let pyInfo = null;
    await test('Python refresh.py 回环：import + monkeypatch + main()', async () => {
      const r = spawnSync(py, [path.join(ROOT, 'tests', '_roundtrip_driver.py'), tmpdir, REFRESH], { encoding: 'utf8', timeout: 120000 });
      if (r.status !== 0) throw new Error('python exit ' + r.status + '\n' + (r.stdout || '') + '\n' + (r.stderr || ''));
      const m = (r.stdout || '').match(/PY_OK records=(\d+) files=(\d+) person=(\d) scipy=(\d) sig_domains=(\d+) reports=(.*)/);
      if (!m) throw new Error('PY_OK line missing:\n' + (r.stdout || ''));
      pyInfo = { records: +m[1], files: +m[2], person: +m[3], scipy: +m[4], sigDomains: +m[5], reports: m[6].split(',').filter(Boolean) };
      if (pyInfo.records !== 8) throw new Error('python records = ' + pyInfo.records);
      if (pyInfo.files !== 1) throw new Error('python files = ' + pyInfo.files);
      if (pyInfo.person !== 1) throw new Error('person.html not generated');
      if (pyInfo.scipy !== 1) throw new Error('scipy 不可用，KW 交叉验证无法进行');
      if (pyInfo.sigDomains !== 9) throw new Error('scipy sig domains = ' + pyInfo.sigDomains + ' (want 9)');
      if (pyInfo.reports.length !== 1 || !pyInfo.reports[0].startsWith('report_')) throw new Error('reports = ' + JSON.stringify(pyInfo.reports));
    });

    const data = pyInfo ? JSON.parse(fs.readFileSync(path.join(tmpdir, 'data.json'), 'utf8')) : null;

    // 5. 逐记录比对
    await test('逐记录比对：8 记录 × 身份/人口学/tests/sc×9/tc×9/comp（CSV 标准解析）', async () => {
      if (!data) throw new Error('no data.json (python step failed)');
      const grid = parseCsv(csvText.replace(/^\uFEFF/, ''));
      const hdr = grid[0];
      const col = name => hdr.indexOf(name);
      const recBy = new Map();
      for (const r of data.records) recBy.set(r.id + '|' + r.date, r);
      if (data.records.length !== 8) throw new Error('python records = ' + data.records.length);
      const pids = ['RTA', 'RTB', 'RTC', 'RTD'];
      const dates = ['2026-01-10', '2026-03-10'];
      for (let i = 1; i < grid.length; i++) {
        const row = grid[i];
        const pid = row[col('Respondent ID')];
        const date = row[col('Start Date')];
        const rec = recBy.get(pid + '|' + date);
        if (!rec) throw new Error(`row ${i}: no python record for ${pid}|${date}`);
        const pi = pids.indexOf(pid);
        const di = dates.indexOf(date);
        if (pi < 0 || di < 0) throw new Error(`row ${i}: unexpected ${pid}|${date}`);
        expectEq(`r${i} file`, rec.file, 'psy-exp-study.csv');
        expectEq(`r${i} diag`, rec.diag, '其他');
        expectEq(`r${i} id`, rec.id, pid);
        expectEq(`r${i} name`, rec.name, pid);
        expectEq(`r${i} pkey`, rec.pkey, 'psy-exp-study.csv|' + pid);
        expectEq(`r${i} gender`, rec.gender, EXPECT_GENDER[pid]);
        const ageW = EXPECT_AGE[pid];
        if (ageW === null) { if (rec.age !== null) throw new Error(`r${i} age = ${rec.age} (want null)`); }
        else expectClose(`r${i} age`, rec.age, ageW, 1e-9, 1);
        expectEq(`r${i} phase`, rec.phase, String(di + 1));
        expectEq(`r${i} rater`, rec.rater, 'browser-research');
        expectEq(`r${i} tests`, JSON.stringify(rec.tests), JSON.stringify(RAW_COLUMNS));
        expectEq(`r${i} comp`, rec.comp, 9);
        for (const b of COMP_BASES) {
          const csvV = row[col(b + ' AGT')];
          if (csvV === '') throw new Error(`r${i} sc[${b}]: csv empty`);
          expectClose(`r${i} sc[${b}]`, rec.sc[b], Math.round(parseFloat(csvV) * 10) / 10, 1e-9, 1);
        }
        for (const c of RAW_COLUMNS) {
          const csvV = row[col(c + ' AGT')];
          if (csvV === '') throw new Error(`r${i} tc[${c}]: csv empty`);
          expectClose(`r${i} tc[${c}]`, rec.tc[c], Math.round(parseFloat(csvV) * 10) / 10, 1e-9, 1);
        }
        // 官方分优先：RTA 第一访视 SoP=77.7 / TMT AGT=62.3
        if (pid === 'RTA' && di === 0) {
          expectEq('official sc.SoP', rec.sc['SoP'], 77.7);
          expectEq('official tc.TMT', rec.tc['TMT'], 62.3);
        }
      }
      const f = data.files['psy-exp-study.csv'];
      if (!f) throw new Error('files[psy-exp-study.csv] missing');
      expectEq('files rows', f.rows, 8);
      expectEq('files test', f.test, false);
      expectEq('files min', f.min, '2026-01-10');
      expectEq('files max', f.max, '2026-03-10');
      if (typeof f.report !== 'string' || !f.report.startsWith('reports/')) throw new Error('files.report = ' + JSON.stringify(f.report));
    });

    // 6. KW 交叉验证（scipy kruskal vs 自包含 JS 实现，同输入）
    await test('KW 交叉验证：scipy sig.formal.gender vs JS buildSig（H/p/eta2/k/N/n）', async () => {
      if (!data) throw new Error('no data.json (python step failed)');
      const pySig = (data.sig || {}).formal || { gender: {} };
      const jsSig = EX.buildSig(data.records).formal.gender;
      const pyDomains = Object.keys(pySig.gender || {});
      const jsDomains = Object.keys(jsSig);
      expectEq('sig domain set', JSON.stringify(pyDomains.sort()), JSON.stringify(jsDomains.sort()));
      for (const d of pyDomains) {
        const py = pySig.gender[d], js = jsSig[d];
        expectClose(`${d} H`, py.H, js.H, 0.011, 2);
        if (Math.abs(py.p - js.p) > 1e-9) throw new Error(`${d} p: scipy ${py.p} vs js ${js.p}`);
        if (py.eta2 === null || js.eta2 === null) {
          if (py.eta2 !== js.eta2) throw new Error(`${d} eta2 null mismatch: ${py.eta2} vs ${js.eta2}`);
        } else {
          expectClose(`${d} eta2`, py.eta2, js.eta2, 0.0011, 3);
        }
        expectEq(`${d} k`, py.k, js.k);
        expectEq(`${d} N`, py.N, js.N);
        expectEq(`${d} n`, JSON.stringify(py.n), JSON.stringify(js.n));
        if (py.k !== 3 || py.N !== 8) throw new Error(`${d} group shape: k=${py.k} N=${py.N} (want k=3 N=8)`);
      }
    });

    const failed = results.filter(r => !r[1]);
    const hardExceptions = exceptions.filter(e => !/Download|Autofill/i.test(e));
    if (hardExceptions.length) {
      console.error('PAGE EXCEPTIONS:', hardExceptions.join(' | '));
      failed.push(['page exceptions', false, hardExceptions.join(' | ')]);
    }
    if (failed.length) {
      console.error(`EXPORT-CSV FAIL: ${failed.length} failed`);
      process.exitCode = 1;
    } else {
      console.log('EXPORT-CSV PASS (' + results.length + ' tests)');
    }
  } finally {
    if (cdp) { try { cdp.ws.close(); } catch {} }
    try { chromeProc.kill(); } catch {}
    server.close();
    for (const d of [tmpdir, profile]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  }
}

main().catch(err => { console.error('EXPORT-CSV FATAL:', err.message); process.exit(1); });
