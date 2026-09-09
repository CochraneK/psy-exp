/** Debug BVMT: trace page state every 2s */
const { execFile } = require('child_process');
const NODE = 'C:/Users/SCZ_2207/.workbuddy/binaries/node/versions/22.22.2-2/node.exe';
const AB = 'D:/node.js/node_global/node_modules/agent-browser/bin/agent-browser.js';
const BASE = 'http://localhost:8766';
const P = 'test';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function ab(args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile(NODE, [AB, ...args], { encoding: 'utf8', timeout }, (err, stdout, stderr) => {
      if (err) reject(new Error('ab: ' + (stdout + stderr).slice(0, 150)));
      else resolve((stdout || '').trim());
    });
  });
}
const ev = c => ab(['eval', c]);

(async () => {
  // close --all 会杀 daemon, 直接导航到目标页
  await ab(['open', BASE + '/pages/mccb-bvmt.html?mode=dev&p=' + P]).catch(async () => {
    // daemon 未运行则冷启动
    await sleep(500);
    await ab(['open', BASE + '/pages/mccb-bvmt.html?mode=dev&p=' + P]);
  });
  await sleep(4000);
  // 确认在正确的页面
  const url = await ev('location.pathname').catch(() => 'ERR');
  if (url.indexOf('bvmt') === -1) throw new Error('wrong page: ' + url);
  console.log('url: ' + url);
  console.log('url: ' + await ev('location.pathname').catch(e => 'ERR'));

  await ev(`(function(){
    localStorage.removeItem('mccb-bvmt-result');
    window.__errs=[]; window.addEventListener('error',function(e){window.__errs.push(e.message)});
    return 'ok'})()`);

  await ev(`window.startTest()`);
  console.log('started');

  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    const st = await ev(`(function(){var S=(typeof STATE!=='undefined')?STATE:{};
      return JSON.stringify({t:${i},
        active:(document.querySelector('.page.active')||{}).id,
        phase:S.phase, trial:S.trialIndex,
        learnPhase:!!document.querySelector('#page-learning.active'),
        recallPhase:!!document.querySelector('#page-recall.active'),
        restPhase:!!document.querySelector('#page-rest.active'),
        recallBtn:!!document.getElementById('submitRecallBtn'),
        contBtn:!!document.getElementById('continueBtn'),
        placed:!!window.__placed,
        ls:!!localStorage.getItem('mccb-bvmt-result'),
        errs:(window.__errs||[]).slice(0,3).join(';'),
        msg:(document.getElementById('statusMsg')||{}).textContent})})()`);
    console.log(st);
    if (st.includes('"ls":true')) { console.log('DONE'); break; }
  }
  console.log('final: ' + await ev("localStorage.getItem('mccb-bvmt-result')").catch(e=>'ERR'));
})().catch(e => console.log('FATAL: ' + e.message));
