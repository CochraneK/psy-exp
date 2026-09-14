/* Research Data Model v1: local, versioned metadata layer for reproducible study/session provenance. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ResearchData=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const MODEL_VERSION='research-data-model-1.0.0';
  const STORAGE_KEY='psy-exp-research-data-v1';
  const DEFAULT_STUDY_ID='psy-exp-default-study';
  const DEFAULT_SITE_ID='local-browser-site';
  const RESULT_TO_TEST={
    'mccb-tmt-result':'tmt','mccb-bacs-result':'bacs','mccb-fluency-result':'fluency','mccb-cpt-result':'cpt','mccb-spatial-span-result':'spatial-span','mccb-lns-result':'lns','mccb-hvlt-result':'hvlt','mccb-bvmt-result':'bvmt','mccb-mazes-result':'mazes','mccb-msceit-result':'msceit'
  };
  const now=()=>new Date().toISOString();
  const clone=v=>{try{return v==null?v:JSON.parse(JSON.stringify(v))}catch{return null}};
  const safeId=v=>String(v==null?'':v).trim().replace(/[^A-Za-z0-9._-]/g,'-').slice(0,96)||'unknown';
  const storage={
    get(){try{const raw=localStorage.getItem(STORAGE_KEY);return raw?JSON.parse(raw):null}catch{return null}},
    set(v){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(v));return true}catch(e){console.warn('ResearchData persistence failed',e&&e.message||e);return false}},
    clear(){try{localStorage.removeItem(STORAGE_KEY);return true}catch{return false}}
  };
  function uid(prefix){
    try{if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return `${prefix}-${crypto.randomUUID()}`;}catch{}
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  }
  function blank(){return{schemaVersion:1,modelVersion:MODEL_VERSION,createdAt:now(),updatedAt:now(),study:{id:DEFAULT_STUDY_ID,label:'psy-exp local research study',consentVersion:null,protocolGovernance:'protocol-lock-v1'},sites:{[DEFAULT_SITE_ID]:{id:DEFAULT_SITE_ID,label:'Local browser site',createdAt:now()}},participants:{},sessions:{},attempts:[],audit:[],builds:{}}}
  function normalize(data){
    const d=data&&typeof data==='object'?data:blank();
    d.schemaVersion=1;d.modelVersion=MODEL_VERSION;d.createdAt=d.createdAt||now();d.updatedAt=d.updatedAt||now();
    d.study=d.study&&typeof d.study==='object'?d.study:{id:DEFAULT_STUDY_ID,label:'psy-exp local research study',consentVersion:null,protocolGovernance:'protocol-lock-v1'};
    d.sites=d.sites&&typeof d.sites==='object'?d.sites:{};if(!d.sites[DEFAULT_SITE_ID])d.sites[DEFAULT_SITE_ID]={id:DEFAULT_SITE_ID,label:'Local browser site',createdAt:now()};
    d.participants=d.participants&&typeof d.participants==='object'?d.participants:{};d.sessions=d.sessions&&typeof d.sessions==='object'?d.sessions:{};d.attempts=Array.isArray(d.attempts)?d.attempts:[];d.audit=Array.isArray(d.audit)?d.audit:[];d.builds=d.builds&&typeof d.builds==='object'?d.builds:{};return d;
  }
  function load(){return normalize(storage.get())}
  function save(data){data=normalize(data);data.updatedAt=now();if(data.audit.length>1000)data.audit.splice(0,data.audit.length-1000);if(data.attempts.length>5000)data.attempts.splice(0,data.attempts.length-5000);return storage.set(data)}
  function audit(data,type,detail){data.audit.push({id:uid('audit'),type,at:now(),detail:clone(detail)||null})}
  function configureStudy({studyId,label,consentVersion,siteId,siteLabel}={}){
    const d=load();const sid=safeId(studyId||d.study.id||DEFAULT_STUDY_ID),site=safeId(siteId||DEFAULT_SITE_ID);
    d.study={...d.study,id:sid,label:label||d.study.label||sid,consentVersion:consentVersion??d.study.consentVersion??null,protocolGovernance:'protocol-lock-v1'};
    d.sites[site]={...(d.sites[site]||{}),id:site,label:siteLabel||d.sites[site]?.label||site,createdAt:d.sites[site]?.createdAt||now()};
    audit(d,'study_configured',{studyId:sid,siteId:site,consentVersion:d.study.consentVersion});save(d);return clone({study:d.study,site:d.sites[site]});
  }
  function ensureParticipant(participantId,{siteId=DEFAULT_SITE_ID}={}){
    const id=safeId(participantId),site=safeId(siteId),d=load();
    if(!d.participants[id]){d.participants[id]={id,studyId:d.study.id,siteId:site,createdAt:now(),updatedAt:now(),status:'active'};audit(d,'participant_created',{participantId:id,siteId:site})}
    else d.participants[id].updatedAt=now();
    save(d);return clone(d.participants[id]);
  }
  function getActiveSession(participantId){const id=safeId(participantId),d=load();const xs=Object.values(d.sessions).filter(s=>s.participantId===id&&s.status==='active').sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)));return clone(xs[0]||null)}
  function beginSession(participantId,{siteId=DEFAULT_SITE_ID,operatorId='local-researcher',consentVersion=null,build=null,environment=null}={}){
    const id=safeId(participantId),site=safeId(siteId);ensureParticipant(id,{siteId:site});const existing=getActiveSession(id);if(existing)return existing;
    const d=load(),sessionId=uid('session');d.sessions[sessionId]={id:sessionId,studyId:d.study.id,siteId:site,participantId:id,operatorId:safeId(operatorId),consentVersion:consentVersion??d.study.consentVersion??null,status:'active',startedAt:now(),completedAt:null,build:clone(build),environment:clone(environment),protocolManifest:clone(build&&build.protocolManifest)||null};
    audit(d,'session_started',{sessionId,participantId:id,siteId:site});save(d);return clone(d.sessions[sessionId]);
  }
  function updateSession(sessionId,patch={}){const id=String(sessionId||''),d=load(),s=d.sessions[id];if(!s)return null;for(const k of ['environment','build','protocolManifest'])if(Object.prototype.hasOwnProperty.call(patch,k))s[k]=clone(patch[k]);if(Object.prototype.hasOwnProperty.call(patch,'operatorId'))s.operatorId=safeId(patch.operatorId);audit(d,'session_updated',{sessionId:id,keys:Object.keys(patch)});save(d);return clone(s)}
  function closeSession(sessionId,{status='completed',reason=null}={}){const id=String(sessionId||''),d=load(),s=d.sessions[id];if(!s)return null;s.status=String(status||'completed');s.completedAt=now();s.closeReason=reason||null;audit(d,'session_closed',{sessionId:id,status:s.status,reason:s.closeReason});save(d);return clone(s)}
  function sourceAttemptKey({participantId,testKey,taskVersion,protocolId,resultRecordedAt,qcStatus}){return[participantId,testKey,taskVersion||'',protocolId||'',resultRecordedAt||'',qcStatus||''].join('|')}
  function recordAttempt({sessionId,participantId,testKey,taskVersion,protocolId,qcStatus,resultRecordedAt,source='participant-manager',sourceKey=null}={}){
    const d=load(),sid=String(sessionId||''),pid=safeId(participantId),key=sourceKey||sourceAttemptKey({participantId:pid,testKey,taskVersion,protocolId,resultRecordedAt,qcStatus});const existing=d.attempts.find(x=>x.sourceKey===key);if(existing)return clone(existing);
    const attempt={id:uid('attempt'),studyId:d.study.id,siteId:(d.sessions[sid]&&d.sessions[sid].siteId)||DEFAULT_SITE_ID,sessionId:sid||null,participantId:pid,testKey:safeId(testKey),taskVersion:taskVersion||null,protocolId:protocolId||null,qcStatus:qcStatus||'unverified',recordedAt:resultRecordedAt||now(),source,sourceKey:key};d.attempts.push(attempt);audit(d,'attempt_recorded',{attemptId:attempt.id,sessionId:attempt.sessionId,participantId:pid,testKey:attempt.testKey,qcStatus:attempt.qcStatus});save(d);return clone(attempt)}
  function syncParticipantData(payload,{sessionId=null}={}){
    const participants=payload&&payload.participants&&typeof payload.participants==='object'?payload.participants:{};let added=0,seen=0;
    for(const [participantId,p] of Object.entries(participants)){
      ensureParticipant(participantId);
      const active=sessionId?null:getActiveSession(participantId),sid=sessionId||active&&active.id||null,history=p&&p.attemptHistory&&typeof p.attemptHistory==='object'?p.attemptHistory:{};
      for(const [resultKey,items] of Object.entries(history)){
        const testKey=RESULT_TO_TEST[resultKey]||resultKey.replace(/^mccb-|(-result)$/g,''),xs=Array.isArray(items)?items:[];
        for(const item of xs){seen++;const meta=item&&item._meta||{},qc=meta.sessionQc||{},before=load().attempts.length;recordAttempt({sessionId:sid,participantId,testKey,taskVersion:meta.taskVersion||null,protocolId:item&&item.protocol||null,qcStatus:qc.status||'unverified',resultRecordedAt:meta.recordedAt||item&&item.date||null,source:'participant-manager-history'});if(load().attempts.length>before)added++}
      }
    }
    const d=load();audit(d,'participant_history_synced',{participants:Object.keys(participants).length,seen,added});save(d);return{participants:Object.keys(participants).length,seen,added,totalAttempts:d.attempts.length}
  }
  function registerBuild(build){const d=load(),id=safeId(build&&build.id||build&&build.commit||build&&build.buildId||'unknown-build');d.builds[id]={id,recordedAt:now(),...clone(build)};audit(d,'build_registered',{buildId:id});save(d);return clone(d.builds[id])}
  function snapshot(){return clone(load())}
  function exportBundle(extra={}){if(extra.participantData)syncParticipantData(extra.participantData);const d=load();return{exportedAt:now(),format:'psy-exp-research-data-bundle',modelVersion:MODEL_VERSION,researchData:d,participantData:clone(extra.participantData)||null}}
  function downloadBundle(extra={}){if(typeof document==='undefined')return false;const blob=new Blob([JSON.stringify(exportBundle(extra),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`psy-exp-research-data-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();URL.revokeObjectURL(url);return true}
  return{MODEL_VERSION,STORAGE_KEY,DEFAULT_STUDY_ID,DEFAULT_SITE_ID,configureStudy,ensureParticipant,beginSession,getActiveSession,updateSession,closeSession,recordAttempt,syncParticipantData,registerBuild,snapshot,exportBundle,downloadBundle,_load:load,_save:save,_clear:storage.clear};
});
