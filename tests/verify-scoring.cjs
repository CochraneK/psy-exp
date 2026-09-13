'use strict';

/**
 * Scoring safety verification.
 *
 * Protects the distinction between:
 *   1) raw / exploratory within-project indices, and
 *   2) validated MCCB-style T scores/composites.
 *
 * It also verifies that only sessions explicitly marked QC=valid enter research
 * group-comparison indices.
 */

const path = require('path');
const { MCCBScoring: MCCB } = require(path.resolve(__dirname, '../mccb-scoring.js'));

function withQc(result, status = 'valid') {
  return {
    ...result,
    _meta: {
      schemaVersion: 2,
      taskVersion: 'test-fixture',
      administration: 'digital_research_adaptation',
      mccbEquivalent: false,
      sessionQc: {
        status,
        qc: {
          visibilityInterruptions: status === 'interrupted' ? 1 : 0,
          timingViolation: status === 'timing_violation',
          technicalFailure: status === 'technical_failure',
          reasons: [],
        },
      },
    },
  };
}

function makeResults(overrides = {}) {
  return Object.assign({
    'mccb-bacs-result':         withQc({ correct: 88, attempted: 90 }),
    'mccb-fluency-result':      withQc({ total: 32, unique: 30 }),
    'mccb-hvlt-result':         withQc({ trial1: 7, trial2: 9, trial3: 10, delayedRecall: 9 }),
    'mccb-bvmt-result':         withQc({ trials: [{ score: 9 }, { score: 11 }, { score: 12 }], delayedRecall: 10 }),
    'mccb-cpt-result':          withQc({ hits: 110, misses: 8, falseAlarms: 10, meanHitRT: 420, dPrime: 3.2, totalTrials: 150 }),
    'mccb-msceit-result':       withQc({ total: 24, correct: 18, elapsed: 120000 }),
    'mccb-mazes-result':        withQc({ totalScore: 22, maxScore: 26, completed: [1, 2, 3, 4, 5, 6, 7], totalTime: 540 }),
    'mccb-spatial-span-result': withQc({ totalCorrect: 19, maxLevel: 7 }),
    'mccb-lns-result':          withQc({ totalCorrect: 21, maxLevel: 8 }),
    'mccb-tmt-result':          withQc({ partA: { time: 35, errors: 0 }, partB: { time: 75, errors: 1 } }),
  }, overrides);
}

const mockData = {
  P001: { cohortId: 'P001', results: makeResults() },
  P002: { cohortId: 'P002', results: makeResults({
    'mccb-bacs-result': withQc({ correct: 60, attempted: 90 }),
    'mccb-fluency-result': withQc({ total: 18, unique: 16 }),
    'mccb-cpt-result': withQc({ hits: 80, misses: 30, falseAlarms: 35, meanHitRT: 520, dPrime: 1.3, totalTrials: 150 }),
    'mccb-mazes-result': withQc({ totalScore: 12, maxScore: 26, completed: [1, 2, 3], totalTime: 800 }),
    'mccb-tmt-result': withQc({ partA: { time: 70, errors: 2 }, partB: { time: 40, errors: 0 } }),
  }) },
  P003: { cohortId: 'P003', results: makeResults({
    'mccb-bacs-result': withQc({ correct: 100, attempted: 100 }),
    'mccb-cpt-result': withQc({ hits: 125, misses: 3, falseAlarms: 3, meanHitRT: 380, dPrime: 4.1, totalTrials: 150 }),
    'mccb-mazes-result': withQc({ totalScore: 25, maxScore: 26, completed: [1, 2, 3, 4, 5, 6, 7], totalTime: 400 }),
    'mccb-tmt-result': withQc({ partA: { time: 25, errors: 0 }, partB: { time: 999, errors: 20 } }),
  }) },
  // Incomplete but valid BACS: missing domains remain missing, not floor scores.
  P004: { cohortId: 'P004', results: {
    'mccb-bacs-result': withQc({ correct: 75, attempted: 80 }),
  } },
  // Interrupted BACS remains visible as raw data but must not enter the rank pool.
  P005: { cohortId: 'P005', results: {
    'mccb-bacs-result': withQc({ correct: 109, attempted: 110 }, 'interrupted'),
  } },
  // Legacy record with no QC envelope is unverified and must also stay out.
  P006: { cohortId: 'P006', results: {
    'mccb-bacs-result': { correct: 110, attempted: 110 },
  } },
};

global.window = {
  ParticipantManager: {
    getData(id) { return mockData[id] || null; },
    getAllParticipants() { return Object.keys(mockData); },
  },
};

let pass = 0;
let fail = 0;
function check(name, condition, detail = '') {
  if (condition) {
    pass++;
    console.log('  ✅ ' + name);
  } else {
    fail++;
    console.log('  ❌ ' + name + (detail ? ' — ' + detail : ''));
  }
}

