'use strict';
/**
 * research-reports.html（报告中心）Chromium E2E 冒烟。
 *
 * 流程：
 *   1. 本地 http 服务 + headless Chrome（CDP 直连，端口 8799/9299，避开 browser-smoke 的 8765/9222）
 *   2. 空态断言（无数据 → 空态提示）
 *   3. 种子数据：6 被试 × 2 访视 × 9 核心测验（+lns 补充），人口学 5 男 1 未标注
 *   4. 重载后：群体总览渲染（srcdoc 内 Chart.js 建图、canvas 数量、摘要行）
 *   5. 切个人报告（下拉选择 → person 模板渲染）
 *   6. iframe 明细表「查看」链接 → postMessage 桥 → 父页切个人视图
 *   7. 官方分注入弹窗（保存 → OfficialScores 落盘 → 渲染刷新）
 *   8. CSV 导出函数接线（exportDashboardCsv 存在且 buildRows 行数正确）
 *
 * 与 browser-smoke.cjs 同架构（零 npm 依赖，Node 22 全局 WebSocket/fetch）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HOST = '127.0.0.1';
const PORT = 8799;
const CDP_PORT = 9299;
const BASE = `http://${HOST}:${PORT}`;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };
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

/* ---- 种子数据：确定性合成（6 被试 × 2 访视 × 9 核心 + lns 补充） ---- */
function seedScript() {
  // 在浏览器内执行：写入 ParticipantManager 与 ResearchData 的 localStorage 结构
  // 主指标字段与 mccb-norms.js PRIMARY 读取对齐
  const pids = ['E2EP1', 'E2EP2', 'E2EP3', 'E2EP4', 'E2EP5', 'E2EP6'];
  const dates = ['2026-01-10', '2026-03-10'];
  const tests = ['tmt', 'bacs', 'fluency', 'cpt', 'spatial-span', 'lns', 'hvlt', 'bvmt', 'mazes', 'msceit'];
  // 包 IIFE：Runtime.evaluate 顶层是脚本非函数体，不允许裸 return
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
const rd={study:{id:'psy-exp-default-study'},participants:{}};
pids.slice(0,5).forEach((pid,i)=>{rd.participants[pid]={age:28+i*6,gender:'male'}});
rd.participants['E2EP6']={};
localStorage.setItem('psy-exp-research-data-v1',JSON.stringify(rd));
return true;})()`;
}

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chrome/Chromium executable found; set CHROME_BIN');
  const server = makeServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, HOST, resolve); });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-exp-reports-'));
  const chromeProc = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeErr = '';
  const results = [];
  chromeProc.stderr.on('data', d => { chromeErr += String(d); if (chromeErr.length > 20000) chromeErr = chromeErr.slice(-20000); });
  let cdp = null;
  const exceptions = [];
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
    async function navigate(url, readyExpr) {
      const before = exceptions.length;
      await cdp.send('Page.navigate', { url });
      await waitFor(readyExpr || 'document.readyState === "complete"');
      await sleep(200);
      const pageExceptions = exceptions.slice(before);
      if (pageExceptions.length) throw new Error(`Runtime exceptions on ${url}: ${pageExceptions.join(' | ')}`);
    }
    async function test(name, fn) {
      try { await fn(); results.push([name, true]); console.log('PASS', name); }
      catch (err) { results.push([name, false, err.message]); console.error('FAIL', name, '::', err.message); }
    }

    // 1. 空态
    await test('空态：无数据时显示空态提示', async () => {
      await navigate(`${BASE}/research-reports.html`, 'document.readyState === "complete" && typeof DashboardExport !== "undefined"');
      await waitFor(`document.getElementById('emptyState') && document.getElementById('emptyState').hidden === false`);
    });

    // 2. 种子数据
    await test('写入 6 被试 × 2 访视合成种子数据', async () => {
      const ok = await evaluate(seedScript());
      if (ok !== true) throw new Error('seed script returned non-true');
    });

    // 3. 重载 → 群体总览
    await test('重载后群体总览：srcdoc 渲染 + Chart.js 建图 + 摘要行', async () => {
      await cdp.send('Page.reload');
      await waitFor(`document.readyState === 'complete' && document.getElementById('summaryLine') && document.getElementById('summaryLine').textContent.includes('被试 6')`, 10000);
      await waitFor(`document.getElementById('summaryLine').textContent.includes('访视 12')`);
      await waitFor(`(()=>{const f=document.getElementById('frame');return f && f.contentDocument && f.contentDocument.readyState==='complete'})()`, 10000);
      const state = await evaluate(`(()=>{
        const f=document.getElementById('frame');
        const doc=f.contentDocument, w=f.contentWindow;
        const srcdoc=f.srcdoc||'';
        const canvases=Array.from(doc.querySelectorAll('canvas'));
        let live=0;
        for(const c of canvases){ try{ if(w.Chart&&w.Chart.getChart(c)) live++; }catch(e){} }
        return {
          hasData: srcdoc.includes('const DATA ='),
          chartLoaded: typeof w.Chart==='function',
          canvases: canvases.length,
          liveCharts: live,
          sigShown: !!doc.getElementById('sigTbl') && doc.getElementById('sigTbl').innerHTML.length>0,
          footerRecords: doc.getElementById('rcount') ? doc.getElementById('rcount').textContent : ''
        };
      })()`);
      const bad = Object.entries(state).filter(([, v]) => !v).map(([k]) => k);
      if (state.canvases < 8) bad.push('canvases=' + state.canvases);
      if (state.liveCharts < 8) bad.push('liveCharts=' + state.liveCharts);
      if (String(state.footerRecords) !== '12') bad.push('footerRecords=' + state.footerRecords);
      if (bad.length) throw new Error('overview render failed: ' + bad.join(', '));
    });

    // 4. 切个人报告（下拉）
    await test('切个人报告：person 模板 + 深链 person= 参数（URL 编码 pid）', async () => {
      await evaluate(`document.getElementById('selParticipant').value='E2EP1';document.getElementById('selParticipant').dispatchEvent(new Event('change'))`);
      // pkey=psy-exp-study|E2EP1 → 编码后 psy-exp-study%7CE2EP1
      await waitFor(`(()=>{const f=document.getElementById('frame');const d=f.contentDocument;return d && d.readyState==='complete' && f.srcdoc.includes('person=') && f.srcdoc.includes('E2EP1')})()`, 10000);
      await waitFor(`(()=>{const f=document.getElementById('frame');const d=f.contentDocument;return d && d.readyState==='complete' && d.getElementById('headTitle') && d.getElementById('headTitle').textContent.includes('E2EP1')})()`, 8000);
      const state = await evaluate(`(()=>{
        const f=document.getElementById('frame');
        const d=f.contentDocument,w=f.contentWindow;
        const canvases=Array.from(d.querySelectorAll('canvas'));
        let live=0;
        for(const c of canvases){ try{ if(w.Chart&&w.Chart.getChart(c)) live++; }catch(e){} }
        return {
          titleHasPid: (d.getElementById('headTitle')?d.getElementById('headTitle').textContent:'').includes('E2EP1'),
          liveCharts: live,
          kpis: d.querySelectorAll('.kpi').length
        };
      })()`);
      if (!state.titleHasPid) throw new Error('person title missing E2EP1');
      if (state.liveCharts < 2) throw new Error('person charts not created: ' + state.liveCharts);
      if (state.kpis < 4) throw new Error('KPIs missing: ' + state.kpis);
    });

    // 5. iframe 明细表「查看」→ postMessage 桥（先回总览再点链接）
    await test('iframe 明细「查看」链接经 postMessage 桥切个人视图', async () => {
      await evaluate(`document.querySelector('#viewSeg button[data-v="overview"]').click()`);
      await waitFor(`(()=>{const f=document.getElementById('frame');return f && f.contentDocument && f.contentDocument.readyState==='complete' && f.srcdoc.includes('const DATA =') && !f.contentDocument.getElementById('headTitle')})()`, 10000);
      await waitFor(`(()=>{const f=document.getElementById('frame');return f.contentDocument && f.contentDocument.querySelectorAll('a[href^="person.html"]').length>0})()`, 8000);
      const clicked = await evaluate(`(()=>{const f=document.getElementById('frame');const a=f.contentDocument.querySelector('a[href^="person.html"]');if(!a)return null;a.click();return a.getAttribute('href')})()`);
      if (!clicked) throw new Error('detail table person link not found');
      // person 模板独有 #headTitle（dashboard 模板无此 id）
      await waitFor(`(()=>{const f=document.getElementById('frame');const d=f.contentDocument;return d && d.readyState==='complete' && d.getElementById('headTitle') && d.getElementById('headTitle').textContent.includes('E2EP')})()`, 8000);
    });

    // 6. 官方分注入弹窗
    await test('官方分注入：弹窗 → 保存 → OfficialScores 落盘', async () => {
      await evaluate(`document.getElementById('btnOfficial').click()`);
      await waitFor(`document.getElementById('modalMask').hidden === false && document.getElementById('mAgt').children.length === 9 && document.getElementById('mTestAgt').children.length === 9`);
      await evaluate(`(()=>{
        const dateSel=document.getElementById('mDate');
        dateSel.value='2026-01-10'; dateSel.dispatchEvent(new Event('change'));
        document.getElementById('agt_SoP').value='77.7';
        document.getElementById('tagt_TMT').value='66.6';
        document.getElementById('mSource').value='e2e-official';
        document.getElementById('mSave').click();
      })()`);
      await waitFor(`(()=>{const v=OfficialScores.getVisit('E2EP1','2026-01-10');return v && v.agt.SoP===77.7 && v.testAgt['TMT']===66.6 && v.source==='e2e-official'})()`, 8000);
      // 保存后应重渲染（summary 含 官方分注入 1 访视）
      await waitFor(`document.getElementById('summaryLine').textContent.includes('官方分注入 1 访视')`);
    });

    // 7. CSV 导出接线
    await test('CSV 导出：exportDashboardCsv 接线 + buildRows 行数', async () => {
      const state = await evaluate(`(()=>{
        const rows=DashboardExport.buildRows();
        const csv=DashboardExport.toCsv(rows);
        const lines=csv.replace(/^\\uFEFF/,'').trim().split('\\r\\n');
        return {
          fn: typeof window.exportDashboardCsv==='function',
          rows: rows.length,
          headerCols: lines[0].split(',').length,
          dataRows: lines.length-1,
          bom: csv.charCodeAt(0)===0xFEFF,
          p001Official: rows.find(r=>r.pid==='E2EP1'&&r.date==='2026-01-10').sc['SoP']
        };
      })()`);
      if (!state.fn) throw new Error('window.exportDashboardCsv 未接线');
      if (state.rows !== 12 || state.dataRows !== 12) throw new Error('rows mismatch: ' + JSON.stringify(state));
      if (state.headerCols !== 34) throw new Error('header cols = ' + state.headerCols + '（期望 34 = 7 人口学 + 9 原始 + 9 测验AGT + 9 综合AGT）');
      if (!state.bom) throw new Error('BOM 缺失');
      if (state.p001Official !== 77.7) throw new Error('官方分未优先进入 CSV: ' + state.p001Official);
    });

    const failed = results.filter(r => !r[1]);
    const hardExceptions = exceptions.filter(e => !/Download|Autofill/i.test(e));
    if (hardExceptions.length) {
      console.error('PAGE EXCEPTIONS:', hardExceptions.join(' | '));
      process.exitCode = 1;
    }
    if (failed.length) { console.error(`REPORTS-E2E FAIL: ${failed.length} failed`); process.exit(1); }
    console.log('REPORTS-E2E PASS (' + results.length + ' tests)');
  } finally {
    try { if (cdp) cdp.ws.close(); } catch {}
    try { chromeProc.kill(); } catch {}
    try { server.close(); } catch {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

main().catch(err => { console.error('FATAL', err.message); process.exit(1); });
