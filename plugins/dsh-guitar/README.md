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

- **和弦**：1–5 品指法图。左侧三栏分开：弦名（x=4）/ `○`空弦与`×`闷弦（x=34）/ 琴枕（x=48），
  所以标记不会压到弦名；红点=根音、蓝点=构成音、圆点内写音名；底部有品位数字。
- **音阶**：1–12 品全指板，主音金色、其余音阶音蓝色，圆点内写音名，底部 1–12 品位数字；
  调外音不画。
- **今日**：按 `dailySpecFor(今天)` 出题——调名、音阶名（如 `A 小调 · 自然小调`）、品域都写清楚，
  给定格显示音名，其余是 `?`；**点任意 `?` 可单独看这一格的答案**，另有「显示答案 / 隐藏答案」。
  注意 A 自然小调与 C 大调音高集合相同，指板看起来一样，所以标题必须写清调名。

样式用宿主的真实 token（`--dsw-alias-label-primary`、`--dsw-alias-border-l1`、`--dsw-font-xs-13` 等），
组件内渲染 `<style>` 元素，卸载时随之移除。

## 安装

在 Harness 里用 `plugin_manager` 装这个包：

```
plugin_manager action=install_bundle target="F:\program\workspace\guitar-app\plugins\dsh-guitar"
```

`target` 必须是**绝对路径的包目录**（有 `package.json` 的那一层）。装完重启 DSH
（Host 半是 Node 模块，不热更新；Client 半会），对话上方会出现 `Guitar Lab` 标签页。

## 已验证

`node plugins/dsh-guitar/test/render.mjs`（面板）与 `test/host.mjs`（工具）都跑在 Node 里，
不依赖浏览器或 DSH：

- bundle 被 `window.__ModuleLoader__` 加载，导出 `apply` / `inject`；
- `apply` 注册到 `conversation.view`，id `guitar-lab`，带 `label`；
- 和弦页：C 大三渲染出 2 个根音点、1 个三音点、1 个 ×（对应 `x32010`），底部有 1–5 品号；
- 音阶页：G 大调 1–12 品的圆点数量与 core 逐个算出来的位置完全一致（6 个主音 / 36 个音阶音）；
- 今日页：按当天 spec 出题，含 `?` 与「显示答案」；
- 工具：4 个定义形状正确（`parameters.type === "object"`、必填项、`render` 返回内容块），
  `execute` 返回真实数据。

**真机已验证**：面板在 `Guitar Lab` 标签页正常渲染；agent 调用 `guitar_scale` 返回
`G 大调：G A B C D E F#（首调唱名 1 2 3 4 5 6 7）`，`isError: false`。

## 下一步

1. 面板里补推算模式；今日一题做成能判分的练习（需要插件自己的存储）。
2. 用 `scripts/session-grep.mjs <工具名> --calls` 随时确认工具是否真的被调用。
