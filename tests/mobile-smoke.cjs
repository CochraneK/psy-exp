'use strict';
/**
 * Mobile viewport layout regression guard (390x844, deviceScaleFactor 2).
 *
 * Complements browser-smoke.cjs (desktop functional E2E) by asserting that
 * on-screen layout stays inside a phone-width viewport. It guards against the
 * class of regression the 2026-09-25 upstream refactor introduced (dropped
 * page-level @media rules, shrunken BACS inputs, class-vs-id result-screen
 * selectors falling back to the .page default row flow).
 *
 *   - task screens: 7 task pages, after starting, no visible element may
 *     overflow the 390px viewport horizontally.
 *   - result screens: 6 shell pages, the .page-result section must be
 *     column-flow (not the .page default row) and overflow-free.
 *
 * Runs its own static server (8765) and headless Chrome (CDP 9222), exactly
 * like browser-smoke.cjs. Requires Node 22+ (global WebSocket + fetch).
 *
 * Task pages are loaded with ?p=E2E1&mode=user and any native JS dialog is
 * auto-accepted: an alert() in headless Chrome blocks the CDP page and the
 * sandbox SIGTERMs the whole process group, so dialogs must be swallowed.
 */
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
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  if (process.platform === 'win32') {
    const env = process.env;
    const candidates = [
      env['ProgramFiles'] && path.join(env['ProgramFiles'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
      env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      env['ProgramFiles'] && path.join(env['ProgramFiles'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ].filter(Boolean);
    for (const candidate of candidates) {
      try { if (fs.existsSync(candidate)) return candidate; } catch {}
    }
    return null;
  }
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

// Measure the active .page screen: count visible elements whose box extends
// past the 390px viewport, plus document-level horizontal scroll.
const MEASURE = `(() => {
  const active = document.querySelector('.page.active');
  if (!active) return JSON.stringify({ error: 'no active page' });
  const over = [];
  active.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
      over.push(el.tagName + '.' + (el.className.baseVal !== undefined ? 'svg' : String(el.className).split(' ').join('.')));
    }
  });
  const doc = document.documentElement;
  return JSON.stringify({ active: active.id, overCount: over.length, overflowEls: over.slice(0, 6), docScrollW: doc.scrollWidth, docClientW: doc.clientWidth });
})()`;

async function main() {
  const chrome = findChrome(); if (!chrome) throw new Error('No Chrome/Chromium executable found on runner');
  const server = makeServer(); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, HOST, resolve); });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-exp-mobile-'));
  const chromeProc = spawn(chrome, ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${CDP_PORT}`,`--user-data-dir=${profile}`,'about:blank'], { stdio:['ignore','ignore','pipe'] });
  let chromeErr = '', cdp; const results = []; const dialogs = [];
  chromeProc.stderr.on('data', d => { chromeErr += String(d); if (chromeErr.length > 20000) chromeErr = chromeErr.slice(-20000); });
  try {
    let targets;
    try { targets = await pollJson(`http://${HOST}:${CDP_PORT}/json/list`); }
    catch (err) { throw new Error(`${err.message}\nChrome stderr:\n${chromeErr}`); }
    const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl); if (!page) throw new Error('No debuggable page target found');
    cdp = await connectCdp(page.webSocketDebuggerUrl);
    // Swallow native dialogs: an alert() in headless Chrome blocks the CDP
    // page and the sandbox SIGTERMs the process group, so auto-accept.
    cdp.on('Page.javascriptDialogOpening', p => { dialogs.push(String(p.message || '').slice(0, 60)); cdp.send('Page.handleJavaScriptDialog', { accept: true }); });
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    async function evaluate(expression) { const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(`Evaluation failed: ${r.exceptionDetails.text}`); return r.result && r.result.value; }
    async function waitFor(expression, timeoutMs=6000) { const start = Date.now(); while (Date.now() - start < timeoutMs) { try { if (await evaluate(expression)) return true; } catch {} await sleep(100); } throw new Error(`Timed out waiting for: ${expression}`); }
    async function navigate(url) { await cdp.send('Page.navigate', { url }); await waitFor(`document.readyState === "complete"`, 8000); await sleep(250); }
    async function test(name, fn) { try { await fn(); results.push([name, true]); console.log(`PASS ${name}`); } catch (err) { results.push([name, false, err.message]); console.error(`FAIL ${name}: ${err.message}`); } }
    async function checkOverflow(label) {
      const raw = await evaluate(MEASURE);
      let m; try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw new Error(`${label}: measure returned non-JSON (${raw})`); }
      if (!m || m.error) throw new Error(`${label}: ${m && m.error ? 'no active page' : 'measure failed'}`);
      const problems = [];
      if (m.overCount > 0) problems.push(`${m.overCount} element(s) overflow the 390px viewport: ${m.overflowEls.join(', ')}`);
      if (m.docScrollW > m.docClientW + 1) problems.push(`document scrollWidth ${m.docScrollW} > clientWidth ${m.docClientW}`);
      if (problems.length) throw new Error(`${label} [active=#${m.active}]: ${problems.join('; ')}`);
    }

    // Seven task screens. Each starts via its real UI control, waits for the
    // task screen to become active, settles, then asserts no overflow.
    const taskCases = [
      { name: 'cpt', file: 'mccb-cpt.html', start: `document.getElementById('practiceBtn').click()`, screen: 'page-test' },
      { name: 'bvmt', file: 'mccb-bvmt.html', start: `document.getElementById('start').click()`, screen: 'study' },
      { name: 'mazes', file: 'mccb-mazes.html', start: `document.getElementById('start').click()`, screen: 'task' },
      { name: 'spatial-span', file: 'mccb-spatial-span.html', start: `(document.getElementById('start')||document.querySelector('#welcome button')).click()`, screen: 'task' },
      { name: 'tmt', file: 'mccb-tmt.html', start: `(() => { const b = [...document.querySelectorAll('#welcome button')].find(x => /Part A/.test(x.textContent)); b && b.click(); return !!b; })()`, screen: 'task' },
    ];
    for (const c of taskCases) {
      await test(`task screen stays in 390px viewport: ${c.name}`, async () => {
        await navigate(`${BASE}/pages/${c.file}?mode=user&p=E2E1`);
        const started = await evaluate(c.start);
        if (c.name === 'tmt' && !started) throw new Error('TMT Part A start button not found');
        await waitFor(`document.getElementById('${c.screen}').classList.contains('active')`, 6000);
        await sleep(600);
        await checkOverflow(`task/${c.name}`);
      });
    }
    // BACS now gates the timed grid behind a mandatory practice screen
    // (operator manual: the practice portion must be fully completed). Cover
    // both the practice layout and the formal 110-cell grid layout.
    await test('task screen stays in 390px viewport: bacs', async () => {
      await navigate(`${BASE}/pages/mccb-bacs.html?mode=user&p=E2E1`);
      await evaluate(`document.getElementById('startBtn').click()`);
      await waitFor(`document.getElementById('page-practice').classList.contains('active')`, 6000);
      await sleep(600);
      await checkOverflow('task/bacs-practice');
      const filled = await evaluate(`(() => { const inputs=[...document.querySelectorAll('#practiceGrid input')]; for(const inp of inputs){ inp.value='1'; inp.dispatchEvent(new Event('input',{bubbles:true})); } return inputs.length; })()`);
      if(!filled) throw new Error('no practice inputs rendered');
      await waitFor(`!document.getElementById('startFormalBtn').disabled`, 6000);
      await evaluate(`document.getElementById('startFormalBtn').click()`);
      await waitFor(`document.getElementById('page-test').classList.contains('active')`, 6000);
      await sleep(600);
      await checkOverflow('task/bacs-test');
    });
    // LNS reaches the recall input (the padded screen) in two steps: start,
    // then the study screen's advance button.
    await test('task screen stays in 390px viewport: lns', async () => {
      await navigate(`${BASE}/pages/mccb-lns.html?mode=user&p=E2E1`);
      await evaluate(`document.getElementById('start').click()`);
      await waitFor(`document.getElementById('study').classList.contains('active')`, 6000);
      await sleep(300);
      await evaluate(`(() => { const b = document.querySelector('.page.active button'); if (b) b.click(); })()`);
      await waitFor(`document.getElementById('recall').classList.contains('active')`, 6000);
      await sleep(600);
      await checkOverflow('task/lns');
    });

    // Six shell result screens: force-activate #result and assert column flow
    // + no horizontal overflow (guards the class-vs-id .page-result fix).
    const resultPages = ['lns','mazes','bvmt','msceit','spatial-span','tmt'];
    for (const name of resultPages) {
      await test(`result screen is column-flow and in-viewport: ${name}`, async () => {
        await navigate(`${BASE}/pages/mccb-${name}.html?mode=user&p=E2E1`);
        const hasResult = await evaluate(`(() => { const r = document.getElementById('result'); if (!r) return false; document.querySelectorAll('.page').forEach(x => x.classList.remove('active')); r.classList.add('active'); return true; })()`);
        if (!hasResult) throw new Error('no #result section');
        await sleep(800); // let the 0.35s page transition settle
        const layout = JSON.parse(await evaluate(`(() => { const r = document.getElementById('result'); const cs = getComputedStyle(r); const doc = document.documentElement; return JSON.stringify({ flexDir: cs.flexDirection, docScrollW: doc.scrollWidth, docClientW: doc.clientWidth }); })()`));
        if (layout.flexDir !== 'column') throw new Error(`result screen is ${layout.flexDir}-flow (expected column)`);
        if (layout.docScrollW > layout.docClientW + 1) throw new Error(`result screen overflows: scrollWidth ${layout.docScrollW} > clientWidth ${layout.docClientW}`);
      });
    }

    const failures = results.filter(x => !x[1]);
    console.log(`\nMobile layout smoke (390x844): ${results.length - failures.length} passed / ${failures.length} failed`);
    if (dialogs.length) console.log(`auto-accepted dialogs: ${dialogs.join(' | ')}`);
    if (failures.length) process.exitCode = 1;
  } finally {
    try { if (cdp) cdp.ws.close(); } catch {}
    try { chromeProc.kill('SIGTERM'); } catch {}
    await new Promise(resolve => server.close(resolve));
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}
main().catch(err => { console.error(err.stack || err); process.exitCode = 1; });
