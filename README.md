# Guitar Lab

Web-first 的吉他学习应用：常用和弦、标准调弦音阶指板、40 关音阶推算游戏。

## 功能（v0.2.0）

- **和弦库**：16 个常用和弦，指法图 + 建议指法 + 横按标记。
- **音阶指板**：标准调弦，0–12 品，12 个调 × 4 种音阶，主音/音阶音高亮。
- **音阶游戏**：40 关固定关卡，给定部分音名，推算其余；计时、拼写提示、宽松/严格判定、最佳成绩。
- **核心引擎**：调号拼写、出题、难度评分、三态判定，全部纯 TS、可单测。

## 技术栈

- pnpm workspace
- React 18 + TypeScript + Vite 5
- `packages/core`：无 UI 依赖的领域核心（可复用到 Web / Tauri / Capacitor / DSH 插件）
- 测试：Node 26 原生 TypeScript，不需要构建

## 目录

```
packages/core/    音乐理论、出题、判定、40 关数据
apps/web/         React 前端
docs/             版本与协作约定
CHANGELOG.md      版本时间线
```

## 开发

```bash
pnpm install
pnpm dev          # Vite，http://127.0.0.1:5173
pnpm build        # 产物在 apps/web/dist
pnpm test         # 核心测试（9 个）
pnpm demo L01     # 终端打印一关
```

> 需要 pnpm 9+。没有的话先装：`npm install -g pnpm`（或 `corepack enable pnpm`）。

## 版本

- `v0.1.0`：核心引擎 + 40 关数据
- `v0.2.0`：Web 端（和弦 / 音阶 / 游戏）
- `v0.2.1`：修复关卡选择器只显示当前章节

版本记录见 [CHANGELOG.md](CHANGELOG.md)，发版流程见 [docs/versioning.md](docs/versioning.md)。
