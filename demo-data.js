/* Deterministic synthetic demo dataset for UI/report testing only. */
(function(root,factory){
  const api=factory(root||globalThis);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PsyExpDemoData=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';

  const VERSION='demo-seed-1.0.0';
  const IDS=Array.from({length:8},(_,i)=>`DEMO-${String(i+1).padStart(3,'0')}`);
  const PREVIOUS_KEY='psy-exp-demo-previous-participant';
  const RESULT_KEYS={
    tmt:'mccb-tmt-result',bacs:'mccb-bacs-result',fluency:'mccb-fluency-result',cpt:'mccb-cpt-result',
    'spatial-span':'mccb-spatial-span-result',lns:'mccb-lns-result',hvlt:'mccb-hvlt-result',
    bvmt:'mccb-bvmt-result',mazes:'mccb-mazes-result',msceit:'mccb-msceit-result'
  };
  const TASKS=Object.keys(RESULT_KEYS);
  const PARTIAL_TASKS=new Set(['tmt','bacs','fluency','spatial-span','lns']);
  const nowFor=i=>new Date(Date.UTC(2026,0,15,8+i,0,0)).toISOString();
  const startedFor=i=>new Date(Date.UTC(2026,0,15,7+i,45,0)).toISOString();
  const storage=()=>root.localStorage||(typeof localStorage!=='undefined'?localStorage:null);
  const PM=()=>root.ParticipantManager||(typeof ParticipantManager!=='undefined'?ParticipantManager:null);

  function sessionQc(status,i,key){
    return {
      testKey:key,
      taskVersion:`demo-${key}-1.0.0`,
      runtimeVersion:VERSION,
      status,
      startedAt:startedFor(i),
      completedAt:nowFor(i),
      elapsedMs:60000+i*1370,
      clock:'synthetic-demo-clock',
      qc:{
        visibilityInterruptions:0,
        timingViolation:status==='timing_violation',
        technicalFailure:status==='technical_failure',
        timerDriftMaxMs:status==='timing_violation'?950:18+i,
        timerSamples:12,
        reasons:status==='valid'?[]:[`demo_${status}`]
      },
      events:[]
    };
  }

  function enrich(id,i,key,raw,status='valid'){
    return {
      ...raw,
      demoSynthetic:true,
      _meta:{
        schemaVersion:4,
        taskVersion:`demo-${key}-1.0.0`,
        runtimeVersion:VERSION,
        administration:'synthetic_demo_only',
        mccbEquivalent:false,
        participantId:id,
        recordedAt:nowFor(i),
        provenance:{
          source:'psy-exp-demo-seed',
          synthetic:true,
          demoVersion:VERSION,
          warning:'NOT_REAL_PARTICIPANT_DATA'
        },
        sessionQc:sessionQc(status,i,key)
      }
    };
  }

  function rawResult(key,i,{edge=false}={}){
    const protocol=edge&&key==='bacs'?`demo-${key}-protocol-v2`:`demo-${key}-protocol-v1`;
    switch(key){
      case'tmt':return{protocol,partA:{time:62-i*4,errors:i%3===0?1:0,completed:true,clickData:[]},partB:{time:105-i*5,errors:i%2,completed:true,clickData:[]}};
      case'bacs':return{protocol,correct:44+i*4,attempted:58+i*3};
      case'fluency':return{protocol,total:14+i*2,unique:14+i*2,reviewStatus:edge?'unreviewed':'verified',semanticReview:edge?null:{status:'verified',reviewer:'demo-generator',reviewedAt:nowFor(i)}};
      case'cpt':return{protocol,hits:31+i*2,misses:7-Math.min(i,5),falseAlarms:6-Math.min(i,4),meanHitRT:520-i*18,meanFART:500-i*12,dPrime:1.15+i*.32,totalTrials:80,timing:{maxOnsetErrorMs:18+i}};
      case'spatial-span':return{protocol,totalCorrect:8+i,maxLevel:4+Math.floor(i/2)};
      case'lns':return{protocol,totalCorrect:7+i,maxLevel:4+Math.floor(i/2)};
      case'hvlt':return{protocol,trial1:4+(i%2),trial2:7+i,trial3:8+i,delayedRecall:7+i,stimulusSet:{id:'demo-synthetic-private-placeholder',version:'demo-v1',fingerprint:'DEMO-NOT-LICENSED-MATERIAL'}};
      case'bvmt':return{protocol,trials:[{score:4+i},{score:6+i},{score:8+i}],delayedRecall:7+i};
      case'mazes':return{protocol,totalScore:10+i*2,maxScore:26,completed:7,totalTime:360-i*15};
      case'msceit':return{protocol,total:24,correct:12+i,rawScore:18+i*3,elapsed:280-i*8,itemSet:{id:'demo-synthetic-private-placeholder',version:'demo-v1'},scoring:{version:'demo-v1',correct:12+i,total:24,rawScore:18+i*3}};
      default:return{protocol};
    }
  }

  function makeParticipant(id,i,{partial=false,edge=false}={}){
    const progress={},results={},invalidResults={},attemptHistory={},sessions={};
    for(const key of TASKS)progress[key]='not_started';
    for(const key of TASKS){
      if(partial&&!PARTIAL_TASKS.has(key))continue;
      const invalid=edge&&key==='cpt';
      const status=invalid?'timing_violation':'valid';
      const result=enrich(id,i,key,rawResult(key,i,{edge}),status);
      const storageKey=RESULT_KEYS[key];
      sessions[key]=result._meta.sessionQc;
      attemptHistory[storageKey]=[result];
      if(invalid){invalidResults[storageKey]=result;progress[key]='completed_invalid'}
      else{results[storageKey]=result;progress[key]='completed'}
    }
    return{
      schemaVersion:4,
      runtimeVersion:VERSION,
      cohortId:id,
      createdAt:nowFor(i),
      updatedAt:nowFor(i),
      demoSynthetic:true,
      demoVersion:VERSION,
      demoProfile:partial?'partial':edge?'qc-edge':'complete',
      warning:'SYNTHETIC DEMO DATA — NOT A REAL ASSESSMENT',
      progress,sessions,results,invalidResults,attemptHistory
    };
  }

  function getDemoIds(){
    const pm=PM();if(!pm)return[];
    return pm.getAllParticipants().filter(id=>{
      if(!IDS.includes(id))return false;
      const d=pm.getData(id);return !!(d&&d.demoSynthetic===true);
    });
  }

  function clear({restorePrevious=true}={}){
    const pm=PM();if(!pm)throw new Error('PARTICIPANT_MANAGER_UNAVAILABLE');
    const ids=getDemoIds();
    for(const id of ids){
      try{if(root.ResearchData&&typeof root.ResearchData.deleteParticipant==='function')root.ResearchData.deleteParticipant(id,{reason:'demo_seed_clear'})}catch(e){if(root.console)console.warn('Demo ResearchData cleanup skipped',id,e&&e.message||e)}
      pm.deleteParticipant(id);
    }
    const store=storage(),previous=store&&store.getItem(PREVIOUS_KEY)||'';
    if(store)store.removeItem(PREVIOUS_KEY);
    if(restorePrevious&&previous&&pm.getAllParticipants().includes(previous))pm.setCurrent(previous);
    else if(/^DEMO-/.test(pm.getCurrent()||''))pm.logout();
    return{version:VERSION,removed:ids.length,remainingDemoIds:getDemoIds()};
  }

  function seed(){
    const pm=PM();if(!pm)throw new Error('PARTICIPANT_MANAGER_UNAVAILABLE');
    const store=storage(),current=pm.getCurrent();
    if(store&&current&&!/^DEMO-/.test(current))store.setItem(PREVIOUS_KEY,current);
    clear({restorePrevious:false});
    IDS.forEach((id,i)=>{
      pm.setCurrent(id);
      const profile=i===6?{partial:true}:i===7?{edge:true}:{};
      pm._saveData(id,makeParticipant(id,i,profile));
    });
    pm.setCurrent(IDS[0]);
    if(root.ResearchData&&typeof root.ResearchData.syncParticipantData==='function'){
      try{root.ResearchData.syncParticipantData(pm.exportAllData(),{sessionId:null})}catch(e){if(root.console)console.warn('Demo ResearchData sync skipped',e&&e.message||e)}
    }
    return summary();
  }

  function summary(){
    const pm=PM();if(!pm)return{version:VERSION,count:0,ids:[]};
    const ids=getDemoIds();
    return{
      version:VERSION,
      count:ids.length,
      ids,
      complete:ids.filter(id=>pm.getData(id)&&pm.getData(id).demoProfile==='complete').length,
      partial:ids.filter(id=>pm.getData(id)&&pm.getData(id).demoProfile==='partial').length,
      qcEdge:ids.filter(id=>pm.getData(id)&&pm.getData(id).demoProfile==='qc-edge').length,
      current:pm.getCurrent()
    };
  }

  return{VERSION,IDS:[...IDS],seed,clear,summary,getDemoIds,makeParticipant};
});
