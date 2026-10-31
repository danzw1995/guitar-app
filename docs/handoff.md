# 交接说明（Handoff）

> 给下一个会话 / 新维护者：**先读这份**，再读 `architecture.md` 和 `roadmap.md`。
> 当前版本：**v0.2.4（文档基线）**；上一个功能版本：v0.2.3。

## 一句话

Web-first 的吉他学习应用：常用和弦、标准调弦音阶指板、40 关音阶推算游戏。React + Vite 前端，纯 TS 领域核心。

## 仓库与运行

- 位置：`F:\program\workspace\guitar-app`
- Node 22+（本机 26），pnpm 9+
- 命令：

```bash
pnpm install
pnpm dev      # http://127.0.0.1:5173
pnpm test     # 9 个 core 测试
pnpm build    # apps/web/dist
pnpm demo L01 # 终端打印一关
```

## 已完成（截至 v0.2.3）

- `packages/core`：调号拼写、音阶、指板定位、出题、难度评分、三态判定。
- 40 关固定关卡（4 章 × 10 关），`data/levels.json`。
- `apps/web`：和弦库（16 个）、音阶指板（12 调 × 4 音阶，0–12 品）、40 关游戏（计时、选音、提交、结果、localStorage 最佳成绩）。
- 指板方向已改为传统六线谱：**横轴品、纵轴 1–6 弦**（1 弦在上）。
- 修复：Vite 启动的 UTF-8 BOM、关卡选择器只显示当前章节、CHANGELOG 乱码。

## 当前限制 / 已知问题

- 进度只存“每关最佳时间”，**没有**完成状态、星级、解锁、连续天数。
- “严格拼写”判定逻辑已支持，但**没有设置开关**。
- 没有音频、节拍器、账号、云同步、排行榜。
- 没有 DSH 插件、Tauri / Capacitor 壳、PWA 配置。
- UI 只在桌面浏览器实际看过；**手机竖屏没有充分验证**。
- 本沙箱里 `pnpm build` 因 esbuild 启动子进程被拦截而无法验证；`pnpm dev` 在用户机器上已跑通。

## 关键决策（不要轻易推翻）

1. **Web-first**：一套 React 组件复用到 Web / Tauri / Capacitor / DSH 插件；不上 Flutter。
2. **core 必须保持纯 TS**：不碰 DOM、不碰 `node:fs`；`levels.ts` 是 Node 专用，不进浏览器构建。
3. **小程序暂缓**：未来用“原生 UI + 共享 core”，不上 Taro；启动前先办 ICP 备案与类目。
4. **v1 游戏只填调内音**，不做全半音；判定默认宽松，严格拼写作为开关。
5. 发版：SemVer + annotated tag + CHANGELOG，见 `versioning.md`。

## 下一步（v0.3.0）

按 `roadmap.md`，第一项是**进度与星级**：

1. `progress` 模型：每关 `completed / stars / bestMs / attempts`，存 localStorage。
2. 结果页按“时间 + 错误”给 1–3 星；1 星解锁下一关。
3. 首页 / 关卡选择显示进度；刷新后保留。
4. 设置项：严格拼写开关。
5. 验收：40 关可连续玩、刷新不丢、手机 375px 可用。

## 新会话开场白

> 读 `docs/README.md`、`docs/handoff.md`、`docs/roadmap.md`，当前 v0.2.4，从 v0.3.0 的“进度与星级”开始做。

## 版本状态

```
v0.2.4  docs baseline（本文档集）
v0.2.3  指板方向 + CHANGELOG 修复
v0.2.2  UTF-8 BOM 修复
v0.2.1  关卡选择器修复
v0.2.0  Web 端
v0.1.0  core + 40 关
```
