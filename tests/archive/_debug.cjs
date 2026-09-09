/* MCCB agent-browser 诊断测试
 * 验证：插入<script>是否执行、DOM是否跨世界可见、localStorage是否可访问
 */
const { execFile } = require('child_process');
const fs = require('fs');

const NODE = 'C:/Users/SCZ_2207/.workbuddy/binaries/node/versions/22.22.2-2/node.exe';
const AB = 'D:/node.js/node_global/node_modules/agent-browser/bin/agent-browser.js';
const BASE = 'http://localhost:8766';

function ab(args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile(NODE, [AB, ...args], { encoding: 'utf8', timeout }, (err, stdout, stderr) => {
      if (err) { reject(new Error((stdout + stderr).slice(0, 500))); }
      else { resolve((stdout || '').trim()); }
    });
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('=== 诊断测试 ===\n');

  // 1. 打开 MSCEIT 页面
  console.log('1. 打开页面...');
  await ab(['open', BASE + '/mccb-msceit.html?mode=dev']);
  await sleep(1500);

  // 2. 直接 eval：检查页面状态
  console.log('2. 直接 eval 检查...');
  let r;
  r = await ab(['eval', "1+1"]);  console.log('   1+1 =', r);
  r = await ab(['eval', "typeof document.body"]);  console.log('   typeof document.body =', r);
  r = await ab(['eval', "typeof STATE"]);  console.log('   typeof STATE =', r);
  r = await ab(['eval', "typeof window.startTest"]);  console.log('   typeof window.startTest =', r);

  // 3. 直接 eval 创建 DOM 元素 & 读回
  console.log('3. 直接 eval 创建/读取 DOM...');
  await ab(['eval', "document.body.insertAdjacentHTML('beforeend','<div id=\"__dbg1\" style=\"display:none\">hello-dom</div>')"]);
  r = await ab(['eval', "document.getElementById('__dbg1')?.textContent"]);  console.log('   读取 __dbg1 =', r);

  // 4. insertAdjacentHTML 注入 <script> 创建带数据的 div
  console.log('4. inject <script> via insertAdjacentHTML...');
  // 这次用最简单的内容
  await ab(['eval', "document.body.insertAdjacentHTML('beforeend','<script>var d=document.createElement(\"div\");d.id=\"__dbg2\";d.style.display=\"none\";d.textContent=\"from-script\";document.body.appendChild(d);<\\/script>')"]);
  await sleep(500);
  r = await ab(['eval', "document.getElementById('__dbg2')?.textContent"]);  console.log('   读取 __dbg2 =', r);

  // 5. 更复杂的注入：访问页面变量 + localStorage
  console.log('5. inject <script> that accesses page vars + localStorage...');
  await ab(['eval', "document.body.insertAdjacentHTML('beforeend','<script>' + " +
    "'var d=document.createElement(\"div\");d.id=\"__dbg3\";d.style.display=\"none\";' + " +
    "'var msg=\"STATE_exists=\"+!!window.STATE+\";startTest_exists=\"+(typeof window.startTest);' + " +
    "'try{msg+=\";ls=\"+localStorage.getItem(\"test-key\");}catch(e){msg+=\";ls_err=\"+e.message;}' + " +
    "'d.textContent=msg;document.body.appendChild(d);' + " +
    "'<\\/script>')"]);
  await sleep(500);
  r = await ab(['eval', "document.getElementById('__dbg3')?.textContent"]);  console.log('   读取 __dbg3 =', r);

  // 6. localStorage 直接读写（从 isolate world）
  console.log('6. localStorage 直接 eval...');
  try {
    r = await ab(['eval', "localStorage.setItem('test-key','test-value'); localStorage.getItem('test-key')"]);
    console.log('   localStorage read/write =', r);
  } catch(e) {
    console.log('   localStorage ERROR:', e.message.slice(0, 200));
  }

  // 7. 用 pageEval 等价方式测试 startTest 调用
  console.log('7. inject <script> that calls startTest()...');
  await ab(['eval', "document.body.insertAdjacentHTML('beforeend','<script>' + " +
    "'var d=document.createElement(\"div\");d.id=\"__dbg4\";d.style.display=\"none\";' + " +
    "'try{window.startTest();d.textContent=\"startTest_ok\";}' + " +
    "'catch(e){d.textContent=\"startTest_err:\"+e.message;}' + " +
    "'document.body.appendChild(d);' + " +
    "'<\\/script>')"]);
  await sleep(3000);
  r = await ab(['eval', "document.getElementById('__dbg4')?.textContent"]);  console.log('   读取 __dbg4 =', r);

  // 8. 检查页面状态（是否已到 test 页）
  r = await ab(['eval', "document.getElementById('page-test')?.classList.contains('active')"]);  console.log('   page-test.active =', r);
  r = await ab(['eval', "document.querySelectorAll('#optionsArea .option-btn')?.length"]);  console.log('   option-btn count =', r);
  r = await ab(['eval', "typeof window.STATE"]);  console.log('   STATE after startTest =', r);

  // 关闭
  console.log('\n9. 关闭浏览器...');
  await ab(['close', '--all']);
  console.log('\n=== 诊断完成 ===');
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
