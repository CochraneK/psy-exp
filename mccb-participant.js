/** Participant storage + research session QC + public-deployment guardrails. */
'use strict';
const RESULT_SCHEMA_VERSION=4;
const PARTICIPANT_SCHEMA_VERSION=4;
const RUNTIME_VERSION='research-runtime-0.4.0';
const DEFAULT_TASK_VERSION='research-web-0.4.0';
const TASK_VERSIONS={tmt:'tmt-web-0.4.0',bacs:'bacs-web-0.4.0',fluency:'fluency-web-0.4.0',cpt:'cpt-web-0.4.0','spatial-span':'spatial-span-web-0.4.0',lns:'lns-web-0.4.0',hvlt:'hvlt-web-0.4.0',bvmt:'bvmt-web-0.4.0',mazes:'mazes-web-0.4.0',msceit:'msceit-web-0.4.0'};
const TASK_TIMING_POLICY={tmt:{mode:'monotonic-elapsed'},bacs:{mode:'absolute-deadline'},fluency:{mode:'absolute-deadline'},hvlt:{mode:'absolute-deadline'},cpt:{mode:'absolute-trial-schedule-with-onset-log'},'spatial-span':{mode:'absolute-deadline'},lns:{mode:'absolute-deadline'},bvmt:{mode:'absolute-deadline'},mazes:{mode:'monotonic-elapsed'},msceit:{mode:'monotonic-elapsed'}};
const VALID_TEST_KEYS=new Set(Object.keys(TASK_VERSIONS));
const VALID_QC_STATUSES=new Set(['valid','aborted','interrupted','timing_violation','technical_failure','unverified']);
const TEST_ORDER=[
  {key:'tmt',name:'Trail Making 研究任务',file:'pages/mccb-tmt.html'},
  {key:'bacs',name:'符号编码研究任务',file:'pages/mccb-bacs.html'},
  {key:'fluency',name:'语义流畅研究任务',file:'pages/mccb-fluency.html'},
  {key:'cpt',name:'持续操作研究任务',file:'pages/mccb-cpt.html'},
  {key:'spatial-span',name:'空间序列研究任务',file:'pages/mccb-spatial-span.html'},
  {key:'lns',name:'字母数字排序研究任务',file:'pages/mccb-lns.html'},
  {key:'hvlt',name:'私有词语学习协议',file:'pages/mccb-hvlt.html'},
  {key:'bvmt',name:'视觉图形学习研究任务',file:'pages/mccb-bvmt.html'},
  {key:'mazes',name:'迷宫规划研究任务',file:'pages/mccb-mazes.html'},
  {key:'msceit',name:'私有情绪管理协议',file:'pages/mccb-msceit.html'}
];
const KEY_TO_RESULT={tmt:'mccb-tmt-result',bacs:'mccb-bacs-result',fluency:'mccb-fluency-result',cpt:'mccb-cpt-result','spatial-span':'mccb-spatial-span-result',lns:'mccb-lns-result',hvlt:'mccb-hvlt-result',bvmt:'mccb-bvmt-result',mazes:'mccb-mazes-result',msceit:'mccb-msceit-result'};
const RESULT_TO_KEY=Object.fromEntries(Object.entries(KEY_TO_RESULT).map(([k,v])=>[v,k]));
const _ls={
  get(k){try{return localStorage.getItem(k)}catch{return null}},
  set(k,v){try{localStorage.setItem(k,v);return true}catch(e){if(typeof console!=='undefined')console.warn('localStorage 写入失败:',k,e&&e.message||e);return false}},
  remove(k){try{localStorage.removeItem(k);return true}catch{return false}},
  json(k){try{const v=this.get(k);return v?JSON.parse(v):null}catch{return null}},
  length(){try{return localStorage.length}catch{return 0}},
  key(i){try{return localStorage.key(i)}catch{return null}}
};
const mono=()=>typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();
const clone=v=>{try{return v==null?v:JSON.parse(JSON.stringify(v))}catch{return null}};
const normalizeId=v=>String(v==null?'':v).trim();
function isValidCohortId(v){const id=normalizeId(v);return id.length>=1&&id.length<=64&&/^[A-Za-z0-9._-]+$/.test(id)}
function taskVersion(k){return TASK_VERSIONS[k]||DEFAULT_TASK_VERSION}

