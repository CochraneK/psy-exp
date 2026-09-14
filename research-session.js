/* Shared Study/Site/Participant/Session bridge for researcher entry points. */
(function(root,factory){
  const api=factory(root||globalThis);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ResearchSession=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  let manifestPromise=null;

  function isOriginalHomepage(){
    if(!root.document)return false;
    return root.document.title==='MCCB 认知成套测验'&&!!root.document.getElementById('dashboard')&&root.document.querySelectorAll('.test-card').length===10;
  }
  function installOriginalUiPolish(){
    if(!isOriginalHomepage())return false;
    const params=new URLSearchParams(root.location&&root.location.search||'');
    if(params.get('ui')==='classic'){
      root.document.body.classList.remove('psy-polish');
      const prior=root.document.getElementById('original-ui-polish');if(prior)prior.remove();
      return false;
    }
    if(!root.document.getElementById('original-ui-polish')){
      const link=root.document.createElement('link');link.id='original-ui-polish';link.rel='stylesheet';link.href='original-ui-polish.css?v=1.0.0';root.document.head.appendChild(link);
    }
    root.document.body.classList.add('psy-polish');
    return true;
  }

  function restoreOriginalReportEntries(){
    if(!root.document)return;
    const single=root.document.querySelector('button[onclick*="research-report.html"],button[onclick*="comprehensive-report.html"]');
    if(single){single.setAttribute('onclick',"window.location.href='comprehensive-report.html'");single.textContent='📊 综合报告';single.title='查看综合认知报告'}
    const comparison=root.document.querySelector('button[onclick*="research-comparison.html"],button[onclick*="comparison-report.html"]');
    if(comparison){comparison.setAttribute('onclick',"window.location.href='comparison-report.html'");comparison.textContent='📈 对比分析';comparison.title='多被试认知域对比'}
  }
  restoreOriginalReportEntries();
  installOriginalUiPolish();

  async function sha256Json(value){
    try{
      if(!(root.crypto&&root.crypto.subtle))return null;
      const bytes=new TextEncoder().encode(JSON.stringify(value));
      const hash=await root.crypto.subtle.digest('SHA-256',bytes);
      return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
    }catch{return null}
  }
  async function loadJson(path){
    const r=await root.fetch(path,{cache:'no-store'});
    if(!r.ok)throw new Error(`${path} ${r.status}`);
    return r.json();
  }
  async function provenance(){
    if(manifestPromise)return manifestPromise;
    manifestPromise=(async()=>{
      let manifest=null,lock=null,manifestHash=null,protocolLockHash=null;
      try{
        [manifest,lock]=await Promise.all([loadJson('task-manifest.json'),loadJson('protocol-lock.json')]);
        [manifestHash,protocolLockHash]=await Promise.all([sha256Json(manifest),sha256Json(lock)]);
      }catch(e){
        if(root.console)console.warn('Research provenance fingerprint unavailable',e&&e.message||e);
      }
      const RD=root.ResearchData,RS=root.ResearchStorage;
      return {
        id:`pages-${manifest&&manifest.runtimeVersion||'unknown'}-${manifest&&manifest.dataModelVersion||RD&&RD.MODEL_VERSION||'unknown'}`,
        commit:null,
        runtimeVersion:manifest&&manifest.runtimeVersion||null,
        scoringVersion:manifest&&manifest.scoringVersion||null,
        dataModelVersion:manifest&&manifest.dataModelVersion||RD&&RD.MODEL_VERSION||null,
        storageArchitecture:manifest&&manifest.storageArchitecture||RS&&RS.STORAGE_ARCH_VERSION||null,
        protocolManifest:{
          manifestVersion:manifest&&manifest.manifestVersion||null,
          protocolGovernance:manifest&&manifest.protocolGovernance||null,
          manifestHash,
          protocolLockHash,
          protocolLockVersion:lock&&lock.lockVersion||null
        }
      };
    })();
    return manifestPromise;
  }
  function requireCore(){
    if(!root.ResearchData)throw new Error('RESEARCH_DATA_UNAVAILABLE');
    if(!root.ResearchStorage)throw new Error('RESEARCH_STORAGE_UNAVAILABLE');
    if(!root.ParticipantManager)throw new Error('PARTICIPANT_MANAGER_UNAVAILABLE');
  }
  async function ensureSession(participantId,{environment=null,forceNew=false,parentSessionId=null,reopenReason=null}={}){
    requireCore();
    const RD=root.ResearchData,RS=root.ResearchStorage;
    const cfg=RS.getConfig(),snap=RD.snapshot(),existing=snap.participants&&snap.participants[participantId];
    const siteId=existing&&existing.siteId||cfg.siteId||RD.DEFAULT_SITE_ID;
    RD.ensureParticipant(participantId,{siteId});
    const eligibility=RD.sessionEligibility(participantId);
    if(!eligibility.eligible)return{blocked:true,participantId,...eligibility};
    const build=await provenance();
    RD.registerBuild(build);
    return RD.beginSession(participantId,{siteId,operatorId:cfg.operatorId||'local-researcher',build,environment,forceNew,parentSessionId,reopenReason});
  }
  async function checkpoint(participantId,session,{reason='checkpoint'}={}){
    requireCore();
    const RD=root.ResearchData,RS=root.ResearchStorage,PM=root.ParticipantManager;
    const participantData=PM.exportAllData(),sid=session&&!session.blocked?session.id:null;
    RD.syncParticipantData(participantData,{sessionId:sid});
    const cfg=RS.getConfig();
    if(!cfg.replica||!cfg.replica.enabled)return{queued:false,sessionId:sid};
    const bundle=RD.exportBundle({participantData});
    const queued=RS.stageBundle(bundle,{studyId:cfg.replica.studyId||RD.snapshot().study.id,reason});
    if(cfg.replica.autoSync&&RS.getTokenState().present){
      try{await RS.flushOutbox()}catch(e){if(root.console)console.warn('Replica sync deferred',e&&e.message||e)}
    }
    return{queued:!!queued,sessionId:sid};
  }
  return{provenance,ensureSession,checkpoint,restoreOriginalReportEntries,installOriginalUiPolish};
});