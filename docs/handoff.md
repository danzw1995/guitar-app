# 交接说明（Handoff）

> 给下一个会话 / 新维护者：**先读这份**，再读 `architecture.md` 和 `roadmap.md`。
> 当前版本：**v0.18.0**（真琴指板、唱名、和弦说明、每日挑战、统计、推算模式、全局设置、复制成绩、
> 累计时长、DSH 插件：面板 + 4 个 agent 工具、PWA：可安装 / 可离线、
> **乐理入门十二节课：音 / 半音 / 12 平均律 / 大小调 / 音程 / 三度叠置 / 级数 / 指板规律 / CAGED /
> 七和弦 / 五度圈 / 时值（含节奏格与节拍器）**、**乐理挑战 12 关（指板点亮答案，键盘可玩）**、
> **练习页：六个阶段 + 51 条练习（每条都带六线谱）+ 计划生成 + 技巧卡**、
> **节奏专项：跟读练习 16 条 + 扫弦练习 24 条（整理自同一支视频的板书）**）。

## 一句话

Web-first 的吉他学习应用：常用和弦、标准调弦音阶指板、40 关音阶推算游戏。React + Vite 前端，纯 TS 领域核心。

## 仓库与运行

- 位置：`F:\program\workspace\guitar-app`
- Node 22+（本机 26），pnpm 9+
- 命令：

```bash
pnpm install
pnpm dev      # http://127.0.0.1:5173
pnpm test     # 42 个 core 测试
pnpm build    # apps/web/dist
pnpm demo L01 # 终端打印一关
```

## 已完成（截至 v0.2.3）

- `packages/core`：调号拼写、音阶、指板定位、出题、难度评分、三态判定。
- 40 关固定关卡（5 章：C 大调 8 / 大调换把 10 / 降号调 8 / 小调入门 7 / 小调进阶 7），`data/levels.json`。
- `apps/web`：和弦库（16 个）、音阶指板（12 调 × 4 音阶，0–12 品）、40 关游戏（计时、选音、提交、结果、localStorage 最佳成绩）。
- 指板方向已改为传统六线谱：**横轴品、纵轴 1–6 弦**（1 弦在上）。
- 修复：Vite 启动的 UTF-8 BOM、关卡选择器只显示当前章节、CHANGELOG 乱码。

## v0.3.0（已发布）

- `packages/core/src/progress.ts`：进度模型、星级（0–3）、三星达标时间、解锁、旧数据迁移，全部纯函数。
- 存储键 `guitar.progress.v1` / `guitar.settings.v1`；`apps/web/src/lib/storage.ts` 是唯一访问点，自动迁移 v0.2.x 的 `guitar.best.*`。
- 游戏页：顶部进度条、关卡下拉带星级与锁、结果面板（星级 / 三星目标 / 新纪录 / 解锁徽章 / 按弦错误分布）、设置面板（严格拼写、重置进度）。
- 开局落在「第一个未通关的已解锁关卡」。
- 键盘操作：Tab 选格 → Enter 打开选择器 → 字母输入音名（可加 `#`/`b`）→ 方向键选择 → Enter 确认，Esc 关闭；规则在 core 的 `nextNoteQuery` / `noteCandidates`。
- 移动端样式：点按目标 ≥ 40×40px（不再压到 36px），720px / 420px 两档断点，指板内部横向滚动。
- 页脚版本号改为 Vite `define` 注入 `__APP_VERSION__`，不再硬编码。
- 测试：9 → 24 个（新增 progress 与键盘音名输入单测）。

### 移动端收尾（v0.3.0 之后补的）

- 点按目标统一 ≥ 40px：格子 40×40、音符按钮 44px、工具栏/标签页/下拉 40px、设置行 44px（整行是 `<label>`）。
- 窄屏（≤720px）`select` / `input` / `textarea` 字号统一 16px，规避 iOS Safari 聚焦自动放大。
- 指板弦名列 `.fb-string-label` / `.fb-corner` 改为 `position: sticky`，横滑时不丢失弦名。
- 以上三条由 `pnpm check:styles`（`apps/web/scripts/check-styles.mjs`）静态断言，12/12 通过。
- 人眼确认过的部分（桌面浏览器窄宽度）：指板横滑正常、**滑到 12 品弦名仍在**、按钮尺寸正常、375px 无横向溢出。
  **没有确认过的**：iPhone 真机上的聚焦缩放（无设备，仅靠 16px 规则保证）与真机点按手感。

