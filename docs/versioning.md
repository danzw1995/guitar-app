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

当前：产品 `0.160.0`，core `0.55.0`，插件 `0.5.1`（v0.19.0 给 core 加了 `strumTab`（按音位排谱），算 MINOR；
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
v0.95.0 只动前端（我的谱卡换调算级数、低音点按级数着色、一次存整段加每小节），core 与工具都不动。
v0.96.0 也只动前端（低音线段按级数上色、选过的调存进记录、跟练面板提示第几级），core 与工具都不动。
v0.97.0 只动前端（跟练里的整段级数与「下一个」预告、导出的 PNG 底下补一行级数），core 与工具都不动。
v0.98.0 也只动前端（级数方块点着单练一小节、读屏念下一级、进行标题带级数），core 与工具都不动。
v0.99.0 同样只动前端（只练两遍自动接回整段、级数方块带小节号、成绩里记下最卡的一处），
只是 `guitar.rhythm.v1` 多了一个可选的 `hardest` 字段，core 与工具都不动。
v0.100.0 把「最卡的地方」归堆放进 core（新导出 `hardestTally()`），按「新增导出算 MINOR」
升到 `0.51.0`；产品侧只是多了一行卡片文字、一个「练几遍」下拉和统计页一块列表。
顺带修掉只练单小节时数不出圈的 bug：改成用节拍器的 `pass` 而不是小节读数。
v0.101.0 的 `sliceTab()`（把一段谱切成一小节）也放在 core，新导出算 MINOR，core 到 `0.52.0`；
产品侧是跟练里提醒上次最卡的那一处、把它存成练习，以及统计页按条目再列一份。
v0.102.0 只动前端（练习页顶部那句最卡的一级、加进今日计划、统计页条目可点），core 与工具都不动；
新增的 `guitar.plan.v1` 存的是「今天自己加的」那几条，只留当天。
v0.103.0 也只动前端：自己加的能勾掉（跟练记完成绩自动勾）、练习库任意一条能加进计划、
统计页多一张「加餐」卡；core 与工具都不动。
v0.104.0 同样只动前端：节奏页 103 条都能加进今日计划、加餐那张卡点一下回练习页、
加餐的名字跟着记录走（`RhythmRecord.title`）；core 与工具都不动。
v0.105.0 还是只动前端：「我的谱」也能加进今日计划、加餐能拖 / 用 ↑↓ 调顺序、
统计页加餐卡落到还没勾的那一条；`guitar.plan.v1` 里重排后写的是递增的 `addedAt`，没加新字段。
v0.106.0 同样只动前端：拖拽落点画插入线、加进计划的名字带级数、
统计页按条目的顺序跟练习页计划对齐；core 与工具都不动。
v0.107.0 还是只动前端：拖到列表末尾的落点、按阶段统计加餐时长（用记录的 `title` 回查 `DRILLS`，
计划表里的 `stage` 第二天就没了）、「最卡的地方」按级数筛；core 与工具都不动。
v0.108.0 同样只动前端：加餐按阶段分组（只插小标题、不重排）、触摸屏长按拿起再点另一条挪位、
统计页归堆那几行也能点着筛（和 chip 共用选中态）；core 与工具都不动。
v0.109.0 还是只动前端：拿起一条时其余几条淡虚线提示、分组能收起、统计页按级数筛的状态写进
地址栏（`#stats?d=5`，另用 `sessionStorage` 兜住顶部 Tab 点击冲掉 hash 的情况）；core 与工具都不动。
v0.110.0 也只动前端：分组标题带「几条 · 多少分钟」、收起的组存 `guitar.extras.closed.v1` 记得住、
统计页「最卡的地方」多一排按阶段筛（和级数筛叠着生效）；core 与工具都不动。
v0.111.0 仍是前端一版：跟练回执里列出「这次还点了另外几处」（每处能单独存成练习 / 加进计划）、
统计页两排筛选能存成「视角」（`guitar.stats.views.v1`，最多 5 个）、加餐完成度按阶段拆一行；
顺手把级数 0 的显示统一成「调外音」（`lib/degrees.ts` 的 `degreeName`，前端工具函数，不进 core）。
v0.125.0 只动前端：视角存下当时的「比上周快 / 慢 N BPM」（`StatsView.pace`）、
0 条的 chip 淡下去（`.chip-empty`）、≤720px 把「比上周快 10 BPM」与「只看这套」
再压成「快 10」「看」（`::after attr(data-short)`）；core 与工具都不动。
v0.126.0 只动前端：组合行的周对比改成按练习次数加权（`Math.max(1, sessions)`）、视角胶囊
直接显示「快 N / 慢 N」（`viewShortLabel` 让标题不再重复练习量）、筛空时补一句人话
（`.hardest-empty`）；顺手修掉一处乱码注释；core 与工具都不动。
v0.128.0 只动前端：「跟练进步」的曲线变成能点的（`role="button"` + 透明底 `<rect>`，选中那天在
行尾补「日期 · BPM · 比上一次 ±N」）、只看某套时曲线跟着筛（`.stat-sub-note`）、放宽一档之后
补一句「之后有 N 条」（提示带筛选快照键 `filterKeyOf`）；core 与工具都不动。
v0.129.0 只动前端与存储模型：「最卡的一处」多一个可选 `hardest.at`（哪天卡住的，`parseHardest`
里校验日期）、曲线上那天的点加空心圈（`.curve-hard`）、双击那天带着
`#practice/<id>?item=&follow=1&bar=N` 过去并让跟练面板圈住那一小节（`FollowAlongProps.startBar`，
挂在 reset effect 末尾而不是单独一个 effect）；core 与工具都不动。
v0.133.0 只动前端：放大块的箭头支持长按连翻（`setInterval` + 每帧同步的 `loopRef`，单点仍走
`onClick` 挪一格）、试听时上方用 `.follow-zoom-now` 写「正在响：第 N 弦…」、记录里多一个
`seg: { from, to }` 把这次圈住的段存下来（`parseSeg()` 校验，下次打开照圈回去）；core 与工具都不动。
v0.132.0 只动前端：试听那一段时谱面上的当前拍竖条跟着走（`TabScore` 给现画的谱改用
`ScoreImage.beats` 定位）、放大块标题边写「上次最卡 / 这一段单独练过几次」、放大块的范围
不再限死一小节（A-B 圈成几小节就画几小节），「上一小节 / 下一小节」改成 `stepWindow()`
把起止一起平移；core 与工具都不动。
v0.134.0 给 core 加了调弦预设（`TUNING_PRESETS` / `tuningPreset()` / `stringsOf()`，
`tunerReading()` 与 `nearestString()` 多一个可选的 `strings` 参数，旧的单参调用不变），
新导出算 MINOR，core 到 `0.53.0`；前端还加了「我的谱」里扒出来的谱逐音改、备份补 5 把键。
v0.137.0 给 core 加了 `timing.ts`（`detectOnsets` / `analyzeTiming`）——新导出算 MINOR，core 到 `0.54.0`。
前端在练习页底部加了「稳不稳」面板：开着节拍器弹一段，看每拍相对节拍器早了还是晚了、标准差多大、
有没有越弹越快。判定顺序是「抖 > 漂移 > 整体偏移」，先说最要命的那条。
v0.138.0 只动前端：「稳不稳」每弹完一遍记进 `guitar.steady.v1`（只留最近 24 遍），
统计页多一块趋势；`TimingReport` 顺带多两个半段标准差（前后两半各自多散）。core 仍是 `0.54.0`，
这把键也进了数据备份（第 20 把）。
v0.158.0 只动前端：①统计页「循环流水」每一行是按钮，点了走 `goTo("practice","steady", replayArgs(bpm, fromBar, toBar))`
（复用 v0.148.0 的 `replayArgs`，分组里多记一个 `bpm`）；②`wavePngDataUrl` 多一个可选 `trim`（秒），
说明文件里多一张「偏得最多的三拍（放大）」；③`WaveRuler` 的落点差小字支持长按连续听（420 毫秒起手、
每 850 毫秒一拍），并把清理 hook 挪到 early return 之前（否则解码完 hook 数变化直接崩）。存储结构没变，core 与工具都不动。
v0.160.0 只动前端：①`LoopEntry` 多两个可选字段 `stdevMs` / `deltaMs`（循环停下时用这一遍的
`TimingReport.stdevMs` 和 `compareRunOf()` 找到的同速上一遍算差），`guitar.steady.loops.v1` 里多这两个数；
②`wave.ts` 加 `waveComparePngDataUrl()`（左整段 + 右放大并排 488×48），`decodeWave(audio, columns)` 多一个
列数参数且列数进缓存键；③`WaveRuler` 的竖线可拖（竖线外一条 12 像素透明粗线，落在 0.35 秒内算抓竖线）。
存储只是加字段，core 与工具都不动。
v0.159.0 只动前端：①统计页「循环流水」那一行支持长按 420 毫秒 → `goTo("practice","steady", …)` 里多带
`auto=1` 与 `srounds`（这一组最近一次的轮数，`Steady` 的 `seeded` 解析后落回 0/2/3/5 那几档）；
②`wave.ts` 新增 `waveClipWavDataUrl()`（解码 → 切样本 → 自拼 16 位单声道 WAV，`btoa` 分块），
`steady.ts` 新增 `worstWindowOf()` / `worstClipOf()` / `downloadDataUrl()`，`runMetaMarkdown` 多一个可选
`clipName`；③`WaveRuler` 加一根跟着走的竖线（`marker` state），并把竖线画在拖选框之后。存储结构没变，core 与工具都不动。
v0.157.0 只动前端：①统计页按「哪几小节」归堆展示 `guitar.steady.loops.v1`（练过几次 / 共几轮 / 最近日期，
最近几次的轮数画成折线）；②`runMetaMarkdown` 写出两遍各自的音频文件名（新增导出 `audioFileName()`，
`downloadAudio()` 也改用它，两边名字保证一致）；③`WaveRuler` 加可选 `onSeek`，落点差的小字变成按钮，
点一下从那一拍往前 0.4 秒放两秒（面板里正在循环时先停循环）。存储结构没变，core 与工具都不动。
v0.156.0 只动前端：①循环听完记一条流水进 `guitar.steady.loops.v1`（`LoopEntry`：日期 / 时刻 / BPM / 起止小节 /
轮数，留最近 40 条），和 `guitar.steady.v1` 分开存——那边是「每一步多稳 + 录音」，这边只记「这一段练了几轮」；
②`runMetaMarkdown` 多一个可选 `compare` 参数（`compareRunOf()` 按「同 BPM、不晚于这一遍」找上一遍），
Markdown 末尾多一节「和同速的上一遍比」；③`WaveRuler` 在叠影上标出落点差（`.wave-ruler-diff` + 小字，只标最偏的三个）。
备份多第 21 把键 `guitar.steady.loops.v1`（`mergeLoops` 按 id 去重、保持顺序、留 40 条）。core 与工具都不动。
v0.155.0 只动前端：①循环听加「几轮」（2 / 3 / 5 / 一直，默认 3），到轮数自动停并收掉点击声，
循环中显示「第 1/3 轮」；effect 的依赖从 `loopRange` 对象换成秒数等原始值，否则每次渲染都重跑、
轮次永远从 1 开始；②叠影落点超过三个时只留最偏的三个（按 `|offset|` 排，其余 `.dim` 淡到 0.28）；
③`runMetaMarkdown` 末尾按这三拍偏拖/偏抢/都在 8 毫秒内写一句「下次练什么」。
`guitar.steady.v1` 结构没变，core 与工具都不动。
v0.154.0 只动前端：①循环听时按这一段拍位排点击声（每轮跳回开头重排），区间超出录音长度时收进录音内；
②`WaveRuler` 给叠影画落点（`.wave-ruler-ghost-dot`，只描边）；③`runMetaMarkdown` 多一行「偏得最多的三拍」。
`guitar.steady.v1` 结构没变，core 与工具都不动。
v0.153.0 只动前端：①拖选区间之后可以循环听那一小段（`<audio>` 的 `timeupdate` 到尾巴跳回开头），
②叠影可选「最稳的一遍 / 同速的上一遍 / 不叠」（`WaveRuler` 加 `ghostLabel`），
③说明文件里的缩略波形标上节拍线与每拍落点（`wavePngDataUrl` 加可选 `offsets` / `bpm` / `originMs`）。
`guitar.steady.v1` 结构没变，core 与工具都不动。
v0.152.0 只动前端：①解码逻辑抽到 `apps/web/src/lib/wave.ts`（`decodeWave` / `waveShapePath` / `wavePngDataUrl`，
带一份按「长度 + 尾巴」做键的缓存，波形组件与说明文件共用）——它只是把已有的解码从组件里搬出来，不算新 API；
②波形上可以叠另一遍的轮廓、可以拖选几拍（换算成小节写进面板），③「存成说明」的 Markdown 里内嵌一张
PNG 缩略波形（240×48）。`guitar.steady.v1` 的结构没变，core 与工具都不动。
v0.151.0 只动前端：①有录音时把录音解码成波形（`WaveRuler`，AudioContext + `decodeAudioData`），节拍竖线与
落点圆点直接画在波形上；②结果面板「这一遍 / 最稳的一遍」并排两个播放器；③「存成说明」导出一份 Markdown
（`runMetaMarkdown`），逐拍数值与前后半段都在里面。`guitar.steady.v1` 只多一个可选字段 `originMs`
（第一下点击声在录音里的位置，画波形要对齐），core 与工具都不动。
v0.150.0 只动前端：①「最稳 MM-DD」变成按钮，点开就是那一遍的明细（能听录音、看参考线、再弹一遍）；
②「稳不稳」记录多存 `offsets`（每拍偏多少毫秒，最多 64 拍），面板与统计页据此画节拍参考线；
③录音能「存成文件」（data URL 转 Blob 再下载，文件名带日期/速度/标准差）。`guitar.steady.v1` 里只多一个可选字段，
旧的记录照样能读；core 与工具都不动。
v0.149.0 只动前端：①「稳不稳」可以勾「录下这一遍」，录到的片段挂在那一遍上（`SteadyRun.audio`，
只留最近 3 遍、单条上限 900KB，进了 `guitar.steady.v1` 所以也走备份），「同速的上一遍」旁边能直接对着听；
②统计页把前后半段的偏移画成两条线（`medianFirstHalfMs` / `medianSecondHalfMs`，0 在中间，往上拖往下抢）；
③面板默认记住上次弹的那几小节（`totalBars` / `fromBar` / `toBar`）。core 与工具都不动。
v0.148.0：①「按这个速度再弹一遍 / 双击最稳那遍」带绝对小节号（`sfrom` / `sto`）与「那一遍整段几小节」
（`SteadyPoint.totalBars`、`SteadyRun.totalBars`，旧的记录没有也照样能读）；②倒计时那三秒先敲一小节同速的点击声；
③`TimingReport` 多两个前后半段的中位数（`medianFirstHalfMs` / `medianSecondHalfMs`），面板据此补「越弹越拖 / 越弹越抢」。
core 加字段算 MINOR → `0.55.0`；工具不动。
v0.147.0 只动前端：稳度曲线按「整段 / 只弹某几小节」拆成两条线（各带最稳绿圈）、双击跳过去后自动数秒开弹、
「同速的上一遍」补一句两遍各自偏早/偏晚的方向（`SteadyRun.medianOffsetMs`）。core 与工具都不动。
v0.146.0 只动前端：稳度点开「只弹某几小节」那天时跟**上一次同样只弹这一小段**的比（整段的不掺进来）；
稳度曲线双击按最稳那一遍的速度与长度跳过去弹；「同速的上一遍」优先挑同样区间的记录，并写明是哪几小节。core 与工具都不动。
v0.145.0 只动前端：「这几条的稳度」能只列「只弹过某几小节」的（筛子不进存储）、最稳那一点画成绿圈并挂
「最稳 MM-DD」、「同速的上一遍」旁边加了「先听同速的节拍」（现放几小节点击，没有录音可放）。core 与工具都不动。
v0.144.0 只动前端：统计页的「稳度」曲线能点某一天（写清那天几 BPM、±几毫秒、只弹哪几小节，并能按那个速度再弹一遍）；
「只弹过」的条目挂小标签，`SteadyPoint` / `SteadyRun` 都带上 `fromBar` / `toBar`；
「稳不稳」多一行「同速的上一遍」对照。core 与工具都不动。
v0.143.0 只动前端：统计页多一块「这几条的稳度」（`RhythmRecord.steadyHistory`，一天一个点、最多 24 个，
备份合并时同一天取更小的标准差）；练习页那句「稳不稳最稳 ±N 毫秒」变成按钮直接跳过去；
「稳不稳」支持只弹某几小节（记录里存 `fromBar` / `toBar`）。core 与工具都不动。
v0.142.0 只动前端，「稳不稳」三件事：明细里说这一遍比上一遍快 / 慢多少、同速时比标准差；
从练习页「顺手弹一遍」弹完把最好的标准差写回那条练习（`RhythmRecord.steadyStdev`）；
清空那档进 `Settings.steadyClear`，刷新之后还记得。core 与工具都不动。
v0.141.0 只动前端：「稳不稳」的清空改成可选清几遍、点过的那一天能按那个速度再弹一遍、
练习页勾掉一条之后顺手弹一遍。跨页用 `#practice/steady?sb=&sbar=` 种子，同页用 `guitar:steady` 事件。
core 与工具都不动。
v0.140.0 只动前端：统计页的趋势线能点（点哪遍看哪遍的明细，键盘 Enter / 空格往后翻）、
「稳不稳」的记录能清空并撤销、记住上次的速度和小节数（`Settings.steadyBpm` / `steadyBars`）。
core 与工具都不动。
v0.139.0 只动前端加 core 的两个字段（`TimingReport.barStdevsMs` / `worstBar`）：趋势图标出最稳与最快、
每遍写「比上次稳了多少」、逐小节指出最散的那一节。core 仍 `0.54.0`（只加字段、不破调用）。
v0.136.0 只动前端：设置页三档主题（跟随系统 / 深色 / 浅色），落地方式是 `<html data-theme>`
加一份调色板覆盖，布局不动；散在 CSS 里的写死色值收进 `--input-bg` / `--deep` / `--halo` /
`--on-accent` / `--line-strong` / `--heat-empty` 几个变量。浅色下六线谱 PNG 用
`filter: invert(1) hue-rotate(180deg)` 反色，不另生成一套图。core 与工具都不动。
v0.135.0 只动前端：跟练面板加键盘操作（空格开始 / 停、← → 平移 A-B 起止，处理函数写进 ref，
`keydown` 只挂一次）、手机「更多」分三组且每项带一句说明（`more-panel` 限高 78vh 自己滚）、
A-B 覆盖整条谱时不再画「单独放大」那一块；core 与工具都不动。
v0.130.0 只动前端：最卡那天的圈上加「卡了几次」的小字（`.curve-hard-n`）、跟练面板里 A/B 圈成
同一小节时用 core 的 `sliceTab` 把那一小节单独切出来放大（`TabScore` 新增 `fluid`，不写内联宽度）、
双击普通一天改成去同一套里那天最快的记录；core 与工具都不动（`sliceTab` 早就在 core 里）。
v0.131.0 只动前端：放大那一小块加「试听这一小节」（`useTone().playTab`，点之前先停节拍器）与
「上一小节 / 下一小节」（`practiceBar(n, false)`，翻页不计「卡住」）、圈上那枚「卡了几次」变成
按钮直达那一小节（`.curve-hard-hit` 透明命中圆）、`TabScore` 的 `fluid` 谱按 `minWidth` 560 画；
core 与工具都不动。
v0.127.0 只动前端：「练了 N 次」变成按钮跳「跟练进步」曲线（`data-curve-id`）、筛空的说明
后面挂「放宽一档」按钮（一次只放宽一档）、「比上周」的 `title` 写清加权用的次数与两边均值；
core 与工具都不动。
v0.124.0 只动前端：组合行加「比上周快 / 慢 N BPM」（`record.history` 近 7 天 vs 前 7 天）、
「卡了几次」chip 上写条数（`.chip-n`）、≤720px 练习量换短文案（`.hardest-set-meta-long` 收起 +
`::after attr(data-short)`）；core 与工具都不动。
v0.123.0 只动前端：组合那行加「最近 MM/DD」、新增「卡了几次」第三排筛选
（`?c=` / `StatsView.count`，只认 0/2/4）、≤720px 那行并回单行（`.hardest-set-go-long` 收起）；
core 与工具都不动。
v0.122.0 只动前端：「最卡的地方」排序里加 `hardest.count` 与 `bestBpm`（计划顺序仍优先）、
视角胶囊显示「练了 N 次」、窄屏弱点用 `::after` + `attr(data-short)` 换短文案；
core 与工具都不动。
v0.121.0 只动前端：组合那行的「整体卡在第几级」改成两段式（先收窄到这套、再点退回这套全部）、
存视角时多记 `sessions` / `avgBpm`、≤720px 用 grid 把那行折成两行并让右端提示常显；
core 与工具都不动。
v0.120.0 只动前端：组合小标题那行的「整体卡在第几级」变成能点的级数筛选、末尾加「练了 N 次 ·
平均 M BPM」、存视角时把当时的短板写进 `StatsView.weak` / `weakCount`（前端数据形状，不进 core）；
core 与工具都不动。
v0.119.0 只动前端：统计页的「只看这套」也算进筛选（进地址栏 `?g=`、进视角、进 sessionStorage）、
撤回提示条上的「去练这一条」顺手开始计时、组合小标题多一句「整体卡在第几级 ×N 次」
（`lib/stats-views.ts` 的 `StatsView.set` 是前端数据形状，不进 core）；core 与工具都不动。
v0.118.0 只动前端与检查脚本：统计页组合小标题能点着筛、撤回提示条加「去练这一条」、
`check-mobile` 补一个「计划里有带谱的加餐」的状态；core 与工具都不动。
v0.117.0 只动前端：统计页组合条目上面的小标题、撤回后的撤销提示条、手机上「今天练过」单独一行；
顺手修了运行时现画的谱在窄屏按位图宽撑宽整页（`TabScore` 的内联宽度补 `maxWidth: 100%`）；
core 与工具都不动。
v0.116.0 只动前端：统计页「最卡的地方」把同一套组合的条目排在一起（记录只能靠 `title` 回查，
因为 `p:extra-…` 的 id 是运行时生成的）、「今天练过」变成能点的按钮可撤回（分钟数不退回）、
一套里勾完的那条自动挪到同组最后；core 与工具都不动。
v0.115.0 只动前端：组合加进来的加餐带上了 `setName`（列表里按「组合 · 名字」归组）、
练过的那条标题淡下去并标「今天练过」、「单独练过几次」那排也进了视角与地址栏（`?p=3`）；
core 与工具都不动。`guitar.stats.views.v1` 的 `spot` 只认 0/1/3，老数据读出来是 0。

v0.114.0 依旧只动前端：组合里今天练过的排到最后（`freshFirst`）、「最卡的地方」多一排按
「单独练过几次」筛（读记录里的 `spots`）、加餐卡下面多一段按组合的完成度；顺手修了
`addExtra` 一批同时加时 id 撞车（时间戳至少比上一条大 1）；core 与工具都不动。

v0.113.0 也只动前端：组合旁边多一个「只加没练过的」开关（勾掉加餐时顺手往 `guitar.plan.done.v1`
记当天练过的标题，点组合时按标题比）、跟练里「只练这一处」会记进跟练记录的 `spots`（并在清单上
显示「单独练过 N 次」）、统计页用过的视角挪到最前（`promoteView` 只改 `addedAt`）；core 与工具都不动。
`guitar.plan.done.v1` 只留当天（读的时候日期对不上就当空表）。

v0.112.0 还是只动前端：练习页能把「今天这一套」存成组合（`guitar.plan.sets.v1`，最多 5 套 × 6 条）、
跟练回执里每处能「只练这一处」（挪循环但不给计数加一）、统计页视角能起名字（12 字以内，空名字
回落到系统标签）；core 与工具都不动。
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
