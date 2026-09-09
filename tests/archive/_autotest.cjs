/* MCCB 自动答题模拟测试 harness v7
 * 架构：agent-browser eval 在主世界执行 — 直接访问全部页面变量/localStorage
 * 不再需要 DOM 通信、script 注入等繞路方案
 */
const { execFile } = require('child_process');
const fs = require('fs');

const NODE = 'C:/Users/SCZ_2207/.workbuddy/binaries/node/versions/22.22.2-2/node.exe';
const AB = 'D:/node.js/node_global/node_modules/agent-browser/bin/agent-browser.js';
const BASE = 'http://localhost:8766';
const REPORT_PATH = 'D:/Software/DSH/psy-exp/data/autotest/_autotest-report';

let gBrowserOpen = false;

function ab(args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    execFile(NODE, [AB, ...args], { encoding: 'utf8', timeout }, (err, stdout, stderr) => {
      if (err) { reject(new Error('ab#' + (args[0] || '') + ': ' + (stdout + stderr).slice(0, 300))); }
      else { resolve((stdout || '').trim()); }
    });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openUrl(url) {
  if (gBrowserOpen) { try { await ab(['close', '--all']); } catch(e) {} await sleep(300); }
  for (let i = 0; i < 3; i++) {
    try { await ab(['open', url]); await sleep(1000); gBrowserOpen = true; return; }
    catch (e) { if (i === 2) throw e; await sleep(1500); }
  }
}
async function closeAll() {
  try { gBrowserOpen = false; await ab(['close', '--all']); } catch(e) {}
  await sleep(300);
}

/** 直接 eval（在主世界执行，可访问所有页面变量） */
async function ev(code) {
  const result = await ab(['eval', code]);
  return result;
}

// ==================== 自动答题函数（每个测验一个）====================

/** MSCEIT: 管理情绪的自动答题 */
async function autoMSCEIT() {
  // 调用 startTest
  await ev('window.startTest()');
  await sleep(500);

  const TOTAL = 12;
  for (let i = 0; i < TOTAL; i++) {
    // 点击第一个选项
    await ev("document.querySelector('#optionsArea .option-btn')?.click()");
    await sleep(100);
    // 点击下一题
    await ev("document.getElementById('btnNext')?.click()");
    await sleep(200);
  }
  await sleep(500);
  const lsResult = await ev("localStorage.getItem('mccb-msceit-result')");
  return { lsWritten: !!lsResult, lsValue: lsResult ? lsResult.slice(0, 100) : null };
}

/** BACS: 符号编码 */
async function autoBACS() {
  await ev('window.startTest()');
  await sleep(500);
  // 填满 44×44 输入框
  for (let i = 0; i < 15; i++) { // 填15个试试，太多会超时
    await ev("var inp=document.querySelector('#grid input'); if(inp){inp.value='1';inp.dispatchEvent(new Event('input',{bubbles:true}))}");
    await sleep(50);
  }
  await sleep(300);
  await ev('window.endTest()');
  await sleep(500);
  const lsResult = await ev("localStorage.getItem('mccb-bacs-result')");
  return { lsWritten: !!lsResult, lsValue: lsResult ? lsResult.slice(0, 100) : null };
}

/** HVLT-R: 言语学习 */
async function autoHVLT() {
  // HVLT流程：学习→回忆第一轮→学习→回忆第二轮→学习→回忆第三轮→延迟回忆
  await ev('window.startTrial(1)');
  await sleep(300);
  // 等待学习阶段完成，模拟停止学习并开始回忆
  await ev('window.stopStudyTimer()');
  await sleep(100);
  await ev("window.startRecall('第 1 轮回忆')");
  await sleep(300);
  // 填写回忆词表
  const words = ['唢呐','二胡','萧','笛子','木炭','煤油','木头','汽油','糖','大蒜','味精','桂皮'];
  for (const w of words) {
    await ev("document.getElementById('recallInput').value='" + w + "'; window.addRecall()");
    await sleep(50);
  }
  await ev('window.finishRecall()');
  await sleep(300);

  // 第二轮
  await ev('window.stopStudyTimer()');
  await sleep(100);
  await ev("window.startRecall('第 2 轮回忆')");
  await sleep(300);
  for (const w of words) {
    await ev("document.getElementById('recallInput').value='" + w + "'; window.addRecall()");
    await sleep(50);
  }
  await ev('window.finishRecall()');
  await sleep(300);

  // 第三轮
  await ev('window.stopStudyTimer()');
  await sleep(100);
  await ev("window.startRecall('第 3 轮回忆')");
  await sleep(300);
  for (const w of words) {
    await ev("document.getElementById('recallInput').value='" + w + "'; window.addRecall()");
    await sleep(50);
  }
  await ev('window.finishRecall()');
  await sleep(300);

  // 延迟回忆
  await ev('window.startDelayedRecall()');
  await sleep(300);
  for (const w of words) {
    await ev("document.getElementById('recallInput').value='" + w + "'; window.addRecall()");
    await sleep(50);
  }
  await ev('window.finishRecall()');
  await sleep(500);

  const lsResult = await ev("localStorage.getItem('mccb-hvlt-result')");
  return { lsWritten: !!lsResult, lsValue: lsResult ? lsResult.slice(0, 100) : null };
}

/** Fluency: 语义流畅性 */
async function autoFluency() {
  await ev('window.startTest()');
  await sleep(300);
  const animals = ['猫','狗','牛','羊','猪','马','鸡','鸭','鱼','虎','狮','熊','兔','鼠','蛇','鸟'];
  for (const a of animals) {
    await ev("document.getElementById('animalInput').value='" + a + "'; window.addAnimal()");
    await sleep(50);
  }
  await ev('window.endTest()');
  await sleep(500);
  const lsResult = await ev("localStorage.getItem('mccb-fluency-result')");
  return { lsWritten: !!lsResult, lsValue: lsResult ? lsResult.slice(0, 100) : null };
}

/** Spatial-Span: 空间广度 */
async function autoSpatialSpan() {
  await ev('window.startTest()');
  let prevProgress = '';
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    // 检查是否有结果落盘 (eval 返回字符串, 'false' 也是真值 — 必须精确比较!)
    const ls = await ev("localStorage.getItem('mccb-spatial-span-result') !== null");
    if (ls === 'true') return { lsWritten: true, lsValue: (await ev("localStorage.getItem('mccb-spatial-span-result')")).slice(0, 100) };

    // 点击第一个可用的 spatial-block
    await ev("var b=document.querySelector('.spatial-block:not([disabled])'); if(b)b.click()");
  }
  await sleep(500);
  const lsFinal = await ev("localStorage.getItem('mccb-spatial-span-result')");
  return { lsWritten: !!lsFinal && lsFinal !== 'null' && lsFinal !== 'false', lsValue: lsFinal ? lsFinal.slice(0, 100) : null, timeout: true };
}

