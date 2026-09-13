# Research validation status

> **Status: research prototype — not a clinically equivalent MCCB implementation.**
>
> 当前代码已经完成工程层面的安全化、材料隔离、session QC、版本/溯源与 research-safe scoring 改造，但这不构成心理测量等效性证据。

## 四层验证模型

本项目把“验证”拆成四层，避免 CI 通过被误解成临床有效：

1. **Engineering correctness**：代码能否稳定运行、保存、导出、回归测试通过。
2. **Session validity**：本次施测是否存在切屏、中断、严重 timing drift 或技术失败。
3. **Research comparability**：两个结果是否来自兼容的 task version / protocol / material / scoring signature。
4. **Psychometric / normative validity**：数字流程是否与标准施测等效、是否有资格使用 MCCB 常模/T-score/composite。

当前前三层有工程实现；第四层仍为 **未验证**。

## 当前任务矩阵

| Task | 当前实现 | 当前公开材料 | Timing | MCCB-equivalent? |
|---|---|---|---|---:|
| TMT | 浏览器 Part A + supplemental Part B | public-domain-related | monotonic elapsed | **No** |
| BACS-related | 合成符号编码 | synthetic | absolute deadline | **No** |
| Category Fluency | typed Animal Naming | public-domain-related | absolute deadline | **No** |
| CPT-related | 自定义 4 位 identical-pairs | synthetic | absolute trial schedule + onset log | **No** |
| Spatial Span-related | 算法生成 3×3 forward/reverse 序列 | synthetic | absolute deadline | **No** |
| LNS-related | 算法生成字母数字排序序列 | synthetic | absolute deadline | **No** |
| HVLT-related | 私有授权词表协议壳 | **private only** | absolute deadline | **No** |
| BVMT-related | 合成符号网格视觉学习 | synthetic | absolute deadline | **No** |
| Mazes-related | 算法生成迷宫规划 | synthetic | monotonic elapsed | **No** |
| MSCEIT-related | 私有题目 + 私有 `score()` 协议壳 | **private only** | monotonic elapsed | **No** |

机器可读版本见 `task-manifest.json`。任何任务从 `mccbEquivalent:false` 变成 `true` 都必须有单独的验证证据、审查记录与冻结版本，不能只改一个布尔值。

## TMT policy

MCCB-related processing-speed 映射只使用 **Trail Making Test Part A**。Part B 可保留为 supplemental research data，但不能进入 MCCB-related processing-speed scoring。

官方 MCCB test list：<https://www.matricsinc.org/mccbtestlist/>

## Session QC

公共 runtime 当前定义：

```text
valid
aborted
interrupted
timing_violation
technical_failure
unverified
```

结果保存为：

```text
results         canonical valid result
invalidResults  最近一次 invalid attempt
attemptHistory  每任务最近 20 次尝试
sessions        session QC snapshot
progress        当前状态
```

### 关键不变量

- 页面隐藏时，活动 session → `interrupted`。
- 未完成页面离开 → `aborted`。
- 明显超出 timing tolerance → `timing_violation`。
- invalid result 不能成为 canonical result。
- valid retest 可以成为 canonical result，但旧 invalid attempt 继续保留在审计历史。
- valid canonical result 后出现 invalid retest，不得覆盖 canonical result，也不得把已完成状态降级。
- 旧数据无 QC envelope → `unverified`，只显示 raw data。

## Timing

当前 runtime 使用单调时钟并支持 absolute deadline。CPT 使用自己的绝对 trial timeline，逐 trial 保存：

```text
scheduled onset
actual onset
onset error
actual stimulus duration
response time
```

这些数据用于判断 session 数据质量与设备/浏览器差异，但目前尚未完成目标硬件矩阵的 timing conformance study。因此，“timer 更正确”不能写成“已经心理测量等效”。

## Research scoring policy

当前 scoring version：

```text
research-scoring-0.4.0
```

### 已删除的旧方法

旧实现曾用 `/110`、`/50`、`/24`、`/36` 等人为固定分母，把不同任务缩放后平均。这种方法会制造不存在的统一量尺，现已删除，并由 CI guard 禁止重新引入。

### 当前默认 internal index

当前只允许：

```text
QC-valid result
→ protocol/material/version compatibility gate
→ required task complete gate
→ per-task tied cohort rank
→ domain research cohort rank index
```