console.log('=== 1. Raw metric extraction + QC metadata ===');
const p1 = MCCB.getProfile('P001');
check('returns profile', !!p1);
check('extracts all 10 tasks', Object.keys(p1.tests).length === 10, Object.keys(p1.tests).length + ' tasks');
check('HVLT total learning = 26', p1.tests.hvlt.extracted.totalLearning === 26);
check('BVMT total learning = 32', p1.tests.bvmt.extracted.totalLearning === 32);
check('TMT exposes Part A = 35', p1.tests.tmt.extracted.partATime === 35);
check('TMT keeps Part B as supplemental = 75', p1.tests.tmt.extracted.partBTime === 75);
check('TMT MCCB time uses Part A only', p1.tests.tmt.extracted.mccbTime === 35);
check('validation metadata is present', p1.tests.tmt.validation && p1.tests.tmt.validation.mccbEquivalent === false);
check('valid fixture is research-scorable', p1.tests.bacs.qcStatus === 'valid' && p1.tests.bacs.eligibleForResearchScoring === true);

console.log('\n=== 2. Default internal mode is research-only ===');
const all = MCCB.getAllProfiles();
check('default norm is internal', all.norm.name === 'internal');
check('default norm is explicitly unvalidated', all.norm.validated === false);
check('default norm label states non-MCCB', /非 MCCB/.test(all.norm.label));
check('all profiles have null composite in research mode', all.profiles.every(p => p.composite === null));
check('no internal domain emits a T score', all.profiles.every(p => Object.values(p.domains).every(d => d.tScore === null)));
check('research domains expose an index score', all.profiles.some(p => Object.values(p.domains).some(d => Number.isFinite(d.indexScore))));

const byId = Object.fromEntries(all.profiles.map(p => [p.id, p]));
check('incomplete P004 has speed-processing domain', !!byId.P004.domains.speed_processing);
check('incomplete P004 does not get missing attention domain', !byId.P004.domains.attention);
check('P003 faster Part A outranks P002 on processing index',
  byId.P003.domains.speed_processing.indexScore > byId.P002.domains.speed_processing.indexScore,
  `P003=${byId.P003.domains.speed_processing.indexScore}, P002=${byId.P002.domains.speed_processing.indexScore}`);

console.log('\n=== 3. Invalid / unverified sessions are raw-only ===');
check('interrupted raw task remains visible', !!byId.P005.tests.bacs);
check('interrupted task is marked ineligible', byId.P005.tests.bacs.qcStatus === 'interrupted' && byId.P005.tests.bacs.eligibleForResearchScoring === false);
check('interrupted-only profile has no ranked domain', !byId.P005.domains.speed_processing);
check('legacy task is marked unverified', byId.P006.tests.bacs.qcStatus === 'unverified');
check('legacy task is not research-scorable by default', byId.P006.tests.bacs.eligibleForResearchScoring === false);
check('legacy-only profile has no ranked domain', !byId.P006.domains.speed_processing);

console.log('\n=== 4. TMT Part B must not affect MCCB-side contribution ===');
check('catastrophic Part B does not erase fast Part A advantage',
  byId.P003.domains.speed_processing.indexScore >= byId.P001.domains.speed_processing.indexScore,
  `P003=${byId.P003.domains.speed_processing.indexScore}, P001=${byId.P001.domains.speed_processing.indexScore}`);

console.log('\n=== 5. Domain summary distinguishes research index from T score ===');
const summary = MCCB.getDomainSummary(byId.P001);
check('summary has seven available domains for complete profile', summary.length === 7, summary.length + ' domains');
check('summary T scores are null in internal mode', summary.every(d => d.tScore === null));
check('summary score type is research-cohort-index', summary.every(d => d.scoreType === 'research-cohort-index'));
check('summary exposes cohort percentile/index', summary.every(d => Number.isFinite(d.indexScore)));
check('summary exposes task QC', summary.flatMap(d => d.tests).some(t => t.qcStatus === 'valid'));

console.log('\n=== 6. Validated norm gate ===');
MCCB.registerNorm({
  name: 'mock-unvalidated',
  label: 'Mock unvalidated norm',
  validated: false,
  apply(profiles, domains) {
    for (const p of profiles) {
      for (const key of Object.keys(domains)) p.domains[key] = { tScore: 50 };
    }
  },
});
MCCB.setNorm('mock-unvalidated');
const unvalidated = MCCB.getAllProfiles();
check('unvalidated custom norm cannot create composite', unvalidated.profiles.every(p => p.composite === null));

MCCB.registerNorm({
  name: 'mock-validated',
  label: 'Mock validated norm for contract test',
  validated: true,
  kind: 'test',
  apply(profiles, domains) {
    for (const p of profiles) {
      for (const key of Object.keys(domains)) p.domains[key] = { tScore: 50, scoreType: 'validated-t-score' };
    }
  },
});
MCCB.setNorm('mock-validated');
const validated = MCCB.getAllProfiles();
check('validated norm is marked validated', validated.norm.validated === true);
check('validated complete profiles can create composite', validated.profiles.every(p => p.composite === 50));
check('validated status is explicit', validated.profiles.every(p => p.scoringStatus === 'validated-norm'));

console.log('\n=== 7. Error handling ===');
let threwUnknown = false;
try { MCCB.setNorm('does-not-exist'); } catch { threwUnknown = true; }
check('unknown norm throws', threwUnknown);
let threwBad = false;
try { MCCB.registerNorm({ name: 'bad' }); } catch { threwBad = true; }
check('norm without apply throws', threwBad);

MCCB.setNorm('internal');
console.log(`\n=== Result: ${pass} passed / ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
