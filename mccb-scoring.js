/**
 * Research-safe cognitive scoring / aggregation.
 *
 * IMPORTANT
 * ---------
 * The browser tasks in this repository are digital research adaptations. Unless a
 * separately validated norm is explicitly registered, this module MUST NOT emit
 * values labelled as MCCB T scores, clinical percentiles, or an MCCB composite.
 *
 * Default behaviour:
 *   raw task result -> exploratory domain contribution -> within-project rank
 *
 * The default `internal` norm therefore exposes `rawIndex`, `indexScore`, and
 * `cohortPercentile` only. `tScore` and `composite` remain null.
 */

const MCCBScoring = (() => {
  const DOMAINS = {
    speed_processing: {
      label: '处理速度',
      labelEn: 'Speed of Processing',
      tests: ['bacs', 'fluency', 'tmt'],
      color: '#3498db',
      desc: '信息处理效率',
    },
    attention: {
      label: '注意/警觉',
      labelEn: 'Attention / Vigilance',
      tests: ['cpt'],
      color: '#2ecc71',
      desc: '持续注意力与警觉性',
    },
    working_memory: {
      label: '工作记忆',
      labelEn: 'Working Memory',
      tests: ['lns', 'spatial-span'],
      color: '#e67e22',
      desc: '言语与非言语工作记忆',
    },
    verbal_learning: {
      label: '言语学习',
      labelEn: 'Verbal Learning',
      tests: ['hvlt'],
      color: '#9b59b6',
      desc: '言语材料的习得与记忆',
    },
    visual_learning: {
      label: '视觉学习',
      labelEn: 'Visual Learning',
      tests: ['bvmt'],
      color: '#1abc9c',
      desc: '视觉信息的习得与记忆',
    },
    reasoning: {
      label: '推理与问题解决',
      labelEn: 'Reasoning & Problem Solving',
      tests: ['mazes'],
      color: '#e74c3c',
      desc: '执行功能与规划能力',
    },
    social_cognition: {
      label: '社会认知',
      labelEn: 'Social Cognition',
      tests: ['msceit'],
      color: '#f39c12',
      desc: '情绪管理与社交推理',
    },
  };

  const KEY_TO_RESULT = {
    tmt: 'mccb-tmt-result',
    bacs: 'mccb-bacs-result',
    fluency: 'mccb-fluency-result',
    cpt: 'mccb-cpt-result',
    'spatial-span': 'mccb-spatial-span-result',
    lns: 'mccb-lns-result',
    hvlt: 'mccb-hvlt-result',
    bvmt: 'mccb-bvmt-result',
    mazes: 'mccb-mazes-result',
    msceit: 'mccb-msceit-result',
  };

  /**
   * Validation status is deliberately conservative.
   * `mccbEquivalent: false` means the current browser administration must not be
   * treated as psychometrically interchangeable with the licensed MCCB procedure.
   */
  const TASK_VALIDATION = {
    tmt: {
      mccbComponent: 'Trail Making Test Part A only',
      mccbEquivalent: false,
      note: 'Part B is supplemental and must not enter MCCB processing-speed scoring.',
    },
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

  const TEST_METRICS = {
    bacs: {
      label: '符号编码', labelEn: 'BACS Symbol Coding',
      extract(result) {
        const correct = n(result.correct);
        const attempted = n(result.attempted);
        return { correct, attempted, accuracy: attempted > 0 ? Math.round(correct / attempted * 100) : 0 };
      },
    },
    fluency: {
      label: '语义流畅性', labelEn: 'Category Fluency',
      extract(result) {
        const total = n(result.total ?? result.unique);
        const unique = n(result.unique ?? result.total);
        return { total, unique };
      },
    },
    hvlt: {
      label: '词语学习', labelEn: 'HVLT-R Verbal Learning',
      extract(result) {
        const trial1 = n(result.trial1);
        const trial2 = n(result.trial2);
        const trial3 = n(result.trial3);
        const delayedRecall = n(result.delayedRecall);
        return {
          trial1, trial2, trial3,
          totalLearning: trial1 + trial2 + trial3,
          delayedRecall,
          retention: trial3 > 0 ? Math.round(delayedRecall / trial3 * 100) : null,
        };
      },
    },
    bvmt: {
      label: '视觉记忆', labelEn: 'BVMT-R Visual Memory',
      extract(result) {
        const trials = Array.isArray(result.trials) ? result.trials : (Array.isArray(result.trialScores) ? result.trialScores : []);
        const scores = trials.map(t => n(typeof t === 'object' ? t.score : t));
        const delayedRecall = n(result.delayedRecall ?? result.delayedScore);
        const last = scores.length ? scores[scores.length - 1] : 0;
        return {
          trialScores: scores,
          totalLearning: scores.reduce((sum, value) => sum + value, 0),
          delayedRecall,
          trialsCompleted: scores.length,
          retention: last > 0 ? Math.round(delayedRecall / last * 100) : null,
        };
      },
    },
    cpt: {
      label: '持续操作', labelEn: 'CPT-IP research adaptation',
      extract(result) {
        return {
          hits: n(result.hits), misses: n(result.misses), falseAlarms: n(result.falseAlarms),
          meanHitRT: n(result.meanHitRT ?? result.meanRT), meanFART: n(result.meanFART),
          dPrime: n(result.dPrime), totalTrials: n(result.totalTrials),
        };
      },
    },
    msceit: {
      label: '情绪管理', labelEn: 'MSCEIT Managing Emotions research adaptation',
      extract(result) {
        const total = n(result.total);
        const correct = n(result.correct);
        return { total, correct, accuracy: total > 0 ? Math.round(correct / total * 100) : 0, elapsed: n(result.elapsed) };
      },
    },
    mazes: {
      label: '迷宫', labelEn: 'NAB Mazes research adaptation',
      extract(result) {
        return {
          totalScore: n(result.totalScore), maxScore: n(result.maxScore, 26),
          completed: Array.isArray(result.completed) ? result.completed.length : 0,
          totalTime: n(result.totalTime),
        };
      },
    },
    'spatial-span': {
      label: '空间广度', labelEn: 'Spatial Span research adaptation',
      extract(result) { return { totalCorrect: n(result.totalCorrect), maxLevel: n(result.maxLevel) }; },
    },
    lns: {
      label: '字母数字广度', labelEn: 'Letter-Number Span research adaptation',
      extract(result) { return { totalCorrect: n(result.totalCorrect), maxLevel: n(result.maxLevel) }; },
    },
    tmt: {
      label: '连线测验', labelEn: 'Trail Making Test',
      extract(result) {
        const a = result.partA || {};
        const b = result.partB || {};
        const partATime = n(a.time);
        return {
          partATime,
          partAErrors: n(a.errors),
          partBTime: n(b.time),
          partBErrors: n(b.errors),
          // MCCB contains TMT Part A only. Part B remains supplemental.
          mccbTime: partATime,
        };
      },
    },
  };

  function estimateDomainContribution(domainKey, testKey, extracted) {
    const maps = {
      speed_processing: {
        bacs: e => e.correct / 110,
        fluency: e => e.total / 50,
        // IMPORTANT: MCCB uses TMT Part A only.
        tmt: e => Math.max(0, 1 - n(e.partATime, 300) / 300),
      },
      attention: { cpt: e => e.dPrime / 5 },
      working_memory: { lns: e => e.totalCorrect / 24, 'spatial-span': e => e.totalCorrect / 24 },
      verbal_learning: { hvlt: e => e.totalLearning / 36 },
      visual_learning: { bvmt: e => e.totalLearning / 36 },
      reasoning: { mazes: e => e.maxScore > 0 ? e.totalScore / e.maxScore : 0 },
      social_cognition: { msceit: e => e.total > 0 ? e.correct / e.total : 0 },
    };
    const fn = maps[domainKey] && maps[domainKey][testKey];
    if (!fn) return null;
    const value = fn(extracted);
    return Number.isFinite(value) ? value : null;
  }

  function rankWithTies(values) {
    const sorted = [...values].sort((a, b) => a.value - b.value);
    const total = sorted.length;
    if (total === 0) return [];
    let i = 0;
    while (i < total) {
      let j = i + 1;
      while (j < total && Math.abs(sorted[j].value - sorted[i].value) < 1e-12) j++;
      const averageRank = (i + (j - 1)) / 2;
      const percentile = total === 1 ? 50 : Math.round(averageRank / (total - 1) * 100);
      for (let k = i; k < j; k++) sorted[k].cohortPercentile = percentile;
      i = j;
    }
    return sorted;
  }

  const internalNorm = {
    name: 'internal',
    label: '项目内探索性相对排名（非 MCCB 常模；不生成 T 分）',
    kind: 'research',
    validated: false,
    apply(allProfiles, domains) {
      for (const domainKey of Object.keys(domains)) {
        const values = [];
        for (const profile of allProfiles) {
          const contributions = [];
          for (const testKey of domains[domainKey].tests) {
            const task = profile.tests[testKey];
            if (!task || !task.extracted) continue;
            const contribution = estimateDomainContribution(domainKey, testKey, task.extracted);
            if (contribution != null) contributions.push(contribution);
          }
          // Missing domains are missing, not zero. This avoids ranking incomplete
          // participants as if they had performed at the floor.
          if (contributions.length === 0) continue;
          const rawIndex = contributions.reduce((sum, value) => sum + value, 0) / contributions.length;
          values.push({ id: profile.id, value: rawIndex, testCount: contributions.length });
        }

        for (const ranked of rankWithTies(values)) {
          const profile = allProfiles.find(p => p.id === ranked.id);
          if (!profile) continue;
          profile.domains[domainKey] = {
            rawIndex: Math.round(ranked.value * 1000) / 1000,
            indexScore: ranked.cohortPercentile,
            cohortPercentile: ranked.cohortPercentile,
            testCount: ranked.testCount,
            tScore: null,
            scoreType: 'research-cohort-index',
          };
        }
      }
    },
  };

  const NORM_REGISTRY = { [internalNorm.name]: internalNorm };
  let activeNorm = internalNorm.name;

  function registerNorm(norm) {
    if (!norm || !norm.name || typeof norm.apply !== 'function') {
      throw new Error('norm 需含 name 和 apply(allProfiles, domains)');
    }
    NORM_REGISTRY[norm.name] = {
      kind: norm.kind || 'custom',
      validated: norm.validated === true,
      label: norm.label || norm.name,
      ...norm,
    };
    return NORM_REGISTRY;
  }

  function setNorm(name) {
    if (!NORM_REGISTRY[name]) throw new Error(`常模 "${name}" 未注册`);
    activeNorm = name;
    return activeNorm;
  }

  function getNorm() {
    const norm = NORM_REGISTRY[activeNorm];
    return { name: activeNorm, label: norm.label, kind: norm.kind, validated: norm.validated === true };
  }

  function getProfile(participantId) {
    const pm = typeof window !== 'undefined' ? window.ParticipantManager : null;
    if (!participantId || !pm) return null;
    const data = pm.getData(participantId);
    if (!data || !data.results) return null;

    const profile = {
      id: participantId,
      date: data.updatedAt || data.createdAt || null,
      tests: {},
      domains: {},
      composite: null,
      scoringStatus: 'raw-only',
    };

    for (const [testKey, metrics] of Object.entries(TEST_METRICS)) {
      const storageKey = KEY_TO_RESULT[testKey];
      const result = data.results[storageKey] || data.results[testKey];
      if (!result) continue;
      profile.tests[testKey] = {
        label: metrics.label,
        labelEn: metrics.labelEn,
        extracted: metrics.extract(result),
        raw: result,
        validation: TASK_VALIDATION[testKey],
      };
    }
    return profile;
  }

  function getAllProfiles() {
    const pm = typeof window !== 'undefined' ? window.ParticipantManager : null;
    if (!pm) return { profiles: [], domains: DOMAINS, metrics: TEST_METRICS, validation: TASK_VALIDATION, norm: getNorm() };

    const profiles = [];
    for (const participantId of pm.getAllParticipants()) {
      const profile = getProfile(participantId);
      if (profile && Object.keys(profile.tests).length > 0) profiles.push(profile);
    }

    const norm = NORM_REGISTRY[activeNorm];
    norm.apply(profiles, DOMAINS);

    for (const profile of profiles) {
      const domainEntries = Object.values(profile.domains);
      const validatedScores = domainEntries.map(d => d && d.tScore).filter(Number.isFinite);
      const allSevenDomainsPresent = Object.keys(DOMAINS).every(key => profile.domains[key] && Number.isFinite(profile.domains[key].tScore));

      // Never manufacture an MCCB-style composite from a research norm or an
      // incomplete domain set.
      if (norm.validated === true && allSevenDomainsPresent && validatedScores.length === 7) {
        profile.composite = Math.round(validatedScores.reduce((sum, value) => sum + value, 0) / validatedScores.length);
        profile.scoringStatus = 'validated-norm';
      } else {
        profile.composite = null;
        profile.scoringStatus = norm.validated === true ? 'validated-norm-incomplete' : 'research-index-only';
      }
    }

    return { profiles, domains: DOMAINS, metrics: TEST_METRICS, validation: TASK_VALIDATION, norm: getNorm() };
  }

  function getDomainSummary(profile) {
    const summary = [];
    for (const [key, domain] of Object.entries(DOMAINS)) {
      const d = profile.domains[key];
      if (!d) continue;
      summary.push({
        key,
        label: domain.label,
        labelEn: domain.labelEn,
        color: domain.color,
        tScore: Number.isFinite(d.tScore) ? d.tScore : null,
        indexScore: Number.isFinite(d.indexScore) ? d.indexScore : null,
        percentile: Number.isFinite(d.cohortPercentile) ? d.cohortPercentile : null,
        scoreType: d.scoreType || (Number.isFinite(d.tScore) ? 'validated-t-score' : 'unknown'),
        tests: domain.tests.map(testKey => ({
          key: testKey,
          label: (profile.tests[testKey] || {}).label || testKey,
          validation: TASK_VALIDATION[testKey],
          ...((profile.tests[testKey] || {}).extracted || {}),
        })),
      });
    }
    return summary;
  }

  return {
    getProfile,
    getAllProfiles,
    getDomainSummary,
    registerNorm,
    setNorm,
    getNorm,
    DOMAINS,
    TEST_METRICS,
    TASK_VALIDATION,
  };
})();

if (typeof window !== 'undefined') window.MCCBScoring = MCCBScoring;
if (typeof module !== 'undefined' && module.exports) module.exports = { MCCBScoring };
