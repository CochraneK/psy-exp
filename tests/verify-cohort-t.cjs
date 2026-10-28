'use strict';
/**
 * MCCBNorms 同队列参考 T（cohort-t）契约测试（零依赖，node 直接跑）。
 *
 * 覆盖：
 *   - normInv（Acklam）vs 已知正态分位数
 *   - rankPool 并列均排名 / N=1 / null 跳过
 *   - rankToT 钳位边界（P_CLAMP=1e-4 → T∈[12.8, 87.2]）
 *   - buildVisits 日期聚类 + 同日同测验取最后一次 + 非 PRIMARY 测验忽略
 *   - cohortTForVisits：域门控（缺测验不给域分）、MIN_COHORT_N 池级守卫、
 *     Overall/Neurocog 合成分、tc 测验级 T
 *   - KW：chi2Sf vs 已知卡方生存函数值；kwTest vs 手算（含结校正退化例）
 *
 * 口径提醒：cohort-t 是研究参考口径（非 MCCB 官方常模），本测试只验证算法自洽，
 * 不验证临床效度。
 */
const assert = require('assert');
const N = require('../mccb-norms.js');
const EX = require('../mccb-dashboard-export.js');

let pass = 0;
let failed = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('ok -', name); }
  catch (e) { failed++; console.error('FAIL -', name, '::', e.message); }
}
const near = (a, b, eps) => Math.abs(a - b) <= eps;

/* ---- normInv ---- */
ok('normInv(0.5) = 0', () => assert(near(N.normInv(0.5), 0, 1e-9)));
ok('normInv(0.95) ≈ 1.644854', () => assert(near(N.normInv(0.95), 1.644854, 1e-4)));
ok('normInv(0.975) ≈ 1.959964', () => assert(near(N.normInv(0.975), 1.959964, 1e-4)));
ok('normInv(0.158655) ≈ -1', () => assert(near(N.normInv(0.158655), -1, 1e-4)));
ok('normInv 拒绝 p∉(0,1)', () => assert.throws(() => N.normInv(0), /out of/));

/* ---- rankPool（并列均排名，0-100，与 rankWithTies 同定义） ---- */
ok('rankPool 无并列 [10,20,30,40] → 0/33.3/66.7/100', () => {
  const r = N.rankPool([10, 20, 30, 40]);
  assert.deepStrictEqual(r, [0, 33.3, 66.7, 100]);
});
ok('rankPool 并列 [10,20,20,40] → 10→0, 20→50, 40→100', () => {
  const r = N.rankPool([10, 20, 20, 40]);
  assert.deepStrictEqual(r, [0, 50, 50, 100]);
});
ok('rankPool N=1 → 50', () => assert.deepStrictEqual(N.rankPool([5]), [50]));
ok('rankPool null 跳过（池内仅 1 有效值 → N=1 规则给 50）', () => assert.deepStrictEqual(N.rankPool([null, 10]), [null, 50]));
ok('rankPool 全 null → 全 null', () => assert.deepStrictEqual(N.rankPool([null, null]), [null, null]));

/* ---- rankToT（P_CLAMP=1e-4 钳位） ---- */
ok('rankToT(50) = 50', () => assert.strictEqual(N.rankToT(50), 50));
ok('rankToT(0) ≈ 12.8（下钳）', () => assert(near(N.rankToT(0), 12.8, 0.1)));
ok('rankToT(100) ≈ 87.2（上钳）', () => assert(near(N.rankToT(100), 87.2, 0.1)));
ok('rankToT(84.1345) ≈ 60（Φ⁻¹(0.8413)≈1）', () => assert(near(N.rankToT(84.1345), 60, 0.1)));
ok('rankToT(null) = null', () => assert.strictEqual(N.rankToT(null), null));

