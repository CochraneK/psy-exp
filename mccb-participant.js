/**
 * Participant storage + research session QC + public-deployment guardrails.
 */
const RESULT_SCHEMA_VERSION=2;
const PARTICIPANT_SCHEMA_VERSION=2;
const DEFAULT_TASK_VERSION='research-web-0.2.0';
const VALID_TEST_KEYS=new Set(['tmt','bacs','fluency','cpt','spatial-span','lns','hvlt','bvmt','mazes','msceit']);
const VALID_QC_STATUSES=new Set(['valid','aborted','interrupted','timing_violation','technical_failure','unverified']);
const TEST_ORDER=[
  {key:'tmt',name:'TMT 连线测验',file:'pages/mccb-tmt.html'},
  {key:'bacs',name:'BACS 符号编码',file:'pages/mccb-bacs.html'},
  {key:'fluency',name:'语义流畅性',file:'pages/mccb-fluency.html'},
  {key:'cpt',name:'CPT-IP 持续操作',file:'pages/mccb-cpt.html'},
  {key:'spatial-span',name:'WMS-III 空间广度',file:'pages/mccb-spatial-span.html'},
  {key:'lns',name:'字母-数字广度',file:'pages/mccb-lns.html'},
  {key:'hvlt',name:'HVLT-R 言语学习',file:'pages/mccb-hvlt.html'},
  {key:'bvmt',name:'BVMT-R 视觉空间记忆',file:'pages/mccb-bvmt.html'},
  {key:'mazes',name:'NAB 迷宫',file:'pages/mccb-mazes.html'},
  {key:'msceit',name:'MSCEIT 情绪管理',file:'pages/mccb-msceit.html'},
];
const KEY_TO_RESULT={tmt:'mccb-tmt-result',bacs:'mccb-bacs-result',fluency:'mccb-fluency-result',cpt:'mccb-cpt-result','spatial-span':'mccb-spatial-span-result',lns:'mccb-lns-result',hvlt:'mccb-hvlt-result',bvmt:'mccb-bvmt-result',mazes:'mccb-mazes-result',msceit:'mccb-msceit-result'};
const RESULT_TO_KEY=Object.fromEntries(Object.entries(KEY_TO_RESULT).map(([k,v])=>[v,k]));

const _ls={
  get(key){try{return localStorage.getItem(key)}catch{return null}},
  set(key,val){try{localStorage.setItem(key,val);return true}catch(err){console.warn('localStorage 写入失败:',key,err&&err.message?err.message:err);return false}},
  remove(key){try{localStorage.removeItem(key);return true}catch{return false}},
  json(key){try{const v=this.get(key);return v?JSON.parse(v):null}catch{return null}},
  length(){try{return localStorage.length}catch{return 0}},key(i){try{return localStorage.key(i)}catch{return null}},
};
const mono=()=>typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();
const clone=v=>{try{return v==null?v:JSON.parse(JSON.stringify(v))}catch{return null}};
const normalizeId=v=>String(v==null?'':v).trim();
function isValidCohortId(v){const id=normalizeId(v);return id.length>=1&&id.length<=64&&/^[A-Za-z0-9._-]+$/.test(id)}

