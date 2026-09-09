/**
 * 评分模块端到端验证
 * 模拟 ParticipantManager，喂入覆盖 10 项测验的样本数据，
 * 验证 mccb-scoring.js 的 getProfile / getAllProfiles / getDomainSummary 逻辑。
 */
const path = require('path');
const MCCB = require(path.resolve(__dirname, '../mccb-scoring.js')).MCCBScoring;

// ---- 模拟 ParticipantManager ----
function makeResults(overrides = {}) {
  return Object.assign({
    'mccb-bacs-result':        { correct: 88, attempted: 90 },
    'mccb-fluency-result':     { total: 32, unique: 30 },
    'mccb-hvlt-result':        { trial1: 7, trial2: 9, trial3: 10, delayedRecall: 9 },
    'mccb-bvmt-result':        { trials: [{score:9},{score:11},{score:12}], delayedRecall: 10 },
    'mccb-cpt-result':         { hits: 180, misses: 5, falseAlarms: 8, meanHitRT: 420, meanFART: 510, dPrime: 3.2, totalTrials: 200 },
    'mccb-msceit-result':      { total: 24, correct: 18, elapsed: 120000 },
    'mccb-mazes-result':       { totalScore: 22, maxScore: 26, completed: [1,2,3,4,5,6,7], totalTime: 540 },
    'mccb-spatial-span-result':{ totalCorrect: 19, maxLevel: 7 },
    'mccb-lns-result':         { totalCorrect: 21, maxLevel: 8 },
    'mccb-tmt-result':         { partA: { time: 35, errors: 0 }, partB: { time: 75, errors: 1 } },
  }, overrides);
}

const mockData = {
  'P001': { cohortId: 'P001', results: makeResults() },
  'P002': { cohortId: 'P002', results: makeResults({
    'mccb-bacs-result':     { correct: 60, attempted: 90 },
    'mccb-fluency-result':  { total: 18, unique: 16 },
    'mccb-cpt-result':      { hits: 150, misses: 20, falseAlarms: 30, meanHitRT: 500, meanFART: 600, dPrime: 1.5, totalTrials: 200 },
    'mccb-mazes-result':    { totalScore: 12, maxScore: 26, completed: [1,2,3], totalTime: 800 },
  })},
  'P003': { cohortId: 'P003', results: makeResults({
    'mccb-bacs-result':     { correct: 100, attempted: 100 },
    'mccb-cpt-result':      { hits: 195, misses: 1, falseAlarms: 2, meanHitRT: 380, meanFART: 460, dPrime: 4.1, totalTrials: 200 },
    'mccb-mazes-result':    { totalScore: 25, maxScore: 26, completed: [1,2,3,4,5,6,7], totalTime: 400 },
  })},
};

global.window = {
  ParticipantManager: {
    getData(id) { return mockData[id] || null; },
    getAllParticipants() { return Object.keys(mockData); },
  },
};
global.ParticipantManager = global.window.ParticipantManager;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}

console.log('=== 1. getProfile 提取正确性 ===');
const p1 = MCCB.getProfile('P001');
check('返回 profile', !!p1);
check('10 项测验全部提取', Object.keys(p1.tests).length === 10, Object.keys(p1.tests).length + ' 项');
check('BACS 正确数=88', p1.tests.bacs.extracted.correct === 88);
check('HVLT 总学习=26', p1.tests.hvlt.extracted.totalLearning === 26, 'got ' + p1.tests.hvlt.extracted.totalLearning);
check('CPT dPrime=3.2', p1.tests.cpt.extracted.dPrime === 3.2);
check('TMT 总时间=110', p1.tests.tmt.extracted.totalTime === 110, 'got ' + p1.tests.tmt.extracted.totalTime);
check('BVMT 总学习=32', p1.tests.bvmt.extracted.totalLearning === 32, 'got ' + p1.tests.bvmt.extracted.totalLearning);

console.log('\n=== 2. getAllProfiles 域排名 / T 分 ===');
const all = MCCB.getAllProfiles();
check('3 个 profile', all.profiles.length === 3, all.profiles.length + ' 个');

// P003 应该最高（BACS/CPT/Mazes 都很强），P002 最低
const byId = Object.fromEntries(all.profiles.map(p => [p.id, p]));
const c003 = byId['P003'].composite, c002 = byId['P002'].composite, c001 = byId['P001'].composite;
check('综合分存在', [c003,c002,c001].every(v => typeof v === 'number'));
check('P003 综合分 ≥ P002 (排序合理)', c003 >= c002, `P003=${c003} P002=${c002}`);
console.log(`    综合分: P001=${c001}, P002=${c002}, P003=${c003}`);

// T 分范围 20-80
let tInRange = true;
for (const p of all.profiles) {
  for (const d of Object.values(p.domains)) {
    if (d.tScore != null && (d.tScore < 20 || d.tScore > 80)) tInRange = false;
  }
}
check('所有 T 分落在 [20,80]', tInRange);

// P002 在 mazes 域应最低（totalScore=12）
const mazesDom = 'reasoning';
const p002MazesPct = byId['P002'].domains[mazesDom].percentile;
const p003MazesPct = byId['P003'].domains[mazesDom].percentile;
check('P002 迷宫百分位 ≤ P003', p002MazesPct <= p003MazesPct, `P002=${p002MazesPct} P003=${p003MazesPct}`);

console.log('\n=== 3. getDomainSummary ===');
const summary = MCCB.getDomainSummary(byId['P001']);
check('返回 7 个域', summary.length === 7, summary.length + ' 个');
check('含处理速度域', summary.some(d => d.key === 'speed_processing'));
check('每个域含 T 分', summary.every(d => typeof d.tScore === 'number'));

console.log('\n=== 4. 边界：空被试 ===');
const empty = MCCB.getProfile('NONEXIST');
check('不存在的被试返回 null', empty === null);

console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail === 0 ? 0 : 1);
