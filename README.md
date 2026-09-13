# psy-exp — MCCB-related cognitive task research prototype

一个用于**认知任务数字化研究、实验流程自动化、数据质量控制和结果管线验证**的纯前端项目。当前包含 10 个 MCCB 相关浏览器任务、被试管理、session QC、原始结果导出、研究安全评分、自动化回归测试与研究报告。

> [!WARNING]
> **当前版本不是经验证的 MCCB 临床等效实现。**
>
> 多个任务改变了标准施测通道或程序，因此浏览器结果不能自动继承 MCCB 官方常模。默认 scoring 只提供项目内部探索性指数；不生成 MCCB T 分、临床百分位或 MCCB overall composite。
>
> 详细验证状态、限制和 release blockers：[`RESEARCH_VALIDATION.md`](RESEARCH_VALIDATION.md)

## 在线访问

GitHub Pages：<https://cochranek.github.io/psy-exp/>

页面适合开发、演示和研究原型验证。若用于真实研究，请先完成研究协议、材料授权、设备/浏览器计时验证、隐私与数据治理审查。

## 当前任务定位

| 认知域 | 浏览器任务 | 当前定位 |
|---|---|---|
| 处理速度 | TMT、BACS Symbol Coding、Category Fluency | 研究适配；MCCB 相关 TMT 只使用 Part A，Part B 为附加数据 |
| 注意/警觉 | CPT identical-pairs task | 研究适配；当前参数不视为标准 CPT-IP 等效实现 |
| 工作记忆 | Spatial Span、Letter-Number Span | 研究适配；施测通道与标准程序存在差异 |
| 言语学习 | HVLT-R-related task | 研究适配；当前视觉/自助式流程不等同标准口头施测 |
| 视觉学习 | BVMT-R-related task | 研究适配；数字等效性尚未建立 |
| 推理与问题解决 | NAB Mazes-related task | 研究适配；数字等效性尚未建立 |
| 社会认知 | MSCEIT-related task | 研究适配；未接入正式授权/验证计分 |

官方 MCCB 项目及施测描述：<https://www.matricsinc.org/mccbtestlist/>

## 快速开始

```bash
python -m http.server 8000 --bind 127.0.0.1
```

浏览器打开：

```text
http://127.0.0.1:8000/
```

项目主要数据保存在浏览器 `localStorage`。这便于离线原型，但不是临床级数据库：清理浏览器数据会丢失结果，同一浏览器 profile 的使用者也可能读取本地数据。正式研究应使用独立的加密、备份、访问控制和审计数据层。

## 项目结构

```text
psy-exp/
├── index.html                  # 测验中心 / 被试面板
├── mccb-common.css             # 共用 UI
├── mccb-participant.js         # 被试存储 + session QC + runtime guardrails
├── mccb-scoring.js             # research-safe 聚合 / norm adapter API
├── research-report.html        # 当前推荐报告：raw + QC + research index
├── comprehensive-report.html   # 旧报告入口，自动转到 research-report
├── comparison-report.html      # 历史比较报告
├── RESEARCH_VALIDATION.md      # 验证边界、限制、release blockers
├── pages/                      # 10 个浏览器任务
├── data/                       # 本地数据 / 报告产物目录
├── docs/                       # 参考资料；公开发布前持续做授权审查
├── tests/                      # 自动化与安全回归测试
└── .github/workflows/ci.yml    # CI
```

## Session QC 与结果状态

新结果统一记录 session metadata：

```text
valid
aborted
interrupted
timing_violation
technical_failure
unverified
```

公共 runtime 使用 `performance.now()`（可用时）记录单调时钟，并监听页面可见性/离开事件：

- `visibilitychange`：活动 session 标记 `interrupted`
- `pagehide`：未完成 session 标记 `aborted`
- `saveResult()`：保留此前 invalid 状态，不会在保存时恢复成 valid

结果结构包含 `_meta`：

```json
{
  "_meta": {
    "schemaVersion": 2,
    "taskVersion": "research-web-0.2.0",
    "administration": "digital_research_adaptation",
    "mccbEquivalent": false,
    "participantId": "P001",
    "sessionQc": {
      "status": "valid",
      "elapsedMs": 12345,
      "clock": "performance.now"
    }
  }
}
```

