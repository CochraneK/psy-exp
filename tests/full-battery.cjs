/**
 * full-battery.cjs v2 — 模拟被试 test 完整做完 MCCB 10 项测验
 * 架构: 驱动逻辑整块注入页面世界 (setInterval 内循环, 零 eval 开销)
 *       harness 只轮询 localStorage 完成标志
 * 账号: test (URL ?p=test → 结果归档到 mccb-participant-test)
 */
const { execFile } = require('child_process');
const fs = require('fs');

const NODE = 'C:/Users/SCZ_2207/.workbuddy/binaries/node/versions/22.22.2-2/node.exe';
const AB = 'D:/node.js/node_global/node_modules/agent-browser/bin/agent-browser.js';
const BASE = process.env.MCCB_BASE || 'http://127.0.0.1:8766';
const P = process.env.MCCB_PARTICIPANT || 'test';
const OUT_DIR = 'D:/Software/DSH/psy-exp/data/autotest';
const REPORT = OUT_DIR + '/battery-test-report';
const HOST = BASE.replace(/^https?:\/\//, '');

// 确保报表目录存在
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

let gOpen = false;
function ab(args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    execFile(NODE, [AB, ...args], { encoding: 'utf8', timeout }, (err, stdout, stderr) => {
      if (err) reject(new Error('ab#' + (args[0] || '') + ': ' + (stdout + stderr).slice(0, 200)));
      else resolve((stdout || '').trim());
    });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

let gStarted = false; // 会话是否已用 open 启动 (后续全部页内导航, 保证单标签页)

async function openUrl(url) {
  // 不在 close --all (会杀 daemon)。用 open 新标签开始, 已有旧标签无影响
  try { await ab(['eval', '1 + 1']); } catch(e){ await sleep(2000); } // 探活, 必要时自动重启
  await ab(['open', url]);
  await sleep(3500);
  gOpen = true; gStarted = true;
  await verifyUrl(url, 10, false);
}

/** 页内导航 — 不经 daemon open, 永远同一标签页, 彻底避免标签错位 */
async function navTo(url) {
  if (!gStarted) return openUrl(url);
  try { await ev("try{document.body.classList.remove('testing-active')}catch(e){}; 'safe'"); } catch(e) {}
  await ev(`location.href='` + url + `'; 'nav'`).catch(() => {});
  await sleep(1800);
  await verifyUrl(url, 12, false);
}

/** 轮询等待 eval 上下文为目标页面 */
async function verifyUrl(url, tries = 10, reopen = false) {
  const want = url.replace(/^https?:\/\/[^/]+/, '');
  for (let i = 0; i < tries; i++) {
    try {
      const got = await ev('location.pathname + location.search');
      if (got.replace(/"/g, '') === want) return true;
    } catch (e) {}
    await sleep(1200);
    if (reopen) { try { await ab(['open', url]); await sleep(1000); } catch (e) {} }
  }
  throw new Error('verifyUrl failed: expected ' + want);
}
async function closeAll() { try { gOpen = false; gStarted = false; await ab(['close', '--all']); } catch(e){} await sleep(300); }
async function ev(code) { return ab(['eval', code]); }

// 注意: agent-browser eval 返回 JSON 字符串 — 布尔是 'true'/'false' 字面量
// 必须显式比较, 直接 if(r) 会因非空字符串 'false' 恒真!
const lsDone = async id => (await ev(`localStorage.getItem('mccb-${id}-result') !== null`)) === 'true';
const clearLs = id => ev(`localStorage.removeItem('mccb-${id}-result'); 'ok'`);
async function pollUntil(fn, timeoutMs, intervalMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fn(); if (r) return r; } catch (e) {}
    await sleep(intervalMs);
  }
  throw new Error('POLL_TIMEOUT: ' + label);
}
const partProgress = async id => {
  const r = await ev(`(function(){var d=JSON.parse(localStorage.getItem('mccb-participant-${P}')||'null');return d?d.progress['${id}']:'NO_PARTICIPANT'})()`);
  return r.replace(/"/g, '');
};

// ---------- 页面世界公共驱动代码 ----------
const OVL = `function(){var o=document.getElementById('overlay');if(!o)return false;var st=getComputedStyle(o);if(st.display==='none'||o.hidden)return false;if(o.__seen)return true;o.__seen=true;var b=o.querySelector('button:not([disabled])');if(b)b.click();return true}`;
// overlay 不可见时重置 __seen (IIFE — 语句不能直接包括号)
const OVL_RESET = `(function(){var o=document.getElementById('overlay');if(o&&!(getComputedStyle(o).display!=='none'||o.hidden))o.__seen=false})()`;

// ---------- 各测验驱动 (单次 eval 注入) ----------
const DRV = {
  msceit: `(function(){if(window.__drv)return'dup';window.__drv=1;window.startTest();
    var iv=setInterval(function(){if(localStorage.getItem('mccb-msceit-result')){clearInterval(iv);return}
      (${OVL_RESET});
      (${OVL})();
      var opt=document.querySelector('#optionsArea .option-btn');if(opt)opt.click();
      var n=document.getElementById('btnNext');if(n&&!n.disabled)n.click();
    },160);return 'ok'})()`,
  bacs: `(function(){if(window.__drv)return'dup';window.__drv=1;window.startTest();
    var iv=setInterval(function(){if(localStorage.getItem('mccb-bacs-result')){clearInterval(iv);return}
      (${OVL_RESET});
      (${OVL})();
      var ins=document.querySelectorAll('#grid input');var any=false;
      for(var i=0;i<ins.length;i++){if(!ins[i].value){ins[i].value='1';ins[i].dispatchEvent(new Event('input',{bubbles:true}));any=true;break}}
      if(!any&&ins.length){window.endTest()}
    },300);return 'ok'})()`,
  fluency: `(function(){if(window.__drv)return'dup';window.__drv=1;window.startTest();
    var words=['猫','狗','牛','羊','猪','马','鸡','鸭','鱼','虎','狮','熊','兔','鼠','蛇','鸟'];var i=0;
    var iv=setInterval(function(){if(localStorage.getItem('mccb-fluency-result')){clearInterval(iv);return}
      (${OVL_RESET});
      (${OVL})();
      if(i<words.length){document.getElementById('animalInput').value=words[i++];window.addAnimal()}
      else{window.endTest()}
    },170);return 'ok'})()`,
  'spatial-span': `(function(){if(window.__drv)return'dup';window.__drv=1;window.startTest();
    var iv=setInterval(function(){if(localStorage.getItem('mccb-spatial-span-result')){clearInterval(iv);return}
      (${OVL_RESET});
      (${OVL})();
      var b=document.querySelector('.spatial-block:not(.selected)');if(b)b.click();
    },600);return 'ok'})()`,
  lns: `(function(){if(window.__drv)return'dup';window.__drv=1;window.startTest();
    var iv=setInterval(function(){if(localStorage.getItem('mccb-lns-result')){clearInterval(iv);return}
      (${OVL_RESET});
      (${OVL})();
      var aa=document.getElementById('answerArea');if(aa&&!aa.classList.contains('hidden')){var bx=document.querySelectorAll('.char-box');bx.forEach(function(b){b.value='A';b.dispatchEvent(new Event('input',{bubbles:true}))});var s=document.getElementById('submitBtn');if(s&&!s.disabled)s.click()}
    },600);return 'ok'})()`,
  hvlt: `(function(){if(window.__drv)return'dup';window.__drv=1;var W=['唢呐','二胡','萧','笛子','木炭','煤油','木头','汽油','糖','大蒜','味精','桂皮'];
    var rounds=[[1,'第 1 轮回忆'],[2,'第 2 轮回忆'],[3,'第 3 轮回忆']];var ri=0;
    window.startTrial(1);
    var iv=setInterval(function(){if(localStorage.getItem('mccb-hvlt-result')){clearInterval(iv);return}
      // 回忆输入框可见 → 逐词加入并结束本轮
      var inp=document.getElementById('recallInput');
      if(inp&&inp.offsetParent!==null){
        var i=0;var wv=setInterval(function(){if(i<W.length){inp.value=W[i++];window.addRecall()}else{clearInterval(wv);window.finishRecall()}},90);
        return;
      }
      // 延迟回忆按钮出现
      var dl=[...document.querySelectorAll('button')].find(function(b){return b.textContent.indexOf('开始延迟回忆')>-1&&b.offsetParent!==null});
      if(dl){dl.click();return}
      // 下一轮学习按钮
      var nb=[...document.querySelectorAll('button')].find(function(b){return /开始第 \\d 轮学习|继续/.test(b.textContent)&&b.offsetParent!==null});
      if(nb){nb.click()}
    },400);return 'ok'})()`,
  tmt: `(function(){if(window.__drv)return'dup';window.__drv=1;startPart('A');
    var iv=setInterval(function(){if(localStorage.getItem('mccb-tmt-result')){clearInterval(iv);return}
      (${OVL_RESET});
      if((${OVL})())return;
      var ra=document.getElementById('page-result-a');
      if(ra&&ra.classList.contains('active')){var b=ra.querySelector('.btn-success');if(b){b.click();return}}
      var pi=document.getElementById('page-part-b-intro');
      if(pi&&pi.classList.contains('active')){startPracticeB();return}
      var pt=document.getElementById('page-test');
      if(pt&&pt.classList.contains('active')&&STATE.points.length&&STATE.currentIndex<STATE.points.length){
        var p=STATE.points[STATE.currentIndex];var c=document.getElementById('testCanvas');var r=c.getBoundingClientRect();
        onCanvasClick({clientX:r.left+p.x*(r.width/STATE.canvasWidth),clientY:r.top+p.y*(r.height/STATE.canvasHeight)});
      }
    },300);return 'ok'})()`,
  cpt: `(function(){if(window.__drv)return'dup';window.__drv=1;startPractice();
    var iv=setInterval(function(){if(localStorage.getItem('mccb-cpt-result')){clearInterval(iv);return}
      var o=document.getElementById('overlay');var ovis=o&&getComputedStyle(o).display!=='none'&&!o.hidden;
      if(ovis){if(!o.__seen){o.__seen=true;var t=o.innerText||'';
        if(t.indexOf('开始正式测验')>-1){CPT.FORMAL_TRIALS=30}
        var b=o.querySelector('button:not([disabled])');if(b){b.click();return}}}
      else if(o){o.__seen=false}
      if(CPT.isRunning&&CPT.isResponseWindow){var t=CPT.trials&&CPT.trials[CPT.currentTrialIdx];
        if(t&&!t._responded&&CPT.isTarget)CPT.handleKeyDown({key:' ',preventDefault:function(){}})}
    },120);return 'ok'})()`,
  bvmt: `(function(){if(window.__drv)return'dup';window.__drv=1;window.startTest();
    var iv=setInterval(function(){if(localStorage.getItem('mccb-bvmt-result')){clearInterval(iv);return}
      (${OVL_RESET});
      if((${OVL})())return;
      var pr=document.getElementById('page-recall');
      if(pr&&pr.classList.contains('active')){
        var cur=typeof STATE!=='undefined'?STATE.trial:-1;
        if(!window.__placed||window.__lastTrial!==cur){window.__placed=true;window.__lastTrial=cur;
          for(var i=0;i<6;i++){selectPoolShape(TARGETS[i]);placeShape(i)}
          submitRecall();}
      } else {window.__placed=false;window.__lastTrial=-1}
      var rst=document.getElementById('page-rest');
      if(rst&&rst.classList.contains('active')){var b=document.getElementById('continueBtn');if(b&&!b.disabled)b.click()}
    },400);return 'ok'})()`,
  mazes: `(function(){if(window.__drv)return'dup';window.__drv=1;
    function solve(m){var K=function(r,c){return r+','+c};var q=[[m.start.r,m.start.c]];var prev={};prev[K(m.start.r,m.start.c)]=null;var end=K(m.end.r,m.end.c);
      while(q.length){var u=q.shift();if(K(u[0],u[1])===end)break;
        [[0,1],[0,-1],[1,0],[-1,0]].forEach(function(d){var nr=u[0]+d[0],nc=u[1]+d[1];
          if(nr<0||nc<0||nr>=m.rows||nc>=m.cols)return;if(m.grid[nr][nc]===1)return;
          if(prev[K(nr,nc)]!==undefined)return;prev[K(nr,nc)]=K(u[0],u[1]);q.push([nr,nc])})}
      if(prev[end]===undefined)return null;var p=[],cur=end;while(cur){var a=cur.split(',');p.unshift({r:+a[0],c:+a[1]});cur=prev[cur]}return p}
    window.startTest();
    var path=null,step=0,midx=-1;
    var iv=setInterval(function(){if(localStorage.getItem('mccb-mazes-result')){clearInterval(iv);return}
      (${OVL_RESET});
      if((${OVL})()){path=null;return}
      if(typeof STATE==='undefined'||typeof MAZES==='undefined')return;
      if(!STATE.isRunning||STATE.isComplete){path=null;return}
      if(midx!==STATE.currentMaze||!path){midx=STATE.currentMaze;path=solve(MAZES[midx]);step=0}
      if(!path)return;
      if(step>=path.length){path=null;return}
      var nxt=path[step];var dr=Math.abs(nxt.r-STATE.playerPos.r),dc=Math.abs(nxt.c-STATE.playerPos.c);
      if(dr+dc!==1){path=null;return}
      var c=document.getElementById('mazeCanvas');var r=c.getBoundingClientRect();var sc=parseFloat(c.dataset.scale||'1');
      onCanvasClick({clientX:r.left+(PATH_PADDING+(nxt.c+0.5)*CELL_SIZE)*sc,clientY:r.top+(PATH_PADDING+(nxt.r+0.5)*CELL_SIZE)*sc});
      step++;
    },90);return 'ok'})()`,
};

// HVLT: 单 eval 内 setTimeout 链 (回忆 12 词×70ms≈0.9s, 每步 3.5s 足够)
DRV.hvlt = `(function(){if(window.__drv)return'dup';window.__drv=1;var W=['唢呐','二胡','萧','笛子','木炭','煤油','木头','汽油','糖','大蒜','味精','桂皮'];
  function typeWords(){var inp=document.getElementById('recallInput');var i=0;
    var wv=setInterval(function(){if(i<W.length){inp.value=W[i++];window.addRecall()}else{clearInterval(wv);window.finishRecall()}},70)}
  window.startTrial(1);
  var seq=[
    function(){window.stopStudyTimer();window.startRecall('第 1 轮回忆');setTimeout(typeWords,250)},
    function(){window.stopStudyTimer();window.startRecall('第 2 轮回忆');setTimeout(typeWords,250)},
    function(){window.stopStudyTimer();window.startRecall('第 3 轮回忆');setTimeout(typeWords,250)},
    function(){window.startDelayedRecall();setTimeout(typeWords,250)},
  ];
  setTimeout(seq[0], 2000);
  setTimeout(seq[1], 6500);
  setTimeout(seq[2], 11000);
  setTimeout(seq[3], 15500);
  return 'ok'})()`;

/** 附着到现有会话 (保留 localStorage); 失败则冷启动 */
async function attachOrOpen(url) {
  if (gStarted) return navTo(url);
  try {
    const alive = await ev('location.protocol').catch(() => null);
    if (alive !== null) {
      await ev(`location.href='` + url + `'; 'nav'`).catch(() => {});
      await sleep(1800);
      try { await verifyUrl(url, 6, false); gStarted = true; gOpen = true; return; } catch (e) {}
    }
  } catch (e) {}
  return openUrl(url);
}

// ---------- 测试顺序 (顶层常量, 供 --list / printHelp / main 共用) ----------
const order = [
  ['MSCEIT 情绪管理', 'msceit'],
  ['BACS 符号编码', 'bacs'],
  ['HVLT-R 言语学习', 'hvlt'],
  ['Fluency 语义流畅性', 'fluency'],
  ['Spatial-Span 空间广度', 'spatial-span'],
  ['LNS 字母数广度', 'lns'],
  ['TMT 连线测验', 'tmt'],
  ['CPT-IP 持续操作', 'cpt'],
  ['BVMT-R 视觉空间记忆', 'bvmt'],
  ['Mazes 迷宫', 'mazes'],
];

function printHelp() {
  console.log(`
用法: node tests/full-battery.cjs [选项] [测试id...]

选项:
  <id...>            运行指定测验子集 (逗号分隔或空格分隔), 例如: cpt,bvmt
  --retry N          单项失败自动重试 N 次 (默认 0)
  --timestamp        报表文件名追加时间戳, 保留历史 (默认覆盖)
  --render           从最新 JSON 重新生成 HTML 报表, 不跑测试
  --list             列出所有可运行测验
  --help, -h         显示本帮助

环境变量:
  MCCB_BASE          静态服务器地址 (默认 http://127.0.0.1:8766)
  MCCB_PARTICIPANT   被试编号 (默认 test)

示例:
  node tests/full-battery.cjs                # 全量 10 项
  node tests/full-battery.cjs cpt,bvmt       # 仅 CPT + BVMT
  node tests/full-battery.cjs --retry 1      # 全量, 每项可重试 1 次
  node tests/full-battery.cjs --render       # 重新生成 HTML 报表
`);
}

async function runOne(name, id, driver, opts = {}) {
  const retries = opts.retries || 0;
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) console.log(`  ↻ 重试 (${attempt}/${retries})...`);
    try {
      const res = await runOneAttempt(name, id, driver);
      return res;
    } catch (e) {
      lastError = e;
    }
  }
  let prog = 'ERR'; try { prog = await partProgress(id); } catch(e2) {}
  console.log('  FAILED: ' + lastError.message.slice(0, 100) + ' | progress=' + prog);
  return { id, name, progress: prog, passed: false, error: lastError.message.slice(0, 200) };
}

async function runOneAttempt(name, id, driver) {
  console.log('\n[' + id + '] ' + name + ' ...');
  const url = BASE + '/pages/mccb-' + id + '.html?mode=dev&p=' + P;
  await attachOrOpen(url);
  await clearLs(id);
  const r = await ev(driver[id]);
  if (r === 'dup') throw new Error('driver already active');
  await pollUntil(() => lsDone(id), 360000, 2000, id);
  await sleep(600);
  const prog = await partProgress(id);
  const ok = prog === 'completed';
  console.log('  progress=' + prog + (ok ? ' OK' : ' FAIL'));
  if (!ok) throw new Error('not completed (progress=' + prog + ')');
  return { id, name, progress: prog, passed: true };
}

async function main() {
  // ---------- CLI 参数解析 ----------
  const args = process.argv.slice(2);
  const POS = { subsets: [], render: false, retries: 0, timestamp: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') { printHelp(); return; }
    else if (a === '--render') POS.render = true;
    else if (a === '--timestamp') POS.timestamp = true;
    else if (a === '--list') { order.forEach(([n, id]) => console.log('  ' + id.padEnd(13) + n)); return; }
    else if (a === '--retry') { POS.retries = parseInt(args[++i] || '0', 10) || 0; }
    else if (a.startsWith('--')) { console.error('未知参数: ' + a); printHelp(); process.exit(2); }
    else POS.subsets.push(a);
  }
  const filterIds = POS.subsets.length ? POS.subsets.join(',') : null;

  // --render 模式: 从最新 JSON 重新生成 HTML 报表, 无需重跑测试
  if (POS.render) {
    const jsonPath = REPORT + '.json';
    if (!fs.existsSync(jsonPath)) { console.error('未找到 ' + jsonPath); process.exit(1); }
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const integrity = data.integrity || { expected: data.total, completed: data.passed, allComplete: data.passed === data.total };
    fs.writeFileSync(REPORT + '.html', renderReportHtml({
      participant: data.participant, total: data.total, passed: data.passed,
      elapsedSec: data.elapsedSec, integrity, results: data.results,
      ranAt: new Date().toISOString(),
    }));
    console.log('HTML 已重新生成: ' + REPORT + '.html');
    return;
  }

  const t0 = Date.now();
  console.log('=== MCCB full battery — participant: ' + P + (filterIds ? ' [subset: ' + filterIds + ']' : '') +
    (POS.retries ? ' [retry=' + POS.retries + ']' : '') + ' ===');

  const selectedOrder = order.filter(x => !filterIds || filterIds.includes(x[1]));

  // 前置检查: HTTP 静态服务器必须可达 (agent-browser v0.27 不自带 server)
  // 例: python -m http.server 8766 --bind 127.0.0.1  (在项目根目录运行)
  try {
    const net = require('net');
    const port = parseInt(HOST.split(':')[1] || '80');
    const ok = await new Promise(r => { const s = net.connect(port, HOST.split(':')[0]); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); });
    if (!ok) { console.warn('HTTP 服务器不可达: ' + BASE + '\n请先运行: python -m http.server ' + port + ' --bind 127.0.0.1 (项目根目录)'); }
  } catch(e) {}

  // 重置被试数据 (仅全量跑时重置; 同一会话内执行, 不 close)
  if (!filterIds) {
    await openUrl(BASE + '/pages/mccb-msceit.html?mode=dev&p=' + P);
    await ev(`(function(){localStorage.removeItem('mccb-participant-${P}');['msceit','bacs','hvlt','fluency','spatial-span','lns','tmt','bvmt','mazes','cpt'].forEach(function(k){localStorage.removeItem('mccb-'+k+'-result')});return 'reset-ok'})()`);
  }

  const results = [];
  for (const [name, id] of selectedOrder) results.push(await runOne(name, id, DRV, { retries: POS.retries }));

  // 最终档案 (必须在 closeAll 前读 — close 会重置临时 profile)
  const finalData = await ev(`JSON.stringify(JSON.parse(localStorage.getItem('mccb-participant-${P}')))`)
    .catch(() => 'null');
  if (!filterIds) await closeAll();

  const passedN = results.filter(r => r.passed).length;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  let final = null; try { final = JSON.parse(finalData); } catch(e) {}
  if (typeof final === 'string') { try { final = JSON.parse(final); } catch(e) {} }  // agent-browser 双重编码

  // 数据完整性断言: 全量跑必须全 completed, 否则标记失败 (供 CI/脚本判断)
  let integrity = { expected: selectedOrder.length, completed: 0, allComplete: false };
  if (final && final.progress) {
    integrity.completed = Object.values(final.progress).filter(s => s === 'completed').length;
    integrity.allComplete = integrity.completed >= selectedOrder.length;
  }

  // 输出文件名: 可选时间戳保留历史
  const ts = POS.timestamp ? '-' + new Date().toISOString().replace(/[:.]/g, '').slice(0, 15) : '';
  const suffix = (filterIds ? '-partial' : '') + ts;

  const report = { participant: P, total: results.length, passed: passedN, elapsedSec: elapsed,
    retries: POS.retries, integrity, results, participantData: final, ranAt: new Date().toISOString() };
  fs.writeFileSync(REPORT + suffix + '.json', JSON.stringify(report, null, 2));

  // 生成可读 HTML 报表
  try {
    fs.writeFileSync(REPORT + suffix + '.html', renderReportHtml({
      participant: P, total: results.length, passed: passedN, elapsedSec: elapsed,
      integrity, results, ranAt: report.ranAt,
    }));
  } catch (e) { console.log('  (HTML report skipped: ' + e.message + ')'); }

  console.log('\n=== DONE: ' + passedN + '/' + results.length + ' for [' + P + '] in ' + elapsed + 's '
    + '(报表: ' + REPORT + suffix + '.{json,html}) ===');
  if (final && final.progress) {
    const done = Object.values(final.progress).filter(s => s === 'completed').length;
    console.log('participant progress: ' + done + '/10 completed');
    if (!integrity.allComplete) {
      console.warn('  ⚠️  数据完整性未达标: 期望 ' + selectedOrder.length + ' completed, 实际 ' + done);
      process.exitCode = 2;
    }
  }
}

