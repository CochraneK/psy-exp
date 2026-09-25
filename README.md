<div align="center">

# psy-exp

**Browser-native cognitive research prototype**

<p>
  <img alt="Research prototype" src="https://img.shields.io/badge/type-cognitive%20research%20prototype-6C63FF">
  <img alt="Frontend" src="https://img.shields.io/badge/runtime-browser%20only-2F80ED">
  <img alt="QC" src="https://img.shields.io/badge/pipeline-session%20QC%20%2B%20raw%20export-27AE60">
  <img alt="MCCB boundary" src="https://img.shields.io/badge/MCCB-not%20an%20official%20implementation-F2994A">
</p>

**在线演示**（仓库私有化后已下线，恢复公开后重新启用） · [**Architecture**](docs/architecture.md) · [**Agent handoff**](HANDOFF.md) · [**UI / UX 说明**](docs/UI_UX_V2.md) · [**Research evidence**](docs/EVIDENCE_REGISTER.md) · [**Design tokens**](docs/DESIGN_TOKENS.md)

</div>

`psy-exp` 用于**浏览器认知任务研究、实验流程自动化、session QC、原始数据导出与研究管线验证**，并把研究者控制台与参与者施测界面明确分离。

> [!WARNING]
> **这不是经验证的 MCCB 临床等效实现，也不是官方 MCCB scoring software。** 当前公开任务是合成刺激研究任务、私有授权材料协议壳或与 MCCB 构念相关的数字适配。默认结果不能继承 MCCB 官方常模，不生成 MCCB T 分、临床 percentile 或 MCCB overall composite。

## 当前产品结构

项目把研究者与参与者界面分开：

- `index.html` — **Researcher Console**：参与者管理、QC 概览、任务检查/重测、报告与数据导出。
- `participant-runner.html` — **Participant Runner**：固定 USER mode 的参与者施测入口、任务进度、下一任务与设备/软件预检。
- `research-report.html` — 单参与者 raw metrics + QC + protocol-compatible research rank。
- `research-comparison.html` — 多参与者、按 reference group 隔离的研究对比与 CSV 导出。
- `pages/` — 10 个具体研究任务。

Researcher Console / 报告使用 `research-ui.css` 的长页面应用 shell；实验任务继续使用 `mccb-common.css` 的全屏任务 shell。两者故意分离，避免管理/报告页面被实验页的 `100vh + overflow:hidden` 布局截断。

详见 [`docs/UI_UX_V2.md`](docs/UI_UX_V2.md)。

## Agent / 协作接管

本仓库把 Git 作为长期 canonical state。新的 Agent / 对话 / 电脑优先读取：

```text
AGENTS.md
→ HANDOFF.md
→ STATUS.md
→ DECISIONS.md
→ docs/architecture.md
→ 与任务相关的 canonical protocol / validation files
```

这套 handoff 只负责连续性，不会覆盖 `task-manifest.json`、`protocol-lock.json`、`RESEARCH_VALIDATION.md` 等研究原生真相。

## 当前安全边界

项目明确区分四件事：

1. **软件是否按代码运行**：由静态契约、Node 测试与真实 Chromium smoke test 覆盖。
2. **一次 session 是否可用于研究分析**：由 `valid / interrupted / aborted / timing_violation / technical_failure / unverified` QC 状态控制。
3. **不同结果能否放在同一研究参考组比较**：默认只比较相同 task version / protocol / material-or-scoring signature 的 QC-valid 结果。
4. **是否具有 MCCB 心理测量等效性**：当前全部为 `false`；必须通过独立实证验证才能改变。

机器可读状态见 [`task-manifest.json`](task-manifest.json)，详细验证边界见 [`RESEARCH_VALIDATION.md`](RESEARCH_VALIDATION.md)。

## 10 个任务的当前定位

| key | 当前公开实现 | 材料策略 | 默认可用于项目内 rank |
|---|---|---|---|
| `tmt` | 浏览器 TMT；MCCB-related 部分只用 Part A | public-domain-related | QC-valid |
| `bacs` | 合成符号编码任务 | synthetic public stimuli | QC-valid |
| `fluency` | 键盘输入 Animal Naming | public-domain-related | **需人工语义核验** |
| `cpt` | 自定义 4 位 identical-pairs | synthetic public stimuli | QC-valid + protocol-compatible |
| `spatial-span` | 算法生成 3×3 空间序列 | synthetic public stimuli | QC-valid |
| `lns` | 算法生成字母数字排序序列 | synthetic public stimuli | QC-valid |
| `hvlt` | 私有词表研究协议壳 | private licensed assets required | QC-valid + same material fingerprint |
| `bvmt` | 合成符号网格视觉学习任务 | synthetic public stimuli | QC-valid |
| `mazes` | 算法生成迷宫规划任务 | synthetic public stimuli | QC-valid |
| `msceit` | 私有题目 + 私有 `score()` 协议壳 | private licensed assets required | QC-valid + same item/scoring signature |