## v0.3.1（已实现，待发版）

- `packages/core/src/daily.ts`：日期键、每日出参、连续天数、统计汇总，全部纯函数。
- 每日挑战：seed = 距 1970-01-01 天数，调按 22 个调轮换、音阶跟着调式、品域按 3 档轮换；
  同一天同题，记录存 `guitar.daily.v1`（按 `YYYY-MM-DD`），不碰主线解锁。
- 连续天数由日期集合算出，不单独存状态。
- 统计页（第 4 个 Tab）：已通关、星星、平均星级、提交次数、最佳成绩合计、连续天数、最近 7 天、最近 5 关战绩。
- 游戏页顶部加「主线关卡 / 今日挑战」切换。
- 测试：24 → 42 个。

### 指板画法与唱名（v0.3.1 之后补的）

- `Fretboard` 重写：SVG 画弦线（低音弦更粗）、品丝、0 品琴枕、3/5/7/9/12 品位记号，
  音是圆点；透明按钮层负责点按/Tab/禁用态，两层共用 `FRET_W / STRING_H / TOP_H` 常量。
- 弦名列移到滚动容器外（不再用 sticky），横滑时不会跑；1 弦与 6 弦弦名统一大写。
- 唱名：`packages/core/src/solfege.ts`，首调/固定 × 数字/do re mi，变化音带升/降前缀。
- 设置项 `labels / solfegeSystem / solfegeStyle` 存 `guitar.settings.v1`，音阶页与游戏页共用。

## 当前限制 / 已知问题

- **本机 `node:test` + `.ts` 会在退出时崩一次**（0xC0000005，打印完结果之后才崩，与代码无关；
  HEAD 同样复现，`.mjs` 测试不崩）。所以 `packages/core` 的 test 脚本走
  `scripts/run-tests.mjs`：只有真的 `fail > 0` 才返回非零，「全过但退出崩」按通过处理。
  CI 是 Linux + Node 24，不受影响。
- 进度只有本机 localStorage，**没有**账号 / 云同步 / 排行榜。
- “严格拼写”开关已可用（默认关），但只影响星级判定，格子颜色仍把拼写错标成橙色。
- 统计里的「总用时」是**最佳成绩合计**（Σ 每关最快全对），不是累计练习时长。
- 没有分享、音频、节拍器。
- 没有 DSH 插件、Tauri / Capacitor 壳、PWA 配置。
- UI 在桌面浏览器看过，窄宽度下横滑 / sticky / 按钮尺寸正常；**iOS 真机行为（聚焦缩放、点按手感）未验证**。
- 本沙箱里 `pnpm build` 因 esbuild 启动子进程被拦截而无法验证；`pnpm dev` 在用户机器上已跑通。

## 关键决策（不要轻易推翻）

1. **Web-first**：一套 React 组件复用到 Web / Tauri / Capacitor / DSH 插件；不上 Flutter。
2. **core 必须保持纯 TS**：不碰 DOM、不碰 `node:fs`；`levels.ts` 是 Node 专用，不进浏览器构建。
3. **小程序暂缓**：未来用“原生 UI + 共享 core”，不上 Taro；启动前先办 ICP 备案与类目。
4. **v1 游戏只填调内音**，不做全半音；判定默认宽松，严格拼写作为开关。
5. 发版：SemVer + annotated tag + CHANGELOG，见 `versioning.md`。

## 怎么"看"谱面（重要）

沙箱里跑不了 `vite build`，但**本机有 Chrome**，可以用无头模式把组件真渲染成 PNG 再自己看。
这几轮排版问题都是这么发现的（数字浮在线下、线穿字、小节线压住第 1 拍）。

