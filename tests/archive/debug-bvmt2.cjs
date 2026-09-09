/** Debug BVMT: 复制 full-battery v2 驱动逻辑, 但加详细日志 */
const { execFile } = require('child_process');
const NODE = 'C:/Users/SCZ_2207/.workbuddy/binaries/node/versions/22.22.2-2/node.exe';
const AB = 'D:/node.js/node_global/node_modules/agent-browser/bin/agent-browser.js';
const BASE = 'http://localhost:8766';
const P = 'test';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function ab(args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    execFile(NODE, [AB, ...args], { encoding: 'utf8', timeout }, (err, stdout, stderr) => {
      if (err) reject(new Error('ab: ' + (stdout + stderr).slice(0, 200)));
      else resolve((stdout || '').trim());
    });
  });
}
const ev = c => ab(['eval', c]);

(async () => {
  // attachOrOpen 逻辑
  try {
    const alive = await ev('location.protocol').catch(() => null);
    console.log('alive: ' + alive);
    if (alive !== null) {
      const url = BASE + '/pages/mccb-bvmt.html?mode=dev&p=' + P;
      await ev(`location.href='` + url + `'; 'nav'`).catch(() => {});
      await sleep(2500);
      const got = await ev('location.pathname + location.search').catch(e => 'ERR:'+e.message);
      console.log('nav-to: ' + got);
    } else {
      await ab(['open', BASE + '/pages/mccb-bvmt.html?mode=dev&p=' + P]);
      await sleep(4000);
    }
  } catch (e) {
    console.log('attach failed: ' + e.message);
    await ab(['open', BASE + '/pages/mccb-bvmt.html?mode=dev&p=' + P]);
    await sleep(4000);
  }

  console.log('loc: ' + await ev('location.pathname').catch(e => 'ERR:'+e.message));

  await ev(`localStorage.removeItem('mccb-bvmt-result'); 'ok'`);
  console.log('localStorage cleared');

  // Inject full driver
  const DRIVER = `(function(){if(window.__drv)return'dup';window.__drv=1;window.startTest();
    var iv=setInterval(function(){if(localStorage.getItem('mccb-bvmt-result')){clearInterval(iv);return}
      (function(){var o=document.getElementById('overlay');if(o&&!(getComputedStyle(o).display!=='none'||o.hidden))o.__seen=false})();
      (function(){var o=document.getElementById('overlay');if(!o)return false;var st=getComputedStyle(o);if(st.display==='none'||o.hidden)return false;if(o.__seen)return true;o.__seen=true;var b=o.querySelector('button:not([disabled])');if(b)b.click();return true})();
      var pr=document.getElementById('page-recall');
      if(pr&&pr.classList.contains('active')){
        if(!window.__placed){window.__placed=true;
          for(var i=0;i<6;i++){selectPoolShape(TARGETS[i]);placeShape(i)}
          submitRecall();}
      } else {window.__placed=false}
      var rst=document.getElementById('page-rest');
      if(rst&&rst.classList.contains('active')){var b=document.getElementById('continueBtn');if(b&&!b.disabled)b.click()}
    },400);return 'ok'})()`;
  const r = await ev(DRIVER);
  console.log('driver inject: ' + r);

  // pollUntil
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const chk = await ev(`localStorage.getItem('mccb-bvmt-result') !== null`).catch(e => 'ERR');
    console.log('poll [' + ((Date.now()-t0)/1000).toFixed(0) + 's]: ' + chk);
    if (chk === 'true') { console.log('DONE'); break; }
    // Also log state
    if (Math.floor((Date.now()-t0)/1000) % 10 === 0) { // every ~10s
      const st = await ev(`(function(){
        var S=(typeof STATE!=='undefined')?STATE:{};
        return JSON.stringify({active:(document.querySelector('.page.active')||{}).id,phase:S.trial,placed:!!window.__placed})
      })()`).catch(e => 'ERR');
      console.log('  state: ' + st);
    }
    await sleep(2000);
  }
  const fin = await ev("localStorage.getItem('mccb-bvmt-result')").catch(e=>'ERR');
  console.log('final: ' + (fin||'null').slice(0,200));
})().catch(e => console.log('FATAL: ' + e.message));
