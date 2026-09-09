/** Debug spatial-span: trace state every 2s. */
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
  await ab(['close', '--all']).catch(() => {});
  await ab(['open', BASE + '/pages/mccb-spatial-span.html?mode=dev&p=' + P]);
  await sleep(3000);
  console.log('url: ' + await ev('location.pathname').catch(e => 'ERR'));

  await ev(`(function(){
    localStorage.removeItem('mccb-spatial-span-result');
    window.__errs=[]; window.addEventListener('error',function(e){window.__errs.push(e.message)});
    return 'ok'})()`);

  await ev(`(function(){if(window.__drv)return'dup';window.__drv=1;window.startTest();
    var iv=setInterval(function(){if(localStorage.getItem('mccb-spatial-span-result')){clearInterval(iv);return}
      var o=document.getElementById('overlay');var ovis=o&&getComputedStyle(o).display!=='none'&&!o.hidden;
      if(ovis){if(!o.__seen){o.__seen=true;var b=o.querySelector('button:not([disabled])');if(b){b.click();return}}}else if(o){o.__seen=false}
      var b=document.querySelector('.spatial-block:not([disabled])');if(b)b.click();
    },600);return 'ok'})()`);

  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const st = await ev(`(function(){var S=(typeof STATE!=='undefined')?STATE:{};
      return JSON.stringify({t:${i}, ls:!!localStorage.getItem('mccb-spatial-span-result'),
        active:(document.querySelector('.page.active')||{}).id,
        lvl:S.currentLevel, trial:S.trialIndex, waiting:S.isWaitingInput, demo:S.isDemonstrating,
        streak:S.streakWrong, clicks:(S.userClicks||[]).length, errs:(window.__errs||[]).slice(0,2).join(';')})})()`);
    console.log(st);
    if (st.includes('"ls":true')) { console.log('DONE'); break; }
  }
})();