/** 生成简洁可读的 HTML 报表 */
function renderReportHtml(o) {
  const row = r => {
    const badge = r.passed
      ? `<span style="color:#16a34a;font-weight:600">✓ completed</span>`
      : `<span style="color:#dc2626;font-weight:600">✗ ${r.progress || 'FAIL'}</span>`;
    const err = r.error ? `<div style="color:#dc2626;font-size:12px">${r.error}</div>` : '';
    return `<tr><td>${r.name}</td><td>${r.id}</td><td>${badge}</td></tr>${err?'<tr><td></td><td colspan="2">'+err+'</td></tr>':''}`;
  };
  const rows = o.results.map(row).join('');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
  <title>MCCB 自动模拟报表 — ${o.participant}</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;margin:2rem auto;max-width:760px;padding:0 1rem;color:#1e293b;background:#f8fafc}
    h1{font-size:1.4rem} .sub{color:#64748b;margin-bottom:1.5rem;font-size:.9rem}
    table{border-collapse:collapse;width:100%;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}
    th,td{padding:.6rem .9rem;text-align:left;border-bottom:1px solid #e2e8f0}
    th{background:#f1f5f9;color:#475569;font-weight:600}
    .cards{display:flex;gap:1rem;margin:1.2rem 0;flex-wrap:wrap}
    .card{flex:1;min-width:130px;background:#fff;border-radius:10px;padding:1rem;box-shadow:0 1px 3px rgba(0,0,0,.08)}
    .card .v{font-size:1.6rem;font-weight:700}.card .l{color:#64748b;font-size:.8rem}
  </style></head><body>
  <h1>MCCB 认知测验自动模拟报表</h1>
  <div class="sub">被试: <b>${o.participant}</b> · 执行时间: ${o.ranAt} · 报表: ${o.total} 项</div>
  <div class="cards">
    <div class="card"><div class="v">${o.passed}/${o.total}</div><div class="l">通过数</div></div>
    <div class="card"><div class="v">${o.elapsedSec}s</div><div class="l">总耗时</div></div>
    <div class="card"><div class="v" style="color:${o.integrity.allComplete?'#16a34a':'#dc2626'}">${o.integrity.completed}/${o.total}</div><div class="l">数据完整性 (completed)</div></div>
  </div>
  <table><thead><tr><th>测验名称</th><th>ID</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table>
  </body></html>`;
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
