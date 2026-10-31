# 游戏规则与音乐理论

## 1. 调弦与坐标

标准调弦，`tuning.strings` 的 index 0 = **1 弦（高音 e）**，index 5 = 6 弦（低音 E），值为 MIDI：

```
[64, 59, 55, 50, 45, 40]   // e B G D A E
```

- 格子 `Cell { s, f }`：`s` 0–5，`f` 品；键为 `"s:f"`。
- 音高：`midi = tuning[s] + f`
- 音高类：`pc = ((midi % 12) + 12) % 12`

## 2. 调与拼写

- 调由 `KeyDef { id, name, tonicPc, mode, letter }` 表示。
- 拼写不是“永远升号”，而是按调号：
  - F 大调：`F G A Bb C D E`
  - Bb 大调：`Bb C D Eb F G A`
  - A 小调：`A B C D E F G`

算法：主音字母开始，按大调/小调音程逐级配字母，用 `diff` 决定 `# / b / ## / bb`。

## 3. 音阶

| id | 名称 | 父调式 | 级数下标 |
|---|---|---|---|
| `major` | 大调 | major | 0–6 |
| `naturalMinor` | 自然小调 | minor | 0–6 |
| `majorPentatonic` | 大调五声 | major | 0,1,2,4,5 |
| `minorPentatonic` | 小调五声 | minor | 0,2,3,4,6 |

- `scalePcs(key, scale)`：音高类集合。
- `scaleNames(key, scale)`：与 pcs 一一对应的音名。
- v1 游戏只用 `major` 和 `naturalMinor`；五声用于音阶页展示。

## 4. 出题

### 目标格

品范围 `[fretMin, fretMax]` 内、音高类属于该音阶的所有格子：

```
target = { (s,f) | pc(tuning[s]+f) ∈ scalePcs }
```

非目标格不参与判定。

### 给定格

- 数量：`round(target.length × givenRatio)`，最少 1，最多 `target.length - 1`。
- 每条弦至少给一个（该弦有目标格时），避免整弦空白。
- 其余随机补足；按 `s, f` 排序。
- 随机源是 `mulberry32(seed)`，同 seed 同结果，可复现/可分享。

### 约束

- 同一拍不能同弦双音（Guitar Pro 也不允许）；当前数据每格独立，天然满足。
- 给定格必须是目标格的子集。

## 5. 判定

对每个目标格：

| 状态 | 条件 | 默认计分 |
|---|---|---|
| `correct` | 音高类对 + 拼写等于期望 | 对 |
| `spelling` | 音高类对、拼写不同（如 F 调写 A# 而不是 Bb） | 宽松算对；严格算错 |
| `wrong` | 音高类错 | 错 |
| `empty` | 未填 | 空 |

返回 `AttemptResult { cells, correct, spelling, wrong, empty, total, accuracy, finished }`。
`accuracy = correct / total`；`finished = empty === 0`。

## 6. 难度

```
coverage = 1 - givens / target
keys     = min(1, 调号升降数 / 7)
span     = min(1, (fretMax - fretMin) / 12)
strings  = 给定覆盖弦数 / 6
weight   = 音阶权重（major 0 / naturalMinor 0.15 / majorPentatonic 0.05 / minorPentatonic 0.1）

difficulty = 0.45*coverage + 0.20*keys + 0.15*span + 0.10*strings + 0.10*weight
```

结果 0–1，保留三位小数。

## 7. 计时与成绩

- 首次点击目标格开始计时；提交停止。
- `elapsed = endAt - startAt`，用 `Date.now()`，不用累加 interval。
- 页面切后台（后续壳）应暂停：记录 `pausedAt`，回来补回。
- 没填就提交：照常显示判定，但**不记进度**（`elapsedMs = 0` 不产生最快成绩）。

### 进度模型

`localStorage["guitar.progress.v1"]`：

```json
{
  "L01": { "completed": true, "stars": 3, "bestMs": 41000, "attempts": 4, "lastAt": 1761900000000 }
}
```

| 字段 | 含义 |
|---|---|
| `completed` | 至少完成过一次（无空格）；一旦 true 不会回退 |
| `bestMs` | 最快「全对」用时；从未全对是 `null` |
| `attempts` | 提交次数（含没做完就提交的） |
| `lastAt` | 最后一次提交时间戳；v0.2.x 迁移来的为 `null` |

「全对」按当前判定模式算：宽松模式下拼写错误算对，严格模式下不算（见 §5）。

### 星级

`stars` 只是缓存，唯一真相是 `starsOf({ completed, bestMs }, parMs)`：

| 星 | 条件 |
|---|---|
| 0 | 没做完（有空格） |
| 1 | 做完，但没全对过 |
| 2 | 全对，但最快全对用时 > 达标时间 |
| 3 | 全对，且最快全对用时 ≤ 达标时间 |

因为 `bestMs` 只在全对时更新，所以「三星 ⇔ bestMs ≤ parMs」永远自洽，不会出现星星和时间打架。

### 三星达标时间

```
parMs = targetCount × (2 + 3 × difficulty) × 1000
```

参考：L01（18 格、难度 0.300）≈ 52s；L40（48 格、难度 0.678）≈ 194s。

### 解锁

- L01 常开；其余关需要上一关 `completed`（至少 1 星）。
- 已解锁关卡永远是连续前缀，不会出现「中间没过却能进后面」。

### 迁移（v0.2.x → v0.3.0）

旧版只存 `guitar.best.<levelId>`，且仅在全对时写入。读到旧键、且该关没有新记录时，转成
`{ completed: true, bestMs: 旧值, attempts: 1 }`，星级按达标时间重算（可能是 3 星）。
两个键都存在时以 `guitar.progress.v1` 为准；「重置进度」会同时删掉旧键。

## 8. 40 关课程

| 章 | 关卡 | 调 | 音阶 | 品 | 给定比例 |
|---|---|---|---|---|---|
| 1 | L01–L10 | C | major | 1–5 | 65% → 45% |
| 2 | L11–L20 | G, D, A, E | major | 1–7 | 55% → 35% |
| 3 | L21–L30 | F, Bb, Eb | major | 1–7 | 50% → 30% |
| 4 | L31–L40 | Am, Em, Dm, Bm | naturalMinor | 0–12 | 40% → 20% |

同章内按“给定递减、品域递增”排；换调时难度有台阶。

## 9. 测试不变量

- 标准调弦 1 弦空弦 = E4(64)，6 弦空弦 = E2(40)。
- F 大调音阶拼写必须是 Bb，不是 A#。
- C 大调 0–12 品目标格数 > 35。
- 所有给定格 ⊆ 目标格，且无重复。
- 全对时 `correct === total`，`finished === true`。
- 40 关重新生成后 target 数、给定数一致。
