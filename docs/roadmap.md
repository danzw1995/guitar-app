# 开发计划（Roadmap）

> 原则：**每个版本都可独立使用**；小步发版，tag + CHANGELOG；不提前建空包。
> 估算按 1 名开发者、熟悉代码库计算。

## 0. 当前状态

- 最新版本：**v0.6.0**
- 可用功能：和弦库、音阶指板、40 关游戏（计时 / 判定 / 结果）、进度与星级、逐关解锁、
  严格拼写、键盘操作、移动端 40px 点按、每日挑战、统计页、推算模式、全局设置、
  DSH 插件（面板 + 4 个 agent 工具）、PWA（可安装 / 可离线，已人工验收）
- 下一版：**v0.7.0**（Tauri / Capacitor 壳，需先装工具链）

## 1. 版本路线

### v0.3.0 — 可日常练习（已发布）

**目标**：从“能玩一关”变成“每天愿意打开”。

| 优先级 | 任务 | 状态 | 说明 |
|---|---|---|---|
| P0 | 进度模型 | ✅ | `progress: { [levelId]: { completed, stars, bestMs, attempts, lastAt } }`，`guitar.progress.v1` |
| P0 | 星级与解锁 | ✅ | 按用时 + 错误给 1–3 星；1 星解锁下一关 |
| P0 | 结果页升级 | ✅ | 星级、最快全对、三星目标、新纪录/解锁徽章、错误分布、“下一关” |
| P0 | 设置项 | ✅ | 严格拼写开关；重置进度 |
| P1 | 关卡选择 | ✅ | 显示星级/锁；按章分组 |
| P1 | 手机竖屏 | ✅ | 375px 实测无横向溢出；点按 ≥ 40px；指板内部滚动 |
| P1 | 键盘操作 | ✅ | Tab 选格、Enter 开选择器、字母输入音名（可加 #/b）、方向键选择、Esc 关闭 |

**实现**：`progress.ts`（星级/达标时间/解锁/迁移/本次得星，纯函数）+ 键盘音名输入
（`nextNoteQuery`/`noteCandidates`）+ 15 个新单测；`lib/storage.ts`（含旧键迁移）；
`Stars` 组件；游戏页结果面板、设置与键盘操作。

**移动端收尾（v0.3.0 后补，未单独发版）**：点按尺寸统一到 ≥ 40px（格子 40×40、音符按钮 44px、
工具栏/标签页/下拉 40px、设置行 44px）；窄屏表单控件字号统一 16px 规避 iOS 聚焦放大；
指板弦名列改为 sticky 固定在左侧。三条都由 `pnpm check:styles` 断言，真机仍待人眼确认。

**验收**：
- 40 关可连续玩，刷新后进度、星级、最佳都在；
- 未解锁关卡不可进入；
- 375px 宽无横向溢出（指板内部滚动除外）；
- `pnpm test` 通过，新增 progress 单测。

**不做**：账号、云同步、音频。

---

### v0.4.0 — 每日挑战、统计、推算模式、全局设置（已发布）

原本计划的 v0.3.1（每日挑战与统计）连同后面的指板/唱名/和弦/推算模式一起，作为 v0.4.0 发出。

| 任务 | 状态 | 说明 |
|---|---|---|
| 每日挑战 | ✅ | 由日期推导 seed / 调 / 音阶 / 品域；记录写 `guitar.daily.v1`，不影响主线 |
| 连续天数 | ✅ | 由「完成过的日期集合」算，不单独存状态；今天没做但昨天做了仍保留连续 |
| 统计页 | ✅ | 第 4 个 Tab：已通关、星级、平均星、提交次数、最佳成绩合计、最近 7 天、最近战绩 |
| 指板重做 | ✅ | 弦线 + 品丝 + 琴枕 + 品位记号 + 圆点；弦名列在滚动容器外 |
| 唱名系统 | ✅ | 首调/固定 × 数字/do re mi，带升降、八度点、等音、唱名对照 |
| 和弦说明 | ✅ | 性质、构成音、指法/○/× 图例、弦名 |
| 推算模式 | ✅ | 随机调 + 一格提示（任意调内音），全板靠推 |
| 全局设置页 | ✅ | 第 5 个 Tab，集中所有配置 |
| 难度可见 / 试玩 | ✅ | 关卡下拉显示难度与格数；可试玩未解锁关卡 |
| 分享文案 | ✅ | 结果页「复制成绩」，剪贴板 + 降级方案（v0.4.1 已补） |

