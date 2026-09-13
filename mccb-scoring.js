/**
 * Research-safe cognitive scoring / aggregation.
 *
 * Browser tasks in this repository are digital research adaptations. Unless a
 * separately validated norm is explicitly registered, this module MUST NOT emit
 * values labelled as MCCB T scores, clinical percentiles, or an MCCB composite.
 * Every norm adapter — including a future validated adapter — receives only tasks
 * whose session QC status is explicitly `valid`.
 */

const MCCBScoring = (() => {
  const DOMAINS = {
    speed_processing: { label: '处理速度', labelEn: 'Speed of Processing', tests: ['bacs', 'fluency', 'tmt'], color: '#3498db', desc: '信息处理效率' },
    attention: { label: '注意/警觉', labelEn: 'Attention / Vigilance', tests: ['cpt'], color: '#2ecc71', desc: '持续注意力与警觉性' },
    working_memory: { label: '工作记忆', labelEn: 'Working Memory', tests: ['lns', 'spatial-span'], color: '#e67e22', desc: '言语与非言语工作记忆' },
    verbal_learning: { label: '言语学习', labelEn: 'Verbal Learning', tests: ['hvlt'], color: '#9b59b6', desc: '言语材料的习得与记忆' },
    visual_learning: { label: '视觉学习', labelEn: 'Visual Learning', tests: ['bvmt'], color: '#1abc9c', desc: '视觉信息的习得与记忆' },
    reasoning: { label: '推理与问题解决', labelEn: 'Reasoning & Problem Solving', tests: ['mazes'], color: '#e74c3c', desc: '执行功能与规划能力' },
    social_cognition: { label: '社会认知', labelEn: 'Social Cognition', tests: ['msceit'], color: '#f39c12', desc: '情绪管理与社交推理' },
  };

  const KEY_TO_RESULT = {
    tmt: 'mccb-tmt-result', bacs: 'mccb-bacs-result', fluency: 'mccb-fluency-result', cpt: 'mccb-cpt-result',
    'spatial-span': 'mccb-spatial-span-result', lns: 'mccb-lns-result', hvlt: 'mccb-hvlt-result', bvmt: 'mccb-bvmt-result',
    mazes: 'mccb-mazes-result', msceit: 'mccb-msceit-result',
  };

  const TASK_VALIDATION = {
    tmt: { mccbComponent: 'Trail Making Test Part A only', mccbEquivalent: false, note: 'Part B is supplemental and must not enter MCCB processing-speed scoring.' },
    bacs: { mccbComponent: 'BACS Symbol Coding', mccbEquivalent: false, note: 'Digital administration not equivalence-validated.' },
    fluency: { mccbComponent: 'Category Fluency: Animal Naming', mccbEquivalent: false, note: 'Typed self-administration differs from standard oral administration.' },
    cpt: { mccbComponent: 'CPT-IP', mccbEquivalent: false, note: 'Current browser implementation does not reproduce the full standardized CPT-IP protocol.' },
    'spatial-span': { mccbComponent: 'WMS-III Spatial Span', mccbEquivalent: false, note: 'Screen-based implementation differs from standardized board administration.' },
    lns: { mccbComponent: 'Letter-Number Span', mccbEquivalent: false, note: 'Visual self-administration differs from standardized oral administration.' },
    hvlt: { mccbComponent: 'HVLT-R', mccbEquivalent: false, note: 'Current visual/self-administered procedure differs from standardized oral presentation.' },
    bvmt: { mccbComponent: 'BVMT-R', mccbEquivalent: false, note: 'Digital drawing/scoring equivalence has not been established.' },
    mazes: { mccbComponent: 'NAB Mazes', mccbEquivalent: false, note: 'Digital implementation equivalence has not been established.' },
    msceit: { mccbComponent: 'MSCEIT Managing Emotions', mccbEquivalent: false, note: 'Digital implementation and scoring are not licensed/validated as official MCCB scoring.' },
  };

  const n = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  function getResultQcStatus(result) {
    const status = result && result._meta && result._meta.sessionQc && result._meta.sessionQc.status;
    return typeof status === 'string' ? status : 'unverified';
  }

  function isResearchScorable(result) {
    return getResultQcStatus(result) === 'valid';
  }

  const TEST_METRICS = {
    bacs: { label: '符号编码', labelEn: 'BACS Symbol Coding', extract(result) { const correct=n(result.correct),attempted=n(result.attempted); return { correct, attempted, accuracy: attempted>0?Math.round(correct/attempted*100):0 }; } },
    fluency: { label: '语义流畅性', labelEn: 'Category Fluency', extract(result) { const total=n(result.total??result.unique),unique=n(result.unique??result.total); return { total, unique }; } },
    hvlt: { label: '词语学习', labelEn: 'HVLT-R Verbal Learning', extract(result) { const trial1=n(result.trial1),trial2=n(result.trial2),trial3=n(result.trial3),delayedRecall=n(result.delayedRecall); return { trial1,trial2,trial3,totalLearning:trial1+trial2+trial3,delayedRecall,retention:trial3>0?Math.round(delayedRecall/trial3*100):null }; } },
    bvmt: { label: '视觉记忆', labelEn: 'BVMT-R Visual Memory', extract(result) { const trials=Array.isArray(result.trials)?result.trials:(Array.isArray(result.trialScores)?result.trialScores:[]),scores=trials.map(t=>n(typeof t==='object'?t.score:t)),delayedRecall=n(result.delayedRecall??result.delayedScore),last=scores.length?scores[scores.length-1]:0; return { trialScores:scores,totalLearning:scores.reduce((s,v)=>s+v,0),delayedRecall,trialsCompleted:scores.length,retention:last>0?Math.round(delayedRecall/last*100):null }; } },
    cpt: { label: '持续操作', labelEn: 'CPT-IP research adaptation', extract(result) { return { hits:n(result.hits),misses:n(result.misses),falseAlarms:n(result.falseAlarms),meanHitRT:n(result.meanHitRT??result.meanRT),meanFART:n(result.meanFART),dPrime:n(result.dPrime),totalTrials:n(result.totalTrials) }; } },
    msceit: { label: '情绪管理', labelEn: 'MSCEIT Managing Emotions research adaptation', extract(result) { const total=n(result.total),correct=n(result.correct); return { total,correct,accuracy:total>0?Math.round(correct/total*100):0,elapsed:n(result.elapsed) }; } },
    mazes: { label: '迷宫', labelEn: 'NAB Mazes research adaptation', extract(result) { return { totalScore:n(result.totalScore),maxScore:n(result.maxScore,26),completed:Array.isArray(result.completed)?result.completed.length:0,totalTime:n(result.totalTime) }; } },
    'spatial-span': { label: '空间广度', labelEn: 'Spatial Span research adaptation', extract(result) { return { totalCorrect:n(result.totalCorrect),maxLevel:n(result.maxLevel) }; } },
    lns: { label: '字母数字广度', labelEn: 'Letter-Number Span research adaptation', extract(result) { return { totalCorrect:n(result.totalCorrect),maxLevel:n(result.maxLevel) }; } },
    tmt: { label: '连线测验', labelEn: 'Trail Making Test', extract(result) { const a=result.partA||{},b=result.partB||{},partATime=n(a.time); return { partATime,partAErrors:n(a.errors),partBTime:n(b.time),partBErrors:n(b.errors),mccbTime:partATime }; } },
  };

  function estimateDomainContribution(domainKey, testKey, extracted) {
    const maps = {
      speed_processing: { bacs:e=>e.correct/110, fluency:e=>e.total/50, tmt:e=>Math.max(0,1-n(e.partATime,300)/300) },
      attention: { cpt:e=>e.dPrime/5 },
      working_memory: { lns:e=>e.totalCorrect/24, 'spatial-span':e=>e.totalCorrect/24 },
      verbal_learning: { hvlt:e=>e.totalLearning/36 }, visual_learning: { bvmt:e=>e.totalLearning/36 },
      reasoning: { mazes:e=>e.maxScore>0?e.totalScore/e.maxScore:0 }, social_cognition: { msceit:e=>e.total>0?e.correct/e.total:0 },
    };
    const fn=maps[domainKey]&&maps[domainKey][testKey]; if(!fn)return null; const value=fn(extracted); return Number.isFinite(value)?value:null;
  }

  function rankWithTies(values) {
    const sorted=[...values].sort((a,b)=>a.value-b.value),total=sorted.length;if(total===0)return[];let i=0;
    while(i<total){let j=i+1;while(j<total&&Math.abs(sorted[j].value-sorted[i].value)<1e-12)j++;const averageRank=(i+j-1)/2,percentile=total===1?50:Math.round(averageRank/(total-1)*100);for(let k=i;k<j;k++)sorted[k].cohortPercentile=percentile;i=j;}return sorted;
  }

  const internalNorm={name:'internal',label:'项目内探索性相对排名（非 MCCB 常模；不生成 T 分）',kind:'research',validated:false,apply(allProfiles,domains){for(const domainKey of Object.keys(domains)){const values=[];for(const profile of allProfiles){const contributions=[];for(const testKey of domains[domainKey].tests){const task=profile.tests[testKey];if(!task||!task.extracted)continue;const contribution=estimateDomainContribution(domainKey,testKey,task.extracted);if(contribution!=null)contributions.push(contribution);}if(!contributions.length)continue;values.push({id:profile.id,value:contributions.reduce((s,v)=>s+v,0)/contributions.length,testCount:contributions.length});}for(const ranked of rankWithTies(values)){const profile=allProfiles.find(p=>p.id===ranked.id);if(!profile)continue;profile.domains[domainKey]={rawIndex:Math.round(ranked.value*1000)/1000,indexScore:ranked.cohortPercentile,cohortPercentile:ranked.cohortPercentile,testCount:ranked.testCount,tScore:null,scoreType:'research-cohort-index'};}}}};

  const NORM_REGISTRY={internal:internalNorm};let activeNorm='internal';
  function registerNorm(norm){if(!norm||!norm.name||typeof norm.apply!=='function')throw new Error('norm 需含 name 和 apply(allProfiles, domains)');NORM_REGISTRY[norm.name]={kind:norm.kind||'custom',validated:norm.validated===true,label:norm.label||norm.name,...norm};return NORM_REGISTRY;}
  function setNorm(name){if(!NORM_REGISTRY[name])throw new Error(`常模 "${name}" 未注册`);activeNorm=name;return activeNorm;}
  function getNorm(){const norm=NORM_REGISTRY[activeNorm];return{name:activeNorm,label:norm.label,kind:norm.kind,validated:norm.validated===true};}

  function getProfile(participantId) {
    const pm=typeof window!=='undefined'?window.ParticipantManager:null;if(!participantId||!pm)return null;const data=pm.getData(participantId);if(!data)return null;
    const validResults=data.results||{},invalidResults=data.invalidResults||{};if(!Object.keys(validResults).length&&!Object.keys(invalidResults).length)return null;
    const profile={id:participantId,date:data.updatedAt||data.createdAt||null,tests:{},domains:{},composite:null,scoringStatus:'raw-only',qcSummary:{valid:0,invalid:0,unverified:0}};
    for(const [testKey,metrics] of Object.entries(TEST_METRICS)){const storageKey=KEY_TO_RESULT[testKey],result=validResults[storageKey]||validResults[testKey]||invalidResults[storageKey]||invalidResults[testKey];if(!result)continue;const qcStatus=getResultQcStatus(result),eligibleForResearchScoring=isResearchScorable(result);if(qcStatus==='valid')profile.qcSummary.valid++;else if(qcStatus==='unverified')profile.qcSummary.unverified++;else profile.qcSummary.invalid++;profile.tests[testKey]={label:metrics.label,labelEn:metrics.labelEn,extracted:metrics.extract(result),raw:result,qcStatus,eligibleForResearchScoring,validation:TASK_VALIDATION[testKey]};}
    return profile;
  }

  function makeScoringProfiles(profiles) {
    return profiles.map(profile => {
      const tests=Object.fromEntries(Object.entries(profile.tests).filter(([,task])=>task.eligibleForResearchScoring===true));
      return { id:profile.id,date:profile.date,tests,domains:{},composite:null,scoringStatus:'raw-only' };
    }).filter(profile=>Object.keys(profile.tests).length>0);
  }

  function getAllProfiles() {
    const pm=typeof window!=='undefined'?window.ParticipantManager:null;if(!pm)return{profiles:[],domains:DOMAINS,metrics:TEST_METRICS,validation:TASK_VALIDATION,norm:getNorm()};
    const profiles=[];for(const participantId of pm.getAllParticipants()){const profile=getProfile(participantId);if(profile&&Object.keys(profile.tests).length)profiles.push(profile);}
    const norm=NORM_REGISTRY[activeNorm];
    // QC boundary is enforced before any adapter sees data, not merely by the
    // default internal norm. Invalid/unverified raw tasks remain reportable only.
    const scoringProfiles=makeScoringProfiles(profiles);norm.apply(scoringProfiles,DOMAINS);const scoredById=new Map(scoringProfiles.map(p=>[p.id,p]));
    for(const profile of profiles){const scored=scoredById.get(profile.id);profile.domains=scored?scored.domains:{};const entries=Object.values(profile.domains),validatedScores=entries.map(d=>d&&d.tScore).filter(Number.isFinite),allSeven=Object.keys(DOMAINS).every(k=>profile.domains[k]&&Number.isFinite(profile.domains[k].tScore));if(norm.validated===true&&scored&&allSeven&&validatedScores.length===7){profile.composite=Math.round(validatedScores.reduce((s,v)=>s+v,0)/7);profile.scoringStatus='validated-norm';}else{profile.composite=null;profile.scoringStatus=!scored?'qc-ineligible':norm.validated===true?'validated-norm-incomplete':'research-index-only';}}
    return{profiles,domains:DOMAINS,metrics:TEST_METRICS,validation:TASK_VALIDATION,norm:getNorm()};
  }

  function getDomainSummary(profile){const summary=[];for(const[key,domain]of Object.entries(DOMAINS)){const d=profile.domains[key];if(!d)continue;summary.push({key,label:domain.label,labelEn:domain.labelEn,color:domain.color,tScore:Number.isFinite(d.tScore)?d.tScore:null,indexScore:Number.isFinite(d.indexScore)?d.indexScore:null,percentile:Number.isFinite(d.cohortPercentile)?d.cohortPercentile:null,scoreType:d.scoreType||(Number.isFinite(d.tScore)?'validated-t-score':'unknown'),tests:domain.tests.map(testKey=>({key:testKey,label:(profile.tests[testKey]||{}).label||testKey,qcStatus:(profile.tests[testKey]||{}).qcStatus||'missing',eligibleForResearchScoring:(profile.tests[testKey]||{}).eligibleForResearchScoring===true,validation:TASK_VALIDATION[testKey],...((profile.tests[testKey]||{}).extracted||{})}))});}return summary;}

  return{getProfile,getAllProfiles,getDomainSummary,getResultQcStatus,isResearchScorable,registerNorm,setNorm,getNorm,DOMAINS,TEST_METRICS,TASK_VALIDATION};
})();

if(typeof window!=='undefined')window.MCCBScoring=MCCBScoring;
if(typeof module!=='undefined'&&module.exports)module.exports={MCCBScoring};