/* ---- buildVisits（日期聚类 + 同日取最后 + 非 PRIMARY 忽略） ---- */
function mkHistory(entries) {
  const h = {};
  for (const [key, recordedAt, result] of entries) {
    (h['mccb-' + key + '-result'] = h['mccb-' + key + '-result'] || []).push({ _meta: { recordedAt }, ...result });
  }
  return h;
}
ok('buildVisits 同日多次取最后一次', () => {
  const v = N.buildVisits({ attemptHistory: mkHistory([
    ['bacs', '2026-01-10T09:00:00Z', { correct: 20 }],
    ['bacs', '2026-01-10T10:00:00Z', { correct: 25 }],
    ['bacs', '2026-02-10T09:00:00Z', { correct: 30 }],
  ]) });
  assert.strictEqual(v.length, 2);
  assert.strictEqual(v[0].date, '2026-01-10');
  assert.strictEqual(v[0].primary.bacs, 25);
  assert.strictEqual(v[1].date, '2026-02-10');
  assert.strictEqual(v[1].primary.bacs, 30);
});
ok('buildVisits 忽略非 PRIMARY 测验（bwais）', () => {
  const v = N.buildVisits({ attemptHistory: mkHistory([
    ['bwais', '2026-01-10T09:00:00Z', { scores: [1, 2] }],
  ]) });
  assert.strictEqual(v.length, 0);
});
ok('buildVisits 空/缺 _meta 不产生访视', () => {
  assert.deepStrictEqual(N.buildVisits({}), []);
  assert.deepStrictEqual(N.buildVisits({ attemptHistory: { 'mccb-bacs-result': [{ correct: 5 }] } }), []);
});
ok('buildVisits tmt 缺 partA.time → Infinity（不入池）', () => {
  const v = N.buildVisits({ attemptHistory: mkHistory([['tmt', '2026-01-10T09:00:00Z', {}]]) });
  assert.strictEqual(v.length, 1);
  assert.strictEqual(v[0].primary.tmt, Infinity);
});

/* ---- cohortTForVisits（域门控 / 池级 N 守卫 / 合成分） ---- */
function mkAllVisits(pids, bacsVals, date) {
  const out = {};
  pids.forEach((pid, i) => {
    out[pid] = [{ date, tests: {}, primary: { bacs: bacsVals[i] } }];
  });
  return out;
}
ok('cohortT N=5 池 → 给出 tc，不给域分（缺 fluency/tmt）', () => {
  const m = N.cohortTForVisits(mkAllVisits(['a', 'b', 'c', 'd', 'e'], [10, 20, 30, 40, 50], '2026-01-10'));
  const o = m.get('a|2026-01-10');
  assert.strictEqual(o.cohortN, 5);
  assert.strictEqual(Object.keys(o.sc).length, 0, '域分应缺失（SoP 需 bacs+fluency+tmt）');
  // bacs 排名 0/25/50/75/100 → T 12.8/43.3/50/56.7/87.2
  assert.deepStrictEqual(
    ['a', 'b', 'c', 'd', 'e'].map(p => m.get(p + '|2026-01-10').tc['BACS SC']),
    [12.8, 43.3, 50, 56.7, 87.2]
  );
});
ok('cohortT N=4 池 < MIN_COHORT_N → 不给 T', () => {
  const m = N.cohortTForVisits(mkAllVisits(['a', 'b', 'c', 'd'], [10, 20, 30, 40], '2026-01-10'));
  const o = m.get('a|2026-01-10');
  assert.deepStrictEqual(o.sc, {});
  assert.deepStrictEqual(o.tc, {});
});
ok('cohortT 域全齐 + Overall/Neurocog 合成', () => {
  const pids = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const all = {};
  pids.forEach((pid, i) => {
    all[pid] = [{ date: '2026-01-10', tests: {}, primary: {
      bacs: 10 + i, fluency: 20 + i, tmt: 100 - i,      // SoP（tmt 反向）
      cpt: 30 + i,                                       // AV
      'spatial-span': 40 + i, lns: 45 + i,               // WM（lns 是补充，不影响核心域）
      hvlt: 50 + i,                                      // Vrbl Lrng
      bvmt: 60 + i,                                      // Vis Lrng
      mazes: 70 + i,                                     // RPS
      msceit: 80 + i                                     // SC
    } }];
  });
  const m = N.cohortTForVisits(all);
  const o = m.get('p3|2026-01-10');
  // 中位位置（5 人池第 3 名）→ 各域 rank=50 → T=50
  assert.strictEqual(o.sc['SoP'], 50);
  assert.strictEqual(o.sc['AV'], 50);
  assert.strictEqual(o.sc['WM'], 50);
  assert.strictEqual(o.sc['Vrbl Lrng'], 50);
  assert.strictEqual(o.sc['Vis Lrng'], 50);
  assert.strictEqual(o.sc['RPS'], 50);
  assert.strictEqual(o.sc['SC'], 50);
  assert.strictEqual(o.sc['Overall Comp'], 50);
  assert.strictEqual(o.sc['Neurocog Comp'], 50);
  // tmt 反向：p1 tmt=100（最差）→ TMT tc 最低；p5 tmt=96（最好）→ 最高
  assert.ok(m.get('p1|2026-01-10').tc['TMT'] < m.get('p5|2026-01-10').tc['TMT'], 'tmt 越小越好');
});
ok('cohortT 多访视各自入池（uid=pid|date，池=全部访视级 unit）', () => {
  const all = {
    a: [{ date: '2026-01-10', tests: {}, primary: { bacs: 10 } },
        { date: '2026-02-10', tests: {}, primary: { bacs: 20 } }],
    b: [{ date: '2026-01-10', tests: {}, primary: { bacs: 30 } }],
    c: [{ date: '2026-01-10', tests: {}, primary: { bacs: 40 } }],
    d: [{ date: '2026-01-10', tests: {}, primary: { bacs: 50 } }],
    e: [{ date: '2026-01-10', tests: {}, primary: { bacs: 60 } }],
  };
  const m = N.cohortTForVisits(all);
  assert.strictEqual(m.size, 6, '5 pid，a 有 2 次访视 → 6 个 uid');
  assert.strictEqual(m.get('a|2026-02-10').cohortN, 6, '池=全部访视级 unit（含 a 自己两次）→ 6');
  // 第二次访视（bacs=20，6 人中第 2 低）rank=100*(0+1)/... avg=(1+2-1)/2=1 → 1/5*100=20 → T=rankToT(20)
  assert.strictEqual(m.get('a|2026-02-10').tc['BACS SC'], N.rankToT(20));
});

