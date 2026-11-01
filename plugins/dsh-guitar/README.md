# Guitar Lab · DSH 插件

在 Harness 的 Web UI 里挂一块 Guitar Lab 面板：和弦构成音、音阶音、今日一题。
数据全部来自仓库里的 `@guitar/core`，只读，不碰进度存档。

## 结构

| 文件 | 作用 |
|---|---|
| `src/client.js` | 面板源码（React，`createElement` 写法，无 JSX） |
| `build.mjs` | 用 rollup 打成 `client.js`（CJS 工厂 + `window.__ModuleLoader__.load`） |
| `client.js` | **构建产物**，插件加载的就是它 |
| `index.js` | Host 半，现在只有 `apply() {}` |
| `cordis.patch.yml` | 往 profile 里插入一行插件 |
| `locale/*.json` | 插件管理器的标题/描述 |
| `icon.svg` | 插件图标 |

## 构建

```bash
# 先把 core 产出来（client.js 里 import 的是 dist，不是 src）
pnpm --filter @guitar/core build
node plugins/dsh-guitar/build.mjs
```

不用 esbuild/tsup：DSH 沙箱里 esbuild 起不了子进程，rollup 是纯 JS。

## 安装

在 Harness 里用 `plugin_manager` 装这个包：

```
plugin_manager action=install_bundle target="F:\program\workspace\guitar-app\plugins\dsh-guitar"
```

装完刷新页面，输入框上方（`conversation.composer.dock`）会出现面板。
`target` 必须是**绝对路径的包目录**（有 `package.json` 的那一层）。

## 已验证 / 未验证

- 已验证：bundle 能被 `window.__ModuleLoader__` 加载；`apply` 注册到
  `conversation.composer.dock`；用 `react-dom/server` 渲染出 3.5KB HTML，
  和弦/性质/指法/标签都在。
- **未验证**：真实 Harness 里的插槽位置与宽度、`--dsw-alias-*` 主题变量名
  （每个变量都写了深色兜底色，取不到也能看）、`ctx.locale.t` 的实际签名（取不到走中文兜底）。

## 下一步

1. 确认面板在真实对话里能出现、宽度合适。
2. 用一个最小 Host 工具试 `import` 是否可用；通了就把 `guitar.lookupChord` /
   `guitar.generatePuzzle` 接上（`harness.defineTool` + `ctx.tools.register`）。
