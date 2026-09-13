# psy-exp — MCCB-related cognitive task research prototype

一个用于**认知测验数字化研究、实验流程自动化与数据管线验证**的网页项目。当前包含 10 个 MCCB 相关任务的浏览器实现、被试管理、原始结果导出、自动化回归测试和研究报告工具。

> [!WARNING]
> **当前版本不是经验证的 MCCB 临床等效实现。**
>
> 多个任务改变了标准施测通道或程序（例如口头施测改为视觉/键盘输入、实体材料改为屏幕交互、自定义 CPT 参数等），因此当前浏览器结果不能自动继承 MCCB 官方常模。
>
> 默认 scoring 只提供**项目内部探索性相对指数**，不生成 MCCB T 分、临床百分位或 MCCB composite。详细状态与 release blockers 见 [`RESEARCH_VALIDATION.md`](RESEARCH_VALIDATION.md)。

## 在线访问

GitHub Pages：<https://cochranek.github.io/psy-exp/>

页面主要用于开发、演示和研究原型验证。若用于真实研究，请先完成协议、授权、设备/浏览器计时验证与数据治理审查。

## 目前包含的任务

| 认知域 | 浏览器任务 | 当前定位 |
|---|---|---|
| 处理速度 | TMT、BACS Symbol Coding、Category Fluency | 研究适配；**MCCB 相关的 TMT 仅 Part A，Part B 为附加任务** |
| 注意/警觉 | CPT identical-pairs task | 研究适配；当前参数不视为标准 CPT-IP 等效实现 |
| 工作记忆 | Spatial Span、Letter-Number Span | 研究适配；施测通道与标准程序存在差异 |
| 言语学习 | HVLT-R-related verbal learning task | 研究适配；当前为视觉/自助式流程，不等同标准口头施测 |
| 视觉学习 | BVMT-R-related task | 研究适配，尚未建立数字等效性 |
| 推理与问题解决 | NAB Mazes-related task | 研究适配，尚未建立数字等效性 |
| 社会认知 | MSCEIT Managing Emotions-related task | 研究适配，尚未接入经验证的正式计分 |

官方 MCCB 项目及施测描述可参考 MATRICS Assessment：<https://www.matricsinc.org/mccbtestlist/>。

## 快速开始

在项目根目录启动静态服务器：

```bash
python -m http.server 8000 --bind 127.0.0.1
```

然后访问：

```text
http://127.0.0.1:8000/
```

项目是纯前端实现，主要数据保存在浏览器 `localStorage`。这意味着数据默认不会由本项目主动上传到服务器，但也意味着：

- 清理浏览器数据会丢失结果；
- 同一浏览器 profile 的操作者可能读取这些数据；
- `localStorage` 不应被当作临床级安全数据库；
- 正式研究应建立独立的加密、备份、访问控制和审计方案。

## 项目结构

```text
psy-exp/
├── index.html                 # 测验中心 / 被试面板
├── mccb-common.css            # 共用 UI
├── mccb-participant.js        # 被试 / localStorage 管理
├── mccb-scoring.js            # research-safe 聚合与可插拔 norm 接口
├── comprehensive-report.html # 综合报告
├── comparison-report.html    # 比较报告
├── RESEARCH_VALIDATION.md     # 测量学状态、限制和 release blockers
├── pages/                     # 10 个任务页面
├── data/                      # 本地数据/报告产物目录
├── docs/                      # 项目参考资料（公开发布前需持续做授权审查）
├── tests/                     # 自动化与验证脚本
└── .github/workflows/ci.yml  # CI 安全回归检查
```

## 被试管理

`mccb-participant.js` 提供：

- 被试编号与当前被试；
- 10 项任务进度；
- 按被试隔离的结果对象；
- 中断后返回并继续；
- 单被试删除；
- 全部被试 JSON 导出。

核心存储键：

```text
mccb-participant-list
mccb-current-participant
mccb-participant-{ID}
```

正式研究仍建议把浏览器本地存储替换为带 schema/version、加密、审计日志和备份策略的数据层。