/* ---- KW：chi2Sf 已知值（df=2 有精确解 exp(-x/2)，可独立验证） ---- */
ok('chi2Sf df=2: P(χ²>5.99146) ≈ 0.05（精确 exp(-x/2)）', () => assert(near(EX.chi2Sf(5.99146, 2), Math.exp(-5.99146 / 2), 1e-6)));
ok('chi2Sf df=2: P(χ²>10.82764) ≈ 0.001（精确 exp(-x/2)）', () => assert(near(EX.chi2Sf(10.82764, 2), Math.exp(-10.82764 / 2), 1e-6)));
ok('chi2Sf x≤0 → 1', () => assert.strictEqual(EX.chi2Sf(0, 3), 1));

/* ---- kwTest 手算 ---- */
ok('kwTest 无结 [1,2,3]/[4,5,6]/[7,8,9] → H=7.2', () => {
  const r = EX.kwTest([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
  assert(near(r.H, 7.2, 1e-9));
  assert.strictEqual(r.k, 3);
  assert.strictEqual(r.N, 9);
  // df=2 → p = exp(-H/2)
  assert(near(r.p, Math.exp(-7.2 / 2), 1e-6));
  assert(near(r.eta2, (7.2 - 3 + 1) / (9 - 3), 1e-9));
});
ok('kwTest 全结退化 → H=0, p=1', () => {
  const r = EX.kwTest([[1, 1, 3], [1, 1, 3]]);
  assert.strictEqual(r.H, 0);
  assert.strictEqual(r.p, 1);
});
ok('kwTest 样本不足 → null', () => {
  assert.strictEqual(EX.kwTest([[1], [2]]), null);
  assert.strictEqual(EX.kwTest([[1, 2]]), null);
});
ok('kwTest 结校正精确例 [[1,1,2],[2,2,3]] → H=49/18≈2.722222（手算）', () => {
  // 秩：1,1→1.5；2,2,2→4；3→6；组A秩和 7，组B秩和 14
  // H_raw = 12/(6·7)·(49/3+196/3)−21 = 7/3 ≈ 2.3333；结 Σ(t³−t)=6+24=30
  // 分母 = 1−30/210 = 6/7；H = (7/3)/(6/7) = 49/18
  const r = EX.kwTest([[1, 1, 2], [2, 2, 3]]);
  assert(near(r.H, 49 / 18, 1e-9));
  assert.strictEqual(r.k, 2);
  assert.strictEqual(r.N, 6);
});
ok('kwTest 结校正使 H 大于未校正原式（分母<1）', () => {
  const raw = 12 / (6 * 7) * (7 * 7 / 3 + 14 * 14 / 3) - 3 * 7; // 2.3333
  const r = EX.kwTest([[1, 1, 2], [2, 2, 3]]);
  assert.ok(r.H > raw, '校正后 H(' + r.H + ') > 原式(' + raw + ')');
});

/* ---- 收尾 ---- */
console.log('');
if (failed) {
  console.error('COHORT-T FAIL: ' + failed + ' failed, ' + pass + ' passed');
  process.exit(1);
}
console.log('COHORT-T PASS (' + pass + ' checks)');