const ExperimentRuntime=(()=>{
  const sessions=new Map();
  const make=testKey=>({testKey,taskVersion:DEFAULT_TASK_VERSION,status:'valid',startedAt:new Date().toISOString(),completedAt:null,startedPerfMs:mono(),elapsedMs:null,clock:typeof performance!=='undefined'&&typeof performance.now==='function'?'performance.now':'Date.now',qc:{visibilityInterruptions:0,timingViolation:false,technicalFailure:false,reasons:[]},events:[]});
  const ensure=testKey=>{if(!VALID_TEST_KEYS.has(testKey))return null;if(!sessions.has(testKey))sessions.set(testKey,make(testKey));return sessions.get(testKey)};
  function snapshot(testKey){return clone(sessions.get(testKey))||null}
  function start(testKey){if(!VALID_TEST_KEYS.has(testKey))return null;sessions.set(testKey,make(testKey));return snapshot(testKey)}
  function event(testKey,type,detail){const s=ensure(testKey);if(!s)return null;s.events.push({type,at:new Date().toISOString(),elapsedMs:Math.max(0,Math.round(mono()-s.startedPerfMs)),detail:detail||null});return snapshot(testKey)}
  function invalidate(testKey,status,reason){const s=ensure(testKey);if(!s)return null;const next=VALID_QC_STATUSES.has(status)?status:'technical_failure';if(s.status==='valid'||s.status==='unverified')s.status=next;else if(next==='technical_failure')s.status=next;if(next==='interrupted')s.qc.visibilityInterruptions++;if(next==='timing_violation')s.qc.timingViolation=true;if(next==='technical_failure')s.qc.technicalFailure=true;if(reason&&!s.qc.reasons.includes(reason))s.qc.reasons.push(reason);return event(testKey,next,reason||null)}
  function invalidateAll(status,reason){const out=[];for(const [key,s] of sessions.entries())if(s&&s.completedAt==null)out.push(invalidate(key,status,reason));return out}
  function complete(testKey){const s=ensure(testKey);if(!s)return{testKey,taskVersion:DEFAULT_TASK_VERSION,status:'unverified',startedAt:null,completedAt:new Date().toISOString(),elapsedMs:null,clock:null,qc:{visibilityInterruptions:0,timingViolation:false,technicalFailure:false,reasons:['session_not_started_through_runtime']},events:[]};if(s.completedAt==null){s.completedAt=new Date().toISOString();s.elapsedMs=Math.max(0,Math.round(mono()-s.startedPerfMs));event(testKey,'complete',{finalStatus:s.status})}return snapshot(testKey)}
  function getActiveTestKeys(){return Array.from(sessions.entries()).filter(([,s])=>s&&s.completedAt==null).map(([k])=>k)}
  function deadline(durationMs,{onTick,onDone,tickMs=100}={}){const startAt=mono(),end=startAt+Math.max(0,Number(durationMs)||0);let timer=null,cancelled=false;function step(){if(cancelled)return;const now=mono(),remainingMs=Math.max(0,end-now);if(typeof onTick==='function')onTick({elapsedMs:now-startAt,remainingMs,deadlineMs:end});if(remainingMs<=0){if(typeof onDone==='function')onDone({elapsedMs:now-startAt,overshootMs:Math.max(0,now-end)});return}timer=setTimeout(step,Math.min(tickMs,remainingMs))}step();return{cancel(){cancelled=true;if(timer)clearTimeout(timer)},startedPerfMs:startAt,deadlinePerfMs:end}}
  return{start,event,invalidate,invalidateAll,complete,snapshot,getActiveTestKeys,deadline};
})();

