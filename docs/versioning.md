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

当前：产品 `0.94.0`，core `0.50.0`，插件 `0.5.1`（v0.19.0 给 core 加了 `strumTab`（按音位排谱），算 MINOR；
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
v0.53.0 的「跳过小结」只读 `guitar.skips.v1`，是 `apps/web/src/pages/Stats.tsx` 里的一段渲染，
core 与工具都不动。
v0.54.0 的「这一周先不练」是前端的新键 `guitar.pauses.v1`（`storage.ts` 的 `PauseLog`）加
`UndoToast` 的第二个按钮，core 只是复用现成的 `pickDue` 的 `exclude`，版本不动。
v0.55.0 的「先不练的」列表只读 `guitar.pauses.v1`，是 `apps/web/src/pages/Stats.tsx` 里的一段
渲染加 `removePause()`，core 与工具都不动。
v0.56.0 给 core 的 `pickDue` / `buildSession` 加了可选的 `freeze`（压后期间不算天数），
属于新增可选参数，core 记 MINOR（0.27.0）；工具不动。
v0.57.0 只动练习页（勾完自动滚到下一块 + 全勾完的收尾提示），core 与工具都不动。
v0.58.0 只动节奏页（「只看没练过的」开关）与检查脚本（补 catch），core 与工具都不动。
v0.59.0 的转换练习在 core 新增了 `chord-drill.ts`（`PROGRESSIONS` / `chordAt` / `changesIn` / `drillBeats`），
新增导出算 MINOR，core 到 `0.28.0`；成绩存前端新键 `guitar.chords.v1`（`storage.ts` 的 `loadChords` /
`saveChords`，与跟练共用同一套记录形状），备份也带上了这把键；工具不动。
v0.60.0 只动统计页（新增「和弦转换」一段），读的还是 `guitar.chords.v1`，core 与工具都不动。
v0.61.0 只动前端（乐理课的「练一练」+ `lib/nav.ts` 的 hash 跳转），core 与工具都不动。
v0.62.0 给 core 加了 `weekly.ts`（`mondayOf` / `weekSummaryOf`），按「新增导出算 MINOR」core 到 0.29.0。
v0.63.0 在 `weekly.ts` 里加了 `goalProgress`，core 到 0.30.0。
v0.64.0 只动练习页（复用 `goalProgress`），core 与工具都不动。
v0.65.0 还是练习页（目标那行变成按钮 + 完成提示），core 与工具都不动。
v0.66.0 在 `weekly.ts` 里加了 `weekPace`（差额摊到每天、按现在的节奏推算这周总量），core 到 0.31.0。
v0.67.0 在 `weekly.ts` 里加了 `weekStreak`（按周记目标，数连续达成的周数），core 到 0.32.0。
v0.68.0 在 `weekly.ts` 里加了 `weekReportOf`（周报），`weekStreak` 多给 `best` / `lastWeeks` / `lastUntil`，core 到 0.33.0。
v0.69.0 只是节奏页给伴奏型加了「变速三档」的快捷入口，全是前端行为，core 与工具都不动。
v0.70.0 新加 `tuner.ts`（音高检测与调音读数），新导出算 MINOR，core 到 0.34.0。
v0.71.0 新加 `transcribe.ts`（扒谱：帧序列切成音、秒换拍、MIDI 落到弦和品），新导出算 MINOR，core 到 0.35.0。
v0.72.0 新加 `ear.ts`（听辨题库与展示用的音名/音程名），新导出算 MINOR，core 到 0.36.0。
v0.73.0 给 `ear.ts` 加了级数判断（`earDegreeQuestion` 等新导出），算 MINOR，core 到 0.37.0。
v0.74.0 只是扒谱页补满十二节课 + 手机上改目录，全在前端，core 与工具都不动。
v0.75.0 把扒出来的谱存进「我的谱」，也只动前端（`my-scores.ts` 加了 `source` / `tab` 字段），core 与工具都不动。
v0.76.0 新加 `chord-detect.ts`（频谱折成 12 个音级、按模板认和弦），新导出算 MINOR，core 到 0.38.0。
v0.77.0 给 `ear.ts` 加了级数走向（`earProgressionQuestion` / `degreeChord` / `DEGREE_PROGRESSIONS`），算 MINOR，core 到 0.39.0。
v0.78.0 只是把听辨成绩搬到统计页（`guitar.ear.v1` 早就在存了），全在前端，core 与工具都不动。
v0.79.0 加「从音频文件导入」：解码和取帧都在 `apps/web/src/components/Transcribe.tsx` 里，
切音/量化/落弦品还是走 v0.71.0 的 core 流水线，core 不动。
v0.80.0 给 `ear.ts` 加了第五种题型「和弦性质」（`earQualityQuestion` / `EAR_QUALITIES` / `EarQuality`），
新导出算 MINOR，core 到 0.40.0。
v0.81.0 给和弦性质分两档（`QUALITY_SETS` / `QualitySet`，`earRound` 多一个 `{ qualitySet }` 参数），
也是新导出，core 到 0.41.0。
v0.82.0 只是把 `missing` / `extra` 显示出来（core 早就在算），只动前端与一条 core 测试，core 不动。
v0.83.0 把听辨正确率按天记下来、在统计页画曲线，存储形状变了但 core 没有新导出，core 不动。
v0.84.0 加了 `chordVoicingTab()`（把和弦按法写成谱）和第三档挂留与强力，新导出算 MINOR，core 到 0.42.0；
v0.85.0 的切段（`segmentChords()`）也是新导出，core 到 `0.43.0`——和弦页的六线谱版与「我的谱」的和弦卡跳转都只在前端。
v0.86.0 又加了四个新导出（`qualityIntervals()` / `chordMidis()` / `voicingOf()` / `sequenceTabOf()`），core 到 `0.44.0`。
v0.87.0 加了 `chordPatternTab()`（同一个和弦写成扫弦或分解），core 到 `0.45.0`——切段改名、和弦谱单独听都只在前端。
v0.88.0 把 `sequenceTabOf()` 扩成 `(chords, beatsPerBar, bpm)`（速度和拍号进谱头），core 到 `0.46.0`；
「按住不放」的长音跟读、切段调顺序与合并都在前端。
v0.89.0 只动前端：直接跟练、导出图片、转位低音提示都用现成的 core 接口，core 停在 `0.46.0`；
v0.90.0 加了两个新导出（`segmentTabOf()` 按真实时长写谱、`bassLineOf()` 低音走线），core 到 `0.47.0`；
「我的谱」卡上的节拍标记只在前端；
v0.90.1 只是把转位和弦写成 `C/E`（`chordLabelOf()` 是新导出，但只为了这个显示问题，按 PATCH 走）；
v0.91.0 加了 `estimateTempo()`（按你弹的速度估 BPM）并给 `BassStep` 加了 `midi` 字段，core 到 `0.48.0`；
「我存的进行」那一块与备份合并都在前端。
v0.92.0 只动前端（低音折线叠到谱上、按速度试听、我存的进行能改），core 与工具都不动。
v0.93.0 在 `chord-detect.ts` 里加了 `snapSegments()`（把切段边界挪到小节线上），新导出算 MINOR，core 到 `0.49.0`。
v0.93.1 只是把最后一段的收尾改成一格（`end = start + step`），core 不动。
v0.94.0 加了 `degreeInKey()`（级数跟着调走），新导出算 MINOR，core 到 `0.50.0`；
一小节一张节奏型卡、和弦谱卡改速度拍号、`retimeTab()` 抽成前端共用函数，都在前端。
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