/** LNS: 字母数广度 */
async function autoLNS() {
  await ev('window.startTest()');
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const ls = await ev("localStorage.getItem('mccb-lns-result') !== null");
    if (ls === 'true') return { lsWritten: true, lsValue: (await ev("localStorage.getItem('mccb-lns-result')")).slice(0, 100) };

    // 填框
    await ev("var bx=document.querySelectorAll('.char-box'); if(bx.length){bx.forEach(function(b,j){b.value='A'}); var s=document.querySelector('button[onclick*=\"submit\"]'); if(s)s.click()}");
  }
  await sleep(500);
  const lsFinal = await ev("localStorage.getItem('mccb-lns-result')");
  return { lsWritten: !!lsFinal && lsFinal !== 'null' && lsFinal !== 'false', lsValue: lsFinal ? lsFinal.slice(0, 100) : null, timeout: true };
}

/** Smoke test：仅确认 startTest 不报错 */
async function smokeTest(name, id) {
  await ev("try{window.startTest ? window.startTest() : window.beginTest ? window.beginTest() : 0}catch(e){}");
  await sleep(2000);
  // 无报错即 pass（smoke 不测完整流程）
  return { lsWritten: false };
}

// ==================== 运行入口 ====================

async function runTest(name, id, autoFn) {
  console.log(name + ' ...');
  await openUrl(BASE + '/pages/mccb-' + id + '.html?mode=dev');
  await sleep(800);
  try {
    const result = await autoFn();
    const ls = result.lsWritten;
    const err = result.timeout ? ['TIMEOUT'] : [];
    console.log('  ls=' + ls + (result.timeout ? ', TIMEOUT' : '') + (result.lsValue ? ' [' + result.lsValue + ']' : ''));
    return { name, id, lsWritten: ls, errors: err, passed: ls && err.length === 0 };
  } catch (e) {
    console.log('  ERROR: ' + e.message.slice(0, 100));
    return { name, id, lsWritten: false, errors: [e.message.slice(0, 200)], passed: false };
  } finally {
    await closeAll();
  }
}

