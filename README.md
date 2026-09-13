# MCCB 认知测验套件

精神分裂症认知功能成套测验（MCCB）的网页化实现。10 项测验 + 被试管理系统，纯前端（HTML/CSS/JS），数据存于浏览器 localStorage，可离线运行。

## GitHub Pages 在线访问

**https://cochranek.github.io/psy-exp/** — 无需本地部署，浏览器直接打开即可使用。

> 所有数据存于浏览器 localStorage（本地存储），不会上传至服务器。

## 快速开始（本地部署）

用任意 HTTP 静态服务器在项目根目录启动，然后浏览器打开 `index.html`：

```bash
# 项目根目录启动静态服务器
python -m http.server 8000 --bind 127.0.0.1
# 浏览器访问 http://127.0.0.1:8000/
```

> 必须通过 HTTP 访问（不能用 `file://`），否则 localStorage 与脚本加载会受限。

## 目录结构

```
psy-exp/
  index.html              入口页（测验中心 + 被试面板）
  mccb-common.css         10 个测验页共享 CSS（365 行，53 个变量）
  mccb-participant.js     被试管理系统（ParticipantManager）
  pages/                  10 个测验页（mccb-*.html）
  data/                   CPT 原始数据 / 报告 / 自动化测试产物
  docs/                   参考资料（操作者表格 A/B、队列研究者手册等 PDF/TXT）
  tests/                  自动化测试与一次性工具脚本
  .workbuddy/memory/      项目工作日志与笔记
```

## 10 项测验

| 测验 | 文件 | 类型 |
|------|------|------|
| BACS 符号编码 | `pages/mccb-bacs.html` | DOM 输入 |
| 语义流畅性 | `pages/mccb-fluency.html` | DOM 按钮 |
| HVLT-R 言语学习 | `pages/mccb-hvlt.html` | DOM 选择 |
| CPT-IP 持续操作 | `pages/mccb-cpt.html` | 全屏响应 |
| WMS-III 空间广度 | `pages/mccb-spatial-span.html` | DOM 方块 |
| 字母-数字广度 LNS | `pages/mccb-lns.html` | DOM 输入 |
| TMT 连线测验 | `pages/mccb-tmt.html` | Canvas |
| BVMT-R 视觉空间记忆 | `pages/mccb-bvmt.html` | Canvas |
| NAB 迷宫 | `pages/mccb-mazes.html` | Canvas |
| MSCEIT 情绪管理 | `pages/mccb-msceit.html` | DOM 评分 |

## 双模式

- **DEV 模式**（默认 `?mode=dev`）：显示反馈面板 / 正确错误标记 / 统计 / 快速反馈，用于开发测试
- **USER 模式**（`?mode=user`）：隐藏全部开发辅助元素，供真实被试作答
- index.html 顶部有 DEV/USER 切换开关，存入 `localStorage('mccb_mode')`

## 被试管理系统

每个被试分配一个队列编号，可中途退出凭编号续做；支持多被试数据隔离与批量管理。

- 登录 / 进度 / 续做 / 结果导出集中在 index.html 被试面板
- **被试管理**（👥 被试管理按钮）：弹窗显示所有被试列表、进度条、最近更新时间，支持**单个删除**和**一键导出全部**（JSON）
- **导出全部**：`mccb-all-participants-{date}.json` 包含每位被试的完整数据
- **清除数据**增强：登录态下自动清除全部被试数据而非仅 global localStorage
- **被试删除**自动清理：`mccb-participant-{ID}` 数据对象 + 向后兼容的 `mccb-participant-{ID}-mccb-*-result` 残留键
- 存储键：`mccb-participant-{ID}`（进度 + 结果）、`mccb-participant-list`、`mccb-current-participant`
- 详见 `mccb-participant.js`

## 自动化测试