const ExperimentRuntime=(()=>{
  const sessions=new Map();
  const make=testKey=>({testKey,taskVersion:taskVersion(testKey),runtimeVersion:RUNTIME_VERSION,timingPolicy:clone(TASK_TIMING_POLICY[testKey]||{mode:'unspecified'}),status:'valid',startedAt:new Date().toISOString(),completedAt:null,startedPerfMs:mono(),elapsedMs:null,clock:typeof performance!=='undefined'&&typeof performance.now==='function'?'performance.now':'Date.now',qc:{visibilityInterruptions:0,timingViolation:false,technicalFailure:false,timerDriftMaxMs:0,timerSamples:0,reasons:[]},events:[]});
  function ensure(k){if(!VALID_TEST_KEYS.has(k))return null;if(!sessions.has(k))sessions.set(k,make(k));return sessions.get(k)}
  function snapshot(k){return clone(sessions.get(k))||null}
  function start(k){if(!VALID_TEST_KEYS.has(k))return null;sessions.set(k,make(k));return snapshot(k)}
  function event(k,type,detail){const s=ensure(k);if(!s)return null;if(s.events.length>=1200)s.events.shift();s.events.push({type,at:new Date().toISOString(),elapsedMs:Math.max(0,Math.round(mono()-s.startedPerfMs)),detail:detail||null});return snapshot(k)}
  function invalidate(k,status,reason){const s=ensure(k);if(!s)return null;const next=VALID_QC_STATUSES.has(status)?status:'technical_failure',prev=s.status;if(s.status==='valid'||s.status==='unverified')s.status=next;else if(next==='technical_failure')s.status=next;if(next==='interrupted'&&prev!=='interrupted')s.qc.visibilityInterruptions++;if(next==='timing_violation')s.qc.timingViolation=true;if(next==='technical_failure')s.qc.technicalFailure=true;if(reason&&!s.qc.reasons.includes(reason))s.qc.reasons.push(reason);return event(k,next,reason||null)}
  function invalidateAll(status,reason){const out=[];for(const [k,s] of sessions.entries())if(s&&s.completedAt==null)out.push(invalidate(k,status,reason));return out}
  function recordTiming(k,label,plannedAtMs,actualAtMs,detail={}){const s=ensure(k);if(!s)return null;const signed=actualAtMs-plannedAtMs,driftMs=Math.abs(signed);s.qc.timerSamples++;s.qc.timerDriftMaxMs=Math.max(s.qc.timerDriftMaxMs,Math.round(driftMs));event(k,'timing_sample',{label,plannedAtMs:Math.round(plannedAtMs),actualAtMs:Math.round(actualAtMs),signedDriftMs:Math.round(signed),driftMs:Math.round(driftMs),...detail});const tolerance=Number(detail.toleranceMs??detail.nominalMs);if(Number.isFinite(tolerance)&&tolerance>0&&driftMs>tolerance)invalidate(k,'timing_violation',`${label}_drift_exceeded_tolerance`);return snapshot(k)}
  function complete(k){const s=ensure(k);if(!s)return{testKey:k,taskVersion:taskVersion(k),runtimeVersion:RUNTIME_VERSION,status:'unverified',startedAt:null,completedAt:new Date().toISOString(),elapsedMs:null,clock:null,qc:{visibilityInterruptions:0,timingViolation:false,technicalFailure:false,timerDriftMaxMs:0,timerSamples:0,reasons:['session_not_started_through_runtime']},events:[]};if(s.completedAt==null){s.completedAt=new Date().toISOString();s.elapsedMs=Math.max(0,Math.round(mono()-s.startedPerfMs));event(k,'complete',{finalStatus:s.status})}return snapshot(k)}
  function getActiveTestKeys(){return[...sessions.entries()].filter(([,s])=>s&&s.completedAt==null).map(([k])=>k)}
  function deadline(durationMs,{testKey,label='deadline',onTick,onDone,tickMs=100,toleranceMs}={}){const startAt=mono(),duration=Math.max(0,Number(durationMs)||0),end=startAt+duration;let timer=null,cancelled=false;if(testKey)event(testKey,'deadline_start',{label,durationMs:duration});function step(){if(cancelled)return;const now=mono(),remainingMs=Math.max(0,end-now);if(typeof onTick==='function')onTick({elapsedMs:now-startAt,remainingMs,deadlineMs:end});if(remainingMs<=0){if(testKey)recordTiming(testKey,label,end,now,{toleranceMs:Number.isFinite(Number(toleranceMs))?Number(toleranceMs):Math.max(250,(Number(tickMs)||100)*5),kind:'deadline_completion'});if(typeof onDone==='function')onDone({elapsedMs:now-startAt,overshootMs:Math.max(0,now-end)});return}timer=setTimeout(step,Math.min(Math.max(10,Number(tickMs)||100),remainingMs))}step();return{cancel(){cancelled=true;if(timer)clearTimeout(timer)},startedPerfMs:startAt,deadlinePerfMs:end}}
  return{start,event,invalidate,invalidateAll,recordTiming,complete,snapshot,getActiveTestKeys,deadline};
})();