这些页面保留 MCCB 构念/组件映射是为了研究追踪，不表示标准施测等效。

## 快速启动

```bash
python -m http.server 8000 --bind 127.0.0.1
```

然后打开：

```text
http://127.0.0.1:8000/
```

首次访问默认是 **USER mode**。研究者可在 Console 的高级区域显式选择 DEV mode 做单项调试；Participant Runner 始终使用 USER mode。

## Participant Runner 与预检

Runner 在正式进入任务前记录一个本地 preflight snapshot，包括：

- localStorage 是否可写；
- `performance.now()` 是否可用；
- 短时 timer-jitter 快测（p95 / max drift）；
- 页面 visibility；
- viewport / DPR / screen；
- secure context；
- 浏览器暴露的 hardware concurrency / touch metadata；
- reduced-motion preference；
- user agent / language。

这些字段用于发现明显的软件/设备风险，**不是跨设备 timing equivalence 证据**。正式研究还应根据最小化原则审查哪些设备字段确有必要保存。

计时任务中切换标签页、锁屏或导致页面不可见，会进入对应 session QC 流程。TMT 达到协议时间上限但未完成时标记为 `aborted / protocol_time_limit_reached_incomplete`，不再错误归类成设备 `timing_violation`。

## 私有材料

公开仓库不分发标准词表、正式情绪管理题目、答案键、共识权重或操作者表格。需要授权材料的任务通过本地文件注入：

```text
private/stimuli.js
```

`private/` 已加入 `.gitignore`。可参考仓库中的示例模板创建本地配置，但不要把受保护材料提交回公共 Git 历史。

HVLT 结果只保存材料 ID / version / fingerprint 与回忆计数；MSCEIT shell 只保存私有 `score()` 返回的脱敏分数元数据，不把题目正文或答案键写入结果。

## 数据模型与 Session QC

公共 runtime：`mccb-participant.js`

```text
runtime: research-runtime-0.4.0
participant schema: 4
result schema: 4
```

每次 session 使用单调时钟（浏览器中优先 `performance.now()`），并保存 task/runtime version、timing policy、事件与 QC。

结果分为：

```text
results         canonical valid result
invalidResults  最近一次 invalid attempt
attemptHistory  每任务最近 20 次完整尝试（valid + invalid）
sessions        session QC snapshot
progress        当前任务状态
```

valid retest 可以成为 canonical result，但此前 interrupted / timing-violation 记录不会被抹掉；之后发生 invalid retest，也不会覆盖已有 valid canonical result。

## Timing

`ExperimentRuntime.deadline()` 使用绝对单调 deadline，而不是相信 callback 恰好准时触发。

当前策略：

- BACS / Fluency / HVLT / Spatial / LNS / BVMT：absolute deadline
- CPT：absolute trial schedule + trial-level scheduled/actual onset、onset error、actual duration、RT
- TMT / Mazes / MSCEIT shell：monotonic elapsed

严重 callback/timing drift 可把 session 标为 `timing_violation`。这提高研究数据可审计性，但**不等于已经证明跨设备/浏览器 timing equivalence**。

## Research-safe scoring

`mccb-scoring.js` 当前默认 scoring 不使用人为固定分母拼接任务，也不把项目内部排名伪装成 T 分。

```text
QC-valid result
  → protocol/material/version compatibility gate
  → each required task: tied within-group rank
  → domain research cohort rank index
```

只有同时具备该认知域全部必要任务、且协议签名一致的参与者才进入该域参考组。每个域结果记录 `referenceN` 与 `referenceKey`。

### UI 小样本防误读

scoring engine 会保留兼容组内排名结果，但报告 UI 额外设置展示 guardrail：

- `reference N < 5`：不展示 0–100 rank 数字；
- `reference N = 5–9`：标记为探索性 / 对样本组成敏感；
- `reference N >= 10`：正常展示，但仍明确是项目内 research rank，不是临床 percentile。