`tests/full-battery.cjs` 用 [agent-browser](https://www.npmjs.com/package/agent-browser) 驱动无头浏览器，模拟被试自动完成全部 10 项测验，结果写入 `data/autotest/`。

**前置条件**（agent-browser v0.27 起不再内置静态服务器）：

```bash
npm install -g agent-browser          # 一次性安装 CLI
python -m http.server 8766 --bind 127.0.0.1 &   # 项目根目录起静态服务器，脚本自动探测
```

**用法**：

```bash
node tests/full-battery.cjs                # 全量 10 项
node tests/full-battery.cjs cpt,bvmt       # 指定子集
node tests/full-battery.cjs --retry 1      # 单项失败自动重试 N 次（抗 daemon 抖动）
node tests/full-battery.cjs --timestamp    # 报表文件名带时间戳（保留历史）
node tests/full-battery.cjs --render       # 从最新 JSON 重生成 HTML 报表（免重跑）
node tests/full-battery.cjs --list / --help
```

- 环境变量：`MCCB_BASE`（静态服务器地址，默认 `http://127.0.0.1:8766`）、`MCCB_PARTICIPANT`（被试编号，默认 `test`）
- 产物：`data/autotest/battery-test-report.json`（全量原始数据）+ `battery-test-report.html`（可视化报表）
- 退出码：`0` 全部通过；`2` 数据完整性未达标（可直接接 CI）

**架构**：驱动逻辑整块注入页面世界（`setInterval` 自转，零 eval 开销），harness 只轮询完成标志；用 `location.href` 同一标签页导航保持 localStorage（**严禁 `close --all`**，会清空临时 profile）。

**关键踩坑（改驱动前必读）**：
- `localStorage.getItem() !== null` 返回字符串 `"false"` 恒真，须显式 `=== 'true'`
- DIV 用 JS `disabled` 属性不会生成 HTML `[disabled]` 属性，CSS `:not([disabled])` 失效，用 `:not(.selected)`
- `input.value` 赋值不触发 `input` 事件，需手动 `dispatchEvent(new Event('input', {bubbles:true}))`
- agent-browser v0.27 的 `eval` 中运算符需空格（`1 + 1` 而非 `1+1`）；**不要用 `.cmd` 包装脚本**（`&` 会被 cmd 拆条）

**测试脚本**（`tests/` 顶层只留现行工具，历史脚本在 `tests/archive/`）：

| 脚本 | 用途 | 位置 |
|------|------|------|
| `full-battery.cjs` | **现行**完整自动化（推荐） | `tests/` |
| `cpt_report.py` | CPT 数据处理（支持单文件/批量） | `tests/` |
| `validate-drivers.cjs` | 驱动语法校验（沙箱验证 10 项 DRV 代码合法） | `tests/` |
| `verify-scoring.cjs` | 评分模块端到端验证（23 项断言，模拟 3 被试跑通 7 域 + 常模接口） | `tests/` |
| `_autotest.cjs` / `debug-*.cjs` / `add-*` / `patch-*` / `reorg-pages.cjs` | 前代/一次性/调试（历史保留） | `tests/archive/` |

**核心 JS 模块**（`index.html` + 各测试页共用）：

| 文件 | 用途 |
|------|------|
| `mccb-common.css` | 共享 CSS 体系（~24 个自定义属性） |
| `mccb-participant.js` | 被试管理（登录/进度/续做/删除/批量导出） |
| `mccb-scoring.js` | **MCCB 综合评分**（7 域认知画像 + 内部相对排名） |

自动化产物：现行报表在 `data/autotest/`，历史报表在 `data/autotest/archive/`。

### CPT 报告生成

`tests/cpt_report.py` 解析 CPT 原始 `.trep` 报告文件，生成可视化 HTML 报表（内联 SVG 图表，无外部 CDN 依赖）：

```bash
# 处理单文件
python tests/cpt_report.py data/cpt-results/被试001.trep

# 批量处理所有 .trep 文件（241 个被试）
python tests/cpt_report.py --all
# 等价语法:
python tests/cpt_report.py --batch
```

- 数据源：`data/cpt-results/*.trep`（241 个文本报告）
- 产物：`data/cpt-reports/{name}_ses{N}.html`（独立 HTML 文件，含击中/虚报/d-prime/反应时图表）
- 索引页：`data/cpt-reports/index.html`（可搜索/排序/筛选的 239 份报告索引）

### 综合认知报告

`comprehensive-report.html` 将 10 项测验的原始分数按 MCCB 7 个认知域汇总，生成统一认知画像：

- 选择被试后自动展示所有已完成测验的域评分
- 雷达图展示 7 个认知域 T 分轮廓
- 域评分卡片含百分位数排名（基于项目内部相对排名）
- 各测验原始分数详情表
- 支持导出 JSON / 打印 PDF / 复制摘要
- 支持 `?p=ID` 深链接直接从被试管理面板跳转
- 入口：首页仪表盘 → 「📊 综合报告」按钮

评分原理：
- 各域分数基于项目内所有被试的相对排名（百分比 → T 分近似转换）
- 因缺少 MCCB 官方常模，当前为项目**内部相对评估**，适合同一群体内比较
- 验证：`node tests/verify-scoring.cjs`（23 项断言，须先有被试数据才有意义）

**常模切换接口**（`mccb-scoring.js` 可插拔）：
- 默认常模 `internal`：项目内部相对排名（非官方常模）
- `MCCBScoring.registerNorm({name, label, apply(allProfiles, domains)})` 注册自定义常模（将来接入 MCCB 官方常模表）
- `MCCBScoring.setNorm(name)` / `getNorm()` 切换与查询；`getAllProfiles()` 返回的 `norm` 字段标注当前所用常模
- 综合报告页顶部自动显示当前常模标注，确保临床透明度
- `verify-scoring.cjs` 已覆盖常模注册/切换/还原/错误处理

> **原始数据说明**：`data/cpt-results/` 下的 `.rep` / `.dat` / `.raw` 文件（各 383 个）为 CPT 软件导出的**专有二进制 blob**（头部字节跨被试一致、含随机加密字节），**无法**用文本方式解析；当前流水线只消费可读的 `.trep` 文本报告（241 个，已全部转为 `data/cpt-reports/` HTML 报表）。如需利用 `.rep` 等格式，需原厂转换工具。

## 资料

`docs/` 内含简版 MCCB 操作者表格 A/B（含标准词表与评分规则）、队列研究者手册等。