function normalizeParticipantData(id,data){if(!data||typeof data!=='object')return null;data.cohortId=data.cohortId||id;data.progress=data.progress||{};data.sessions=data.sessions||{};data.results=data.results||{};data.invalidResults=data.invalidResults||{};data.attemptHistory=data.attemptHistory||{};return data}

const ParticipantManager={
  getCurrent(){return _ls.get('mccb-current-participant')||''},
  setCurrent(cohortId){const id=normalizeId(cohortId);if(!id){_ls.remove('mccb-current-participant');return true}if(!isValidCohortId(id)){if(typeof console!=='undefined')console.warn('无效被试编号，仅允许 1-64 位字母、数字、点、下划线和连字符。');return false}if(!_ls.set('mccb-current-participant',id))return false;const list=this.getAllParticipants();if(!list.includes(id)){list.push(id);if(!_ls.set('mccb-participant-list',JSON.stringify(list)))return false}if(!_ls.get('mccb-participant-'+id))return!!this._createParticipant(id);return true},
  getAllParticipants(){const list=_ls.json('mccb-participant-list');return Array.isArray(list)?list.filter(isValidCohortId):[]},
  logout(){_ls.remove('mccb-current-participant')},
  getData(cohortId){const id=normalizeId(cohortId||this.getCurrent());if(!isValidCohortId(id))return null;return normalizeParticipantData(id,_ls.json('mccb-participant-'+id))},
  _saveData(cohortId,data){const id=normalizeId(cohortId||this.getCurrent());data=normalizeParticipantData(id,data);if(!isValidCohortId(id)||!data)return false;data.schemaVersion=PARTICIPANT_SCHEMA_VERSION;data.runtimeVersion=RUNTIME_VERSION;data.updatedAt=new Date().toISOString();return _ls.set('mccb-participant-'+id,JSON.stringify(data))},
  _createParticipant(id){if(!isValidCohortId(id))return null;const progress={};TEST_ORDER.forEach(t=>progress[t.key]='not_started');const now=new Date().toISOString(),data={schemaVersion:PARTICIPANT_SCHEMA_VERSION,runtimeVersion:RUNTIME_VERSION,cohortId:id,createdAt:now,updatedAt:now,progress,sessions:{},results:{},invalidResults:{},attemptHistory:{}};return this._saveData(id,data)?data:null},
  getProgress(k){const d=this.getData();return d&&d.progress[k]||'not_started'},
  setProgress(k,status){if(!VALID_TEST_KEYS.has(k))return false;const d=this.getData();if(!d)return false;d.progress[k]=status;return this._saveData(d.cohortId,d)},
  markInProgress(k){if(!VALID_TEST_KEYS.has(k))return false;const d=this.getData();if(!d)return false;ExperimentRuntime.start(k);d.progress[k]='in_progress';d.sessions[k]=ExperimentRuntime.snapshot(k);return this._saveData(d.cohortId,d)},
  invalidateSession(k,status,reason){if(!VALID_TEST_KEYS.has(k))return false;ExperimentRuntime.invalidate(k,status,reason);return this._persistActiveSessionQc()},
  _persistActiveSessionQc(){const d=this.getData();if(!d)return false;for(const k of VALID_TEST_KEYS){const s=ExperimentRuntime.snapshot(k);if(!s)continue;d.sessions[k]=s;if(s.completedAt==null&&s.status!=='valid')d.progress[k]=s.status}return this._saveData(d.cohortId,d)},
  saveResult(k,resultData){const id=this.getCurrent(),resultKey=KEY_TO_RESULT[k];if(!isValidCohortId(id)||!resultKey||!resultData||typeof resultData!=='object')return false;const sessionQc=ExperimentRuntime.complete(k),enriched={...resultData,_meta:{schemaVersion:RESULT_SCHEMA_VERSION,taskVersion:sessionQc&&sessionQc.taskVersion||taskVersion(k),runtimeVersion:RUNTIME_VERSION,administration:'digital_research_adaptation',mccbEquivalent:false,participantId:id,recordedAt:new Date().toISOString(),provenance:{runtimeVersion:RUNTIME_VERSION,taskVersion:sessionQc&&sessionQc.taskVersion||taskVersion(k),source:'browser-local'},sessionQc}},d=this.getData(id);if(!d)return false;d.sessions[k]=sessionQc;const history=d.attemptHistory[resultKey]||(d.attemptHistory[resultKey]=[]);history.push(enriched);if(history.length>20)history.splice(0,history.length-20);const valid=sessionQc&&sessionQc.status==='valid';if(valid){d.results[resultKey]=enriched;d.progress[k]='completed'}else{d.invalidResults[resultKey]=enriched;d.progress[k]=d.results[resultKey]?'completed':'completed_invalid'}if(!this._saveData(id,d)){if(typeof console!=='undefined')console.error('被试结果保存失败:',id,k);return false}const scoped='mccb-participant-'+id+'-'+resultKey;if(valid)_ls.set(scoped,JSON.stringify(enriched));else{_ls.remove(resultKey);if(!d.results[resultKey])_ls.remove(scoped)}return true},
  getResult(k){const d=this.getData();return d&&d.results[KEY_TO_RESULT[k]]||null},
  getInvalidResult(k){const d=this.getData();return d&&d.invalidResults[KEY_TO_RESULT[k]]||null},
  getAttemptHistory(k){const d=this.getData();return d&&d.attemptHistory[KEY_TO_RESULT[k]]||[]},
  reviewFluency(status,reviewer='local-researcher'){if(!['verified','rejected','unreviewed'].includes(status))return false;const d=this.getData(),key=KEY_TO_RESULT.fluency;if(!d||!d.results[key])return false;const r=d.results[key],now=new Date().toISOString();r.reviewStatus=status;r.semanticReview={status,reviewedAt:now,reviewer:String(reviewer||'local-researcher').slice(0,80)};const history=d.attemptHistory[key]||[];for(let i=history.length-1;i>=0;i--){if(history[i]&&history[i]._meta&&r._meta&&history[i]._meta.recordedAt===r._meta.recordedAt){history[i]=clone(r);break}}if(!this._saveData(d.cohortId,d))return false;_ls.set('mccb-participant-'+d.cohortId+'-'+key,JSON.stringify(r));return true},
  getAnyResult(k){return this.getResult(k)||this.getInvalidResult(k)},
  getSessionQc(k){const r=this.getAnyResult(k);if(r&&r._meta&&r._meta.sessionQc)return r._meta.sessionQc;const d=this.getData();return d&&d.sessions[k]||null},
  getFirstIncomplete(){const d=this.getData();if(!d)return TEST_ORDER[0];for(const t of TEST_ORDER)if(d.progress[t.key]!=='completed')return t;return null},
  getProgressSummary(){const d=this.getData();if(!d)return{done:0,invalid:0,total:TEST_ORDER.length};const s=Object.values(d.progress),bad=new Set(['completed_invalid','aborted','interrupted','timing_violation','technical_failure']);return{done:s.filter(x=>x==='completed').length,invalid:s.filter(x=>bad.has(x)).length,total:TEST_ORDER.length}},
  getTestUrl(k,mode){const t=TEST_ORDER.find(x=>x.key===k);if(!t)return'#';const params=new URLSearchParams();if(mode==='dev')params.set('mode','dev');else params.set('mode','user');const id=this.getCurrent();if(isValidCohortId(id))params.set('p',id);return t.file+'?'+params.toString()},
  getParticipantFromUrl(){if(typeof window==='undefined'||!window.location)return'';const p=new URLSearchParams(window.location.search).get('p');return isValidCohortId(p)?p:''},
  initFromUrl(){const id=this.getParticipantFromUrl();if(id)this.setCurrent(id);return this.getCurrent()},
  deleteParticipant(cohortId){const id=normalizeId(cohortId);if(!isValidCohortId(id))return false;_ls.remove('mccb-participant-'+id);const prefix='mccb-participant-'+id+'-',rm=[];for(let i=0;i<_ls.length();i++){const k=_ls.key(i);if(k&&k.startsWith(prefix))rm.push(k)}rm.forEach(k=>_ls.remove(k));_ls.set('mccb-participant-list',JSON.stringify(this.getAllParticipants().filter(x=>x!==id)));if(this.getCurrent()===id)_ls.remove('mccb-current-participant');return true},
  getAllSummaries(){const bad=new Set(['completed_invalid','aborted','interrupted','timing_violation','technical_failure']);return this.getAllParticipants().map(id=>{const d=this.getData(id);if(!d)return{id,done:0,invalid:0,total:TEST_ORDER.length};const s=Object.values(d.progress);return{id,done:s.filter(x=>x==='completed').length,invalid:s.filter(x=>bad.has(x)).length,total:TEST_ORDER.length,createdAt:d.createdAt||null,updatedAt:d.updatedAt||null,isCurrent:this.getCurrent()===id}})},
  exportAllData(){const list=this.getAllParticipants(),participants={};list.forEach(id=>{const d=this.getData(id);if(d)participants[id]=d});return{schemaVersion:PARTICIPANT_SCHEMA_VERSION,runtimeVersion:RUNTIME_VERSION,exportDate:new Date().toISOString(),participantCount:list.length,participants}},
  getBuildInfo(){return{runtimeVersion:RUNTIME_VERSION,resultSchemaVersion:RESULT_SCHEMA_VERSION,participantSchemaVersion:PARTICIPANT_SCHEMA_VERSION,taskVersions:clone(TASK_VERSIONS),timingPolicy:clone(TASK_TIMING_POLICY)}}
};

