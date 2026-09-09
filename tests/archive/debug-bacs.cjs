/** Instrumented single-test run: watch participant blob transitions live. */
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

async function snap(label) {
  try {
    const r = await ev(`(function(){var d=null;try{d=JSON.parse(localStorage.getItem('mccb-participant-${P}'))}catch(e){}
      return JSON.stringify({path:location.pathname.slice(-20), prog:d?d.progress.bacs:'?', ls:!!localStorage.getItem('mccb-bacs-result')})})()`);
    console.log('  [' + label + '] ' + r);
    return JSON.parse(r);
  } catch (e) { console.log('  [' + label + '] EVAL-ERR: ' + e.message.slice(0, 80)); return null; }
}

(async () => {
  await ab(['close', '--all']).catch(() => {});
  await ab(['open', BASE + '/pages/mccb-bacs.html?mode=dev&p=' + P]);
  await sleep(1500);
  await snap('loaded');
  await ev("localStorage.removeItem('mccb-bacs-result'); 'ok'");
  const drv = `(function(){if(window.__drv)return'dup';window.__drv=1;window.startTest();
    var iv=setInterval(function(){if(localStorage.getItem('mccb-bacs-result')){clearInterval(iv);return}
      var o=document.getElementById('overlay');if(o&&getComputedStyle(o).display!=='none'&&!o.hidden){if(!o.__seen){o.__seen=true;var b=o.querySelector('button:not([disabled])');if(b){b.click();return}}}else if(o){o.__seen=false}
      var ins=document.querySelectorAll('#grid input');var any=false;
      for(var i=0;i<ins.length;i++){if(!ins[i].value){ins[i].value='1';ins[i].dispatchEvent(new Event('input',{bubbles:true}));any=true;break}}
      if(!any&&ins.length){window.endTest()}
    },300);return 'ok'})()`;
  const r = await ev(drv);
  console.log('  driver: ' + r);
  for (let i = 0; i < 30; i++) {
    await sleep(800);
    const s = await snap('t' + i);
    if (s && s.prog === 'completed') { console.log('  -> COMPLETED at t' + i); break; }
  }
  await snap('final');
})();
