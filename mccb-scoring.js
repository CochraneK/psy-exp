/**
 * MCCB 综合评分模块
 * 
 * 将 10 项测验的原始分数按 7 个认知域汇总，生成认知画像。
 * 原始分数 → 域分数 → 总综合分。
 * 
 * 使用说明：
 *   MCCBScoring.getProfile(participantId)  — 单被试
 *   MCCBScoring.getAllProfiles()            — 全部被试
 *   MCCBScoring.getDomainSummary(profile)   — 域摘要
 */

const MCCBScoring = (() => {

  // ============================
  // MCCB 7 个认知域定义
  // ============================
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

// localStorage key 映射（与 mccb-participant.js 保持一致）
const KEY_TO_RESULT = {
  tmt:        'mccb-tmt-result',
  bacs:       'mccb-bacs-result',
  fluency:    'mccb-fluency-result',
  cpt:        'mccb-cpt-result',
  'spatial-span': 'mccb-spatial-span-result',
  lns:        'mccb-lns-result',
  hvlt:       'mccb-hvlt-result',
  bvmt:       'mccb-bvmt-result',
  mazes:      'mccb-mazes-result',
  msceit:     'mccb-msceit-result',
};

// ============================
// 各测验关键指标提取
// ============================
  const TEST_METRICS = {
    bacs: {
      label: '符号编码',
      labelEn: 'BACS Symbol Coding',
      extract(result) {
        return {
          correct: result.correct || 0,
          attempted: result.attempted || 0,
          accuracy: result.attempted > 0
            ? Math.round((result.correct / result.attempted) * 100)
            : 0,
        };
      },
    },
    fluency: {
      label: '语义流畅性',
      labelEn: 'Category Fluency',
      extract(result) {
        return {
          total: result.total || result.unique || 0,
          unique: result.unique || result.total || 0,
        };
      },
    },
    hvlt: {
      label: '词语学习',
      labelEn: 'HVLT-R Verbal Learning',
      extract(result) {
        const t1 = result.trial1 || 0;
        const t2 = result.trial2 || 0;
        const t3 = result.trial3 || 0;
        return {
          trial1: t1,
          trial2: t2,
          trial3: t3,
          totalLearning: t1 + t2 + t3,
          delayedRecall: result.delayedRecall || 0,
          retention: t3 > 0
            ? Math.round(((result.delayedRecall || 0) / t3) * 100)
            : 0,
        };
      },
    },
    bvmt: {
      label: '视觉记忆',
      labelEn: 'BVMT-R Visual Memory',
      extract(result) {
        const trials = result.trials || result.trialScores || [];
        const scores = trials.map(t => t.score || 0);
        return {
          trialScores: scores,
          totalLearning: scores.reduce((s, v) => s + v, 0),
          delayedRecall: result.delayedRecall || result.delayedScore || 0,
          trialsCompleted: scores.length,
          retention: scores.length > 0 && scores[scores.length - 1] > 0
            ? Math.round(((result.delayedRecall || 0) / scores[scores.length - 1]) * 100)
            : 0,
        };
      },
    },
    cpt: {
      label: '持续操作',
      labelEn: 'CPT-IP',
      extract(result) {
        return {
          hits: result.hits || 0,
          misses: result.misses || 0,
          falseAlarms: result.falseAlarms || 0,
          meanHitRT: result.meanHitRT || result.meanRT || 0,
          meanFART: result.meanFART || 0,
          dPrime: result.dPrime || 0,
          totalTrials: result.totalTrials || 0,
        };
      },
    },
    msceit: {
      label: '情绪管理',
      labelEn: 'MSCEIT Managing Emotions',
      extract(result) {
        return {
          total: result.total || 0,
          correct: result.correct || 0,
          accuracy: result.total > 0
            ? Math.round((result.correct / result.total) * 100)
            : 0,
          elapsed: result.elapsed || 0,
        };
      },
    },
    mazes: {
      label: '迷宫',
      labelEn: 'NAB Mazes',
      extract(result) {
        return {
          totalScore: result.totalScore || 0,
          maxScore: result.maxScore || 26,
          completed: (result.completed || []).length,
          totalTime: result.totalTime || 0,
        };
      },
    },
    'spatial-span': {
      label: '空间广度',
      labelEn: 'Spatial Span',
      extract(result) {
        return {
          totalCorrect: result.totalCorrect || 0,
          maxLevel: result.maxLevel || 0,
        };
      },
    },
    lns: {
      label: '字母数字广度',
      labelEn: 'Letter-Number Span',
      extract(result) {
        return {
          totalCorrect: result.totalCorrect || 0,
          maxLevel: result.maxLevel || 0,
        };
      },
    },
    tmt: {
      label: '连线测验',
      labelEn: 'Trail Making Test',
      extract(result) {
        const a = result.partA || {};
        const b = result.partB || {};
        return {
          partATime: a.time || 0,
          partAErrors: a.errors || 0,
          partBTime: b.time || 0,
          partBErrors: b.errors || 0,
          totalTime: (a.time || 0) + (b.time || 0),
        };
      },
    },
  };

  // ============================
  // 简易标准化（百分比排名近似）
  // 因缺少 MCCB 官方常模，采用项目内部相对排名
  // ============================
  function _computeDomainScores(allProfiles) {
    // 收集每个测试的原始分数用于排名
    // domain scores: 0-100 基于内部相对排名
    const domainValues = {};
    for (const domainKey of Object.keys(DOMAINS)) {
      domainValues[domainKey] = [];
    }

    for (const p of allProfiles) {
      for (const domainKey of Object.keys(DOMAINS)) {
        const domain = DOMAINS[domainKey];
        let rawSum = 0;
        let count = 0;
        for (const testKey of domain.tests) {
          const t = p.tests[testKey];
          if (t && t.extracted) {
            // 归一化：不同 tests 映射到大致统一的分数轴
            rawSum += _estimateDomainContribution(domainKey, testKey, t.extracted);
            count++;
          }
        }
        const avg = count > 0 ? rawSum / count : 0;
        domainValues[domainKey].push({ id: p.id, value: avg });
      }
    }

    // 对每个域计算百分比排名（0-100）
    for (const domainKey of Object.keys(DOMAINS)) {
      const vals = domainValues[domainKey].sort((a, b) => a.value - b.value);
      const total = vals.length;
      vals.forEach((v, i) => {
        v.percentile = total > 1 ? Math.round((i / (total - 1)) * 100) : 50;
      });
      // 存回 profile
      for (const v of vals) {
        const profile = allProfiles.find(p => p.id === v.id);
        if (profile) {
          profile.domains[domainKey] = profile.domains[domainKey] || {};
          profile.domains[domainKey].raw = Math.round(v.value * 10) / 10;
          profile.domains[domainKey].percentile = v.percentile;
          profile.domains[domainKey].tScore = _percentileToTScore(v.percentile);
        }
      }
    }
  }

  function _estimateDomainContribution(domainKey, testKey, extracted) {
    // 各测验原始分到域贡献的估算映射
    const maps = {
      speed_processing: {
        bacs: (e) => e.correct / 110,       // BACS 满分约 110
        fluency: (e) => e.total / 50,        // 流畅性通常 15-40
        tmt: (e) => Math.max(0, 1 - (e.totalTime || 600) / 600), // 时间越短越好
      },
      attention: {
        cpt: (e) => e.dPrime / 5,           // d' 通常在 0-4
      },
      working_memory: {
        lns: (e) => e.totalCorrect / 24,    // LNS 满分 24
        'spatial-span': (e) => e.totalCorrect / 24,
      },
      verbal_learning: {
        hvlt: (e) => e.totalLearning / 36,  // HVLT 3 试次满分 36
      },
      visual_learning: {
        bvmt: (e) => e.totalLearning / 36,  // BVMT 3 试次满分 36
      },
      reasoning: {
        mazes: (e) => e.totalScore / 26,
      },
      social_cognition: {
        msceit: (e) => e.correct / e.total,
      },
    };

    const map = maps[domainKey];
    if (!map || !map[testKey]) return 0;
    return map[testKey](extracted);
  }

  function _percentileToTScore(pct) {
    // 百分位数 → T 分的近似转换（正态分布假设）
    // T = 50 + 10 * z, 百分位 → z 近似
    if (pct <= 0) return 20;
    if (pct >= 100) return 80;
    // 简单多项式近似
    const z = (pct - 50) / 50;
    const t = 50 + 10 * z;
    return Math.round(Math.max(20, Math.min(80, t)));
  }

  // ============================
  // 公共 API
  // ============================
  function getProfile(participantId) {
    if (!participantId || !window.ParticipantManager) return null;
    const data = window.ParticipantManager.getData(participantId);
    if (!data || !data.results) return null;

    const profile = {
      id: participantId,
      date: data.results._date || null,
      tests: {},
      domains: {},
      composite: null,
    };

    // 提取各测验指标
    for (const [testKey, metrics] of Object.entries(TEST_METRICS)) {
      const storageKey = KEY_TO_RESULT[testKey];
      const result = data.results[storageKey] || data.results[testKey];
      if (!result) continue;
      profile.tests[testKey] = {
        label: metrics.label,
        labelEn: metrics.labelEn,
        extracted: metrics.extract(result),
        raw: result,
      };
    }

    return profile;
  }

  function getAllProfiles() {
    if (!window.ParticipantManager) return { profiles: [], domains: DOMAINS, metrics: TEST_METRICS };
    const all = window.ParticipantManager.getAllParticipants();
    const profiles = [];
    for (const pid of all) {
      const p = getProfile(pid);
      if (p && Object.keys(p.tests).length > 0) profiles.push(p);
    }

    // 计算域分数（需要全部 profile 做相对排名）
    _computeDomainScores(profiles);

    // 计算综合 T 分
    for (const p of profiles) {
      const domainScores = Object.values(p.domains).map(d => d.tScore).filter(v => v != null);
      p.composite = domainScores.length > 0
        ? Math.round(domainScores.reduce((s, v) => s + v, 0) / domainScores.length)
        : null;
    }

    return { profiles, domains: DOMAINS, metrics: TEST_METRICS };
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
        tScore: d.tScore,
        percentile: d.percentile,
        tests: domain.tests.map(tk => ({
          key: tk,
          label: (profile.tests[tk] || {}).label || tk,
          ...(profile.tests[tk] || {}).extracted,
        })),
      });
    }
    return summary;
  }

  return { getProfile, getAllProfiles, getDomainSummary, DOMAINS, TEST_METRICS };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MCCBScoring };
}