```powershell
# 1) 写一个临时脚本，把 layoutTab 的结果拼成 HTML（<link> 真实 styles.css）
node .tmp-preview/preview.ts
# 2) 无头 Chrome 截图（需要 danger-full-access：Chrome 用命名管道，沙箱默认拒绝）
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu `
  --no-sandbox --hide-scrollbars --force-device-scale-factor=2 --window-size=900,780 `
  --screenshot=".tmp-preview/shot.png" "file:///F:/program/workspace/guitar-app/.tmp-preview/preview.html"
# 3) 用 read_image 看这张图
```

注意：`.tmp-preview/` 是临时目录，看完就删（不要提交）。

## 下一步

1. **真机验收**：iOS / Android 各点一遍——七个 Tab 换行、练习页计时与打卡、节拍器在手机上够不够响。
2. **首屏实测**：`pnpm build` 后的首屏时间（本机沙箱跑不了 Vite 构建，需要你自己的机器）。
3. **40 关难度复核**：需要真实体验反馈。
4. 和弦 / 音阶试听（音频目前只有节拍器）——复用同一个 AudioContext。
5. DSH 插件还能继续补：面板里加推算模式、把「今日一题」做成能判分的小练习（需要插件自己的存储）。
6. **桌面 / 安卓壳**：Tauri / Capacitor——**先装工具链**（这台机器没有 Rust，也没有 Android SDK/Gradle/adb，
   Java 只有 8），详见 `roadmap.md`；不占版本号。
7. **视频里的板块③ 伴奏型（17 条）还没导入**：板书是「和弦 + 每拍拨哪几根弦」的分解指法，
   现有 `Tab` 表达不了"每拍换弦序"，要先加一种「伴奏型」数据类型（和弦 + 每拍的弦序计划）再做，
   不要硬塞进 `chordTab`。板块④ 的扫弦 24 条已在 v0.18.0 全部导入。

## 在浏览器里验收（agent-browser）

