/**
 * Research-safe cognitive scoring / aggregation.
 *
 * Public browser tasks in this repository are research adaptations. The default
 * scoring path only creates cohort-relative rank indices from QC-valid results.
 * It never produces MCCB T-scores, clinical percentiles, or an MCCB composite.
 */
const MCCBScoring = (() => {
  const SCORING_VERSION = 'research-scoring-0.4.0';

  const DOMAINS = {
    speed_processing: { label:'处理速度', labelEn:'Speed of Processing', tests:['bacs','fluency','tmt'], color:'#3498db' },
    attention: { label:'注意/警觉', labelEn:'Attention / Vigilance', tests:['cpt'], color:'#2ecc71' },
    working_memory: { label:'工作记忆', labelEn:'Working Memory', tests:['lns','spatial-span'], color:'#e67e22' },
    verbal_learning: { label:'言语学习', labelEn:'Verbal Learning', tests:['hvlt'], color:'#9b59b6' },
    visual_learning: { label:'视觉学习', labelEn:'Visual Learning', tests:['bvmt'], color:'#1abc9c' },
    reasoning: { label:'推理与问题解决', labelEn:'Reasoning & Problem Solving', tests:['mazes'], color:'#e74c3c' },
    social_cognition: { label:'社会认知', labelEn:'Social Cognition', tests:['msceit'], color:'#f39c12' },
  };

  const KEY_TO_RESULT = {
    tmt:'mccb-tmt-result', bacs:'mccb-bacs-result', fluency:'mccb-fluency-result', cpt:'mccb-cpt-result',
    'spatial-span':'mccb-spatial-span-result', lns:'mccb-lns-result', hvlt:'mccb-hvlt-result', bvmt:'mccb-bvmt-result',
    mazes:'mccb-mazes-result', msceit:'mccb-msceit-result',
  };

  const TASK_VALIDATION = {
    tmt:{mccbComponent:'Trail Making Test Part A only',mccbEquivalent:false,timingStatus:'monotonic-elapsed',materialPolicy:'public-domain-related',note:'Only Part A enters the research processing-speed domain; Part B is supplemental.'},
    bacs:{mccbComponent:'BACS Symbol Coding',mccbEquivalent:false,timingStatus:'absolute-deadline',materialPolicy:'synthetic-public-stimuli',note:'Synthetic browser symbol coding; not the licensed paper/pencil administration.'},
    fluency:{mccbComponent:'Category Fluency: Animal Naming',mccbEquivalent:false,timingStatus:'absolute-deadline',materialPolicy:'public-domain-related',note:'Typed self-administration differs from oral administration; semantic validity needs researcher review.'},
    cpt:{mccbComponent:'CPT-IP',mccbEquivalent:false,timingStatus:'absolute-trial-schedule-with-onset-log',materialPolicy:'synthetic-public-stimuli',note:'Custom identical-pairs protocol; scheduled/actual onset and RT are logged, but standardized CPT-IP equivalence is not claimed.'},
    'spatial-span':{mccbComponent:'WMS-III Spatial Span',mccbEquivalent:false,timingStatus:'absolute-deadline',materialPolicy:'synthetic-public-stimuli',note:'Algorithm-generated 3x3 screen sequences; no WMS-III board stimuli are bundled.'},
    lns:{mccbComponent:'Letter-Number Span',mccbEquivalent:false,timingStatus:'absolute-deadline',materialPolicy:'synthetic-public-stimuli',note:'Algorithm-generated visual sequences; standard administration is oral.'},
    hvlt:{mccbComponent:'HVLT-R',mccbEquivalent:false,timingStatus:'absolute-deadline',materialPolicy:'private-licensed-assets-required',note:'No word list is public; an authorized private stimulus configuration is required.'},
    bvmt:{mccbComponent:'BVMT-R',mccbEquivalent:false,timingStatus:'absolute-deadline',materialPolicy:'synthetic-public-stimuli',note:'Synthetic symbol-grid learning task; no standard BVMT-R figures are bundled.'},
    mazes:{mccbComponent:'NAB Mazes',mccbEquivalent:false,timingStatus:'monotonic-elapsed',materialPolicy:'synthetic-public-stimuli',note:'Algorithm-generated mazes and project-local efficiency score; no NAB maze layouts or official scoring are bundled.'},
    msceit:{mccbComponent:'MSCEIT Managing Emotions',mccbEquivalent:false,timingStatus:'monotonic-elapsed',materialPolicy:'private-licensed-assets-required',note:'Formal items and scoring are private/authorized inputs; public repository contains only a protocol shell.'},
  };

  const n=(v,fallback=0)=>{const x=Number(v);return Number.isFinite(x)?x:fallback};
  const finite=v=>Number.isFinite(Number(v));
  const delayedValue=result=>{
    if(finite(result.delayedScore)) return Number(result.delayedScore);
    if(result.delayedRecall && typeof result.delayedRecall==='object' && finite(result.delayedRecall.score)) return Number(result.delayedRecall.score);
    return n(result.delayedRecall);
  };

  function getResultQcStatus(result){
    const status=result&&result._meta&&result._meta.sessionQc&&result._meta.sessionQc.status;
    return typeof status==='string'?status:'unverified';
  }
  function isResearchScorable(result){return getResultQcStatus(result)==='valid'}

  const TEST_METRICS = {
    bacs:{label:'符号编码研究任务',labelEn:'Synthetic Symbol Coding',extract:r=>{const correct=n(r.correct),attempted=n(r.attempted);return{correct,attempted,accuracy:attempted>0?Math.round(correct/attempted*1000)/10:null}}},
    fluency:{label:'语义流畅研究任务',labelEn:'Typed Category Fluency',extract:r=>({total:n(r.total??r.unique),unique:n(r.unique??r.total),reviewStatus:r.reviewStatus||'unreviewed'})},
    hvlt:{label:'私有词语学习协议',labelEn:'Private Verbal Learning Protocol',extract:r=>{const trial1=n(r.trial1),trial2=n(r.trial2),trial3=n(r.trial3),delayedRecall=n(r.delayedRecall);return{trial1,trial2,trial3,totalLearning:trial1+trial2+trial3,delayedRecall,retention:trial3>0?Math.round(delayedRecall/trial3*1000)/10:null}}},
    bvmt:{label:'合成视觉学习任务',labelEn:'Synthetic Visual Pattern Learning',extract:r=>{const trials=Array.isArray(r.trials)?r.trials:(Array.isArray(r.trialScores)?r.trialScores:[]),scores=trials.map(x=>n(typeof x==='object'?x.score:x)),delayedRecall=delayedValue(r),last=scores.length?scores[scores.length-1]:0;return{trialScores:scores,totalLearning:scores.reduce((a,b)=>a+b,0),delayedRecall,trialsCompleted:scores.length,retention:last>0?Math.round(delayedRecall/last*1000)/10:null}}},
    cpt:{label:'持续操作研究任务',labelEn:'Custom Identical-Pairs Task',extract:r=>({hits:n(r.hits),misses:n(r.misses),falseAlarms:n(r.falseAlarms),meanHitRT:n(r.meanHitRT??r.meanRT),meanFART:n(r.meanFART),dPrime:n(r.dPrime),totalTrials:n(r.totalTrials),maxOnsetErrorMs:n(r.timing&&r.timing.maxOnsetErrorMs)})},
    msceit:{label:'私有情绪管理协议',labelEn:'Private Emotion Management Protocol',extract:r=>{const scoring=r.scoring||{},total=n(r.total??scoring.total),correct=n(r.correct??scoring.correct),rawScore=finite(r.rawScore)?Number(r.rawScore):(finite(scoring.rawScore)?Number(scoring.rawScore):correct);return{total,correct,rawScore,accuracy:total>0&&finite(correct)?Math.round(correct/total*1000)/10:null,elapsed:n(r.elapsed)}}},
    mazes:{label:'生成式迷宫任务',labelEn:'Generated Maze Planning',extract:r=>({totalScore:n(r.totalScore),maxScore:n(r.maxScore,26),completed:Array.isArray(r.completed)?r.completed.length:n(r.completed),totalTime:n(r.totalTime)})},
    'spatial-span':{label:'合成空间序列任务',labelEn:'Synthetic Spatial Sequence',extract:r=>({totalCorrect:n(r.totalCorrect),maxLevel:n(r.maxLevel)})},
    lns:{label:'合成字母数字排序',labelEn:'Synthetic Letter-Number Ordering',extract:r=>({totalCorrect:n(r.totalCorrect),maxLevel:n(r.maxLevel)})},
    tmt:{label:'连线测验',labelEn:'Trail Making Test',extract:r=>{const a=r.partA||{},b=r.partB||{};return{partATime:n(a.time),partAErrors:n(a.errors),partBTime:n(b.time),partBErrors:n(b.errors),mccbTime:n(a.time)}}},
  };

  const PERFORMANCE = {
    bacs:e=>n(e.correct),
    fluency:e=>n(e.unique),
    tmt:e=>-n(e.partATime,Infinity),
    cpt:e=>n(e.dPrime),
    lns:e=>n(e.totalCorrect),
    'spatial-span':e=>n(e.totalCorrect),
    hvlt:e=>n(e.totalLearning),
    bvmt:e=>n(e.totalLearning),
    mazes:e=>n(e.totalScore),
    msceit:e=>finite(e.rawScore)?Number(e.rawScore):n(e.correct),
  };

  function protocolSignature(testKey,result){
    const meta=result&&result._meta||{};
    const parts={testKey,taskVersion:meta.taskVersion||'unversioned',protocol:result&&result.protocol||'legacy'};
    if(testKey==='hvlt'){
      parts.materialFingerprint=result.materialFingerprint||result.material&&result.material.fingerprint||null;
      parts.materialVersion=result.materialVersion||result.material&&result.material.version||null;
      parts.setId=result.setId||result.material&&result.material.setId||null;
    }
    if(testKey==='msceit'){
      parts.itemSet=result.itemSet&&`${result.itemSet.id||''}:${result.itemSet.version||''}`||null;
      parts.scoringVersion=result.scoring&&result.scoring.version||null;
    }
    return JSON.stringify(parts);
  }

  function rankWithTies(items){
    const sorted=[...items].sort((a,b)=>a.value-b.value),N=sorted.length;
    if(!N)return[];
    let i=0;
    while(i<N){
      let j=i+1;while(j<N&&Math.abs(sorted[j].value-sorted[i].value)<1e-12)j++;
      const avg=(i+j-1)/2,index=N===1?50:Math.round(avg/(N-1)*1000)/10;
      for(let k=i;k<j;k++)sorted[k].rankIndex=index;
      i=j;
    }
    return sorted;
  }

  function compatibleDomainGroups(profiles,domain){
    const groups=new Map();
    for(const profile of profiles){
      const tasks=domain.tests.map(k=>profile.tests[k]);
      if(tasks.some(t=>!t||!t.extracted||t.eligibleForResearchScoring!==true))continue;
      const key=domain.tests.map(k=>`${k}:${profile.tests[k].signature}`).join('|');
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(profile);
    }
    return groups;
  }

  const internalNorm={
    name:'internal',version:'protocol-compatible-rank-0.4.0',provenance:'psy-exp QC-valid, protocol-compatible within-project tied ranks',
    label:'同协议项目内研究排名（非 MCCB 常模）',kind:'research',validated:false,
    apply(profiles,domains){
      for(const [domainKey,domain] of Object.entries(domains)){
        for(const [referenceKey,group] of compatibleDomainGroups(profiles,domain)){
          const byParticipant=new Map(group.map(p=>[p.id,[]]));
          for(const testKey of domain.tests){
            const perf=PERFORMANCE[testKey];if(!perf)continue;
            const ranked=rankWithTies(group.map(p=>({id:p.id,value:perf(p.tests[testKey].extracted)})).filter(x=>Number.isFinite(x.value)));
            ranked.forEach(x=>byParticipant.get(x.id)?.push({testKey,index:x.rankIndex}));
          }
          for(const profile of group){
            const parts=byParticipant.get(profile.id)||[];
            if(parts.length!==domain.tests.length)continue;
            const indexScore=Math.round(parts.reduce((s,x)=>s+x.index,0)/parts.length*10)/10;
            profile.domains[domainKey]={indexScore,cohortRankIndex:indexScore,cohortPercentile:null,tScore:null,testCount:parts.length,requiredTestCount:domain.tests.length,referenceN:group.length,referenceKey,testRanks:parts,scoreType:'research-cohort-rank-index',scoringVersion:SCORING_VERSION,normVersion:this.version};
          }
        }
      }
    }
  };

  const NORM_REGISTRY={internal:internalNorm};
  let activeNorm='internal';
  function registerNorm(norm){
    if(!norm||!norm.name||typeof norm.apply!=='function')throw new Error('norm 需含 name 和 apply(allProfiles, domains)');
    if(norm.validated===true&&(!norm.version||!norm.provenance||typeof norm.supportsTask!=='function'))throw new Error('validated norm 必须声明 version、provenance 和 supportsTask(testKey, task)');
    NORM_REGISTRY[norm.name]={kind:norm.kind||'custom',validated:norm.validated===true,label:norm.label||norm.name,version:norm.version||'unversioned',provenance:norm.provenance||'unspecified',...norm};
    return NORM_REGISTRY[norm.name];
  }
  function setNorm(name){if(!NORM_REGISTRY[name])throw new Error(`常模 "${name}" 未注册`);activeNorm=name;return activeNorm}
  function getNorm(){const x=NORM_REGISTRY[activeNorm];return{name:activeNorm,label:x.label,kind:x.kind,validated:x.validated===true,version:x.version,provenance:x.provenance,scoringVersion:SCORING_VERSION}}

  function getProfile(participantId){
    const pm=typeof window!=='undefined'?window.ParticipantManager:null;if(!participantId||!pm)return null;
    const data=pm.getData(participantId);if(!data)return null;
    const valid=data.results||{},invalid=data.invalidResults||{};
    if(!Object.keys(valid).length&&!Object.keys(invalid).length)return null;
    const profile={id:participantId,date:data.updatedAt||data.createdAt||null,tests:{},domains:{},composite:null,scoringStatus:'raw-only',scoringVersion:SCORING_VERSION,qcSummary:{valid:0,invalid:0,unverified:0}};
    for(const [testKey,metric] of Object.entries(TEST_METRICS)){
      const storageKey=KEY_TO_RESULT[testKey],result=valid[storageKey]||valid[testKey]||invalid[storageKey]||invalid[testKey];
      if(!result)continue;
      const qcStatus=getResultQcStatus(result),eligible=isResearchScorable(result);
      if(qcStatus==='valid')profile.qcSummary.valid++;else if(qcStatus==='unverified')profile.qcSummary.unverified++;else profile.qcSummary.invalid++;
      profile.tests[testKey]={label:metric.label,labelEn:metric.labelEn,extracted:metric.extract(result),raw:result,qcStatus,eligibleForResearchScoring:eligible,validation:TASK_VALIDATION[testKey],signature:protocolSignature(testKey,result),provenance:result._meta&&result._meta.provenance||null};
    }
    return profile;
  }

  function makeScoringProfiles(profiles,norm){
    return profiles.map(profile=>{
      const tests={};
      for(const [key,task] of Object.entries(profile.tests)){
        if(task.eligibleForResearchScoring!==true)continue;
        if(norm.validated===true&&!norm.supportsTask(key,task))continue;
        tests[key]=task;
      }
      return{id:profile.id,date:profile.date,tests,domains:{},composite:null,scoringStatus:'raw-only',scoringVersion:SCORING_VERSION};
    }).filter(p=>Object.keys(p.tests).length>0);
  }

  function getAllProfiles(){
    const pm=typeof window!=='undefined'?window.ParticipantManager:null;
    if(!pm)return{profiles:[],domains:DOMAINS,metrics:TEST_METRICS,validation:TASK_VALIDATION,norm:getNorm(),scoringVersion:SCORING_VERSION};
    const profiles=[];for(const id of pm.getAllParticipants()){const p=getProfile(id);if(p&&Object.keys(p.tests).length)profiles.push(p)}
    const norm=NORM_REGISTRY[activeNorm],scoringProfiles=makeScoringProfiles(profiles,norm);norm.apply(scoringProfiles,DOMAINS);
    const scoredById=new Map(scoringProfiles.map(p=>[p.id,p]));
    for(const profile of profiles){
      const scored=scoredById.get(profile.id);profile.domains=scored?scored.domains:{};
      const allSeven=Object.keys(DOMAINS).every(k=>profile.domains[k]&&Number.isFinite(profile.domains[k].tScore));
      if(norm.validated===true&&scored&&allSeven){const ts=Object.values(profile.domains).map(d=>d.tScore);profile.composite=Math.round(ts.reduce((a,b)=>a+b,0)/ts.length);profile.scoringStatus='validated-norm'}
      else{profile.composite=null;profile.scoringStatus=!scored?'qc-ineligible':norm.validated===true?'validated-norm-incomplete':'research-index-only'}
    }
    return{profiles,domains:DOMAINS,metrics:TEST_METRICS,validation:TASK_VALIDATION,norm:getNorm(),scoringVersion:SCORING_VERSION};
  }

  function getDomainSummary(profile){
    const out=[];
    for(const [key,domain] of Object.entries(DOMAINS)){
      const d=profile.domains[key];if(!d)continue;
      out.push({key,label:domain.label,labelEn:domain.labelEn,color:domain.color,tScore:Number.isFinite(d.tScore)?d.tScore:null,indexScore:Number.isFinite(d.indexScore)?d.indexScore:null,percentile:null,cohortRankIndex:Number.isFinite(d.cohortRankIndex)?d.cohortRankIndex:null,referenceN:d.referenceN||null,scoreType:d.scoreType||(Number.isFinite(d.tScore)?'validated-t-score':'unknown'),scoringVersion:d.scoringVersion||SCORING_VERSION,normVersion:d.normVersion||getNorm().version,tests:domain.tests.map(testKey=>({key:testKey,label:(profile.tests[testKey]||{}).label||testKey,qcStatus:(profile.tests[testKey]||{}).qcStatus||'missing',eligibleForResearchScoring:(profile.tests[testKey]||{}).eligibleForResearchScoring===true,validation:TASK_VALIDATION[testKey],...((profile.tests[testKey]||{}).extracted||{})}))});
    }
    return out;
  }

  return{SCORING_VERSION,getProfile,getAllProfiles,getDomainSummary,getResultQcStatus,isResearchScorable,registerNorm,setNorm,getNorm,DOMAINS,TEST_METRICS,TASK_VALIDATION};
})();
if(typeof window!=='undefined')window.MCCBScoring=MCCBScoring;
if(typeof module!=='undefined'&&module.exports)module.exports={MCCBScoring};