## Scoring：当前安全策略

### 默认 `internal`

当前默认模式是：

```text
raw result
  ↓
exploratory domain contribution
  ↓
within-project cohort rank
```

它输出：

- `rawIndex`
- `indexScore`
- `cohortPercentile`

它**不会**输出：

- MCCB T-score
- 临床 percentile
- MCCB overall composite

另外，缺测域现在保持为 missing，不会再被当作 0 分参与组内排名。

### TMT 修正

MCCB 的速度处理项目是 **Trail Making Test: Part A**。当前代码仍可保存 Part B 作为附加研究数据，但 scoring 只允许 Part A 进入 MCCB-related 处理速度路径。

### 未来 validated norm adapter

接口仍支持：

```js
MCCBScoring.registerNorm({
  name: 'validated-example',
  label: '...',
  validated: true,
  apply(profiles, domains) {
    // validated, versioned transformation
  }
});
```

`validated: true` 只是软件门控条件，不是验证证据。真正启用前必须记录常模来源、版本、适用人群、缺失数据规则以及验证证据。

## 自动化测试

### 评分安全回归

```bash
node tests/verify-scoring.cjs
```

检查包括：

- raw metrics 提取；
- internal mode 不产生 T 分/composite；
- missing domain 不当作零分；
- TMT Part B 不泄漏进 MCCB-related contribution；
- 只有显式 validated norm 才允许 composite；
- norm 接口错误处理。

### Browser driver syntax

```bash
node tests/validate-drivers.cjs
```

### Full battery automation

需要 `agent-browser` 和本地静态服务器：

```bash
npm install -g agent-browser
python -m http.server 8766 --bind 127.0.0.1
node tests/full-battery.cjs
```

可用参数：

```bash
node tests/full-battery.cjs cpt,bvmt
node tests/full-battery.cjs --retry 1
node tests/full-battery.cjs --timestamp
node tests/full-battery.cjs --render
node tests/full-battery.cjs --list
```

> Browser automation 证明的是**软件行为与数据完整性**，不能证明数字任务与标准 MCCB 在心理测量学上等效。

## CPT 报告

```bash
python tests/cpt_report.py data/cpt-results/被试001.trep
python tests/cpt_report.py --all
```

该工具用于解析现有可读 `.trep` 输出并生成独立 HTML 报告。它与当前浏览器 CPT 任务是否具备 MCCB normative equivalence 是两个独立问题。

## CI

Pull Request / push 会执行：

- JavaScript syntax checks；
- scoring safety regression；
- browser-driver syntax validation；
- Python syntax check；
- 防止把 research percentile 再次误标成 T-score 的 guard。

## 下一阶段优先级

1. **P0 — 临床解释安全**：继续删除各 task 页面中未经验证的“优秀/正常/偏低”阈值。
2. **P0 — test security / licensing**：审查公开仓库中的受版权保护刺激、答案和操作资料的再分发权限。
3. **P1 — session QC**：统一 `valid / aborted / interrupted / timing_violation / technical_failure`。
4. **P1 — experiment clock**：所有计时任务改用 monotonic absolute deadline，并记录 timing jitter。
5. **P1 — schema/versioning**：每条结果记录 task version、schema version、scoring/norm version。
6. **P2 — validated adapters**：只有在程序等效性和常模来源明确后才增加正式 normative scoring。
7. **P2 — UI/报告**：明确区分 raw score、research index 与 validated normative score。

## 重要参考

- MCCB test list / administration descriptions: <https://www.matricsinc.org/mccbtestlist/>
- MCCB scoring-program instructions: <https://matricsinc.org/wp-content/uploads/2019/12/MCCB_MSCEIT_CD_Installation.pdf>
- Copyright-holder / technical-assistance information: <https://www.matricsinc.org/technical-assistance/>

## 免责声明

本仓库当前用于软件工程、研究原型和方法学开发，不提供诊断，不应将当前数字任务输出单独用于医疗决策或对个人作临床认知功能结论。
