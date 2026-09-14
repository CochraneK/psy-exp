/* Research bundle validation, preview and controlled import/restore. */
(function(root,factory){
  const api=factory(root||globalThis);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ResearchGovernance=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const FORMAT='psy-exp-research-data-bundle';
  const MAX_JSON_BYTES=12*1024*1024;
  const VALID_PROGRESS=new Set(['not_started','in_progress','completed','completed_invalid','aborted','interrupted','timing_violation','technical_failure']);
  const safeId=v=>typeof v==='string'&&/^[A-Za-z0-9._-]{1,96}$/.test(v);
  const clone=v=>JSON.parse(JSON.stringify(v));
  function dangerousKeys(value,path='root',errors=[]){if(!value||typeof value!=='object')return errors;for(const [k,v] of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(k))errors.push(`${path}.${k}: forbidden key`);else dangerousKeys(v,`${path}.${k}`,errors)}return errors}
  function validateParticipantPayload(p,errors,warnings){
    if(p==null)return;if(typeof p!=='object'||Array.isArray(p)){errors.push('participantData must be an object');return}
    if(p.schemaVersion!==4)warnings.push(`participantData.schemaVersion=${p.schemaVersion}; current runtime expects 4`);
    if(!p.participants||typeof p.participants!=='object'||Array.isArray(p.participants)){errors.push('participantData.participants missing');return}
    const ids=Object.keys(p.participants);if(ids.length>10000)errors.push('participant count exceeds 10000');
    for(const id of ids){if(!safeId(id)){errors.push(`invalid participant id: ${id}`);continue}const d=p.participants[id];if(!d||typeof d!=='object'){errors.push(`participant ${id} invalid`);continue}if(d.cohortId&&d.cohortId!==id)errors.push(`participant ${id} cohortId mismatch`);if(d.progress&&typeof d.progress==='object'){for(const [k,s] of Object.entries(d.progress))if(!VALID_PROGRESS.has(s))warnings.push(`participant ${id} progress ${k} has unknown status ${s}`)}for(const key of ['results','invalidResults','attemptHistory','sessions'])if(d[key]!=null&&(typeof d[key]!=='object'||Array.isArray(d[key])))errors.push(`participant ${id} ${key} must be object`);if(d.attemptHistory&&typeof d.attemptHistory==='object')for(const [k,xs] of Object.entries(d.attemptHistory)){if(!Array.isArray(xs))errors.push(`participant ${id} attemptHistory.${k} must be array`);else if(xs.length>100)warnings.push(`participant ${id} attemptHistory.${k} has ${xs.length} attempts`)}}
  }
  function validateResearchData(r,errors,warnings){
    if(!r||typeof r!=='object'||Array.isArray(r)){errors.push('researchData missing');return}if(r.schemaVersion!==1)errors.push(`researchData.schemaVersion ${r.schemaVersion} unsupported`);if(typeof r.modelVersion!=='string'||!r.modelVersion.startsWith('research-data-model-1.'))errors.push(`researchData.modelVersion ${r.modelVersion||'missing'} unsupported`);if(!r.study||!safeId(r.study.id)){errors.push('researchData.study.id invalid')}for(const key of ['sites','participants','sessions','builds'])if(!r[key]||typeof r[key]!=='object'||Array.isArray(r[key]))errors.push(`researchData.${key} must be object`);if(!Array.isArray(r.attempts))errors.push('researchData.attempts must be array');if(!Array.isArray(r.audit))errors.push('researchData.audit must be array');if(r.attempts&&r.attempts.length>5000)warnings.push(`researchData contains ${r.attempts.length} attempts; local model will cap history`);if(r.audit&&r.audit.length>1000)warnings.push(`researchData contains ${r.audit.length} audit records; local model will cap history`)
  }
  function validateBundle(input,{maxBytes=MAX_JSON_BYTES}={}){
    const errors=[],warnings=[];let bundle=input;
    if(typeof input==='string'){if(BufferLikeByteLength(input)>maxBytes)return{ok:false,errors:['bundle exceeds maximum size'],warnings,summary:null};try{bundle=JSON.parse(input)}catch{return{ok:false,errors:['invalid JSON'],warnings,summary:null}}}
    if(!bundle||typeof bundle!=='object'||Array.isArray(bundle))return{ok:false,errors:['bundle must be object'],warnings,summary:null};dangerousKeys(bundle,'bundle',errors);if(bundle.format!==FORMAT)errors.push(`format must be ${FORMAT}`);validateResearchData(bundle.researchData,errors,warnings);validateParticipantPayload(bundle.participantData,errors,warnings);
    const participantCount=bundle.participantData&&bundle.participantData.participants?Object.keys(bundle.participantData.participants).length:0,sessionCount=bundle.researchData&&bundle.researchData.sessions?Object.keys(bundle.researchData.sessions).length:0,attemptCount=Array.isArray(bundle.researchData&&bundle.researchData.attempts)?bundle.researchData.attempts.length:0;
    return{ok:errors.length===0,errors,warnings,summary:{format:bundle.format||null,modelVersion:bundle.modelVersion||bundle.researchData&&bundle.researchData.modelVersion||null,studyId:bundle.researchData&&bundle.researchData.study&&bundle.researchData.study.id||null,participants:participantCount,sessions:sessionCount,attempts:attemptCount,exportedAt:bundle.exportedAt||null},bundle:errors.length?null:clone(bundle)}
  }
  function BufferLikeByteLength(s){if(typeof Buffer!=='undefined')return Buffer.byteLength(s);return new TextEncoder().encode(s).length}
  function clearParticipantStorage(){const s=root.localStorage;if(!s)return;const rm=[];for(let i=0;i<s.length;i++){const k=s.key(i);if(k&&(k==='mccb-participant-list'||k==='mccb-current-participant'||k.startsWith('mccb-participant-')))rm.push(k)}rm.forEach(k=>s.removeItem(k))}
  function restoreParticipantData(payload,{mode='merge'}={}){
    if(!payload||!payload.participants)return{restored:0};const s=root.localStorage;if(!s)throw new Error('LOCAL_STORAGE_UNAVAILABLE');if(mode==='replace')clearParticipantStorage();const existing=(()=>{try{return JSON.parse(s.getItem('mccb-participant-list')||'[]')}catch{return[]}})(),ids=new Set(Array.isArray(existing)?existing.filter(safeId):[]);let restored=0;
    for(const [id,data] of Object.entries(payload.participants)){if(!safeId(id))continue;s.setItem('mccb-participant-'+id,JSON.stringify(data));ids.add(id);restored++;if(data&&data.results)for(const [resultKey,result] of Object.entries(data.results))s.setItem(`mccb-participant-${id}-${resultKey}`,JSON.stringify(result))}
    s.setItem('mccb-participant-list',JSON.stringify([...ids]));return{restored,total:ids.size}
  }
  function mergeResearchData(incoming){const RD=root.ResearchData;if(!RD)throw new Error('RESEARCH_DATA_UNAVAILABLE');const current=RD.snapshot();if(current.study&&incoming.study&&current.study.id!==incoming.study.id&&Object.keys(current.participants||{}).length)throw new Error('STUDY_MISMATCH_REQUIRES_REPLACE');const next=clone(current);next.study=clone(incoming.study||next.study);for(const key of ['sites','participants','sessions','builds'])next[key]={...(next[key]||{}),...clone(incoming[key]||{})};const seen=new Set((next.attempts||[]).map(a=>a&&a.sourceKey||a&&a.id).filter(Boolean));for(const a of incoming.attempts||[]){const k=a&&a.sourceKey||a&&a.id;if(!k||!seen.has(k)){next.attempts.push(clone(a));if(k)seen.add(k)}}next.audit=[...(next.audit||[]),...(incoming.audit||[]).map(clone)].slice(-1000);return RD._save(next)?next:null}
  function importBundle(input,{mode='merge',restoreParticipants=true}={}){
    const v=validateBundle(input);if(!v.ok){const e=new Error('BUNDLE_VALIDATION_FAILED');e.validation=v;throw e}if(!['merge','replace'].includes(mode))throw new Error('IMPORT_MODE_INVALID');const RD=root.ResearchData;if(!RD)throw new Error('RESEARCH_DATA_UNAVAILABLE');let researchResult;if(mode==='replace')researchResult=RD._save(v.bundle.researchData)?RD.snapshot():null;else researchResult=mergeResearchData(v.bundle.researchData);const participantResult=restoreParticipants&&v.bundle.participantData?restoreParticipantData(v.bundle.participantData,{mode}):{restored:0};return{ok:!!researchResult,mode,summary:v.summary,participantResult,researchData:researchResult}
  }
  function exportLocalBundle(){if(!root.ResearchData)throw new Error('RESEARCH_DATA_UNAVAILABLE');const participantData=root.ParticipantManager&&typeof root.ParticipantManager.exportAllData==='function'?root.ParticipantManager.exportAllData():null;return root.ResearchData.exportBundle({participantData})}
  return{FORMAT,MAX_JSON_BYTES,validateBundle,restoreParticipantData,importBundle,exportLocalBundle};
});