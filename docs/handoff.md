# 交接说明（Handoff）

> 给下一个会话 / 新维护者：**先读这份**，再读 `architecture.md` 和 `roadmap.md`。
> 当前版本：**v0.3.0**（进度与星级、键盘操作、移动端点按）。

## 一句话

Web-first 的吉他学习应用：常用和弦、标准调弦音阶指板、40 关音阶推算游戏。React + Vite 前端，纯 TS 领域核心。

## 仓库与运行

- 位置：`F:\program\workspace\guitar-app`
- Node 22+（本机 26），pnpm 9+
- 命令：

```bash
pnpm install
pnpm dev      # http://127.0.0.1:5173
pnpm test     # 24 个 core 测试
pnpm build    # apps/web/dist
pnpm demo L01 # 终端打印一关
```

## 已完成（截至 v0.2.3）

- `packages/core`：调号拼写、音阶、指板定位、出题、难度评分、三态判定。
- 40 关固定关卡（4 章 × 10 关），`data/levels.json`。
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

### 遗留（不阻塞发布）

- 375px 只确认了「无横向溢出」；逐个按钮的点按尺寸、iOS Safari 聚焦缩放（控件字号 < 16px 会放大页面）未逐一验证。
- 指板横滑时弦名列会跟着滚出视野，考虑改成 sticky 固定列（v0.3.1 再看）。

## 当前限制 / 已知问题

- 进度只有本机 localStorage，**没有**账号 / 云同步 / 排行榜。
- “严格拼写”开关已可用（默认关），但只影响星级判定，格子颜色仍把拼写错标成橙色。
- 没有音频、节拍器、连续天数、统计页。
- 没有 DSH 插件、Tauri / Capacitor 壳、PWA 配置。
- UI 只在桌面浏览器实际看过；手机竖屏只验证了「375px 无横向溢出」，点按尺寸与 iOS 行为未逐一确认。
- 本沙箱里 `pnpm build` 因 esbuild 启动子进程被拦截而无法验证；`pnpm dev` 在用户机器上已跑通。

## 关键决策（不要轻易推翻）

1. **Web-first**：一套 React 组件复用到 Web / Tauri / Capacitor / DSH 插件；不上 Flutter。
2. **core 必须保持纯 TS**：不碰 DOM、不碰 `node:fs`；`levels.ts` 是 Node 专用，不进浏览器构建。
3. **小程序暂缓**：未来用“原生 UI + 共享 core”，不上 Taro；启动前先办 ICP 备案与类目。
4. **v1 游戏只填调内音**，不做全半音；判定默认宽松，严格拼写作为开关。
5. 发版：SemVer + annotated tag + CHANGELOG，见 `versioning.md`。

## 下一步

1. **v0.3.1**：每日挑战（日期 seed）+ 连续天数 + 统计页 + 分享文案；
   顺手收 v0.3.0 的遗留（375px 点按尺寸、iOS 缩放、指板弦名 sticky）。
2. 之后的顺序见 `roadmap.md`（v0.4 DSH 插件 → v0.5 壳 → v0.6 音频 → v1.0 稳定）。

## 新会话开场白

> 读 `docs/README.md`、`docs/handoff.md`、`docs/roadmap.md`，当前 v0.3.0，从 v0.3.1 的每日挑战开始做。

## 版本状态

```
v0.3.0  进度与星级、逐关解锁、严格拼写设置、键盘操作、移动端 40px 点按
v0.2.4  docs baseline（文档基线）
v0.2.3  指板方向 + CHANGELOG 修复
v0.2.2  UTF-8 BOM 修复
v0.2.1  关卡选择器修复
v0.2.0  Web 端
v0.1.0  core + 40 关
```