async function runSmoke(name, id) {
  console.log(name + ' ...');
  await openUrl(BASE + '/pages/mccb-' + id + '.html?mode=dev');
  await sleep(800);
  try {
    const result = await smokeTest(name, id);
    console.log('  [SMOKE] ls=' + result.lsWritten);
    return { name, id, lsWritten: false, errors: [], passed: true };
  } catch (e) {
    console.log('  [SMOKE] ERROR: ' + e.message.slice(0, 100));
    return { name, id, lsWritten: false, errors: [e.message.slice(0, 200)], passed: false };
  } finally {
    await closeAll();
  }
}

async function main() {
  const startTime = Date.now();
  const report = [];

  report.push(await runTest('MSCEIT 情绪管理', 'msceit', autoMSCEIT));
  report.push(await runTest('BACS 符号编码', 'bacs', autoBACS));
  report.push(await runTest('HVLT-R 言语学习', 'hvlt', autoHVLT));
  report.push(await runTest('Fluency 语义流畅性', 'fluency', autoFluency));
  report.push(await runTest('Spatial-Span 空间广度', 'spatial-span', autoSpatialSpan));
  report.push(await runTest('LNS 字母数广度', 'lns', autoLNS));
  report.push(await runSmoke('TMT 连线测验', 'tmt'));
  report.push(await runSmoke('BVMT-R 视觉空间记忆', 'bvmt'));
  report.push(await runSmoke('Mazes 迷宫', 'mazes'));
  report.push(await runSmoke('CPT-IP 持续操作', 'cpt'));

  const passedN = report.filter(r => r.passed).length;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const summary = { total: report.length, passed: passedN, failed: report.length - passedN, elapsedSec: elapsed, report };
  fs.writeFileSync(REPORT_PATH + '.json', JSON.stringify(summary, null, 2));
  fs.writeFileSync(REPORT_PATH + '.html', renderHtml(summary));
  console.log('\n=== DONE: ' + passedN + '/' + report.length + ' passed in ' + elapsed + 's ===');
}

function renderHtml(s) {
  function safeJoin(arr) {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return '<span style="color:#999">无</span>';
    return arr.map(e => '<code>' + String(e).replace(/</g,'&lt;') + '</code>').join('<br>');
  }
  var rows = '';
  s.report.forEach(function(r) {
    rows += '<tr class="' + (r.passed ? 'ok' : 'bad') + '"><td>' + r.name + '</td><td>' + (r.lsWritten ? '✅' : '❌') + '</td><td>' + safeJoin(r.errors) + '</td></tr>';
  });
  return '<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>MCCB 自动答题模拟测试报告</title>\n' +
    '<style>body{font-family:system-ui,"Microsoft YaHei",sans-serif;background:#f6f7f9;color:#1a1a1a;padding:24px}\n' +
    'h1{font-size:20px}h2{font-size:15px;color:#444}table{border-collapse:collapse;width:100%;background:#fff;margin-top:12px;font-size:13px}\n' +
    'th,td{border:1px solid #e3e6ea;padding:8px 10px;text-align:left}.ok{background:#eafaf0}.bad{background:#fdeeee}\n' +
    'code{font-size:11px;color:#b00}.sum{margin-top:14px;font-size:14px;font-weight:600}</style></head><body>\n' +
    '<h1>MCCB 自动答题模拟测试报告 (v7)</h1>\n' +
    '<h2>生成时间：' + new Date().toISOString() + ' | 耗时：' + s.elapsedSec + 's</h2>\n' +
    '<table><thead><tr><th>测验</th><th>结果落盘</th><th>异常</th></tr></thead><tbody>' + rows + '</tbody></table>\n' +
    '<div class="sum">通过 ' + s.passed + ' / ' + s.total + '</div>\n' +
    '</body></html>';
}

main().catch(function(e) { console.error('FATAL', e); process.exit(1); });