**口径说明**：统计里现在有两张卡——「最佳成绩合计」（Σ 每关最快全对）和
「累计练习时长」（`totalMs` 累加，v0.4.1 补上），两者含义不同，不要混用。

---

### v0.4.1 — 收尾与减负（已发布）

| 任务 | 状态 | 说明 |
|---|---|---|
| 分享文案 | ✅ | 结果页「复制成绩」，剪贴板 + textarea 降级 |
| 累计练习时长 | ✅ | `LevelProgress.totalMs`，统计页与「最佳成绩合计」并排 |
| 组件拆分 | ✅ | `PuzzleBoard` / `NotePicker` / `ResultPanel`，`Game.tsx` 722 → 488 行 |
| 结果面板标题 | ✅ | 加「本关结果」小标题，状态标题放大 |

---

### v0.5.0 — DSH 插件（已发布）

**前置**（✅）：core 用 `tsc` 产出 ESM + `.d.ts` 到 `dist/`——不是计划里写的 `tsup`，
因为沙箱里 esbuild 起不了子进程；`pnpm --filter @guitar/core build` 即可。

| 任务 | 状态 | 说明 |
|---|---|---|
| Client 面板 | ✅ | `plugins/dsh-guitar`：`conversation.view` 整页标签，和弦 / 音阶 / 今日一题三页 |
| 主题/locale | ✅ | 用宿主真实 token（`--dsw-alias-label-primary` 等）；文案走 `ctx.locale.t` |
| 安装 | ✅ | 本地目录 `install_bundle`（Junction 链接），面板与工具都已实测生效 |
| Host 工具 | ✅ | `guitar_chord` / `guitar_scale` / `guitar_daily` / `guitar_note_at`，已实测被 agent 调用 |

**验收**：✅ 面板在 `Guitar Lab` 标签页渲染；✅ agent 调用 `guitar_scale` 返回真实数据。

**踩过的坑（写下来省下次）**：

1. **插槽分 `single` / `list` / `keyed` / `chain`**：注册到 `single` 槽会直接抛
   `single slot "…" already has a registration`。可用的整页槽是 `conversation.view`（list）；
   `conversation.composer.dock` 是输入框里放 token 统计的 list 行（挤）；`conversation.header` 是 single（宿主占用）。
2. **Host 半不能 `import` dsh 内部包**：`@deepseek-ai/dsh-tools` 在 app.asar 里，
   从插件目录解析会 `ERR_MODULE_NOT_FOUND`；`harness.defineTool` 只存在于动态插件。
   正确做法是直接构造定义对象交给 `ctx.tools.register()`——它只校验 `name` 与 `output.render`。
3. **Client 半必须自己渲染 `<style>`**：否则 CSS 常量被 tree-shake，页面裸奔。

---

### v0.6.0 — PWA（已发布）

| 任务 | 状态 | 说明 |
|---|---|---|
| PWA | ✅ | `manifest.webmanifest` + `sw.js`（导航网络优先、静态资源 stale-while-revalidate）+ 三个图标（含 maskable）；`pnpm check:pwa` 静态断言 |
| 人工验收 | ✅ | 浏览器出现安装入口；Manifest 无报错、图标识别；Service Worker 为 activated；勾 Offline 后刷新仍能打开 |

**壳（Tauri / Capacitor）不在本版**：这台机器没有 Rust、没有 Android SDK/Gradle/adb，Java 只有 8
（Android 需要 17+）。装齐约 5GB，且构建要起子进程，沙箱里未必能跑通。见 v0.7.0。