const ParticipantManager={
  getCurrent(){return _ls.get('mccb-current-participant')||''},
  setCurrent(cohortId){const id=normalizeId(cohortId);if(!id){_ls.remove('mccb-current-participant');return true}if(!isValidCohortId(id)){console.warn('无效被试编号，仅允许 1-64 位字母、数字、点、下划线和连字符。');return false}if(!_ls.set('mccb-current-participant',id))return false;const list=this.getAllParticipants();if(!list.includes(id)){list.push(id);if(!_ls.set('mccb-participant-list',JSON.stringify(list)))return false}if(!_ls.get('mccb-participant-'+id))return!!this._createParticipant(id);return true},
  getAllParticipants(){const list=_ls.json('mccb-participant-list');return Array.isArray(list)?list.filter(isValidCohortId):[]},
  logout(){_ls.remove('mccb-current-participant')},
  getData(cohortId){const id=normalizeId(cohortId||this.getCurrent());return isValidCohortId(id)?_ls.json('mccb-participant-'+id):null},
  _saveData(cohortId,data){const id=normalizeId(cohortId||this.getCurrent());if(!isValidCohortId(id)||!data||typeof data!=='object')return false;data.schemaVersion=PARTICIPANT_SCHEMA_VERSION;data.updatedAt=new Date().toISOString();return _ls.set('mccb-participant-'+id,JSON.stringify(data))},
  _createParticipant(cohortId){if(!isValidCohortId(cohortId))return null;const progress={};TEST_ORDER.forEach(t=>progress[t.key]='not_started');const now=new Date().toISOString(),data={schemaVersion:PARTICIPANT_SCHEMA_VERSION,cohortId,createdAt:now,updatedAt:now,progress,sessions:{},results:{},invalidResults:{}};return this._saveData(cohortId,data)?data:null},
  getProgress(testKey){const d=this.getData();return d&&d.progress&&d.progress[testKey]||'not_started'},
  setProgress(testKey,status){if(!VALID_TEST_KEYS.has(testKey))return false;const d=this.getData();if(!d)return false;if(!d.progress)d.progress={};d.progress[testKey]=status;return this._saveData(d.cohortId,d)},
  markInProgress(testKey){if(!VALID_TEST_KEYS.has(testKey))return false;ExperimentRuntime.start(testKey);const d=this.getData();if(!d)return false;if(!d.progress)d.progress={};if(!d.sessions)d.sessions={};d.progress[testKey]='in_progress';d.sessions[testKey]=ExperimentRuntime.snapshot(testKey);return this._saveData(d.cohortId,d)},
  invalidateSession(testKey,status,reason){if(!VALID_TEST_KEYS.has(testKey))return false;ExperimentRuntime.invalidate(testKey,status,reason);return this._persistActiveSessionQc()},
  _persistActiveSessionQc(){const d=this.getData();if(!d)return false;if(!d.sessions)d.sessions={};if(!d.progress)d.progress={};for(const key of VALID_TEST_KEYS){const s=ExperimentRuntime.snapshot(key);if(!s)continue;d.sessions[key]=s;if(s.completedAt==null&&s.status!=='valid')d.progress[key]=s.status}return this._saveData(d.cohortId,d)},
  saveResult(testKey,resultData){const id=this.getCurrent(),resultKey=KEY_TO_RESULT[testKey];if(!isValidCohortId(id)||!resultKey||!resultData||typeof resultData!=='object')return false;const sessionQc=ExperimentRuntime.complete(testKey),enriched={...resultData,_meta:{schemaVersion:RESULT_SCHEMA_VERSION,taskVersion:sessionQc&&sessionQc.taskVersion||DEFAULT_TASK_VERSION,administration:'digital_research_adaptation',mccbEquivalent:false,participantId:id,recordedAt:new Date().toISOString(),sessionQc}},d=this.getData(id);if(!d)return false;if(!d.progress)d.progress={};if(!d.results)d.results={};if(!d.invalidResults)d.invalidResults={};if(!d.sessions)d.sessions={};d.sessions[testKey]=sessionQc;const valid=sessionQc&&sessionQc.status==='valid';if(valid){d.results[resultKey]=enriched;delete d.invalidResults[resultKey];d.progress[testKey]='completed'}else{d.invalidResults[resultKey]=enriched;if(!d.results[resultKey])d.progress[testKey]='completed_invalid'}if(!this._saveData(id,d)){console.error('被试结果保存失败:',id,testKey);return false}const compatibility='mccb-participant-'+id+'-'+resultKey;if(valid)_ls.set(compatibility,JSON.stringify(enriched));else{_ls.remove(resultKey);if(!d.results[resultKey])_ls.remove(compatibility)}return true},
  getResult(testKey){const d=this.getData();return d&&d.results?d.results[KEY_TO_RESULT[testKey]]||null:null},
  getInvalidResult(testKey){const d=this.getData();return d&&d.invalidResults?d.invalidResults[KEY_TO_RESULT[testKey]]||null:null},
  getAnyResult(testKey){return this.getResult(testKey)||this.getInvalidResult(testKey)},
  getSessionQc(testKey){const r=this.getAnyResult(testKey);if(r&&r._meta&&r._meta.sessionQc)return r._meta.sessionQc;const d=this.getData();return d&&d.sessions?d.sessions[testKey]||null:null},
  getFirstIncomplete(){const d=this.getData();if(!d)return TEST_ORDER[0];for(const t of TEST_ORDER)if(!d.progress||d.progress[t.key]!=='completed')return t;return null},
  getProgressSummary(){const d=this.getData();if(!d)return{done:0,invalid:0,total:TEST_ORDER.length};const s=Object.values(d.progress||{}),bad=new Set(['completed_invalid','aborted','interrupted','timing_violation','technical_failure']);return{done:s.filter(x=>x==='completed').length,invalid:s.filter(x=>bad.has(x)).length,total:TEST_ORDER.length}},
  getTestUrl(testKey,mode){const t=TEST_ORDER.find(x=>x.key===testKey);if(!t)return'#';const p=new URLSearchParams();p.set('mode',mode||'user');const id=this.getCurrent();if(isValidCohortId(id))p.set('p',id);return t.file+'?'+p.toString()},
  getParticipantFromUrl(){if(typeof window==='undefined'||!window.location)return'';const p=new URLSearchParams(window.location.search).get('p');return isValidCohortId(p)?p:''},
  initFromUrl(){const id=this.getParticipantFromUrl();if(id)this.setCurrent(id);return this.getCurrent()},
  deleteParticipant(cohortId){const id=normalizeId(cohortId);if(!isValidCohortId(id))return false;_ls.remove('mccb-participant-'+id);const prefix='mccb-participant-'+id+'-',rm=[];for(let i=0;i<_ls.length();i++){const k=_ls.key(i);if(k&&k.startsWith(prefix))rm.push(k)}rm.forEach(k=>_ls.remove(k));_ls.set('mccb-participant-list',JSON.stringify(this.getAllParticipants().filter(x=>x!==id)));if(this.getCurrent()===id)_ls.remove('mccb-current-participant');return true},
  getAllSummaries(){const bad=new Set(['completed_invalid','aborted','interrupted','timing_violation','technical_failure']);return this.getAllParticipants().map(id=>{const d=this.getData(id);if(!d)return{id,done:0,invalid:0,total:TEST_ORDER.length,createdAt:null,updatedAt:null};const s=Object.values(d.progress||{});return{id,done:s.filter(x=>x==='completed').length,invalid:s.filter(x=>bad.has(x)).length,total:TEST_ORDER.length,createdAt:d.createdAt||null,updatedAt:d.updatedAt||null,isCurrent:this.getCurrent()===id}})},
  exportAllData(){const list=this.getAllParticipants(),participants={};list.forEach(id=>{const d=this.getData(id);if(d)participants[id]=d});return{schemaVersion:PARTICIPANT_SCHEMA_VERSION,exportDate:new Date().toISOString(),participantCount:list.length,participants}},
};

