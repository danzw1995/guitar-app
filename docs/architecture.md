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
  统一在 `src/lib/levels.ts` 里读一次，顺带算三星达标时间。
- `src/lib/storage.ts` 是**唯一**直接碰 localStorage 的地方：`guitar.progress.v1`、
  `guitar.settings.v1`，并负责把 v0.2.x 的 `guitar.best.*` 迁移过来。
  换壳（Tauri / Capacitor / 小程序）时只换这一层。
- 状态：页面内 `useState`；跨会话一律走 `storage.ts`，不在组件里直接写键。
- 版本号由 `vite.config.ts` 的 `define` 注入 `__APP_VERSION__`（取自 `apps/web/package.json`），
  页脚不再硬编码。

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
| 存储 | `lib/storage.ts`（localStorage） | `wx.setStorageSync` | WebView localStorage |
| 计时 | `Date.now` + interval | 同左 + `onHide` | 同左 |
| 音频 | Web Audio（v0.6） | InnerAudioContext | Web Audio |
| 分享 | Clipboard / URL | `onShareAppMessage` | 系统分享 |

core 里不出现这些 API。

## 5. 平台目标

- **Web / PWA**：主形态，先跑通。
- **PWA**（v0.6.0 已实现）：`public/manifest.webmanifest` + `public/sw.js`。
  service worker 刻意保守——**导航请求网络优先**（发新版立刻生效，不会卡在旧版本），
  静态资源 stale-while-revalidate（Vite 产物带 hash，旧缓存不会顶替新文件）。
  只在 `import.meta.env.PROD` 注册，避免开发时缓存干扰热更新。图标由
  `apps/web/scripts/gen-icons.mjs` 手写 PNG 编码生成（不依赖 sharp/canvas）。
- **Tauri（Windows）**：包 Web 产物，体积小。
- **Capacitor（Android）**：包 Web 产物。
- **DSH 插件**（v0.5.0 已实现）：`plugins/dsh-guitar` 是一个 bundle，两条加载路径：
  Client 半（`client.js`，租 rollup 打包成 `window.__ModuleLoader__` 工厂）挂 `conversation.view`；
  Host 半（`index.js`，Node ESM）用 `ctx.tools.register()` 暴露 4 个吉他工具。
  不允许 iframe，必须继承宿主主题与 locale。
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
- DSH 沙箱禁止 esbuild 启动子进程，`pnpm build`（Vite）在当前环境无法验证；以 `pnpm dev` + `tsc --noEmit` 为准。
- Node 26 可直接跑 `.ts`，core 测试不需要构建。
- **core 的构建用 `tsc`，不用 esbuild/tsup**：`pnpm --filter @guitar/core build`
  走 `packages/core/tsconfig.build.json`，输出 ESM + `.d.ts` 到 `packages/core/dist/`（已 gitignore）。
  源码里的 `.ts` 后缀靠 TS 5.7+ 的 `rewriteRelativeImportExtensions` 改写成 `.js`；
  `src/levels.ts` 依赖 `node:fs`，只给脚本用，排除在构建外。
  Vite 仍然直接吃源码（`exports["."] = ./src/index.ts`），`exports["./dist"]` 给 DSH 插件用。
- **不要用 PowerShell 的 `Get-Content -Raw` / `Set-Content` 改仓库里的文本文件**：它会按 ANSI 读 UTF-8，
  中文会变成乱码并吞掉换行（本仓库已经踩过一次，靠 `git checkout` 才恢复）。用编辑工具，或显式指定 `-Encoding utf8`。
- **DSH 插件的 Host 半不能 `import` dsh 内部包**：`@deepseek-ai/dsh-tools` 等在 `app.asar` 里，
  从插件目录解析必然 `ERR_MODULE_NOT_FOUND`；`harness.defineTool` 只是动态插件的沙箱全局。
  工具定义要自己拼（`ctx.tools.register()` 只校验 `name` 与 `output.render`），见
  `plugins/dsh-guitar/README.md`。
- **插件插槽有类型**：`single` / `list` / `keyed` / `chain`。注册到 `single` 槽会抛
  `single slot "…" already has a registration`；整页面板要用 `conversation.view`（list）。
- **DSH 的 session 是多帧 zstd**（`session.v4.jsonl.zstd`），普通文本搜索无效；
  用 `node scripts/session-grep.mjs <关键字> --calls` 查工具调用记录。