这个 N 门槛只是**界面 anti-false-precision 规则**，不是经验证的统计学或心理测量样本量阈值。

### Fluency 特殊门槛

网页只能自动去重字符串，不能可靠判断任意文本是否真的是动物名称。因此新结果默认 `reviewStatus = unreviewed`，raw data 可查看，但在研究者把语义核验状态设为 `verified` 前，不进入处理速度域排名。

### Validated norm adapter

未来若注册 `validated: true` 的 norm adapter，代码强制要求：

- `version`
- `provenance`
- `supportsTask(testKey, task)`
- `apply(profiles, domains)`

adapter 只会收到 QC-valid 且由 `supportsTask()` 明确接受的任务。只有 validated adapter 输出完整七域 T-score 时，工程层才允许生成 composite。这些字段只是软件安全门，不构成心理测量验证证据。

## CI / 自动化验证

CI 当前包含三层：

### 1. 静态与数据契约

```bash
node --check mccb-scoring.js
node --check mccb-participant.js
node tests/validate-inline-scripts.cjs
node tests/verify-participant.cjs
node tests/verify-scoring.cjs
node tests/verify-manifest.cjs
node tests/validate-drivers.cjs
```

### 2. UI / accessibility contract

```bash
node tests/verify-ui.cjs
```

该检查覆盖所有 10 个任务的 viewport/lang 基线，并禁止重新加入 `user-scalable=no` / `maximum-scale=1`；同时检查 Researcher Console / Runner / 报告的关键 UI 安全边界。

### 3. 真实 Chromium smoke

```bash
node tests/browser-smoke.cjs
```

该脚本不依赖 Playwright/Selenium：在 GitHub runner 上启动本地 HTTP server 和预装 Chromium/Chrome，通过 Chrome DevTools Protocol 实际执行页面 JavaScript，验证 Console、Runner、单人报告、对比页及 USER-mode 任务返回流程。

这仍然是 smoke test，不是完整视觉回归或设备 timing validation。

CI 还包含 fail-closed guard，防止：

- research index 被重新标成 MCCB T-score；
- arbitrary fixed-denominator scaling 重新进入 scoring；
- TMT Part B 泄漏进 processing-speed logic；
- invalid / unverified session 进入默认 scoring；
- 未经人工语义核验的 Fluency 进入 scoring；
- 公共树重新出现操作者表格或公开 HVLT word list；
- Windows/本机绝对路径和旧 browser harness 回归；
- 任务页重新禁止浏览器缩放；
- manifest / runtime / scoring metadata 漂移。

旧的机器绑定 `tests/cpt_report.py` 已移除；它不属于当前自定义 CPT 浏览器协议，也不再作为 CI 的 Python 特例存在。

## 项目结构

```text
psy-exp/
├── index.html
├── participant-runner.html
├── research-ui.css
├── mccb-participant.js
├── mccb-scoring.js
├── task-manifest.json
├── research-report.html
├── research-comparison.html
├── RESEARCH_VALIDATION.md
├── docs/
├── pages/
├── tests/
└── .github/workflows/ci.yml
```

## 仍然不能声称的事情

即使所有 CI 和 Chromium smoke 都通过，也不能据此声称：

- 与标准 MCCB 数字等效；
- 可使用 MCCB 官方常模解释；
- 可用于临床诊断或“正常/异常”判断；
- 合成刺激任务等同于其对应版权测验；
- GitHub Pages / localStorage 满足正式临床数据治理要求；
- 一台 CI 虚拟机上的浏览器 smoke 等同于真实目标设备的 timing conformance。

进入 validated mode 仍需要独立完成目标设备/浏览器矩阵、timing conformance、施测流程一致性、重测/信度/效度、常模与授权审查，并冻结 task/material/scoring 版本。

## Test security / Git 历史

当前工作树已经移除公开操作者表格和内嵌受保护刺激，但**删除文件不会自动从历史 commit 中清除旧内容**。若过去提交过不应公开的材料，需要额外执行 Git history purge；见 [`docs/HISTORY_PURGE.md`](docs/HISTORY_PURGE.md)。

## 官方背景资料

- MCCB test list: <https://www.matricsinc.org/mccbtestlist/>
- MATRICS technical assistance / copyright information: <https://www.matricsinc.org/technical-assistance/>

代码许可与第三方测验材料权利是两件不同的事；不要因为项目代码公开就推定测试材料可以自由再分发。