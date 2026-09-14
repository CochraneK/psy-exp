'use strict';
const assert=require('assert');

class MemoryStorage{
  constructor(){this.map=new Map()}
  getItem(k){return this.map.has(k)?this.map.get(k):null}
  setItem(k,v){this.map.set(String(k),String(v))}
  removeItem(k){this.map.delete(String(k))}
  clear(){this.map.clear()}
  key(i){return [...this.map.keys()][i]??null}
  get length(){return this.map.size}
}

global.localStorage=new MemoryStorage();
const {ParticipantManager}=require('../mccb-participant.js');
global.window={ParticipantManager,localStorage:global.localStorage};
const {MCCBScoring}=require('../mccb-scoring.js');
global.window.MCCBScoring=MCCBScoring;
const Demo=require('../demo-data.js');

let passed=0;
function check(name,fn){try{fn();passed++;console.log('  ✅ '+name)}catch(e){console.error('  ❌ '+name+' — '+e.message);throw e}}

console.log('=== Synthetic demo data contract ===');
ParticipantManager.setCurrent('REAL-001');
check('real participant exists before demo seed',()=>assert(ParticipantManager.getAllParticipants().includes('REAL-001')));

const seeded=Demo.seed();
check('seeds exactly eight demo participants',()=>assert.strictEqual(seeded.count,8));
check('seed mix is six complete, one partial, one QC-edge',()=>assert.deepStrictEqual([seeded.complete,seeded.partial,seeded.qcEdge],[6,1,1]));
check('selects DEMO-001 after seeding',()=>assert.strictEqual(ParticipantManager.getCurrent(),'DEMO-001'));
check('does not delete pre-existing real participant',()=>assert(ParticipantManager.getAllParticipants().includes('REAL-001')));

const demo1=ParticipantManager.getData('DEMO-001');
check('complete demo has all ten completed tasks',()=>assert.strictEqual(Object.values(demo1.progress).filter(x=>x==='completed').length,10));
check('all demo results are explicitly synthetic and non-equivalent',()=>{
  for(const result of Object.values(demo1.results)){
    assert.strictEqual(result.demoSynthetic,true);
    assert.strictEqual(result._meta.administration,'synthetic_demo_only');
    assert.strictEqual(result._meta.mccbEquivalent,false);
    assert.strictEqual(result._meta.provenance.synthetic,true);
  }
});

const partial=ParticipantManager.getData('DEMO-007');
check('partial demo leaves five tasks unstarted',()=>assert.strictEqual(Object.values(partial.progress).filter(x=>x==='not_started').length,5));
const edge=ParticipantManager.getData('DEMO-008');
check('QC-edge demo stores CPT as timing-violation invalid result',()=>{
  assert.strictEqual(edge.progress.cpt,'completed_invalid');
  assert.strictEqual(edge.invalidResults['mccb-cpt-result']._meta.sessionQc.status,'timing_violation');
});
check('QC-edge demo leaves fluency semantically unreviewed',()=>assert.strictEqual(edge.results['mccb-fluency-result'].reviewStatus,'unreviewed'));

const bundle=MCCBScoring.getAllProfiles();
const p1=bundle.profiles.find(p=>p.id==='DEMO-001');
const domains=MCCBScoring.getDomainSummary(p1);
check('complete demo produces all seven research domains',()=>assert.strictEqual(domains.length,7));
check('every DEMO-001 domain has reference N >= 5',()=>assert(domains.every(d=>Number(d.referenceN)>=5)));
check('demo scoring stays research-index-only',()=>{
  assert.strictEqual(p1.composite,null);
  assert.strictEqual(p1.scoringStatus,'research-index-only');
  assert(domains.every(d=>d.tScore===null&&d.scoreType==='research-cohort-rank-index'));
});
const p8=bundle.profiles.find(p=>p.id==='DEMO-008');
check('edge demo is excluded from invalid CPT and unreviewed fluency scoring',()=>{
  assert.strictEqual(p8.tests.cpt.eligibleForResearchScoring,false);
  assert.strictEqual(p8.tests.fluency.eligibleForResearchScoring,false);
  assert.strictEqual(p8.tests.fluency.ineligibilityReason,'semantic_review_required');
});
check('demo protocol version is isolated from ordinary task versions',()=>assert(Object.values(demo1.results).every(r=>String(r._meta.taskVersion).startsWith('demo-'))));

const cleared=Demo.clear();
check('clear removes only the eight synthetic demo participants',()=>assert.strictEqual(cleared.removed,8));
check('real participant survives demo clear',()=>assert(ParticipantManager.getAllParticipants().includes('REAL-001')));
check('demo clear restores the pre-demo current participant',()=>assert.strictEqual(ParticipantManager.getCurrent(),'REAL-001'));
check('no demo IDs remain after clear',()=>assert.strictEqual(Demo.getDemoIds().length,0));

console.log(`\n=== Demo data: ${passed} checks passed ===`);
