# Guitar Lab · DSH 插件

在 Harness 的 Web UI 里挂一块 Guitar Lab 面板：和弦构成音、音阶音、今日一题。
数据全部来自仓库里的 `@guitar/core`，只读，不碰进度存档。

## 结构

| 文件 | 作用 |
|---|---|
| `src/client.js` | 面板源码（React，`createElement` 写法，无 JSX） |
| `build.mjs` | 用 rollup 打成 `client.js`（CJS 工厂 + `window.__ModuleLoader__.load`） |
| `client.js` | **构建产物**，插件加载的就是它 |
| `test/render.mjs` | 无浏览器验证：加载 bundle、渲染三页、把圆点数量和 core 算出来的位置对齐 |
| `index.js` | Host 半，现在只有 `apply() {}` |
| `cordis.patch.yml` | 往 profile 里插入一行插件 |
| `locale/*.json` | 插件管理器的标题/描述 |
| `icon.svg` | 插件图标 |

## 插在哪个槽

`conversation.view`——和 Chat / Trajectory 并列的**整页标签**，list 类型，可以多注册。

踩过的两个坑（DSH 的插槽分 `single` / `list` / `keyed` / `chain`，注册到 single 槽会直接抛错）：

| 槽 | 类型 | 结果 |
|---|---|---|
| `conversation.composer.dock` | list | 能装，但那是输入框里放 token 统计的一行，挤成一团 |
| `conversation.header` | **single** | 宿主已占，报 `single slot "conversation.header" already has a registration at priority 0` |
| `conversation.view` | list | ✅ 整页，宽度高度都够 |

## 构建

```bash
pnpm --filter @guitar/core build     # client.js import 的是 dist，不是 src
node plugins/dsh-guitar/build.mjs
node plugins/dsh-guitar/test/render.mjs
```

不用 esbuild/tsup：DSH 沙箱里 esbuild 起不了子进程，rollup 是纯 JS。

## 画了什么

- **和弦**：0–5 品指法图，红点=根音、蓝点=其余构成音、○=空弦、×=闷弦，圆点里是音名；
  下方一行给性质和指法串（`x32010`）。
- **音阶**：1–12 品全指板，主音金色、其余音阶音蓝色，圆点里是音名；
  调外音不画（和 Web 应用里的默认视图一致）。
- **今日**：今天的日期、调、品域、要填格数，外加该调的指板。

样式只用 `currentColor` 和 `color-mix`，所以亮色/暗色主题都跟宿主一致，**不再猜 `--dsw-alias-*` 变量名**。

## 安装

在 Harness 里用 `plugin_manager` 装这个包：

```
plugin_manager action=install_bundle target="F:\program\workspace\guitar-app\plugins\dsh-guitar"
```

装完刷新页面，输入框上方（`conversation.composer.dock`）会出现面板。
`target` 必须是**绝对路径的包目录**（有 `package.json` 的那一层）。

## 已验证 / 未验证

已验证（`node test/render.mjs`，不是靠"应该能跑"）：

- bundle 被 `window.__ModuleLoader__` 加载，导出 `apply` / `inject`；
- `apply` 注册到 `conversation.view`，id `guitar-lab`，带 `label`；
- 和弦页：C 大三渲染出 2 个根音点、1 个三音点、1 个 ×（对应 `x32010`）；
- 音阶页：G 大调 1–12 品的圆点数量与 core 逐个算出来的位置完全一致（6 个主音 / 36 个音阶音）；
- 今日页：日期与调取自 `dailySpecFor`，指板存在。

**未验证**：真实 Harness 里 view 标签的渲染容器（宽度/内边距）、`ctx.locale.t` 的真实签名
（取不到走中文兜底）。

## 下一步

1. 确认 view 标签里能正常渲染、宽度合适。
2. 用一个最小 Host 工具试 `import` 是否可用；通了就把 `guitar.lookupChord` /
   `guitar.generatePuzzle` 接上（`harness.defineTool` + `ctx.tools.register`）。