function installResearchSafetyUI(){
  if(typeof document==='undefined')return;
  const SAFE='仅显示原始分与研究指标；未应用经验证的 MCCB 常模，不用于“正常/异常”判断或临床诊断解释。';
  function lock(container){const render=()=>{if(container.textContent&&container.textContent.includes(SAFE))return;container.textContent='';const strong=document.createElement('strong'),span=document.createElement('span');strong.textContent='研究版提示：';span.textContent=SAFE;container.append(strong,span)};render();if(typeof MutationObserver!=='undefined'){const o=new MutationObserver(()=>{if(!container.textContent.includes(SAFE)){o.disconnect();render();o.observe(container,{childList:true,subtree:true,characterData:true})}});o.observe(container,{childList:true,subtree:true,characterData:true})}}
  document.querySelectorAll('.norm-ref').forEach(lock);

  // The landing-page charts are a separate legacy 0-100 heuristic pipeline.
  // Keep them out of the default UI until they are rebuilt on MCCBScoring.
  const charts=document.getElementById('chartsPanel');if(charts){charts.style.setProperty('display','none','important');if(!document.getElementById('legacy-chart-safety-note')){const note=document.createElement('div');note.id='legacy-chart-safety-note';note.style.cssText='margin:16px 0;padding:12px 14px;border:1px solid #bfdbfe;border-radius:12px;background:#eff6ff;color:#1e40af;font-size:13px;line-height:1.6';note.textContent='旧版 0–100“标准化”图表已停用。请使用“研究版认知报告”查看 raw data、session QC 与项目内探索性指标。';charts.parentNode.insertBefore(note,charts)}}

  document.querySelectorAll('button[onclick*="comprehensive-report.html"]').forEach(btn=>{btn.setAttribute('onclick',"window.location.href='research-report.html'");btn.textContent='📊 研究版报告';btn.title='查看 raw data、session QC 与研究指标'});
  document.querySelectorAll('button[onclick*="comparison-report.html"]').forEach(btn=>{btn.setAttribute('onclick',"window.location.href='research-comparison.html'");btn.textContent='📈 研究版对比';btn.title='仅比较 QC-valid 研究指标'});

  if(!document.getElementById('research-prototype-banner')){const b=document.createElement('div');b.id='research-prototype-banner';b.setAttribute('role','note');b.textContent='RESEARCH PROTOTYPE · 当前网页任务未经 MCCB 数字等效性验证；结果仅供研究/开发。';b.style.cssText='position:fixed;left:12px;bottom:12px;z-index:99999;max-width:min(560px,calc(100vw - 24px));padding:8px 12px;border:1px solid rgba(245,158,11,.45);border-radius:10px;background:rgba(255,251,235,.96);color:#92400e;font-size:12px;line-height:1.5;box-shadow:0 4px 18px rgba(0,0,0,.08)';document.body.appendChild(b)}
}