---

### v0.7.0 — 桌面 / 安卓壳（暂缓，视工具链而定）

| 任务 | 说明 |
|---|---|
| Tauri（Windows） | 需要 Rust + MSVC 构建工具；包 `apps/web/dist`，体积小 |
| Capacitor（Android） | 需要 Android Studio/SDK + JDK 17+；处理返回键/安全区 |
| 存储适配 | localStorage 在 WebView 中保持一致；预留 adapter |

**验收**：Windows 安装包可离线打开；Android APK 可安装；进度不丢。

**前置检查**（2026-11-03）：`cargo` / `rustc` / `gradle` / `adb` 均未安装，`ANDROID_HOME` 未设置，
`java` 只有 Java 8。开工前先装工具链。

---

### v0.8.0 — 声音与节奏（1–2 周）

| 任务 | 说明 |
|---|---|
| 节拍器 | Web Audio 调度，支持 BPM/拍号 |
| 和弦/音阶试听 | 简单合成或采样 |
| 计时对齐 | 与节拍器共用 AudioContext 时钟 |

**验收**：节拍器 5 分钟漂移可接受；静音/音量可用；不影响游戏计时。

---

### v1.0.0 — 稳定版

- ✅ **错误边界**：渲染抛错显示兜底页（`role="alert"`），说明进度没丢，可重试/重载
- ✅ **离线提示**：`role="status"` 的中性色提示条（离线不是错误）
- ✅ **可访问性**：跳转链接、`main` 可聚焦、`nav` 语义 + `aria-current`、指板每格 `aria-label`、
  选音器 `dialog` 语义与焦点归还、空状态、`prefers-reduced-motion`
- ✅ **版本号展示**：页脚 `v{__APP_VERSION__}`（沿用）
- ✅ `pnpm check:all`：core 测试 + 样式 / PWA / a11y 三套静态断言
- ⬜ 新手引导（3 步：选调 → 填一格 → 提交）
- ⬜ 40 关难度复核（真实用户数据）
- ⬜ CI（GitHub Actions：test + build）
- ⬜ 性能：首屏 < 1s（本地）

**验收**：新用户 5 分钟内完成第一关；无 P0/P1 bug；文档与 CHANGELOG 完整。

## 2. 暂不排期（Backlog）

| 项 | 触发条件 | 备注 |
|---|---|---|
| 微信小程序 | 微信成为主渠道 / 需要分享裂变 | 原生 UI + core CJS；8–10 人日 + ICP 1–2 周 |
| 账号 / 云同步 / 排行榜 | 有跨设备需求 | 需后端与隐私合规 |
| iOS | 有明确用户群 | Capacitor 可复用 |
| 曲谱 / 播放 | 产品扩展到“跟谱” | 与当前定位不同，单独立项 |

## 3. 风险

| 风险 | 影响 | 对策 |
|---|---|---|
| 音乐理论错误 | 教学错误，信任受损 | core 单测覆盖拼写/出题；新增调先加测试 |
| 内容量不足 | 40 关玩完即走 | v0.3.1 每日挑战 + 后续扩展关卡 |
| 音频时序 | 节拍器不可用 | 用 AudioContext 时钟，不用 setInterval 累加 |
| 多端维护 | 版本分叉 | core 唯一真相；UI 适配层隔离 |
| 审核/备案（小程序） | 上线延期 | 启动前先办 |

## 4. 完成定义（DoD）

一个任务算完成，需要：

- 代码 + 类型检查通过；
- 相关测试通过（core 逻辑必须有测试）；
- 文档更新（规则/交互有变时）；
- `CHANGELOG.md` 有记录；
- 版本号与 tag（发版时）；
- 在浏览器实际点过（UI 任务）。

## 5. 发版流程

见 `versioning.md`：改版本号 → 更新 CHANGELOG → commit → annotated tag → push。
