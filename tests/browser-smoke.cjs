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
      let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const abs = path.resolve(ROOT, rel);
      if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) {
        res.writeHead(403); res.end('forbidden'); return;
      }
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        res.writeHead(404, {'content-type':'text/plain; charset=utf-8'}); res.end('not found'); return;
      }
      res.writeHead(200, {'content-type': MIME[path.extname(abs)] || 'application/octet-stream', 'cache-control':'no-store'});
      fs.createReadStream(abs).pipe(res);
    } catch (err) {
      res.writeHead(500); res.end(String(err));
    }
  });
}

async function pollJson(url, timeoutMs=10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function connectCdp(wsUrl) {
  if (typeof WebSocket !== 'function') throw new Error('Node WebSocket global is unavailable; use Node 22+');
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const eventHandlers = new Map();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP websocket open timeout')), 5000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP websocket error')); }, { once: true });
  });
  ws.addEventListener('message', event => {
    const msg = JSON.parse(String(event.data));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message || 'CDP error'} (${msg.error.code || ''})`)); else resolve(msg.result);
      return;
    }
    if (msg.method && eventHandlers.has(msg.method)) for (const fn of eventHandlers.get(msg.method)) fn(msg.params || {});
  });
  const send = (method, params={}) => new Promise((resolve, reject) => {
    const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  const on = (method, fn) => { if (!eventHandlers.has(method)) eventHandlers.set(method, new Set()); eventHandlers.get(method).add(fn); };
  return { ws, send, on };
}

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chrome/Chromium executable found on runner');
  const server = makeServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, HOST, resolve); });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-exp-chrome-'));
  const chromeProc = spawn(chrome, [
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, 'about:blank'
  ], { stdio: ['ignore','ignore','pipe'] });
  let chromeErr = '';
  chromeProc.stderr.on('data', d => { chromeErr += String(d); if (chromeErr.length > 20000) chromeErr = chromeErr.slice(-20000); });

  const results = [];
  let cdp;
  try {
    const targets = await pollJson(`http://${HOST}:${CDP_PORT}/json/list`);
    const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!page) throw new Error('No debuggable page target found');
    cdp = await connectCdp(page.webSocketDebuggerUrl);
    const exceptions = [];
    cdp.on('Runtime.exceptionThrown', p => exceptions.push(p.exceptionDetails && (p.exceptionDetails.text || (p.exceptionDetails.exception && p.exceptionDetails.exception.description)) || 'unknown runtime exception'));
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    async function evaluate(expression) {
      const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(`Evaluation failed: ${r.exceptionDetails.text}`);
      return r.result && r.result.value;
    }
    async function waitFor(expression, timeoutMs=6000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        try { if (await evaluate(expression)) return true; } catch {}
        await sleep(100);
      }
      throw new Error(`Timed out waiting for expression: ${expression}`);
    }
    async function navigate(url, readyExpression='document.readyState === "complete"') {
      const before = exceptions.length;
      await cdp.send('Page.navigate', { url });
      await waitFor(readyExpression);
      await sleep(150);
      const pageExceptions = exceptions.slice(before);
      if (pageExceptions.length) throw new Error(`Runtime exceptions on ${url}: ${pageExceptions.join(' | ')}`);
    }
    async function test(name, fn) {
      try { await fn(); results.push([name, true]); console.log(`PASS ${name}`); }
      catch (err) { results.push([name, false, err.message]); console.error(`FAIL ${name}: ${err.message}`); }
    }

    await test('researcher console loads as scrollable research app', async () => {
      await navigate(`${BASE}/index.html`, 'document.readyState === "complete" && !!document.querySelector(".research-shell")');
      const ok = await evaluate(`document.querySelector('.eyebrow').textContent.includes('Researcher console') && getComputedStyle(document.documentElement).overflowY !== 'hidden' && document.querySelectorAll('#cohortMetrics .metric').length === 4`);
      if (!ok) throw new Error('researcher console shell/metrics contract failed');
      await evaluate(`ParticipantManager.setCurrent('E2E1')`);
    });

    await test('participant runner resolves deep link and renders ten tasks', async () => {
      await navigate(`${BASE}/participant-runner.html?p=E2E1`, `document.readyState === 'complete' && document.getElementById('participantLabel').textContent.includes('E2E1')`);
      await waitFor(`document.querySelectorAll('#taskList .task-row').length === 10 && document.querySelectorAll('#preflightList .check').length >= 6`, 8000);
      const ok = await evaluate(`!document.body.textContent.includes('DEV mode') && document.getElementById('nextBtn').getAttribute('href').includes('mode=user')`);
      if (!ok) throw new Error('runner leaked DEV controls or did not force USER mode');
    });

    await test('single report executes and exposes research norm label', async () => {
      await navigate(`${BASE}/research-report.html`, `document.readyState === 'complete' && document.getElementById('normBadge').textContent !== '载入中…'`);
      const ok = await evaluate(`document.getElementById('normBadge').textContent.includes('RESEARCH') && document.body.textContent.includes('reference N < 5')`);
      if (!ok) throw new Error('research report guardrail/norm label missing');
    });

    await test('comparison page executes selection model', async () => {
      await navigate(`${BASE}/research-comparison.html`, `document.readyState === 'complete' && document.getElementById('count').textContent.length > 0`);
      const ok = await evaluate(`document.body.textContent.includes('导出 CSV') && document.body.textContent.includes('N≥5')`);
      if (!ok) throw new Error('comparison controls/guardrail missing');
    });

    await test('USER-mode task return routes back to participant runner', async () => {
      await navigate(`${BASE}/participant-runner.html?p=E2E1`, `document.getElementById('participantLabel').textContent.includes('E2E1')`);
      await evaluate(`location.href='${BASE}/pages/mccb-tmt.html?p=E2E1&mode=user'`);
      await waitFor(`location.pathname.endsWith('/pages/mccb-tmt.html') && !!document.getElementById('startA')`);
      await evaluate(`location.href='${BASE}/index.html'`);
      await waitFor(`location.pathname.endsWith('/participant-runner.html') && document.getElementById('participantLabel').textContent.includes('E2E1')`, 8000);
    });

    const failures = results.filter(x => !x[1]);
    console.log(`\nBrowser smoke: ${results.length - failures.length} passed / ${failures.length} failed`);
    if (failures.length) process.exitCode = 1;
  } finally {
    try { if (cdp) cdp.ws.close(); } catch {}
    try { chromeProc.kill('SIGTERM'); } catch {}
    await new Promise(resolve => server.close(resolve));
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
    if (process.exitCode && chromeErr) console.error(`\nChrome stderr tail:\n${chromeErr.slice(-4000)}`);
  }
}

main().catch(err => { console.error(err.stack || err); process.exit(1); });
