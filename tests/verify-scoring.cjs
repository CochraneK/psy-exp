'use strict';
const path=require('path');
const {MCCBScoring:MCCB}=require(path.resolve(__dirname,'../mccb-scoring.js'));
function withQc(result,status='valid',taskVersion='fixture-v1'){return{...result,_meta:{schemaVersion:3,taskVersion,administration:'digital_research_adaptation',mccbEquivalent:false,sessionQc:{status,qc:{visibilityInterruptions:status==='interrupted'?1:0,timingViolation:status==='timing_violation',technicalFailure:status==='technical_failure',reasons:[]}}}}}
function makeResults(overrides={}){return Object.assign({
  'mccb-bacs-result':withQc({protocol:'synthetic-symbol-coding-v1',correct:88,attempted:90}),
  'mccb-fluency-result':withQc({protocol:'typed-animal-fluency-v1',total:32,unique:30}),
  'mccb-hvlt-result':withQc({protocol:'private-verbal-learning-v1',trial1:7,trial2:9,trial3:10,delayedRecall:9,materialFingerprint:'set-a'}),
  'mccb-bvmt-result':withQc({protocol:'synthetic-visual-pattern-v1',trials:[{score:9},{score:11},{score:12}],delayedRecall:{score:10},delayedScore:10}),
  'mccb-cpt-result':withQc({protocol:'custom-identical-pairs-v1',hits:110,misses:8,falseAlarms:10,meanHitRT:420,dPrime:3.2,totalTrials:150}),
  'mccb-msceit-result':withQc({protocol:'private-social-cognition-shell-v1',total:24,correct:18,rawScore:18,itemSet:{id:'set-a',version:'1'},scoring:{version:'score-1',rawScore:18,correct:18,total:24}}),
  'mccb-mazes-result':withQc({protocol:'generated-perfect-mazes-v1',totalScore:22,maxScore:26,completed:7,totalTime:540}),
  'mccb-spatial-span-result':withQc({protocol:'synthetic-spatial-sequence-v1',totalCorrect:19,maxLevel:7}),
  'mccb-lns-result':withQc({protocol:'synthetic-letter-number-ordering-v1',totalCorrect:21,maxLevel:8}),
  'mccb-tmt-result':withQc({protocol:'tmt-browser-v1',partA:{time:35,errors:0},partB:{time:75,errors:1}}),
},overrides)}
const mockData={
 P001:{cohortId:'P001',results:makeResults()},
 P002:{cohortId:'P002',results:makeResults({'mccb-bacs-result':withQc({protocol:'synthetic-symbol-coding-v1',correct:60,attempted:90}),'mccb-fluency-result':withQc({protocol:'typed-animal-fluency-v1',total:18,unique:16}),'mccb-cpt-result':withQc({protocol:'custom-identical-pairs-v1',hits:80,misses:30,falseAlarms:35,meanHitRT:520,dPrime:1.3,totalTrials:150}),'mccb-mazes-result':withQc({protocol:'generated-perfect-mazes-v1',totalScore:12,maxScore:26,completed:3,totalTime:800}),'mccb-tmt-result':withQc({protocol:'tmt-browser-v1',partA:{time:70,errors:2},partB:{time:40,errors:0}})})},
 P003:{cohortId:'P003',results:makeResults({'mccb-bacs-result':withQc({protocol:'synthetic-symbol-coding-v1',correct:100,attempted:100}),'mccb-cpt-result':withQc({protocol:'custom-identical-pairs-v1',hits:125,misses:3,falseAlarms:3,meanHitRT:380,dPrime:4.1,totalTrials:150}),'mccb-mazes-result':withQc({protocol:'generated-perfect-mazes-v1',totalScore:25,maxScore:26,completed:7,totalTime:400}),'mccb-tmt-result':withQc({protocol:'tmt-browser-v1',partA:{time:25,errors:0},partB:{time:999,errors:20}})})},
 P004:{cohortId:'P004',results:{'mccb-bacs-result':withQc({protocol:'synthetic-symbol-coding-v1',correct:75,attempted:80})}},
 P005:{cohortId:'P005',invalidResults:{'mccb-bacs-result':withQc({protocol:'synthetic-symbol-coding-v1',correct:109,attempted:110},'interrupted')}},
 P006:{cohortId:'P006',results:{'mccb-bacs-result':{correct:110,attempted:110}}},
 P007:{cohortId:'P007',results:makeResults({'mccb-cpt-result':withQc({protocol:'different-cpt-protocol',hits:130,misses:2,falseAlarms:2,dPrime:4.5,totalTrials:150})})},
 P008:{cohortId:'P008',results:makeResults()},
};
global.window={ParticipantManager:{getData:id=>mockData[id]||null,getAllParticipants:()=>Object.keys(mockData)}};
let pass=0,fail=0;function check(name,cond,detail=''){if(cond){pass++;console.log('  ✅ '+name)}else{fail++;console.log('  ❌ '+name+(detail?' — '+detail:''))}}
console.log('=== 1. Extraction + QC ===');
const p1=MCCB.getProfile('P001');check('all 10 tasks extracted',Object.keys(p1.tests).length===10);check('TMT uses Part A as MCCB-related metric',p1.tests.tmt.extracted.mccbTime===35);check('Part B remains supplemental',p1.tests.tmt.extracted.partBTime===75);check('BVMT object delayed score extracted',p1.tests.bvmt.extracted.delayedRecall===10);check('Maze numeric completed extracted',p1.tests.mazes.extracted.completed===7);check('task validation never claims equivalence',Object.values(MCCB.TASK_VALIDATION).every(x=>x.mccbEquivalent===false));
console.log('\n=== 2. Internal research ranking ===');
const bundle=MCCB.getAllProfiles(),byId=Object.fromEntries(bundle.profiles.map(p=>[p.id,p]));check('internal norm is unvalidated',bundle.norm.name==='internal'&&!bundle.norm.validated);check('no composite in research mode',bundle.profiles.every(p=>p.composite===null));check('no T score in research mode',bundle.profiles.every(p=>Object.values(p.domains).every(d=>d.tScore===null)));check('complete profile has seven domains',Object.keys(byId.P001.domains).length===7);check('partial speed battery stays missing',!byId.P004.domains.speed_processing);check('faster/better complete profile outranks slower profile',byId.P003.domains.speed_processing.indexScore>byId.P002.domains.speed_processing.indexScore);check('identical profiles tie',byId.P001.domains.speed_processing.indexScore===byId.P008.domains.speed_processing.indexScore);check('research score type explicit',Object.values(byId.P001.domains).every(d=>d.scoreType==='research-cohort-rank-index'));
console.log('\n=== 3. Protocol compatibility ===');
check('standard CPT-compatible group excludes mismatched protocol',byId.P001.domains.attention.referenceN===4,`N=${byId.P001.domains.attention.referenceN}`);check('mismatched CPT protocol is isolated',byId.P007.domains.attention.referenceN===1&&byId.P007.domains.attention.indexScore===50,JSON.stringify(byId.P007.domains.attention));
console.log('\n=== 4. Invalid/unverified isolation ===');
check('interrupted raw result remains visible',!!byId.P005.tests.bacs);check('interrupted result is not scorable',!byId.P005.tests.bacs.eligibleForResearchScoring);check('interrupted-only participant has no domains',Object.keys(byId.P005.domains).length===0);check('legacy result is unverified and unscored',byId.P006.tests.bacs.qcStatus==='unverified'&&Object.keys(byId.P006.domains).length===0);
console.log('\n=== 5. TMT Part B leakage ===');
check('catastrophic Part B cannot erase fast Part A',byId.P003.domains.speed_processing.indexScore>=byId.P001.domains.speed_processing.indexScore);
console.log('\n=== 6. Validated adapter contract ===');
let rejected=false;try{MCCB.registerNorm({name:'bad-validated',validated:true,version:'1',provenance:'fixture',apply(){}})}catch{rejected=true}check('validated adapter requires supportsTask',rejected);
let seen=[];MCCB.registerNorm({name:'mock-validated',label:'Mock validated',validated:true,kind:'test',version:'1',provenance:'fixture only',supportsTask:(key,task)=>task.qcStatus==='valid',apply(profiles,domains){seen=profiles.map(p=>({id:p.id,tests:Object.keys(p.tests)}));for(const p of profiles)for(const key of Object.keys(domains))p.domains[key]={tScore:50,scoreType:'validated-t-score'}}});MCCB.setNorm('mock-validated');const validated=MCCB.getAllProfiles(),v=Object.fromEntries(validated.profiles.map(p=>[p.id,p]));check('invalid-only participant never reaches validated adapter',!seen.some(x=>x.id==='P005'));check('unverified-only participant never reaches validated adapter',!seen.some(x=>x.id==='P006'));check('validated provenance exposed',validated.norm.version==='1'&&validated.norm.provenance==='fixture only');check('valid complete participant can receive composite',v.P001.composite===50);check('invalid/unverified composite stays null',v.P005.composite===null&&v.P006.composite===null);
console.log('\n=== 7. Unvalidated adapter cannot create composite ===');
MCCB.registerNorm({name:'mock-unvalidated',validated:false,apply(profiles,domains){for(const p of profiles)for(const key of Object.keys(domains))p.domains[key]={tScore:50}}});MCCB.setNorm('mock-unvalidated');check('unvalidated adapter cannot create composite',MCCB.getAllProfiles().profiles.every(p=>p.composite===null));
MCCB.setNorm('internal');
console.log(`\n=== Result: ${pass} passed / ${fail} failed ===`);process.exit(fail===0?0:1);