function installResearchSafetyUI(){
  if(typeof document==='undefined')return;
  const SAFE='仅显示原始分与研究指标；未应用经验证的 MCCB 常模，不用于“正常/异常”判断或临床诊断解释。';
  function lock(container){const render=()=>{if(container.textContent&&container.textContent.includes(SAFE))return;container.textContent='';const strong=document.createElement('strong'),span=document.createElement('span');strong.textContent='研究版提示：';span.textContent=SAFE;container.append(strong,span)};render();if(typeof MutationObserver!=='undefined'){const o=new MutationObserver(()=>{if(!container.textContent.includes(SAFE)){o.disconnect();render();o.observe(container,{childList:true,subtree:true,characterData:true})}});o.observe(container,{childList:true,subtree:true,characterData:true})}}
  document.querySelectorAll('.norm-ref').forEach(lock);
  document.querySelectorAll('button[onclick*="comprehensive-report.html"]').forEach(btn=>{btn.setAttribute('onclick',"window.location.href='research-report.html'");btn.textContent='📊 研究版报告';btn.title='查看 raw data、session QC 与研究指标'});
  document.querySelectorAll('button[onclick*="comparison-report.html"]').forEach(btn=>{btn.setAttribute('onclick',"window.location.href='research-comparison.html'");btn.textContent='📈 研究版对比';btn.title='仅比较 QC-valid research indices'});
  const path=typeof location!=='undefined'?location.pathname:'';
  const isTask=/\/pages\/mccb-[^/]+\.html$/.test(path);
  if(isTask){
    const params=new URLSearchParams(typeof location!=='undefined'?location.search:'');
    const isUser=params.get('mode')!=='dev';
    if(isUser){
      const id=ParticipantManager.getCurrent();
      const runner='../participant-runner.html'+(isValidCohortId(id)?'?p='+encodeURIComponent(id):'');
      document.querySelectorAll('a[href="../index.html"]').forEach(a=>{
        if((a.textContent||'').includes('返回测验中心')){a.href=runner;a.textContent='返回施测流程'}
      });
    }
    if(!document.getElementById('research-prototype-banner')){const b=document.createElement('div');b.id='research-prototype-banner';b.setAttribute('role','note');b.textContent='RESEARCH PROTOTYPE · 当前网页任务未经 MCCB 数字等效性验证；结果仅供研究/开发。';b.style.cssText='position:fixed;left:12px;bottom:12px;z-index:99999;max-width:min(560px,calc(100vw - 24px));padding:8px 12px;border:1px solid rgba(245,158,11,.45);border-radius:10px;background:rgba(255,251,235,.96);color:#92400e;font-size:12px;line-height:1.5;box-shadow:0 4px 18px rgba(0,0,0,.08)';document.body.appendChild(b)}
  }
}

