# psy-exp — MCCB-related cognitive research prototype

`psy-exp` 是一个用于**浏览器认知任务研究、实验流程自动化、session QC、原始数据导出与研究管线验证**的纯前端项目。

> [!WARNING]
> **这不是经验证的 MCCB 临床等效实现，也不是官方 MCCB scoring software。**
> 当前公开任务是合成刺激研究任务、私有授权材料协议壳或与 MCCB 构念相关的数字适配。默认结果不能继承 MCCB 官方常模，不生成 MCCB T 分、临床 percentile 或 MCCB overall composite。

在线演示：<https://cochranek.github.io/psy-exp/>

## 当前安全边界

项目现在把四件事明确分开：

1. **软件是否按代码运行**：由 CI、语法测试、driver 校验和数据契约测试覆盖。
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

首次访问默认是 **USER mode**；DEV mode 必须显式开启。直接访问任务页但没有 `mode` 参数时，也会自动进入 USER mode。

## 私有材料

公开仓库不再分发标准词表、正式情绪管理题目、答案键、共识权重或操作者表格。需要授权材料的任务通过本地文件注入：

```text
private/stimuli.js
```

`private/` 已加入 `.gitignore`。可参考仓库中的示例模板创建本地配置，但不要把受保护材料提交回公共 Git 历史。

HVLT 结果只保存材料 ID / version / fingerprint 与回忆计数；MSCEIT shell 只保存私有 `score()` 返回的脱敏分数元数据，不把题目正文或答案键写入结果。

## 数据模型与 Session QC

公共 runtime：`mccb-participant.js`

当前版本：

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

这意味着：一次 valid retest 可以成为 canonical result，但此前 interrupted/timing-violation 记录不会被抹掉；之后发生 invalid retest，也不会覆盖已有 valid canonical result。

页面隐藏会把正在运行的 session 标记为 `interrupted`；未完成页面被卸载时标记为 `aborted`。invalid / unverified 结果可以审计，但默认不能进入 cohort ranking 或 validated norm adapter。

## Timing

`ExperimentRuntime.deadline()` 使用绝对单调 deadline，而不是相信 callback 恰好准时触发：

```js
ExperimentRuntime.deadline(durationMs, {
  testKey: 'bacs',
  label: 'formal_window',
  tickMs: 100,
  onTick,
  onDone
})
```

当前策略：

- BACS / Fluency / HVLT / Spatial / LNS / BVMT：absolute deadline
- CPT：absolute trial schedule + trial-level scheduled/actual onset、onset error、actual duration、RT
- TMT / Mazes / MSCEIT shell：monotonic elapsed

严重 timing drift 可把 session 标为 `timing_violation`。这提高研究数据可审计性，但**不等于已经证明跨设备/浏览器 timing equivalence**。

## Research-safe scoring

`mccb-scoring.js` 当前版本：

```text
research-scoring-0.4.0
```

默认 `internal` scoring 不再使用 `/110`、`/50`、`/24`、`/36` 等人为固定分母拼接任务，也不把项目内部排名伪装成 T 分。

流程是：

```text
QC-valid result
  → protocol/material/version compatibility gate
  → each required task: tied within-group rank
  → domain research cohort rank index
```

只有同时具备该认知域全部必要任务、且协议签名一致的参与者才进入该域参考组。每个域结果记录 `referenceN` 与 `referenceKey`。

### Fluency 特殊门槛

网页只能自动去重字符串，不能可靠判断任意文本是否真的是动物名称。因此新结果默认 `reviewStatus = unreviewed`，raw data 可查看，但在研究者把语义核验状态设为 `verified` 前，不进入处理速度域排名。

### Validated norm adapter

未来若注册 `validated: true` 的 norm adapter，代码强制要求：

- `version`
- `provenance`
- `supportsTask(testKey, task)`
- `apply(profiles, domains)`

adapter 只会收到 QC-valid 且由 `supportsTask()` 明确接受的任务。只有 validated adapter 输出完整七域 T-score 时，工程层才允许生成 composite。

这些字段只是**软件安全门**，并不构成心理测量验证证据。

## 报告

推荐使用：

- `research-report.html`：单被试 raw metrics + QC + protocol-compatible research rank
- `research-comparison.html`：多被试 QC-aware comparison

旧 `comprehensive-report.html` / `comparison-report.html` 会转到研究安全页面。首页旧的 0–100 启发式“标准化”图表已停用。

## CI

CI 当前检查：

```bash
node --check mccb-scoring.js
node --check mccb-participant.js
node tests/validate-inline-scripts.cjs
node tests/verify-participant.cjs
node tests/verify-scoring.cjs
node tests/verify-manifest.cjs
node tests/validate-drivers.cjs
python -m py_compile tests/cpt_report.py
```

此外还有硬 guard，防止：

- research index 被重新标成 MCCB T-score
- arbitrary fixed-denominator scaling 重新进入 scoring
- TMT Part B 泄漏进 MCCB-related processing-speed logic
- invalid / unverified session 进入默认 scoring
- 未经人工语义核验的 Fluency 进入 scoring
- 公共树重新出现已移除的操作者表格或公开 HVLT word list
- manifest / runtime / scoring metadata 漂移

## 项目结构

```text
psy-exp/
├── index.html
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

即使所有 CI 通过，也不能据此声称：

- 与标准 MCCB 数字等效
- 可使用 MCCB 官方常模解释
- 可用于临床诊断或“正常/异常”判断
- 合成刺激任务等同于其对应版权测验
- GitHub Pages / localStorage 满足正式临床数据治理要求

要进入 validated mode，需要独立完成目标设备/浏览器 timing conformance、施测流程一致性研究、重测/信度/效度研究、常模与授权审查，并冻结 task/material/scoring 版本。

## Test security / Git 历史

当前工作树已经移除公开操作者表格和内嵌受保护刺激，但**删除文件不会自动从历史 commit 中清除旧内容**。若过去提交过不应公开的材料，需要额外执行 Git history purge；见 [`docs/HISTORY_PURGE.md`](docs/HISTORY_PURGE.md)。

## 官方背景资料

- MCCB test list: <https://www.matricsinc.org/mccbtestlist/>
- MATRICS technical assistance / copyright information: <https://www.matricsinc.org/technical-assistance/>

代码许可与第三方测验材料权利是两件不同的事；不要因为项目代码公开就推定测试材料可以自由再分发。
