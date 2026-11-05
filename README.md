# Guitar Lab

Web-first 的吉他学习应用：常用和弦、标准调弦音阶指板、40 关音阶推算游戏。

当前版本：**v0.7.3**

## 功能

- **和弦库**：16 个常用和弦，指法图 + 建议指法 + 横按标记，并给出性质与构成音（如「C 大三和弦 · C E G」）。
- **音阶指板**：标准调弦，1–12 品，12 调 × 4 种音阶，主音/音阶音高亮；按真琴画（弦线、品丝、琴枕、品位记号），
  可切换显示**音名 / 唱名 / 两者**，唱名支持首调与固定、数字与 do re mi，变化音带升/降、八度带点。
- **音阶游戏**：40 关固定关卡（5 章），给定部分音名，推算其余；难度与要填格数可见。
- **推算模式**：随机调，整块指板只给一格提示（任意调内音），其余全靠推。
- **乐理入门**（十一节课，每节「一句话 → 钢琴上看 → 吉他上看」）：音与半音、12 平均律、
  大调与小调公式（含关系小调）、音程、三度叠置（和弦是叠出来的）、和弦级数（I–vii°）、
  指板规律（相邻弦差 5 品 / 同品跨弦 +3 级 / 八度形状 / 同弦 2-2-1-2-2-2-1）、
  **CAGED 五把位**（可交互，含大小三切换）、七和弦（maj7 / 7 / m7）、五度圈与调号。
  和弦页有「级数徽章」，音阶页有「音程公式」。
- **乐理挑战**：12 关（三和弦 / 七和弦 / 音程），在指板上**点亮所有答案格**，判定后标出漏点与多点；
  键盘可玩（方向键移动、空格点亮、Esc 关闭），成绩同样记星级。
- **进度与星级**：每关完成状态、1–3 星、逐关解锁、最快全对时间；刷新不丢。
- **键盘操作**：Tab 选格、Enter 开选择器、字母输入音名（可加 `#`/`b`）；移动端点按 ≥ 40px。
- **每日挑战**：题目按日期生成（同一天同题），独立记录与连续天数；不影响主线解锁。
- **统计**：通关进度、星级、平均星级、提交次数、最近 7 天与最近战绩，全部本机保存。
- **设置**：指板显示、唱名体系与写法、严格拼写、重置进度集中一处。
- **DSH 插件**（`plugins/dsh-guitar`）：在 DeepSeek Harness 里加一个 `Guitar Lab` 整页标签
  （和弦指法图 / 音阶指板 / 今日一题），并把同一份数据暴露成 4 个 agent 工具
  （`guitar_chord` / `guitar_scale` / `guitar_daily` / `guitar_note_at`）。
- **PWA**：可安装到桌面 / 手机，断网也能打开（图标、manifest、service worker 在 `apps/web/public/`）。
- **核心引擎**：调号拼写、出题、难度、判定、唱名、和弦构成，纯 TS + 单测。

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
pnpm test         # 核心测试（42 个）
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
| [plugins/dsh-guitar/README.md](plugins/dsh-guitar/README.md) | DSH 插件：插槽、构建、安装、踩过的坑 |

## 下一步

**v0.6.0**：PWA / Tauri（Windows）/ Capacitor（Android）壳。详见 [docs/roadmap.md](docs/roadmap.md)。
