'use strict';
/**
 * Open-item review contract: the research console path that lets real data
 * pass the fluency semantic-review gate and the bwais open-item review gate
 * without bypassing QC or changing protocol signatures.
 */
const path=require('path');
class MemoryStorage{constructor(){this.map=new Map()}get length(){return this.map.size}key(i){return Array.from(this.map.keys())[i]??null}getItem(k){return this.map.has(k)?this.map.get(k):null}setItem(k,v){this.map.set(String(k),String(v))}removeItem(k){this.map.delete(String(k))}}
global.localStorage=new MemoryStorage();
const {ParticipantManager}=require(path.resolve(__dirname,'../mccb-participant.js'));
const {MCCBScoring:MCCB}=require(path.resolve(__dirname,'../mccb-scoring.js'));
global.window={ParticipantManager};
let pass=0,fail=0;function check(name,cond,detail=''){if(cond){pass++;console.log('  ✅ '+name)}else{fail++;console.log('  ❌ '+name+(detail?' — '+detail:''))}}
function bwaisResult(overrides={}){return Object.assign({
  test:'简易韦氏 4 分测验研究协议',
  protocol:'brief-wais-4subtest-private-shell-v1',
  date:'2026-09-30T00:00:00.000Z',
  materialSet:{id:'set-r',version:'1',fingerprint:'fp-review'},
  knowledge:{rawScore:null,maxScore:29,administered:29,answers:{1:'猫',2:'狗'}},
  similarities:{rawScore:null,maxScore:26,administered:13,answers:{1:'都是动物'}},
  pictureCompletion:{rawScore:null,maxScore:21,administered:21,answers:{1:{item:1,answer:'缺角',timeMs:12000,timedOut:false}}},
  blockDesign:{rawScore:36,maxScore:48,administered:10,items:[{item:1,score:4,timeMs:10000,attempts:1}]},
  reviewStatus:'unreviewed'
},overrides)}
console.log('=== 1. Unreviewed bwais is blocked by the open-item gate ===');
check('create R001',ParticipantManager.setCurrent('R001')===true);
check('start bwais session',ParticipantManager.markInProgress('bwais')===true);
check('save unreviewed bwais',ParticipantManager.saveResult('bwais',bwaisResult())===true);
let profile=MCCB.getProfile('R001');
let before=profile.tests.bwais;
check('unreviewed bwais visible with null raws',before.extracted.knowledge===null&&before.extracted.total===null);
check('qc valid, so ineligibility is review-only',before.qcStatus==='valid');
check('unreviewed bwais ineligible',before.eligibleForResearchScoring===false&&before.ineligibilityReason==='open_item_review_required');
const sigBefore=before.signature;
console.log('\n=== 2. Invalid review inputs are rejected without side effects ===');
check('invalid status rejected',ParticipantManager.reviewBwais({knowledge:24,similarities:18,pictureCompletion:17},'maybe')===false);
check('missing scores rejected',ParticipantManager.reviewBwais(null,'verified')===false);
check('over-max knowledge rejected',ParticipantManager.reviewBwais({knowledge:30,similarities:18,pictureCompletion:17},'verified')===false);
check('negative similarities rejected',ParticipantManager.reviewBwais({knowledge:24,similarities:-1,pictureCompletion:17},'verified')===false);
check('non-numeric picture rejected',ParticipantManager.reviewBwais({knowledge:24,similarities:18,pictureCompletion:'高'},'verified')===false);
check('partial scores rejected',ParticipantManager.reviewBwais({knowledge:24,similarities:18},'verified')===false);
let d=ParticipantManager.getData('R001');
check('failed reviews leave canonical result untouched',d.results['mccb-bwais-result'].reviewStatus==='unreviewed'&&d.results['mccb-bwais-result'].knowledge.rawScore===null&&!d.results['mccb-bwais-result'].openReview);
console.log('\n=== 3. Verify requires the auto-scored block design component ===');
check('create R002',ParticipantManager.setCurrent('R002')===true);
check('start bwais',ParticipantManager.markInProgress('bwais')===true);
check('save bwais without block auto-score',ParticipantManager.saveResult('bwais',bwaisResult({blockDesign:{rawScore:null,maxScore:48,administered:0,items:[]}}))===true);
check('verify without block auto-score rejected',ParticipantManager.reviewBwais({knowledge:24,similarities:18,pictureCompletion:17},'verified')===false);
console.log('\n=== 4. Valid verified review passes the gate ===');
check('verify R001 with in-range scores',ParticipantManager.setCurrent('R001')===true&&ParticipantManager.reviewBwais({knowledge:24,similarities:18,pictureCompletion:17},'verified','reviewer-1')===true);
d=ParticipantManager.getData('R001');const r=d.results['mccb-bwais-result'];
check('open-item raw scores persisted',r.knowledge.rawScore===24&&r.similarities.rawScore===18&&r.pictureCompletion.rawScore===17);
check('review status verified',r.reviewStatus==='verified');
check('open review metadata persisted',r.openReview.status==='verified'&&r.openReview.reviewer==='reviewer-1'&&!!r.openReview.reviewedAt);
check('open review stores assigned scores',r.openReview.scores.knowledge===24&&r.openReview.scores.similarities===18&&r.openReview.scores.pictureCompletion===17&&r.openReview.scores.blockDesign===36);
check('total recomputed across all four subtests',r.total===24+18+17+36);
profile=MCCB.getProfile('R001');
check('reviewed bwais eligible',profile.tests.bwais.eligibleForResearchScoring===true&&profile.tests.bwais.ineligibilityReason===null);
check('extracted total correct',profile.tests.bwais.extracted.total===95);
check('protocol signature unchanged by review',profile.tests.bwais.signature===sigBefore);
check('attempt history entry annotated',ParticipantManager.getAttemptHistory('bwais')[0].reviewStatus==='verified');
check('scoped convenience key stays in sync',JSON.parse(localStorage.getItem('mccb-participant-R001-mccb-bwais-result')).reviewStatus==='verified');
console.log('\n=== 5. Rejection keeps the gate closed ===');
check('create R003',ParticipantManager.setCurrent('R003')===true);
check('start bwais',ParticipantManager.markInProgress('bwais')===true);
check('save unreviewed bwais',ParticipantManager.saveResult('bwais',bwaisResult())===true);
check('reject R003',ParticipantManager.reviewBwais(null,'rejected','reviewer-1')===true);
let d3=ParticipantManager.getData('R003');
check('rejected status persisted with metadata',d3.results['mccb-bwais-result'].reviewStatus==='rejected'&&d3.results['mccb-bwais-result'].openReview.status==='rejected');
profile=MCCB.getProfile('R003');
check('rejected remains ineligible for the same reason',profile.tests.bwais.eligibleForResearchScoring===false&&profile.tests.bwais.ineligibilityReason==='open_item_review_required');
check('review on participant without result fails',ParticipantManager.setCurrent('R004')===true&&ParticipantManager.reviewBwais({knowledge:1,similarities:1,pictureCompletion:1},'verified')===false);
console.log('\n=== 6. Re-review replaces the assignment ===');
check('move R001 to rejected',ParticipantManager.setCurrent('R001')===true&&ParticipantManager.reviewBwais(null,'rejected')===true);
check('re-verify with new scores',ParticipantManager.reviewBwais({knowledge:25,similarities:17,pictureCompletion:16},'verified','reviewer-2')===true);
d=ParticipantManager.getData('R001');
check('latest scores win',d.results['mccb-bwais-result'].knowledge.rawScore===25&&d.results['mccb-bwais-result'].total===25+17+16+36);
check('reviewer updated',d.results['mccb-bwais-result'].openReview.reviewer==='reviewer-2');
check('single canonical history entry stays updated',ParticipantManager.getAttemptHistory('bwais').length===1&&ParticipantManager.getAttemptHistory('bwais')[0].openReview.scores.knowledge===25);
console.log('\n=== 7. Fluency semantic review end-to-end ===');
check('create R005',ParticipantManager.setCurrent('R005')===true);
check('start fluency',ParticipantManager.markInProgress('fluency')===true);
check('save unreviewed fluency',ParticipantManager.saveResult('fluency',{protocol:'typed-animal-fluency-v1',total:4,unique:4,entries:['猫','狗','鲸','象']})===true);
profile=MCCB.getProfile('R005');
check('unreviewed fluency gated',profile.tests.fluency.eligibleForResearchScoring===false&&profile.tests.fluency.ineligibilityReason==='semantic_review_required');
check('verify fluency semantics',ParticipantManager.reviewFluency('verified','reviewer-1')===true);
profile=MCCB.getProfile('R005');
check('reviewed fluency eligible',profile.tests.fluency.eligibleForResearchScoring===true);
console.log('\n=== 8. Bundle level ===');
const bundle=MCCB.getAllProfiles();
check('bundle includes reviewed eligible bwais',bundle.profiles.some(p=>p.id==='R001'&&p.tests.bwais&&p.tests.bwais.eligibleForResearchScoring===true));
check('unreviewed/rejected bwais stay out of scoring',!bundle.profiles.find(p=>p.id==='R003').tests.bwais.eligibleForResearchScoring);
console.log(`\n=== Result: ${pass} passed / ${fail} failed ===`);
process.exit(fail===0?0:1);