结果字段包括：

```text
indexScore
referenceN
referenceKey
testRanks
scoreType = research-cohort-rank-index
```

它不是临床 percentile，也不是 MCCB T-score。

### Missing data

默认研究 index 要求一个域所需的所有研究任务都齐全。缺任务就缺域，不把缺失当作 0 分，也不从不完整的混合任务集合强行生成域分。

这条规则是**本项目的保守 research policy**，不是对官方 MCCB missing-data 规则的复制。未来 validated adapter 必须独立实现并验证其自己的 missing-data rule。

### Category Fluency semantic review

网页可以去重输入，但不能可靠判断任意字符串是否属于动物名称，也不能自动处理同义词、上下位词和语言变体。

因此：

- raw result 始终可保留；
- 新结果默认 `reviewStatus = unreviewed`；
- 未被研究者标记为 `verified` 的 Fluency 不进入 cohort scoring；
- 该状态会导致 processing-speed research domain 暂不生成。

## Protocol compatibility

项目内 rank 也不能把不同研究协议混在一起。

默认 reference group 至少区分：

- task version
- task protocol identifier
- HVLT private set ID / version / fingerprint
- MSCEIT private item-set version / private scoring version

因此，更换材料或计分版本后，不会自动和旧版本形成同一个 reference pool。

## Validated norm adapter gate

未来 `validated:true` adapter 必须至少声明：

```js
{
  name: '...',
  version: '...',
  provenance: '...',
  validated: true,
  supportsTask(testKey, task) { ... },
  apply(profiles, domains) { ... }
}
```

工程层保证：

- invalid / unverified tasks 不进入 adapter；
- adapter 只能看到自己显式接受的 task/version/protocol；
- 只有 validated adapter 生成完整七域 T-score 时才允许 composite。

这些门槛只是防止误用，**不是 validated status 的证据**。

## Protected materials / redistribution

当前工作树已经采取以下措施：

- 删除两份公开 MCCB operator-form 文本；
- HVLT 页面不再内嵌词表；
- MSCEIT 页面不再公开题目/答案/评分权重；
- WMS/LNS/BVMT/Mazes 类页面改用算法生成或合成刺激；
- `private/` 默认 git-ignored；
- CI 会检查受保护材料不会重新回到公开树。

MATRICS technical assistance / copyright background：<https://www.matricsinc.org/technical-assistance/>

### 重要：Git history 仍需单独处置

从当前树删除文件并不会删除历史 blob。若历史版本包含不应公开的材料，需要执行 repository history rewrite，并处理缓存/PR refs 等遗留对象。见 `docs/HISTORY_PURGE.md`。

这不是当前代码 PR 能通过普通文件 API 安全完成的操作，因为它会重写大量 commit SHA 和协作者历史。

## Reporting policy

当前推荐报告：

- `research-report.html`
- `research-comparison.html`

必须明确显示：

- raw metric
- session QC
- task/protocol validation status
- research cohort rank 的 reference group 大小
- 当前 norm / scoring version
- 非 MCCB-equivalent 声明

旧 T-score-shaped 页面不应作为默认报告入口。

## Definition of done for a future “validated MCCB mode”

至少需要全部完成：

- exact administration protocol frozen per task；
- material/scoring redistribution rights and test security resolved；
- target browser/device timing conformance completed；
- digital-vs-standard empirical equivalence evidence for every adapted task；
- reliability / validity / repeated-measure properties documented where relevant；
- validated normative transformations with provenance and versioning；
- validated missing-data rules reproduced and conformance-tested；
- known-answer reference fixtures for scoring；
- result stores task/material/scoring/norm/QC provenance；
- privacy/security architecture appropriate to intended research/clinical environment；
- independent review confirms report labels do not overstate validity。

在这些条件满足之前，应坚持使用 **research prototype / research adaptation / raw score / cohort rank index** 等表述，而不是 “MCCB score”“clinical percentile”“normal/impaired”。

## Automated tests are not psychometric validation

CI 能证明的是工程约束没有被明显破坏，例如：语法、数据持久化、session QC、材料策略、protocol grouping、TMT Part-B isolation、无伪 T-score、无 arbitrary denominator scaling 等。

CI 不能证明数字任务与标准 MCCB 在心理测量意义上可互换。
