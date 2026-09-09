/** Deep instrumentation: monkey-patch saveResult, run msceit, trace everything. */
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
  await ab(['open', BASE + '/pages/mccb-msceit.html?mode=dev&p=' + P]);
  await sleep(3000);
  console.log('url: ' + await ev('location.pathname').catch(e => 'ERR'));

  // 重置 + monkey-patch + 错误捕获
  await ev(`(function(){
    localStorage.removeItem('mccb-msceit-result');
    var d=JSON.parse(localStorage.getItem('mccb-participant-${P}')||'null');
    if(d){d.progress.msceit='not_started';localStorage.setItem('mccb-participant-${P}',JSON.stringify(d))}
    window.__calls=[]; window.__errs=[];
    var orig=ParticipantManager.saveResult.bind(ParticipantManager);
    ParticipantManager.saveResult=function(k,data){window.__calls.push(k+'@'+Date.now());try{var r=orig(k,data);window.__calls.push('ok@'+Date.now());return r}catch(e){window.__errs.push('saveResult:'+e.message);throw e}};
    window.addEventListener('error',function(e){window.__errs.push('page:'+e.message)});
    return 'patched'})()`);

  // 驱动
  await ev(`(function(){if(window.__drv)return'dup';window.__drv=1;window.startTest();
    var iv=setInterval(function(){if(localStorage.getItem('mccb-msceit-result')){clearInterval(iv);return}
      var o=document.getElementById('overlay');var ovis=o&&getComputedStyle(o).display!=='none'&&!o.hidden;
      if(ovis){if(!o.__seen){o.__seen=true;var b=o.querySelector('button:not([disabled])');if(b){b.click();return}}}else if(o){o.__seen=false}
      var opt=document.querySelector('#optionsArea .option-btn');if(opt)opt.click();
      var n=document.getElementById('btnNext');if(n&&!n.disabled)n.click();
    },160);return 'ok'})()`);

  // 轮询
  for (let i = 0; i < 40; i++) {
    await sleep(700);
    const st = await ev(`(function(){var d=JSON.parse(localStorage.getItem('mccb-participant-${P}')||'null');
      return JSON.stringify({t:${i}, ls:!!localStorage.getItem('mccb-msceit-result'), prog:d?d.progress.msceit:'?', cur:localStorage.getItem('mccb-current-participant'), calls:window.__calls?window.__calls.join('|'):'-', errs:(window.__errs||[]).slice(0,3).join(';')})})()`);
    console.log(st);
    const parsed = JSON.parse(st);
    if (parsed.ls) break;
  }
  await sleep(800);
  console.log('FINAL: ' + await ev(`(function(){var d=JSON.parse(localStorage.getItem('mccb-participant-${P}')||'null');
    return JSON.stringify({prog:d?d.progress.msceit:'?', calls:window.__calls, errs:window.__errs})})()`));
})();
