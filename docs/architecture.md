# 架构

## 1. 总览

```
apps/web (React + Vite)
apps/desktop (Tauri, 计划)
apps/mobile (Capacitor, 计划)
plugins/dsh-guitar (DSH Client 插件, 计划)
        │
        ▼
packages/core (纯 TS：理论 / 出题 / 判定 / 数据)
```

当前只有 `packages/core` + `apps/web`。其他是目标形态，不提前建空包。

## 2. 分层与边界

### packages/core

- **纯 TS**：不引用 DOM、不引用 `node:fs`、不发网络请求。
- `theory.ts`：调号拼写、音阶、音高类、指板定位。
- `puzzle.ts`：出题、难度、判定。
- `chords.ts`：和弦指法数据。
- `types.ts`：公共类型。
- `levels.ts`：**Node 专用**（读 JSON），不从 `index.ts` 导出，避免进浏览器包。
- 单测：`node test/core.test.ts`（Node 26 原生 TS）。

### apps/web

- React 18 + Vite 5，函数组件 + hooks。
- 三页：`Chords` / `Scales` / `Game`，共用 `Fretboard`。
- 关卡数据用 Vite 的 JSON import 直接读 `packages/core/data/levels.json`，不经过 `levels.ts`。
- 状态：页面内 `useState`；跨会话只存 localStorage。

### 未来 packages/ui（计划）

现在 UI 在 `apps/web/src/components`。当 DSH 插件 / Tauri 需要复用时，把 `Fretboard`、`ChordDiagram`、`NotePicker` 抽到 `packages/ui`，Web 与插件共用。**不要在只有 Web 一个消费者时提前抽包。**

## 3. 数据流

```
levels.json ──► generatePuzzle(level params)
                    │
                    ▼
              Puzzle { target, givens, difficulty }
                    │
       玩家输入 answers: Record<"s:f", string>
                    │
                    ▼
              checkAnswer ──► AttemptResult { cells, correct, spelling, wrong, empty }
```

`Puzzle` 不存答案文本；答案由 `expectedNameMap(puzzle)` 从调号 + 音阶推导，保证“规则唯一”。

## 4. 跨端适配点

将来换壳时，只有这些需要替换：

| 能力 | Web | 小程序（未来） | 桌面/安卓 |
|---|---|---|---|
| 存储 | localStorage | `wx.setStorageSync` | WebView localStorage |
| 计时 | `Date.now` + interval | 同左 + `onHide` | 同左 |
| 音频 | Web Audio（v0.6） | InnerAudioContext | Web Audio |
| 分享 | Clipboard / URL | `onShareAppMessage` | 系统分享 |

core 里不出现这些 API。

## 5. 平台目标

- **Web / PWA**：主形态，先跑通。
- **Tauri（Windows）**：包 Web 产物，体积小。
- **Capacitor（Android）**：包 Web 产物。
- **DSH 插件**：Client 插件，React 组件注册到 slot；不允许 iframe，必须继承宿主主题与 locale。
- **微信小程序**：暂缓。未来“原生 UI + core 的 CJS 构建”，不用 Taro。

## 6. 关键技术决策

### 为什么 Web-first

界面是 2D（指板、按钮、图表），Web 性能足够；一套组件可覆盖浏览器、Tauri、Capacitor、DSH 插件。Flutter 无法复用到 DSH 插件。

### 为什么 core 不引 Node API

浏览器与小程序都没有 `fs`。`levels.ts` 只给脚本/测试用；Web 直接 import JSON。

### 为什么小程序不用 Taro

三页应用，Taro 的 React 抽象仍需重写 Canvas/样式/API，实际复用约 70%，却多一层构建与兼容成本。原生重写更稳。

### 为什么先不做账号

v1 是练习工具，本地进度足够；账号/云同步会引入后端、隐私、合规成本。

## 7. 已知工程约束

- 本机 PowerShell 5.1 写 UTF-8 会带 BOM，导致 Vite 读 `package.json` 失败；**新增 JSON 必须无 BOM**。
- DSH 沙箱禁止 esbuild 启动子进程，`pnpm build` 在当前环境无法验证；以 `pnpm dev` + `tsc --noEmit` 为准。
- Node 26 可直接跑 `.ts`，core 测试不需要构建。
