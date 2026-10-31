# Guitar Lab

Web-first 的吉他学习应用：常用和弦、标准调弦音阶指板、40 关音阶推算游戏。

当前版本：**v0.2.4（文档基线）** · 功能基线 v0.2.3

## 功能

- **和弦库**：16 个常用和弦，指法图 + 建议指法 + 横按标记。
- **音阶指板**：标准调弦，0–12 品，12 调 × 4 种音阶，主音/音阶音高亮；指板方向与六线谱一致（纵轴 1–6 弦）。
- **音阶游戏**：40 关固定关卡（4 章 × 10 关），给定部分音名，推算其余；计时、三态判定、结果、每关最佳成绩。
- **核心引擎**：调号拼写（F 大调 = Bb，不是 A#）、出题、难度评分、判定，纯 TS + 单测。

## 技术栈

- pnpm workspace
- React 18 + TypeScript + Vite 5
- `packages/core`：无 UI 依赖的领域核心（可复用到 Web / Tauri / Capacitor / DSH 插件）
- 测试：Node 26 原生 TypeScript，不需要构建

## 目录

```
packages/core/    音乐理论、出题、判定、40 关数据
apps/web/         React 前端
docs/             产品、架构、规则、UX、路线图、交接
CONTRIBUTING.md   开发与发版约定
```

## 开发

```powershell
pnpm install
pnpm dev          # http://127.0.0.1:5173
pnpm build        # 产物在 apps/web/dist
pnpm test         # 核心测试（9 个）
pnpm demo L01     # 终端打印一关
```

> 需要 pnpm 9+：`npm install -g pnpm`。新增 JSON 必须无 BOM（见 CONTRIBUTING）。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/handoff.md](docs/handoff.md) | **先读**：当前状态、已知问题、下一步 |
| [docs/product.md](docs/product.md) | 用户、范围、非目标、指标 |
| [docs/architecture.md](docs/architecture.md) | 分层、边界、跨端、技术决策 |
| [docs/game-rules.md](docs/game-rules.md) | 调弦、拼写、出题、判定、难度 |
| [docs/ux.md](docs/ux.md) | 页面、指板方向、状态色、交互 |
| [docs/roadmap.md](docs/roadmap.md) | v0.3 → v1.0 计划 |
| [docs/versioning.md](docs/versioning.md) | SemVer / tag / 发版 |

## 下一步

**v0.3.0：进度与星级** —— 完成状态、1–3 星、关卡解锁、严格拼写开关、手机竖屏验证。详见 [docs/roadmap.md](docs/roadmap.md)。
