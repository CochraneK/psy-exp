'use strict';

/**
 * Scoring safety verification.
 * Protects raw/research/validated boundaries and the global session-QC gate.
 */
const path = require('path');
const { MCCBScoring: MCCB } = require(path.resolve(__dirname, '../mccb-scoring.js'));

function withQc(result, status = 'valid') {
  return { ...result, _meta: { schemaVersion: 3, taskVersion: 'test-fixture', runtimeVersion:'test-runtime', provenance:{runtimeVersion:'test-runtime',taskVersion:'test-fixture',source:'fixture'}, administration: 'digital_research_adaptation', mccbEquivalent: false, sessionQc: { status, qc: { visibilityInterruptions: status === 'interrupted' ? 1 : 0, timingViolation: status === 'timing_violation', technicalFailure: status === 'technical_failure', reasons: [] } } } };
}
function makeResults(overrides = {}) {
  return Object.assign({
    'mccb-bacs-result':withQc({correct:88,attempted:90}),
    'mccb-fluency-result':withQc({total:32,unique:30}),
    'mccb-hvlt-result':withQc({trial1:7,trial2:9,trial3:10,delayedRecall:9}),
    'mccb-bvmt-result':withQc({trials:[{score:9},{score:11},{score:12}],delayedRecall:10}),
    'mccb-cpt-result':withQc({hits:110,misses:8,falseAlarms:10,meanHitRT:420,dPrime:3.2,totalTrials:150}),
    'mccb-msceit-result':withQc({total:24,correct:18,elapsed:120000}),
    'mccb-mazes-result':withQc({totalScore:22,maxScore:26,completed:[1,2,3,4,5,6,7],totalTime:540}),
    'mccb-spatial-span-result':withQc({totalCorrect:19,maxLevel:7}),
    'mccb-lns-result':withQc({totalCorrect:21,maxLevel:8}),
    'mccb-tmt-result':withQc({partA:{time:35,errors:0},partB:{time:75,errors:1}}),
  }, overrides);
}
const mockData={
  P001:{cohortId:'P001',results:makeResults()},
  P002:{cohortId:'P002',results:makeResults({'mccb-bacs-result':withQc({correct:60,attempted:90}),'mccb-fluency-result':withQc({total:18,unique:16}),'mccb-cpt-result':withQc({hits:80,misses:30,falseAlarms:35,meanHitRT:520,dPrime:1.3,totalTrials:150}),'mccb-mazes-result':withQc({totalScore:12,maxScore:26,completed:[1,2,3],totalTime:800}),'mccb-tmt-result':withQc({partA:{time:70,errors:2},partB:{time:40,errors:0}})})},
  P003:{cohortId:'P003',results:makeResults({'mccb-bacs-result':withQc({correct:100,attempted:100}),'mccb-cpt-result':withQc({hits:125,misses:3,falseAlarms:3,meanHitRT:380,dPrime:4.1,totalTrials:150}),'mccb-mazes-result':withQc({totalScore:25,maxScore:26,completed:[1,2,3,4,5,6,7],totalTime:400}),'mccb-tmt-result':withQc({partA:{time:25,errors:0},partB:{time:999,errors:20}})})},
  P004:{cohortId:'P004',results:{'mccb-bacs-result':withQc({correct:75,attempted:80})}},
  P005:{cohortId:'P005',invalidResults:{'mccb-bacs-result':withQc({correct:109,attempted:110},'interrupted')}},
  P006:{cohortId:'P006',results:{'mccb-bacs-result':{correct:110,attempted:110}}},
};
global.window={ParticipantManager:{getData(id){return mockData[id]||null},getAllParticipants(){return Object.keys(mockData)}}};

let pass=0,fail=0;function check(name,condition,detail=''){if(condition){pass++;console.log('  ✅ '+name)}else{fail++;console.log('  ❌ '+name+(detail?' — '+detail:''))}}

console.log('=== 1. Raw metric extraction + QC ===');
const p1=MCCB.getProfile('P001');
check('returns profile',!!p1);check('extracts all 10 tasks',Object.keys(p1.tests).length===10);check('HVLT total learning = 26',p1.tests.hvlt.extracted.totalLearning===26);check('TMT MCCB time uses Part A only',p1.tests.tmt.extracted.mccbTime===35);check('Part B retained as supplemental',p1.tests.tmt.extracted.partBTime===75);check('validation metadata present',p1.tests.tmt.validation.mccbEquivalent===false);check('timing metadata present',p1.tests.cpt.validation.timingStatus==='instrumented-timeout');check('valid fixture is scorable',p1.tests.bacs.eligibleForResearchScoring===true);check('raw provenance exposed',p1.tests.bacs.provenance&&p1.tests.bacs.provenance.source==='fixture');check('scoring version explicit',typeof MCCB.SCORING_VERSION==='string'&&MCCB.SCORING_VERSION.length>0);

