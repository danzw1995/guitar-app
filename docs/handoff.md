# 交接说明（Handoff）

> 给下一个会话 / 新维护者：**先读这份**，再读 `architecture.md` 和 `roadmap.md`。
> 当前版本：**v0.2.4（文档基线）**；上一个功能版本：v0.2.3；**v0.3.0 进行中（未发版）**。

## 一句话

Web-first 的吉他学习应用：常用和弦、标准调弦音阶指板、40 关音阶推算游戏。React + Vite 前端，纯 TS 领域核心。

## 仓库与运行

- 位置：`F:\program\workspace\guitar-app`
- Node 22+（本机 26），pnpm 9+
- 命令：

```bash
pnpm install
pnpm dev      # http://127.0.0.1:5173
pnpm test     # 22 个 core 测试
pnpm build    # apps/web/dist
pnpm demo L01 # 终端打印一关
```

## 已完成（截至 v0.2.3）

- `packages/core`：调号拼写、音阶、指板定位、出题、难度评分、三态判定。
- 40 关固定关卡（4 章 × 10 关），`data/levels.json`。
- `apps/web`：和弦库（16 个）、音阶指板（12 调 × 4 音阶，0–12 品）、40 关游戏（计时、选音、提交、结果、localStorage 最佳成绩）。
- 指板方向已改为传统六线谱：**横轴品、纵轴 1–6 弦**（1 弦在上）。
- 修复：Vite 启动的 UTF-8 BOM、关卡选择器只显示当前章节、CHANGELOG 乱码。

## v0.3.0 已完成（未发版）

- `packages/core/src/progress.ts`：进度模型、星级（0–3）、三星达标时间、解锁、旧数据迁移，全部纯函数。
- 存储键 `guitar.progress.v1` / `guitar.settings.v1`；`apps/web/src/lib/storage.ts` 是唯一访问点，自动迁移 v0.2.x 的 `guitar.best.*`。
- 游戏页：顶部进度条、关卡下拉带星级与锁、结果面板（星级 / 三星目标 / 新纪录 / 解锁徽章 / 按弦错误分布）、设置面板（严格拼写、重置进度）。
- 开局落在「第一个未通关的已解锁关卡」。
- 页脚版本号改为 Vite `define` 注入 `__APP_VERSION__`，不再硬编码。
- 测试：9 → 22 个（新增 13 个 progress 单测：星级、达标时间、解锁、迁移、本次得星）。

### 还没做（v0.3.0 剩余 P1）

- 手机竖屏 375px 实测与修正（指板横向滚动、点按 ≥ 40px）。
- 键盘操作（桌面：Tab 选格、数字/字母选音）。

## 当前限制 / 已知问题

- 进度只有本机 localStorage，**没有**账号 / 云同步 / 排行榜。
- “严格拼写”开关已可用（默认关），但只影响星级判定，格子颜色仍把拼写错标成橙色。
- 没有音频、节拍器、连续天数、统计页。
- 没有 DSH 插件、Tauri / Capacitor 壳、PWA 配置。
- UI 只在桌面浏览器实际看过；**手机竖屏没有充分验证**。
- 本沙箱里 `pnpm build` 因 esbuild 启动子进程被拦截而无法验证；`pnpm dev` 在用户机器上已跑通。

## 关键决策（不要轻易推翻）

1. **Web-first**：一套 React 组件复用到 Web / Tauri / Capacitor / DSH 插件；不上 Flutter。
2. **core 必须保持纯 TS**：不碰 DOM、不碰 `node:fs`；`levels.ts` 是 Node 专用，不进浏览器构建。
3. **小程序暂缓**：未来用“原生 UI + 共享 core”，不上 Taro；启动前先办 ICP 备案与类目。
4. **v1 游戏只填调内音**，不做全半音；判定默认宽松，严格拼写作为开关。
5. 发版：SemVer + annotated tag + CHANGELOG，见 `versioning.md`。

## 下一步

1. **收尾 v0.3.0**：手机竖屏 375px 实测、键盘操作（见 `roadmap.md` P1），然后发版。
   发版动作：`CHANGELOG` 建 `[0.3.0]` 段 → 根与 `apps/web` 版本改 `0.3.0` → commit → annotated tag。
2. **v0.3.1**：每日挑战（日期 seed）+ 连续天数 + 统计页 + 分享文案。
3. 之后的顺序见 `roadmap.md`（v0.4 DSH 插件 → v0.5 壳 → v0.6 音频 → v1.0 稳定）。

## 新会话开场白

> 读 `docs/README.md`、`docs/handoff.md`、`docs/roadmap.md`，当前 v0.2.4（v0.3.0 进行中），继续 v0.3.0 剩余 P1。

## 版本状态

```
v0.3.0  （进行中）进度与星级：已完成 P0 + 关卡选择，剩竖屏与键盘
v0.2.4  docs baseline（本文档集）
v0.2.3  指板方向 + CHANGELOG 修复
v0.2.2  UTF-8 BOM 修复
v0.2.1  关卡选择器修复
v0.2.0  Web 端
v0.1.0  core + 40 关
```
