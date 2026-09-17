'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HOST = '127.0.0.1';
const PORT = 8765;
const CDP_PORT = 9222;
const BASE = `http://${HOST}:${PORT}`;
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function findChrome() {
  for (const candidate of ['google-chrome-stable','google-chrome','chromium','chromium-browser']) {
    const r = spawnSync('which', [candidate], { encoding: 'utf8' });
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
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) { res.writeHead(404, {'content-type':'text/plain; charset=utf-8'}); res.end('not found'); return; }
      res.writeHead(200, {'content-type': MIME[path.extname(abs)] || 'application/octet-stream', 'cache-control':'no-store'});
      fs.createReadStream(abs).pipe(res);
    } catch (err) { res.writeHead(500); res.end(String(err)); }
  });
}
async function pollJson(url, timeoutMs=15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
async function connectCdp(wsUrl) {
  if (typeof WebSocket !== 'function') throw new Error('Node WebSocket global is unavailable; use Node 22+');
  const ws = new WebSocket(wsUrl), pending = new Map(), eventHandlers = new Map(); let nextId = 1;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP websocket open timeout')), 5000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP websocket error')); }, { once: true });
  });
  ws.addEventListener('message', event => {
    const msg = JSON.parse(String(event.data));
    if (msg.id && pending.has(msg.id)) { const {resolve,reject}=pending.get(msg.id); pending.delete(msg.id); msg.error?reject(new Error(`${msg.error.message||'CDP error'} (${msg.error.code||''})`)):resolve(msg.result); return; }
    if (msg.method && eventHandlers.has(msg.method)) for (const fn of eventHandlers.get(msg.method)) fn(msg.params || {});
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=nextId++;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
  const on=(method,fn)=>{if(!eventHandlers.has(method))eventHandlers.set(method,new Set());eventHandlers.get(method).add(fn)};
  return {ws,send,on};
}

async function main() {
  const chrome=findChrome(); if(!chrome) throw new Error('No Chrome/Chromium executable found on runner');
  const server=makeServer(); await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(PORT,HOST,resolve)});
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'psy-exp-chrome-'));
  const chromeProc=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${CDP_PORT}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  let chromeErr='',cdp; const results=[]; chromeProc.stderr.on('data',d=>{chromeErr+=String(d);if(chromeErr.length>20000)chromeErr=chromeErr.slice(-20000)});
  try {
    let targets;
    try { targets=await pollJson(`http://${HOST}:${CDP_PORT}/json/list`); }
    catch(err){ throw new Error(`${err.message}\nChrome stderr:\n${chromeErr}`); }
    const page=targets.find(t=>t.type==='page'&&t.webSocketDebuggerUrl); if(!page)throw new Error('No debuggable page target found');
    cdp=await connectCdp(page.webSocketDebuggerUrl); const exceptions=[]; cdp.on('Runtime.exceptionThrown',p=>exceptions.push(p.exceptionDetails&&(p.exceptionDetails.text||(p.exceptionDetails.exception&&p.exceptionDetails.exception.description))||'unknown runtime exception')); await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    async function evaluate(expression){const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(`Evaluation failed: ${r.exceptionDetails.text}`);return r.result&&r.result.value}
    async function waitFor(expression,timeoutMs=6000){const start=Date.now();while(Date.now()-start<timeoutMs){try{if(await evaluate(expression))return true}catch{}await sleep(100)}throw new Error(`Timed out waiting for expression: ${expression}`)}
    async function navigate(url,readyExpression='document.readyState === "complete"'){const before=exceptions.length;await cdp.send('Page.navigate',{url});await waitFor(readyExpression);await sleep(180);const pageExceptions=exceptions.slice(before);if(pageExceptions.length)throw new Error(`Runtime exceptions on ${url}: ${pageExceptions.join(' | ')}`)}
    async function test(name,fn){try{await fn();results.push([name,true]);console.log(`PASS ${name}`)}catch(err){results.push([name,false,err.message]);console.error(`FAIL ${name}: ${err.message}`)}}

    await test('research-boundary homepage supports a real first-time login flow', async()=>{
      await navigate(`${BASE}/index.html`,'document.readyState === "complete" && !!document.querySelector(".container")');
      await evaluate(`localStorage.clear(); true`);
      await navigate(`${BASE}/index.html`,'document.readyState === "complete" && !!document.querySelector(".container")');
      await waitFor(`document.querySelectorAll('.test-card').length===10 && typeof ResearchData!=='undefined' && typeof ResearchSession!=='undefined' && window.PSY_EXP_ORIGINAL_UI_MODERN_CORE==='1.0.0'`,8000);
      const shell=await evaluate(`(()=>({title:document.title==='psy-exp · 认知研究任务套件',boundary:document.querySelector('.research-boundary')?.textContent.includes('不生成官方 MCCB T 分或临床 percentile')===true,noPseudoStandardization:!document.body.textContent.includes('标准化认知功能评估工具')&&!document.body.textContent.includes('分数已标准化为百分比'),logo:!!document.querySelector('.header .logo'),dashboard:!!document.getElementById('dashboard'),domains:document.querySelectorAll('.domain-section').length===7,cards:document.querySelectorAll('.test-card').length===10,modeToggle:!!document.getElementById('modeToggle'),wideMode:!!document.getElementById('wm-toggle'),participantManager:!!document.getElementById('participantManagerOverlay'),resume:!!document.getElementById('resumeBtn'),noLaterWorkbench:!document.querySelector('.workbench-header,.subject-bar,.task-grid'),noResearchCss:![...document.styleSheets].some(s=>String(s.href||'').includes('research-ui.css')),polish:document.body.classList.contains('psy-polish')&&!!document.getElementById('original-ui-polish'),defaultUserMode:localStorage.getItem('mccb_mode')==='user'}))()`);
      const invalid=await evaluate(`(()=>{const input=document.getElementById('participantInput');input.value='bad id';input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('loginBtn').click();return ParticipantManager.getCurrent()===''&&!document.getElementById('loginBtn').disabled&&input.validationMessage.length>0})()`);
      if(!invalid)throw new Error('invalid participant id produced a false logged-in UI state');
      const typed=await evaluate(`(()=>{const input=document.getElementById('participantInput');input.value='E2E1';input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('loginBtn').click();return true})()`);
      if(!typed)throw new Error('could not type participant id through homepage input');
      await waitFor(`ParticipantManager.getCurrent()==='E2E1' && document.getElementById('loginBtn').disabled===true && document.getElementById('greetingArea').textContent.includes('E2E1') && document.getElementById('progressText').textContent.startsWith('0 / 10')`,8000);
      await waitFor(`ResearchData.snapshot().participants.E2E1`,8000);
      const participantOk=await evaluate(`ParticipantManager.getProgressSummary().done===0 && document.getElementById('resumeBtn').textContent.includes('10 项未完成')`);
      if(!participantOk)throw new Error('homepage login did not create clean participant UI/data state');
      const failed=Object.entries(shell||{}).filter(([,ok])=>!ok).map(([name])=>name);
      if(failed.length)throw new Error(`homepage browser contract failed: ${failed.join(', ')}`);
    });
    await test('data governance enables consent version and runner fails closed before grant', async()=>{
      await navigate(`${BASE}/data-governance.html`,`document.readyState === 'complete' && typeof ResearchGovernance!=='undefined' && !!document.getElementById('saveStudyBtn')`);
      const configured=await evaluate(`(()=>{document.getElementById('consentVersion').value='consent-e2e-v1';document.getElementById('saveStudyBtn').click();const e=ResearchData.sessionEligibility('E2E1');return ResearchData.MODEL_VERSION==='research-data-model-1.1.0'&&ResearchStorage.STORAGE_ARCH_VERSION==='local-primary-http-replica-1.0.0'&&e.eligible===false&&e.reason==='consent_required'})()`);if(!configured)throw new Error('governance page did not persist consent version gate');
      await navigate(`${BASE}/participant-runner.html?p=E2E1`,`document.readyState === 'complete' && document.getElementById('participantLabel').textContent.includes('E2E1')`);
      await waitFor(`document.querySelectorAll('#preflightList .check').length >= 6 && document.getElementById('nextTitle').textContent.includes('暂不能开始施测')`,8000);
      const blocked=await evaluate(`(()=>{const d=ResearchData.snapshot();return Object.keys(d.sessions).length===0&&document.getElementById('nextBtn').hidden===true&&document.getElementById('nextDesc').textContent.includes('consent-e2e-v1')&&[...document.querySelectorAll('#taskList a')].every(a=>!a.hasAttribute('href'))})()`);if(!blocked)throw new Error('runner did not fail closed on missing consent');
    });

    await test('governance grant releases participant and runner creates fingerprinted session', async()=>{
      await navigate(`${BASE}/data-governance.html`,`document.readyState === 'complete' && !!document.getElementById('grantConsentBtn')`);
      const granted=await evaluate(`(()=>{document.getElementById('grantConsentBtn').click();const e=ResearchData.sessionEligibility('E2E1'),p=ResearchData.snapshot().participants.E2E1;return e.eligible===true&&p.consent&&p.consent.version==='consent-e2e-v1'})()`);if(!granted)throw new Error('consent grant did not unlock participant');
      await navigate(`${BASE}/participant-runner.html?p=E2E1`,`document.readyState === 'complete' && document.getElementById('participantLabel').textContent.includes('E2E1')`);
      await waitFor(`document.querySelectorAll('#taskList .task-row').length === 10 && document.querySelectorAll('#preflightList .check').length >= 6`,8000);
      await waitFor(`(()=>{const d=ResearchData.snapshot(),s=Object.values(d.sessions)[0];return d.modelVersion==='research-data-model-1.1.0'&&d.participants.E2E1&&s&&s.participantId==='E2E1'&&s.status==='active'&&s.consentVersion==='consent-e2e-v1'&&s.environment&&s.protocolManifest&&typeof s.protocolManifest.manifestHash==='string'&&s.protocolManifest.manifestHash.length===64&&typeof s.protocolManifest.protocolLockHash==='string'&&s.protocolManifest.protocolLockHash.length===64})()`,8000);
      const ok=await evaluate(`(()=>{const d=ResearchData.snapshot(),s=Object.values(d.sessions)[0];return !!document.querySelector('.runner-focus')&&!!document.querySelector('.runner-roadmap')&&!document.body.textContent.includes('DEV mode')&&!document.querySelector('a[href="data-governance.html"]')&&document.getElementById('nextBtn').getAttribute('href').includes('mode=user')&&document.getElementById('progressText').textContent.startsWith('0 / 10')&&d.study.id==='psy-exp-default-study'&&s.build&&s.build.dataModelVersion==='research-data-model-1.1.0'&&s.build.storageArchitecture==='local-primary-http-replica-1.0.0'})()`);if(!ok)throw new Error('runner/session provenance contract failed');
    });

    await test('complete TMT Part A through real task UI and persist valid canonical result', async()=>{
      await navigate(`${BASE}/pages/mccb-tmt.html?p=E2E1&mode=user`,`document.readyState === 'complete' && !!document.getElementById('startA')`);await evaluate(`document.getElementById('startA').click()`);await waitFor(`document.getElementById('task').classList.contains('active') && !!document.querySelector('#board .node.next')`);
      const clicked=await evaluate(`(()=>{for(let i=0;i<25;i++){const n=document.querySelector('#board .node.next');if(!n)return false;n.click()}return true})()`);if(!clicked)throw new Error('could not traverse all 25 TMT Part A targets');await waitFor(`document.getElementById('result').classList.contains('active') && !!ParticipantManager.getResult('tmt')`);
      const ok=await evaluate(`(()=>{const r=ParticipantManager.getResult('tmt');return r&&r.protocol==='trail-making-browser-synthetic-v2'&&r.partA&&r.partA.completed===true&&r.partA.errors===0&&r.partA.clickData.length===25&&r._meta&&r._meta.sessionQc&&r._meta.sessionQc.status==='valid'&&ParticipantManager.getProgress('tmt')==='completed'})()`);if(!ok)throw new Error('TMT canonical result/QC/protocol persistence failed');
    });

    await test('task return restores runner progress, reuses session and checkpoints attempt provenance', async()=>{
      await evaluate(`document.querySelector('#result a[href*="participant-runner"]').click()`);await waitFor(`location.pathname.endsWith('/participant-runner.html') && document.getElementById('participantLabel').textContent.includes('E2E1')`,8000);await waitFor(`typeof ResearchData!=='undefined' && Object.values(ResearchData.snapshot().sessions).length===1 && Object.values(ResearchData.snapshot().sessions)[0].environment`,8000);
      await waitFor(`ResearchData.snapshot().attempts.some(a=>a.testKey==='tmt')`,8000);
      const ok=await evaluate(`(()=>{const d=ResearchData.snapshot(),s=Object.values(d.sessions)[0];return document.getElementById('progressText').textContent.startsWith('1 / 10') && document.getElementById('nextBtn').getAttribute('href').includes('mccb-bacs.html') && document.getElementById('nextBtn').getAttribute('href').includes('mode=user') && Object.values(d.sessions).length===1 && d.attempts.some(a=>a.testKey==='tmt'&&a.sessionId===s.id)})()`);if(!ok)throw new Error('runner did not reflect completion, advance, reuse session, or sync attempt');
    });

    await test('USER flow completes BACS inputs and returns to participant runner instead of researcher console', async()=>{
      await evaluate(`document.getElementById('nextBtn').click()`);
      await waitFor(`location.pathname.endsWith('/pages/mccb-bacs.html') && new URLSearchParams(location.search).get('mode')==='user'`,8000);
      await waitFor(`!!document.getElementById('startBtn') && !!document.getElementById('research-prototype-banner')`,8000);
      await evaluate(`document.getElementById('startBtn').click()`);
      await waitFor(`document.getElementById('page-test').classList.contains('active') && document.querySelectorAll('#grid input').length===110`,8000);
      const inputOk=await evaluate(`(()=>{const symbols=['△','○','◇','☆','□','♠','♣','♥','☼'];const inputs=[...document.querySelectorAll('#grid input')].slice(0,5);for(const input of inputs){const sym=input.closest('.cell').querySelector('.sym').textContent;input.value=String(symbols.indexOf(sym)+1);input.dispatchEvent(new Event('input',{bubbles:true}))}return document.getElementById('devCount').style.display==='none'&&inputs.every(i=>i.disabled&&!i.classList.contains('ok')&&!i.classList.contains('bad'))})()`);
      if(!inputOk)throw new Error('BACS USER mode exposed feedback or did not accept real input events');
      await evaluate(`end()`);
      await waitFor(`document.getElementById('page-result').classList.contains('active') && !!ParticipantManager.getResult('bacs')`,8000);
      const saved=await evaluate(`(()=>{const r=ParticipantManager.getResult('bacs'),a=[...document.querySelectorAll('#page-result a')].find(x=>x.textContent.includes('返回施测流程'));return r&&r.attempted===5&&r.correct===5&&ParticipantManager.getProgress('bacs')==='completed'&&a&&a.getAttribute('href').includes('participant-runner.html')&&a.getAttribute('href').includes('p=E2E1')})()`);
      if(!saved)throw new Error('BACS result or USER-mode return target is incorrect');
      await evaluate(`[...document.querySelectorAll('#page-result a')].find(x=>x.textContent.includes('返回施测流程')).click()`);
      await waitFor(`location.pathname.endsWith('/participant-runner.html') && document.getElementById('progressText').textContent.startsWith('2 / 10')`,8000);
      await waitFor(`ResearchData.snapshot().attempts.some(a=>a.testKey==='bacs')`,8000);
      const advanced=await evaluate(`document.getElementById('nextBtn').getAttribute('href').includes('mccb-fluency.html') && !document.body.textContent.includes('DEV mode') && !document.querySelector('a[href="data-governance.html"]')`);
      if(!advanced)throw new Error('runner did not advance cleanly to the third task after BACS');
    });
    await test('logout clears participant-specific dashboard and re-login restores progress', async()=>{
      await navigate(`${BASE}/index.html`,'document.readyState === "complete" && typeof ResearchData!=="undefined" && window.PSY_EXP_ORIGINAL_UI_MODERN_CORE==="1.0.0"');
      await waitFor(`ParticipantManager.getCurrent()==='E2E1' && document.getElementById('dashProgress').textContent.includes('2 / 10')`,8000);
      await evaluate(`document.getElementById('logoutBtn').click()`);
      const cleared=await evaluate(`ParticipantManager.getCurrent()==='' && document.getElementById('progressArea').style.display==='none' && document.getElementById('resumeBtn').style.display==='none' && document.getElementById('dashProgress').textContent.includes('0 / 10') && document.getElementById('dashGrid').textContent.includes('尚无测评数据') && document.getElementById('chartsPanel').style.display==='none'`);
      if(!cleared)throw new Error('logout left prior participant data visible on researcher dashboard');
      await evaluate(`(()=>{const input=document.getElementById('participantInput');input.value='E2E1';input.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('loginBtn').click();return true})()`);
      await waitFor(`ParticipantManager.getCurrent()==='E2E1' && document.getElementById('progressText').textContent.startsWith('2 / 10') && document.getElementById('dashProgress').textContent.includes('2 / 10')`,8000);
    });
    await test('single report executes in restored visual language and exposes raw result', async()=>{
      await navigate(`${BASE}/research-report.html`,`document.readyState === 'complete' && document.getElementById('participantSelect').options.length > 1`);
      const ok=await evaluate(`!!document.querySelector('.header') && !!document.querySelector('.subject-card') && !document.querySelector('.report-masthead') && document.getElementById('normBadge').textContent.includes('非临床常模') && document.body.textContent.includes('Trail Making')`);if(!ok)throw new Error('restored report visual shell, guardrail, or persisted TMT result missing');
    });

    await test('comparison page executes restored participant chips and safe matrix', async()=>{
      await navigate(`${BASE}/research-comparison.html`,`document.readyState === 'complete' && document.getElementById('reportCount').textContent.length > 0`);
      const ok=await evaluate(`!!document.querySelector('.comparison-layout') && !!document.querySelector('.participant-chip') && !document.querySelector('.selector-panel') && document.body.textContent.includes('CSV') && document.body.textContent.includes('N≥5') && document.body.textContent.includes('E2E1')`);if(!ok)throw new Error('restored comparison controls, participant, matrix, or small-N guardrail missing');
    });

    await test('homepage demo query still works after research-safe title rename', async()=>{
      await navigate(`${BASE}/index.html?demo=seed`,'document.readyState === "complete" && !!document.querySelector(".container")');
      await waitFor(`new URLSearchParams(location.search).get('demo')==='ready' && !!document.getElementById('psy-demo-banner')`,8000);
      const seeded=await evaluate(`document.body.classList.contains('psy-polish') && document.getElementById('psy-demo-banner').textContent.includes('DEMO 合成数据') && ParticipantManager.getAllParticipants().includes('DEMO-001')`);
      if(!seeded)throw new Error('demo seed/banner/polish did not activate on renamed homepage');
      await navigate(`${BASE}/index.html?demo=clear`,'document.readyState === "complete" && !!document.querySelector(".container")');
      await waitFor(`new URLSearchParams(location.search).get('demo')==='cleared'`,8000);
    });
    await test('private-material task shells fail closed without bundled assets', async()=>{
      await navigate(`${BASE}/pages/mccb-hvlt.html?p=E2E1&mode=user`,`document.readyState === 'complete' && !!document.getElementById('startBtn')`);const hvltOk=await evaluate(`document.getElementById('startBtn').disabled===true && document.getElementById('materialStatus').classList.contains('bad')`);if(!hvltOk)throw new Error('HVLT public shell did not fail closed without private material');
      await navigate(`${BASE}/pages/mccb-msceit.html?p=E2E1&mode=user`,`document.readyState === 'complete' && !!document.getElementById('start')`);const msceitOk=await evaluate(`document.getElementById('start').disabled===true && document.getElementById('status').classList.contains('bad')`);if(!msceitOk)throw new Error('MSCEIT public shell did not fail closed without private material');
    });

    const failures=results.filter(x=>!x[1]);console.log(`\nBrowser E2E smoke: ${results.length-failures.length} passed / ${failures.length} failed`);if(failures.length)process.exitCode=1;
  } finally {
    try{if(cdp)cdp.ws.close()}catch{}try{chromeProc.kill('SIGTERM')}catch{}await new Promise(resolve=>server.close(resolve));try{fs.rmSync(profile,{recursive:true,force:true})}catch{}
  }
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1});