function isOriginalHomepage(){if(typeof window==='undefined'||typeof document==='undefined')return false;const path=window.location&&window.location.pathname||'';return(path.endsWith('/')||path.endsWith('/index.html'))&&!!document.getElementById('dashboard')&&document.querySelectorAll('.test-card').length===10}
function loadScriptOnce(src,globalName){return new Promise((resolve,reject)=>{if(globalName&&window[globalName]){resolve(window[globalName]);return}const prior=[...document.scripts].find(s=>{try{return new URL(s.src,location.href).pathname.endsWith('/'+src)}catch{return false}});if(prior){if(!globalName||window[globalName])resolve(window[globalName]);else{prior.addEventListener('load',()=>resolve(window[globalName]),{once:true});prior.addEventListener('error',reject,{once:true})}return}const s=document.createElement('script');s.src=src;s.async=false;s.onload=()=>resolve(globalName?window[globalName]:true);s.onerror=()=>reject(new Error(`failed to load ${src}`));document.head.appendChild(s)})}
async function bootstrapOriginalHomepageModernCore(){if(!isOriginalHomepage())return false;const viewport=document.querySelector('meta[name="viewport"]');if(viewport)viewport.setAttribute('content','width=device-width, initial-scale=1.0');await loadScriptOnce('research-storage.js','ResearchStorage');await loadScriptOnce('research-data.js','ResearchData');await loadScriptOnce('research-governance.js','ResearchGovernance');await loadScriptOnce('mccb-scoring.js','MCCBScoring');await loadScriptOnce('research-session.js','ResearchSession');await loadScriptOnce('original-ui-controller.js','PSY_EXP_ORIGINAL_UI_MODERN_CORE');return true}

