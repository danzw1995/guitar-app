# 版本与协作约定

## 版本号

SemVer：`MAJOR.MINOR.PATCH`

- MAJOR：不兼容的接口/数据变更
- MINOR：向下兼容的新功能
- PATCH：修 bug、文案、样式

发版按内容定级，不强制每个版本都带新功能：只有修复时发 PATCH（v0.2.1–v0.2.3 都是这样）。

## 谁跟着谁涨

| 包 | 版本号 | 说明 |
|---|---|---|
| 根 `package.json` | 产品版本 | MINOR 版本与 git tag 一一对应（patch 不打 tag） |
| `apps/web` | 产品版本 | 跟随根 |
| `packages/core` | 独立 | 只在自己的 API 变化时动；新增导出算 MINOR |
| `plugins/dsh-guitar` | 独立 | 同上；插件与产品发版节奏不同，改插件才动 |

当前：产品 `0.52.0`，core `0.26.0`，插件 `0.5.1`（v0.19.0 给 core 加了 `strumTab`（按音位排谱），算 MINOR；
v0.19.6 只是排版与记法，core 不动；v0.20.0 换渲染器、core 只多了一个 `alphatex.ts`（新导出 `tabToAlphaTex` 等），
按「新增导出算 MINOR」本该升到 0.16.0，但 alphaTex 只是渲染适配层、不属于乐理 API，这次按 PATCH 处理；
v0.21.2 给 `TabNote` 加了 `ghost`（弦不弹、谱上画 x），向下兼容，core 升到 `0.16.0`；
v0.21.3 只改渲染留白，core 不动；v0.21.4 只改渲染参数与自画箭头，core 不动；
v0.21.5 删掉 `ghost`（六线谱里不弹的弦应留空），core 回到 `0.16.1`；
v0.21.6 切音改 `{pm}`，core 到 `0.16.2`；v0.21.7 只改渲染（P.M. 虚线、箭头跟着每行走、像素裁边），core 不动；
v0.22.0 加了跟练的节拍器设置、按练习给拍号与细分、音量与音频单例，都是前端行为，core 不动；
v0.23.0 加了今日三条与完成度，仍是前端；v0.24.0 的视听同步靠 `@danzw777/tab-score` 多吐一份拍位
（工具升到 `0.6.0`），core 不动；v0.26.0 的「我的谱」只在前端（按需加载 alphaTab + localStorage），
复用工具导出的 `asciiTabToSpec`，core 不动，工具升到 `0.8.0`（多了 `./ascii` `./spec` `./duration` 子路径导出）；
v0.26.1 只是包名改名与发布；v0.27.0 把「我的谱」的预览也改成静态 PNG（浏览器里画一次、存成图，
和内置谱同一套显示），仍只在前端，core 与工具都不动；
v0.43.0 把节奏页的跟练面板接到练习页（成绩键加 `p:` 前缀，仍存 `guitar.rhythm.v1`），只动前端，core 与工具都不动；
v0.44.0 的热力图放在 core（`heatmapOf` / `heatLevel` / `weekdayIndex`，`daily.ts` 多导出 `addDays`），
按「新增导出算 MINOR」core 升到 `0.22.0`；工具不动。
v0.45.0 的跟练曲线也放在 core（`history.ts` 的 `pushBpmPoint` / `sparklineOf`），core 升到 `0.23.0`；
同版的热力图点选、默认落地页改「练习」都只动前端。
v0.46.0 的间隔复习同样在 core（`review.ts` 的 `lastPracticed` / `dueDaysOf` / `pickDue`），
`buildSession` 多了可选的 `log`，core 升到 `0.24.0`。
v0.47.0 只是把节奏页「今日三条」接到同一套挑选上（前端改动，core 不动）。
v0.48.0 的「退步加急」在 core（`history.ts` 的 `regressedIds` / `REGRESS_BPM` / `REGRESS_BOOST_DAYS`，
`review.ts` 的 `pickDue` 多了 `boost` / `exclude`），core 升到 `0.25.0`。
v0.49.0 的「换一条」只动前端（跳过表 `guitar.skips.v1` 存在 `apps/web/src/lib/storage.ts`），
挑选复用 `pickDue` 已有的 `exclude`，core 与工具都不动。
v0.50.0 把同一个跳过表接到练习页：`buildSession` 的 `BuildOptions` 多了可选的 `skip`，
core 升到 `0.26.0`（和 v0.46.0 加 `log` 时一样按 MINOR 算）。
v0.51.0 只把 `guitar.skips.v1` 加进备份的键表与合并规则（`apps/web/src/lib/backup.ts`），
core 与工具都不动。
v0.52.0 的「撤销」是前端组件（`apps/web/src/components/UndoToast.tsx`）加 `storage.ts` 的
`removeSkip()`，core 与工具都不动。
`tools/tab-score` 是独立发布的包（`@danzw777/tab-score`），版本线与产品无关，现在是 `0.8.4`
（0.7.0 加了 ASCII 六线谱输入，0.8.0 补子路径导出并把样例从发布包里摘掉，0.8.1 是第一次真正发布到 npm——
因为 `@danzw` 那个 scope 当时的 token 没有写权限，包名从 `@danzw/tab-score` 改成了 `@danzw777/tab-score`；
0.8.2 只修 README 里的样例文件名；0.8.3 给拍位补上纵向区间，多行谱的高亮只盖一行；
0.8.4 修 ASCII 里大写 `E` 被当成 1 弦、把 1 弦那一行覆盖掉的问题）。

## 一次发版的流程

1. 功能提交到 `main`。
2. 更新 `CHANGELOG.md`：把 `Unreleased` 的内容移到新版本号下，写日期。
3. 更新根 `package.json` 与 `apps/web` 的版本号；`packages/core` 只在自己的 API 变了时升。
4. 提交：`chore(release): v0.4.1`。
5. **只有 MINOR（`vX.Y.0`）才打 tag**：`git tag -a v0.31.0 -m "v0.31.0"`；
   patch 版本（`v0.30.1`、`v0.30.2`…）只 bump + 记 CHANGELOG + 提交，**不打 tag**。
6. 推送：`git push origin main`（有 tag 时再 `--tags`）。

## 提交信息

Conventional Commits：

```
feat(core): 增加五声音阶
fix(web): 修复计时器在后台漂移
docs: 更新版本流程
chore(release): v0.4.1
```

scope：`core` / `web` / `docs` / `repo`。

## 追溯

- **tag 只打在 MINOR（`vX.Y.0`）上**：`git log v0.29.0..v0.30.0` 可看这一段（一个功能版本）的全部提交；
  patch 版本靠 `CHANGELOG.md` 的条目与提交信息定位，不再单独打 tag
  （2026-11-12 清理：删掉了 33 个 patch tag，只留 30 个 MINOR tag）。
- `CHANGELOG.md` 按版本记录“做了什么”，MINOR tag 指向对应提交。
- 破坏性变更在提交 body 里写 `BREAKING CHANGE:`。