console.log('\n=== 2. Internal mode is research-only ===');
const all=MCCB.getAllProfiles(),byId=Object.fromEntries(all.profiles.map(p=>[p.id,p]));
check('internal norm unvalidated',all.norm.name==='internal'&&all.norm.validated===false);check('internal norm versioned',/^internal-rank-/.test(all.norm.version));check('internal norm provenance explicit',/project-local/.test(all.norm.provenance));check('bundle exposes scoring version',all.scoringVersion===MCCB.SCORING_VERSION);check('all composites null',all.profiles.every(p=>p.composite===null));check('no internal T score',all.profiles.every(p=>Object.values(p.domains).every(d=>d.tScore===null)));check('valid complete profile has seven domains',Object.keys(byId.P001.domains).length===7);check('missing P004 attention stays missing',!byId.P004.domains.attention);check('P003 fast Part A outranks P002',byId.P003.domains.speed_processing.indexScore>byId.P002.domains.speed_processing.indexScore);

console.log('\n=== 3. Invalid/unverified are audit-only ===');
check('invalidResults attempt visible',!!byId.P005.tests.bacs);check('interrupted ineligible',byId.P005.tests.bacs.qcStatus==='interrupted'&&!byId.P005.tests.bacs.eligibleForResearchScoring);check('interrupted-only profile has no domains',Object.keys(byId.P005.domains).length===0);check('legacy record unverified',byId.P006.tests.bacs.qcStatus==='unverified');check('legacy-only profile has no domains',Object.keys(byId.P006.domains).length===0);check('QC-ineligible status explicit',byId.P005.scoringStatus==='qc-ineligible'&&byId.P006.scoringStatus==='qc-ineligible');

console.log('\n=== 4. Part B leakage guard ===');
check('catastrophic Part B does not erase Part A advantage',byId.P003.domains.speed_processing.indexScore>=byId.P001.domains.speed_processing.indexScore);

console.log('\n=== 5. Domain summary ===');
const summary=MCCB.getDomainSummary(byId.P001);check('seven domains',summary.length===7);check('research score type explicit',summary.every(d=>d.scoreType==='research-cohort-index'));check('T scores null',summary.every(d=>d.tScore===null));check('domain scoring version explicit',summary.every(d=>d.scoringVersion===MCCB.SCORING_VERSION));check('domain norm version explicit',summary.every(d=>/^internal-rank-/.test(d.normVersion)));check('task QC exposed',summary.flatMap(d=>d.tests).some(t=>t.qcStatus==='valid'));

console.log('\n=== 6. Validated adapter provenance contract + QC gate ===');
let threw=false;try{MCCB.registerNorm({name:'invalid-validated-contract',validated:true,apply(){}})}catch{threw=true}check('validated norm without version/provenance is rejected',threw);
let seenByValidated=[];
MCCB.registerNorm({name:'mock-validated',label:'Mock validated norm',validated:true,kind:'test',version:'fixture-norm-1',provenance:'known-answer unit-test fixture',apply(profiles,domains){seenByValidated=profiles.map(p=>({id:p.id,tests:Object.keys(p.tests)}));for(const p of profiles){for(const key of Object.keys(domains))p.domains[key]={tScore:50,scoreType:'validated-t-score'};}}});
MCCB.setNorm('mock-validated');const validated=MCCB.getAllProfiles(),vById=Object.fromEntries(validated.profiles.map(p=>[p.id,p]));
check('validated flag true',validated.norm.validated===true);check('validated norm version retained',validated.norm.version==='fixture-norm-1');check('validated norm provenance retained',/known-answer/.test(validated.norm.provenance));check('adapter never receives invalid-only P005',!seenByValidated.some(p=>p.id==='P005'));check('adapter never receives unverified-only P006',!seenByValidated.some(p=>p.id==='P006'));check('adapter receives only valid tasks',seenByValidated.every(p=>p.tests.length>0));check('valid profiles can receive composite',vById.P001.composite===50&&vById.P002.composite===50&&vById.P003.composite===50&&vById.P004.composite===50);check('invalid-only profile composite stays null',vById.P005.composite===null&&vById.P005.scoringStatus==='qc-ineligible');check('unverified-only profile composite stays null',vById.P006.composite===null&&vById.P006.scoringStatus==='qc-ineligible');

console.log('\n=== 7. Unvalidated adapter cannot create composite ===');
MCCB.registerNorm({name:'mock-unvalidated',label:'Mock unvalidated',validated:false,version:'fixture-unvalidated-1',provenance:'unit-test',apply(profiles,domains){for(const p of profiles){for(const key of Object.keys(domains))p.domains[key]={tScore:50};}}});MCCB.setNorm('mock-unvalidated');const unvalidated=MCCB.getAllProfiles();check('unvalidated adapter cannot create composite',unvalidated.profiles.every(p=>p.composite===null));

console.log('\n=== 8. Error handling ===');
threw=false;try{MCCB.setNorm('does-not-exist')}catch{threw=true}check('unknown norm throws',threw);threw=false;try{MCCB.registerNorm({name:'bad'})}catch{threw=true}check('norm without apply throws',threw);
MCCB.setNorm('internal');console.log(`\n=== Result: ${pass} passed / ${fail} failed ===`);process.exit(fail===0?0:1);
