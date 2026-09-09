# MCCB 认知测验套件 — 项目笔记

## 自动化测试（2026-09-07/08）

- **现行**: `tests/full-battery.cjs` 驱动 agent-browser 完整模拟被试完成 10 项测验，产物在 `data/autotest/`
- **完整运行方法 / agent-browser v0.27 适配 / 驱动踩坑** → 见 **`README.md`「自动化测试」节**（勿在 memory 重复）
- 关键结论: 全量 10/10 已通过（331s）；BVMT 延迟回忆需用 `STATE.trial` 变化触发
- 前置: HTTP 静态服务器（`python -m http.server 8766`）必须先于脚本跑

## User/Dev 双模式切换机制

所有测试页支持 `?mode=dev` / `?mode=user` URL 参数：

**index.html** — 入口页顶部有 DEV/USER toggle 开关
- 模式存入 `localStorage('mccb_mode')`
- `goTest(href)` 读取模式并附加 URL 参数

**每个测试页** — 在 `<script>` 顶部注入：
```javascript
// === Mode (DEV / USER) ===
const urlParams = new URLSearchParams(window.location.search);
const MODE = urlParams.get('mode') || 'dev';
const IS_DEV = MODE === 'dev';
function applyModeStyles() {
  if (!IS_DEV) { /* 隐藏开发辅助元素 */ }
}
```
- User Mode：隐藏反馈面板、正确/错误标记、统计信息、快速反馈（✓/✗）等开发辅助元素
- 业务逻辑中反馈类添加（correct-answer/wrong-answer）和反馈内容设置用 `if (IS_DEV)` 守卫包裹
- 所有 10 个测试页已全部完成模式注入

## 跨页面 UI 布局一致性 — 已知问题清单（第二轮修复 2026-08-28 ✅ 全部完成）

### ✅ A-1 — CPT 布局重构 → 已修复
- 从唯一卡片式布局改为标准全屏 flex 居中布局（`.page fixed + flex`）
- 添加 `#overlay` 模态框系统、`export-area` 导出区
- 保留已有 welcome logo（80px 渐变色）
- 统一结果网格参数（gap:20px, padding:24px）

### ✅ A-2 — 响应式断点补全 → 已修复
- 全部 9 页（bacs, fluency, hvlt, bvmt, msceit, mazes, spatial-span, lns, tmt）添加 768px + 480px @media
- 3 个 Canvas 页额外特殊规则

### ✅ B-3 — HVLT 结果页参数 → 已验证为标准值（无需修改）
- width:500px/gap:20px/padding:24px/ri-value:28px

### ✅ B-4 — MSCEIT 按钮颜色 → 已验证为标准值（无需修改）
- `btn-success { background: #27ae60; }` 已为绿色

### ✅ B-5 — USER 模式隐藏行为 → 已统一
- 4 页修复：bacs（精确ID→统一选择器）、mazes（空操作→统一选择器）、spatial-span/lns（.remove()→.style.display='none'）

### ✅ B-6 — CPT welcome logo → 已验证已有标准实现（80px 渐变色）

### ✅ C-7 — BACS 输入框放大 → 已修复
- 实际尺寸为 40×40px（非 28×28px），现改为 44×44px 满足触控标准

## CSS 体系（重构于 2026-08-29）

### mccb-common.css
- **共享 CSS 文件**（365 行），所有 10 个测试页共用
- **53 个 CSS 自定义属性**（:root 变量）：
  - `--bg-*`: 背景色（page, card, input, inst, hover, export, disabled）
  - `--text-*`: 文字色（primary, secondary, body, muted, on-accent）
  - `--accent-*`: 主题色（blue, blue-hover, green, inst-border）
  - `--color-*`: 功能色（success, warning, danger + hover/text 变体）
  - `--shadow-*`: 阴影（sm, md, lg, logo）
  - `--radius-*`: 圆角（sm, md, lg, pill）
  - `--z-*`: 层叠（page:1, page-active:2, quick-feedback:5, floating-bar:100, progress-bar:99, overlay:200）
  - `--font-*`: 字体（sans, mono）
  - `--transition-*`: 过渡（page, btn）
- **响应式断点**: 768px + 480px（overlay padding / welcome padding）
- **触摸滚动**: body.testing-active 禁止滚动, canvas touch-action: none