静态检查证明不了"页面上真的能点"。`pnpm run check:ui` 会用
[agent-browser](https://www.npmjs.com/package/agent-browser) 开一个真 Chrome，跑一遍：

```powershell
pnpm dev                            # 一个终端
pnpm run check:ui                   # 另一个终端（默认连 5173，也可以传地址）
```

它会断言：新手引导能关、8 个 Tab 能切、节奏页 68 张卡、扫弦练习 24 条且都有谱、
「跟练」面板带着 80 BPM 出现、「收起」后面板消失、试听不报错。没装 agent-browser
或页面没起来时**只提示并跳过**（不挡 CI）。

平时手工核对也用它，比写临时预览页省事：

```powershell
agent-browser open http://127.0.0.1:5173
agent-browser snapshot -i                       # 带 @eN 的可交互元素树
agent-browser click "@e8"                       # 点「节奏」
agent-browser screenshot home.png --full        # 整页
agent-browser screenshot ".drill-card" card.png # 只截一张卡
agent-browser set viewport 390 844              # 手机宽度看排版
agent-browser console / errors                  # 抓控制台
agent-browser diff screenshot --baseline old.png # 视觉回归
```

注意 PowerShell 里 `@e8` 要加引号（否则会被当成 splatting）。

## 内容可信度：转录板书时用这两个工具

从视频板书转录节奏型时，最容易犯的错是「看着对、其实不对」——v0.18 把十几条十六分压成了
八分，v0.19.1 之前符梁画得让八分和十六分一个样，都是这么来的。两个便宜的保险：

1. **对照图**：`pnpm run compare:boards`（需要 `pnpm dev` 在跑）会把「视频板书截图」和
   「我们渲染出来的谱」左右拼成一张 `.tmp/boards.png`，24 条一次看完。
   默认去 `C:\Users\wangzhidan\Documents\deepseek-harness\default-workspace\guitar`
   找 slides，可以 `GUITAR_VIDEO_DIR=D:\... ` 指别处；找不到就只拼我们自己的谱。
   **转录完先看这张图，再提交。**
2. **节奏指纹**：`packages/core/test/fixtures/rhythm-fingerprints.json` 存了每条练习的
   `[拍位, 时值, 方向]` 序列，`pnpm test` 会逐条比对。数据一改，测试就会打印
   「第 6 条原来 [...] 现在 [...]」；确认是有意改的，跑 `pnpm run gen:fingerprints` 更新基线，
   然后 review 那行 diff。**改了数据却不更新基线，测试会拦下来。**

## 新会话开场白

> 读 `docs/README.md`、`docs/handoff.md`、`docs/roadmap.md`，当前 v0.10.1，乐理（12 节课 + 挑战游戏）、节奏/节拍器、练习页（51 条练习带六线谱）都已完成，下一步是 v1.0 的真机验收与首屏实测。

## 版本状态

```
v0.18.0 扫弦练习 24 条（同一支视频板块④，含切音点与方向换算）；core 0.13.0
v0.17.0 跟读练习 16 条（整理自 BV1DA411b7nb 板书）+ X 记谱（Tab.display="rhythm"）；core 0.13.0
v0.16.2 节奏试听只放音符（不叠节拍器）
v0.16.1 节奏练习改用 C–E–G 循环（试听不再像节拍器）；音量配平；跨弦谱按起音算间距
v0.16.0 节奏页试听（playTab + 打拍子；core 新增 tabEvents）
v0.15.0 和弦试听拆成扫弦/分解，试听时点亮正在响的弦
v0.14.0 试听（和弦扫弦 / 音阶上行，Web Audio 合成，无音频文件）
v0.13.0 跟练模式（节拍器起速 + 每 4 小节 +5 + 记录最高 BPM）；节拍器排程抽成 useMetronome
v0.12.2 谱面：符干朝下、符梁固定在弦线下方（吉他谱习惯）
v0.12.1 谱面：符干贴在音上（不再另画节奏轨）、超过 460px 换行、弦号改成 1–6
v0.12.0 节奏专项 Tab（10 时值练习 + 12 扫弦型 + 6 风格片段，全部带谱与数拍词）
v0.11.0 时值轨（符头/符干/符梁/符尾）、击勾滑字母改夹在数字中间、推弦 7↗9、导航换行
v0.10.1 六线谱重排（居中/断线/小节偏移/严格上行）+ 排版静态检查
v0.10.0 六线谱（tab.ts + TabDiagram）；练习库重写为 51 条、每条只属于一个阶段；阶段条与阶段说明
v0.9.0  练习页（按分钟数生成计划）+ 技巧库 14 张卡 + 练习记录与统计；导航 7 个 Tab
v0.8.0  第 12 课时值（附点/三连音/拍号/扫弦型）；节奏格 RhythmStrip；Web Audio 节拍器
v0.7.3  乐理挑战键盘操作；新手引导补上其它页面；插件工具 schema 的 required 提到对象层
v0.7.2  第 11 课五度圈与调号；章节标题进数据；练习体系合并（删 TheoryQuiz）；40 关重排
v0.7.1  乐理挑战游戏（12 关，点亮格子，接星级）+ 第 10 课七和弦
v0.7.0  乐理入门九节课（音/半音/12平均律/大小调/音程/三度叠置/级数/指板规律/CAGED）+ 收尾与 a11y + CI
v0.6.0  PWA：manifest + service worker + 图标；可安装、断网可开（已人工验收）
v0.5.0  DSH 插件：conversation.view 面板（和弦/音阶/今日）+ 4 个 agent 工具；core 构建产物
v0.4.1  复制成绩、累计练习时长、游戏页拆组件、结果面板标题
v0.4.0  真琴指板、唱名、和弦说明、每日挑战、统计、推算模式、全局设置
v0.3.0  进度与星级、逐关解锁、严格拼写设置、键盘操作、移动端 40px 点按
v0.2.4  docs baseline（文档基线）
v0.2.3  指板方向 + CHANGELOG 修复
v0.2.2  UTF-8 BOM 修复
v0.2.1  关卡选择器修复
v0.2.0  Web 端
v0.1.0  core + 40 关
```