function installRuntimeGuards(){
  if(typeof document!=='undefined'){
    document.addEventListener('visibilitychange',()=>{if(document.hidden){ExperimentRuntime.invalidateAll('interrupted','document_hidden_during_active_session');ParticipantManager._persistActiveSessionQc()}});
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installResearchSafetyUI,{once:true});else installResearchSafetyUI();
  }
  if(typeof window!=='undefined'){
    window.ParticipantManager=ParticipantManager;window.ExperimentRuntime=ExperimentRuntime;window.PSY_EXP_BUILD=ParticipantManager.getBuildInfo();window.TEST_ORDER=TEST_ORDER;
    try{if(localStorage.getItem('mccb_mode')==null)localStorage.setItem('mccb_mode','user')}catch{}
    const path=window.location&&window.location.pathname||'';
    if(/\/pages\/mccb-[^/]+\.html$/.test(path)){const params=new URLSearchParams(window.location.search);if(!params.has('mode')){params.set('mode','user');window.location.replace(path+'?'+params.toString()+(window.location.hash||''));return}}
    if(/\/comprehensive-report\.html$/.test(path)){window.location.replace('research-report.html'+(window.location.search||'')+(window.location.hash||''));return}
    if(/\/comparison-report\.html$/.test(path)){window.location.replace('research-comparison.html'+(window.location.search||'')+(window.location.hash||''));return}
    window.addEventListener('load',()=>{bootstrapOriginalHomepageModernCore().catch(e=>console.warn('Original UI modern-core bootstrap failed',e&&e.message||e))},{once:true});
  }
}
installRuntimeGuards();

if(typeof module!=='undefined'&&module.exports)module.exports={ParticipantManager,ExperimentRuntime,isValidCohortId,RESULT_SCHEMA_VERSION,PARTICIPANT_SCHEMA_VERSION,RUNTIME_VERSION,TASK_VERSIONS,TASK_TIMING_POLICY,TEST_ORDER,KEY_TO_RESULT,RESULT_TO_KEY};