### 有效结果与无效尝试分离

被试对象分别保存：

```text
results         # canonical valid results
invalidResults  # interrupted / aborted / timing violation / technical failure
sessions        # session QC snapshots
progress        # not_started / in_progress / completed / completed_invalid / ...
```

无效尝试保留用于审计，但不会进入正常完成槽位。若某任务之后重新完成一次 valid retest，则 valid 结果成为 canonical result。

历史数据没有 QC envelope 时标记为 `unverified`：仍可查看 raw data，但默认不进入项目内群体排名。

## Scoring：research-safe 默认策略

默认 `internal` 模式：

```text
QC-valid raw result
  ↓
exploratory domain contribution
  ↓
within-project cohort rank
```

输出：

- `rawIndex`
- `indexScore`
- `cohortPercentile`

不输出：

- MCCB T-score
- 临床 percentile
- MCCB overall composite

缺测域保持 missing，不按 0 分处理；`invalid` 和 `unverified` session 也不会进入默认 ranking pool。

### TMT

当前任务仍保留 Part A + Part B，但 MCCB 相关处理速度聚合只使用 **Part A**。Part B 仅为 supplemental data。

### 未来 validated norm adapter

`MCCBScoring.registerNorm()` 保留扩展接口。只有显式 `validated: true` 且七个域 T-score 完整时，工程层才允许生成 composite。

该 flag 只是软件安全门，**不是验证证据本身**。任何 validated adapter 都必须另外记录版本、常模来源、授权状态与验证依据。

## 研究版报告

推荐使用：

```text
research-report.html
```

它明确区分：

- 原始任务指标
- session QC
- 项目内探索性相对位置
- future validated norm

旧 `comprehensive-report.html` 假设 T-score-shaped data，因此现在自动重定向到研究安全报告。

每个任务页原有 `.norm-ref` 临床样式解释也由公共 runtime 锁定为研究提示，避免旧的“优秀 / 正常 / 偏低”等启发式阈值继续呈现为有效常模解释。

## Timing

当前公共 `ExperimentRuntime` 提供：

```js
ExperimentRuntime.deadline(durationMs, {
  onTick,
  onDone,
  tickMs: 100
})
```

它以绝对单调 deadline 测量时间，`setTimeout` 只负责唤醒调度。

仍需继续迁移任务页中基于 callback 次数递减的 `setInterval()` 倒计时，并为 CPT 等 timing-critical task 增加 trial-level scheduled onset / actual onset / jitter 记录和设备验证。

## 自动化验证

CI 当前覆盖：

```bash
node --check mccb-scoring.js
node --check mccb-participant.js
node tests/verify-participant.cjs
node tests/verify-scoring.cjs
node tests/validate-drivers.cjs
python -m py_compile tests/cpt_report.py
```

此外还有 guardrails 防止：

- 项目内部 percentile 被重新包装成 MCCB T-score
- invalid / unverified session 重新进入默认 research ranking
- research-safe report 被误删
- TMT Part B 再次泄漏进 MCCB 相关处理速度逻辑

浏览器 full battery：

```bash
python -m http.server 8766 --bind 127.0.0.1
node tests/full-battery.cjs
```

自动化测试只能证明软件流程和工程约束，没有能力证明数字任务与标准 MCCB 心理测量等效。

## 材料授权与 test security

多个 MCCB 组成测验存在独立版权/授权要求。公开完整刺激材料、答案、操作者资料或衍生复现前，应确认相关权利与 test-security 要求。

MATRICS technical assistance：<https://www.matricsinc.org/technical-assistance/>

## 下一阶段优先级

1. 将 BACS / Fluency / HVLT 等倒计时迁移到 absolute-deadline clock。
2. CPT 增加 trial-level timing jitter / dropped-frame / visibility QC。
3. 从各任务源代码中彻底删除已失效的启发式“正常/异常”阈值分支。
4. 完成受保护材料的 redistribution / test-security 审核。
5. 为 task / result / scoring / norm 建立正式版本与 provenance。
6. 对目标浏览器与设备做 timing conformance suite。

## License / clinical-use note

仓库代码的许可与其中第三方测验材料的权利是两个不同问题。代码可公开不代表第三方测试材料可自由复制或用于临床施测。请分别核查。