function installRuntimeGuards(){
  if(typeof document!=='undefined'){document.addEventListener('visibilitychange',()=>{if(document.hidden){ExperimentRuntime.invalidateAll('interrupted','document_hidden_during_active_session');ParticipantManager._persistActiveSessionQc()}});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installResearchSafetyUI,{once:true});else installResearchSafetyUI()}
  if(typeof window!=='undefined'){
    window.ParticipantManager=ParticipantManager;window.ExperimentRuntime=ExperimentRuntime;
    // Public/default navigation is USER mode. DEV remains an explicit opt-in via
    // the landing-page toggle or ?mode=dev.
    try{if(localStorage.getItem('mccb_mode')==null)localStorage.setItem('mccb_mode','user')}catch{}
    const path=window.location&&window.location.pathname||'';
    if(/\/pages\/mccb-[^/]+\.html$/.test(path)){const params=new URLSearchParams(window.location.search);if(!params.has('mode')){params.set('mode','user');window.location.replace(path+'?'+params.toString()+(window.location.hash||''));return}}
    if(/\/comprehensive-report\.html$/.test(path)){window.location.replace('research-report.html'+(window.location.search||'')+(window.location.hash||''));return}
    if(/\/comparison-report\.html$/.test(path)){window.location.replace('research-comparison.html'+(window.location.search||'')+(window.location.hash||''));return}
    window.addEventListener('pagehide',()=>{ExperimentRuntime.invalidateAll('aborted','page_hidden_or_unloaded_before_completion');ParticipantManager._persistActiveSessionQc()});
  }
}
installRuntimeGuards();

if(typeof module!=='undefined'&&module.exports)module.exports={ParticipantManager,ExperimentRuntime,TEST_ORDER,KEY_TO_RESULT,RESULT_TO_KEY,RESULT_SCHEMA_VERSION,PARTICIPANT_SCHEMA_VERSION,isValidCohortId};
