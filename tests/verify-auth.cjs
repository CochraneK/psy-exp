'use strict';
/**
 * Research access gate contract (research-auth 1.0.0).
 * - module shape/version + honest-boundary copy
 * - SHA-256 WebCrypto vs pure-JS fallback cross-check
 * - configure/verify/session/lockout/disable semantics
 * - 5 researcher page wiring + index.html admin-surface wiring
 * - manifest/CI/full-battery version alignment
 */
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const R=require(path.join(ROOT,'research-auth.js'));
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

let passed=0,failed=0;
function check(cond,label){if(cond){passed++;console.log('  PASS',label)}else{failed++;console.error('  FAIL',label)}}

console.log('=== research access auth contract (research-auth 1.0.0) ===');

(async()=>{
  // [1] module shape
  console.log('\n[1] module shape');
  check(typeof R==='object'&&R!==null,'module exports object');
  check(R.AUTH_VERSION==='research-auth-1.0.0','AUTH_VERSION value');
  check(R.AUTH_KEY==='psy-exp-research-auth-v1','AUTH_KEY value');
  check(R.SESSION_KEY==='psy-exp-research-auth-session','SESSION_KEY value');
  check(R.MAX_ATTEMPTS===5&&R.LOCK_MS===30000&&R.MIN_CODE===4&&R.MAX_CODE===64,'attempt/lock/length constants');
  for(const k of ['getAuthState','requireAccess','configure','verify','disable','clearSession','mountGate','setStore','memStores','_digest'])check(typeof R[k]==='function',`api ${k}`);
  check(/NOT real security/i.test(read('research-auth.js')),'module header declares honest boundary (EN)');
  check(read('research-auth.js').includes('不是真实安全'),'module UI copy declares honest boundary (ZH)');

  // [2] digest cross-check
  console.log('\n[2] sha256 webcrypto vs fallback');
  check(await R._digest('abc')==='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad','webcrypto abc vector');
  check(await R._digest('abc',{fallback:true})==='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad','fallback abc vector');
  check(await R._digest('',{fallback:true})==='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','fallback empty vector');
  const longText=('认知研究原型研究区访问门 research auth gate '.repeat(150))+'é莫';
  check(await R._digest(longText,{fallback:true})===await R._digest(longText),'fallback === webcrypto on long CJK+accented text');

  // [3] unconfigured
  console.log('\n[3] unconfigured state');
  R.memStores();
  check(R.requireAccess().ok===true&&R.requireAccess().reason==='gate_off','requireAccess ok when unconfigured');
  check((await R.verify('abcd')).reason==='not_configured','verify not_configured');
  check(R.getAuthState().configured===false,'getAuthState configured=false');

  // [4] configure/verify/session roundtrip
  console.log('\n[4] configure/verify/session roundtrip');
  R.memStores();
  check((await R.configure({passcode:'abcd'})).ok===true,'configure ok (first-time)');
  check(R.getAuthState().enabled===true,'state enabled after configure');
  check((await R.verify('wrong!')).reason==='invalid_passcode','wrong passcode rejected');
  check((await R.verify('wrong!')).attemptsLeft===3,'attemptsLeft=3 after two failures');
  check((await R.verify('abcd')).ok===true,'correct passcode accepted');
  check(R.requireAccess().reason==='session_active','session active after verify');
  R.clearSession();
  check(R.requireAccess().reason==='gate_active','gate_active after clearSession');
  check(R.getAuthState().sessionActive===false,'state sessionActive=false after clearSession');

  // [5] lockout
  console.log('\n[5] lockout');
  R.memStores();
  await R.configure({passcode:'abcd'});
  for(let i=0;i<4;i++)await R.verify('nope'+i);
  const fifth=await R.verify('nope5');
  check(fifth.reason==='locked','5th failure locks the gate');
  check(fifth.retryAfterMs>0&&fifth.retryAfterMs<=R.LOCK_MS,'retryAfterMs within (0, LOCK_MS]');
  check(R.requireAccess().reason==='locked','requireAccess locked');
  check((await R.verify('abcd')).reason==='locked','locked even with the correct passcode');
  check(R.getAuthState().locked===true,'getAuthState locked=true');

  // [6] change and disable
  console.log('\n[6] change and disable');
  R.memStores();
  await R.configure({passcode:'abcd'});
  check((await R.configure({passcode:'efgh',currentPasscode:'nope'})).reason==='invalid_current_passcode','change requires correct current passcode');
  const ch=await R.configure({passcode:'efgh',currentPasscode:'abcd'});
  check(ch.ok===true&&ch.changed===true,'change ok and changed=true');
  check((await R.verify('abcd')).reason==='invalid_passcode','old passcode no longer valid');
  check((await R.verify('efgh')).ok===true,'new passcode valid');
  check((await R.disable({currentPasscode:'abcd'})).reason==='invalid_current_passcode','disable requires correct current passcode');
  check((await R.disable({currentPasscode:'efgh'})).ok===true,'disable ok');
  check(R.getAuthState().configured===false&&R.requireAccess().ok===true,'disabled -> unconfigured, gate off');
  check((await R.verify('efgh')).reason==='not_configured','verify not_configured after disable');

  // [7] passcode validation
  console.log('\n[7] passcode validation');
  R.memStores();
  check((await R.configure({passcode:'abc'})).reason==='invalid_passcode','3 chars rejected');
  check((await R.configure({passcode:'x'.repeat(65)})).reason==='invalid_passcode','65 chars rejected');
  check(R.getAuthState().configured===false,'still unconfigured after invalid passcodes');
  check((await R.configure({passcode:'abcd'})).ok===true,'4 chars accepted');
  check((await R.configure({passcode:'x'.repeat(64),currentPasscode:'abcd'})).ok===true,'64 chars accepted');

  // [8] corrupt stored state
  console.log('\n[8] corrupt stored state (fail-safe)');
  const m=R.memStores();
  await R.configure({passcode:'abcd'});
  m.l.setItem(R.AUTH_KEY,'{not json');
  check(R.requireAccess().ok===true,'unparseable state -> gate treated as off (no crash)');
  m.l.setItem(R.AUTH_KEY,JSON.stringify({version:1,salt:123,hash:'cd',enabled:true,attempts:0,lockedUntil:0}));
  check(R.requireAccess().ok===true&&R.getAuthState().configured===false,'malformed shape (non-string salt) -> unconfigured, no crash');
  m.l.setItem(R.AUTH_KEY,JSON.stringify({version:9,salt:'ab',hash:'cd',enabled:true}));
  check(R.requireAccess().ok===true,'wrong version -> unconfigured, no crash');

  // [9] five researcher page wiring
  console.log('\n[9] five researcher pages load and mount the gate');
  for(const f of ['index.html','data-governance.html','research-report.html','research-comparison.html','research-review.html']){
    const html=read(f);
    check(/<script src="research-auth\.js"><\/script>/.test(html),f+' loads research-auth.js');
    check(/ResearchAuth\.mountGate\(\)/.test(html),f+' mounts the gate');
  }

  // [10] index.html admin-surface wiring
  console.log('\n[10] index.html admin surface');
  const index=read('index.html');
  check(/<script src="research-storage\.js"><\/script>/.test(index),'index loads research-storage.js');
  check(/<script src="research-data\.js"><\/script>/.test(index),'index loads research-data.js');
  check(/function researchStatusHtml\(/.test(index)&&index.includes('研究状态'),'participant list shows research status column');
  check(/function deleteParticipant\([\s\S]{0,1400}?ResearchData\.deleteParticipant/.test(index),'deleteParticipant cascades into ResearchData');
  check(index.includes("reason: 'console_participant_delete'")||index.includes('reason: \'console_participant_delete\''),'single delete audit reason console_participant_delete');
  check(index.includes('console_clear_all'),'clear-all audit reason console_clear_all');
  check(/function clearAllData\([\s\S]{0,1600}?ResearchData\.snapshot\(\)\.participants/.test(index),'clearAllData unions research-layer participant ids');
  check(index.includes('id="pmStatus"'),'deletion result status line present');
  check(/participant-runner\.html\?p=/.test(index),'resume routes through participant-runner (session gate + preflight)');
  check(index.includes('id="authPasscodeInput"')&&index.includes('id="authCurrentInput"'),'access-confirmation card inputs present');
  check(index.includes('id="authEnableBtn"')&&index.includes('id="authDisableBtn"')&&index.includes('id="authReverifyBtn"'),'access-confirmation card buttons present');
  check(/async function authConfigure\(/.test(index)&&/async function authDisable\(/.test(index)&&/function authRefreshState\(/.test(index),'auth handlers defined in console script');

  // [11] manifest / CI / full-battery alignment
  console.log('\n[11] version alignment');
  const manifest=JSON.parse(read('task-manifest.json'));
  check(manifest.researchAuthVersion===R.AUTH_VERSION,'manifest researchAuthVersion matches module');
  const ci=read('.github/workflows/ci.yml');
  check(ci.includes('node --check research-auth.js'),'ci syntax-checks research-auth.js');
  check(ci.includes('test -f research-auth.js')&&ci.includes("AUTH_VERSION='research-auth-1.0.0'")&&ci.includes('"researchAuthVersion": "research-auth-1.0.0"'),'ci pins module + manifest versions');
  check(ci.includes('node --check tests/verify-auth.cjs'),'ci syntax-checks this contract');
  check(/for f in index\.html data-governance\.html research-report\.html research-comparison\.html research-review\.html/.test(ci),'ci verifies five-page gate wiring');
  check(read('tests/full-battery.cjs').includes("['research access auth','tests/verify-auth.cjs']"),'full-battery includes the auth group');

  // [12] regression guards
  console.log('\n[12] regression guards');
  check(index.includes('id="participantManagerOverlay"')&&index.includes('id="resumeBtn"'),'verify-ui asserted ids preserved in index');
  check(read('participant-runner.html').includes('applySessionGate'),'participant runner session gate untouched');
  check(read('data-governance.html').includes('id="hardDeleteBtn"'),'governance hardDelete untouched');
  check(!/getTestUrl\(first\.key/.test(index),'resume no longer links task pages directly');

  console.log(`\n=== verify-auth: ${passed} passed, ${failed} failed ===`);
  process.exit(failed===0?0:1);
})().catch(e=>{console.error('CONTRACT ERROR',e);process.exit(1)});
