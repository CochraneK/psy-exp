'use strict';

const path = require('path');

class MemoryStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(i) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
}

global.localStorage = new MemoryStorage();

const {
  ParticipantManager,
  ExperimentRuntime,
  isValidCohortId,
  RESULT_SCHEMA_VERSION,
  PARTICIPANT_SCHEMA_VERSION,
} = require(path.resolve(__dirname, '../mccb-participant.js'));

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

console.log('=== 1. Participant ID validation ===');
check('safe ID accepted', isValidCohortId('ABC-001_2.test'));
check('empty ID rejected', !isValidCohortId(''));
check('whitespace/slash rejected', !isValidCohortId('ABC 001/2'));
check('overlong ID rejected', !isValidCohortId('A'.repeat(65)));
check('invalid ID cannot become current', ParticipantManager.setCurrent('../x') === false);

console.log('\n=== 2. Participant schema and valid completion ===');
check('set current succeeds', ParticipantManager.setCurrent('P001') === true);
let data = ParticipantManager.getData('P001');
check('participant schema version stored', data.schemaVersion === PARTICIPANT_SCHEMA_VERSION);
check('new participant has result/session/audit containers', data.results && data.invalidResults && data.sessions);

check('markInProgress starts QC session', ParticipantManager.markInProgress('cpt') === true);
const running = ExperimentRuntime.snapshot('cpt');
check('runtime status starts valid', running && running.status === 'valid');
check('runtime uses a clock', !!running.clock);

check('save valid result succeeds', ParticipantManager.saveResult('cpt', { hits: 10, falseAlarms: 1, dPrime: 2.1 }) === true);
data = ParticipantManager.getData('P001');
const cpt = data.results['mccb-cpt-result'];
check('valid session progress completed', data.progress.cpt === 'completed');
check('result schema metadata added', cpt._meta && cpt._meta.schemaVersion === RESULT_SCHEMA_VERSION);
check('result explicitly research adaptation', cpt._meta.mccbEquivalent === false && cpt._meta.administration === 'digital_research_adaptation');
check('valid QC persisted', cpt._meta.sessionQc.status === 'valid');
check('participant ID persisted in result metadata', cpt._meta.participantId === 'P001');

console.log('\n=== 3. Interrupted session is isolated from canonical results ===');
// Simulate page-level legacy storage written immediately before saveResult().
localStorage.setItem('mccb-bacs-result', JSON.stringify({ correct: 99, attempted: 100 }));
check('start BACS', ParticipantManager.markInProgress('bacs') === true);
check('invalidate BACS on interruption', ParticipantManager.invalidateSession('bacs', 'interrupted', 'test_hidden') === true);
check('save interrupted result succeeds as audit record', ParticipantManager.saveResult('bacs', { correct: 99, attempted: 100 }) === true);
data = ParticipantManager.getData('P001');
const bacsInvalid = data.invalidResults['mccb-bacs-result'];
check('interrupted attempt is not canonical result', !data.results['mccb-bacs-result']);
check('interrupted attempt is stored in invalidResults', !!bacsInvalid);
check('interrupted session is completed_invalid', data.progress.bacs === 'completed_invalid');
check('interrupted status preserved after save', bacsInvalid._meta.sessionQc.status === 'interrupted');
check('interruption count captured', bacsInvalid._meta.sessionQc.qc.visibilityInterruptions >= 1);
check('reason captured', bacsInvalid._meta.sessionQc.qc.reasons.includes('test_hidden'));
check('legacy unscoped result removed', localStorage.getItem('mccb-bacs-result') === null);
check('getResult excludes invalid attempt', ParticipantManager.getResult('bacs') === null);
check('getInvalidResult exposes audit attempt', ParticipantManager.getInvalidResult('bacs')._meta.sessionQc.status === 'interrupted');

console.log('\n=== 4. Later valid retest becomes canonical ===');
check('start BACS retest', ParticipantManager.markInProgress('bacs') === true);
check('save valid BACS retest', ParticipantManager.saveResult('bacs', { correct: 80, attempted: 90 }) === true);
data = ParticipantManager.getData('P001');
check('valid retest becomes canonical', data.results['mccb-bacs-result']._meta.sessionQc.status === 'valid');
check('invalid slot cleared after valid retest', !data.invalidResults['mccb-bacs-result']);
check('progress upgraded to completed', data.progress.bacs === 'completed');

console.log('\n=== 5. Progress summary separates completion states ===');
const summary = ParticipantManager.getProgressSummary();
check('two valid completions after retest', summary.done === 2, JSON.stringify(summary));
check('no remaining invalid completion after valid retest', summary.invalid === 0, JSON.stringify(summary));
check('first incomplete remains TMT', ParticipantManager.getFirstIncomplete().key === 'tmt');

console.log('\n=== 6. Export preserves schema ===');
const exported = ParticipantManager.exportAllData();
check('export has schema version', exported.schemaVersion === PARTICIPANT_SCHEMA_VERSION);
check('export contains participant', exported.participants.P001 && exported.participantCount === 1);

console.log(`\n=== Result: ${pass} passed / ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