### 每个测试页
- `<link rel="stylesheet" href="mccb-common.css">` + 页面特有 CSS（`<style>`）
- 共用 CSS 占 ~70%，页面特有 ~30%
- 所有颜色值使用 var() 而非硬编码
- 全部 px 转换为 rem（16px 基准，border/outline/shadow/transform 保留 px）

## 无障碍改进（2026-08-29）

### 语义化 HTML
- `<main id="app">` 替代 `<div id="app">`
- 每个 page 为 `<section>` 而非 `<div>`
- Welcome 页用 `<header>`、按钮区用 `<footer>`
- `.norm-ref` 改为 `<aside>`

### 键盘导航
- `role="button"`, `tabindex="0"`, Enter/Space 键盘事件
- 应用于 spatial-block、pool-shape、part-card 等可点击 div

### 模态框焦点陷阱
- `showOverlay` 后自动陷阱焦点
- Tab/Shift+Tab 循环、Escape 关闭
- 关闭后焦点回移

### 触摸优化
- `-webkit-tap-highlight-color: transparent; touch-action: manipulation`
- `body.testing-active` 测试中锁定滚动
- 开始/结束测试时自动添加/移除 class

## 页面离开保护（2026-08-28）
- `beforeunload`：测试进行中提示用户确认离开
- `visibilitychange`：页面隐藏时自动结束测试

| 页面 | 类型 | 行数 | 关键参数 |
|------|------|------|---------|
| BACS | DOM 选择题 | ~420 | 44×44 输入框 ✅ |
| Fluency | DOM 按钮网格 | ~470 | 3×3 字母网格 |
| HVLT | DOM 选择列表 | ~380 | 标准结果参数 ✅ |
| CPT | 全屏 flex 居中 | ~530 | 标准布局 ✅ |
| BVMT | Canvas 绘图 | ~520 | 300×<var> grid |
| MSCEIT | DOM 评分 | ~540 | btn-success=#27ae60 ✅ |
| Mazes | Canvas 迷宫 | ~800 | CELL_SIZE=52, 7 mazes, 总分/26 |
| Sp.Span | DOM 方块 | 585 | 74/56px, 900ms |
| LNS | DOM char-box | 591 | len×500+1500ms |
| TMT | Canvas 连线 | ~1500 | radius=22, 4:3 ratio, A/B均300s |

## 第五轮 — 操作者表格对照修复（2026-08-28/29）

### HVLT-R 标准中文版词表
- 替换为操作者表格 B 规定的标准词表（3 语义范畴 × 4 词）
- 乐器：唢呐、二胡、萧、笛子
- 燃料/材料：木炭、煤油、木头、汽油
- 调味品：糖、大蒜、味精、桂皮

### Mazes 评分规则（操作者表格 B 版本）
- **迷宫 A/B/C**：30 秒限时，评分 0/1/2 分
  - A: 1-3s=2, 4-30s=1
  - B: 1-11s=2, 12-30s=1
  - C: 1-15s=2, 16-30s=1
- **迷宫 D**：120 秒限时，0-5 分（1-28s=5, 29-39s=4, 40-51s=3, 52-70s=2, 71-120s=1）
- **迷宫 E/F/G**：240 秒限时，0-5 分
- **终止规则**：连续 3 个迷宫得 0 分则自动终止
- **满分**：26 分

### TMT 超时修正
- Part A：100s → 300s（与 Part B 一致）

## 近期模块与陷阱（2026-09-09）

- **综合评分** `mccb-scoring.js` + `comprehensive-report.html`：7 域认知画像，T 分基于项目内部相对排名（**非 MCCB 官方常模**）；验证 `tests/verify-scoring.cjs`（16 断言，须先有被试数据）；域/排名/导出细节见 README「综合认知报告」节（勿在 memory 重复）
- **参与者挂载陷阱**：`mccb-participant.js` 第 278 行在脚本加载时执行 `window.ParticipantManager = ParticipantManager`；评分模块与报告页依赖该全局挂载，重构时不要改坏，否则取不到被试数据
- **数据死路**：`data/cpt-results/` 的 `.rep`/`.dat`/`.raw` 为 CPT 软件专有二进制 blob，不可文本解析；勿再投入（详见 README「原始数据说明」）
