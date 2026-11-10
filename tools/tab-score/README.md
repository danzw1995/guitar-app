# @danzw777/tab-score

把吉他六线谱（alphaTex 文本、JSON，或者手写的 ASCII 六线谱）渲染成图片：一个不依赖浏览器的命令行工具，也是一个可以直接 import 的库。

- 底座是 [alphaTab](https://alphatab.net)（MPL-2.0）+ 官方原生渲染后端 [alphaSkia](https://github.com/CoderLine/alphaSkia)（BSD-3）
- 不需要 Chrome、不需要 DOM、不需要 Web Worker
- 输出 PNG（默认 2 倍像素）或 SVG（字体内嵌，单文件可发给别人看）

## 安装

```bash
npm i -g @danzw777/tab-score     # 全局安装
# 或者在自己的项目里
npm i @danzw777/tab-score
```

`alphaSkia` 的原生二进制按平台装（`@coderline/alphaskia-windows|linux|macos`），它们是 `optionalDependencies`，会自动按当前系统挑一个。

## 用法

```bash
npx @danzw777/tab-score song.tab -o song.png   # 不装也能直接用

tab-score samples/demo.tex -o demo.png
tab-score samples/spec.json --theme light --width 1000
tab-score samples/demo.tab --beat-lines   # ASCII 六线谱
tab-score song.tex --format svg -o song.svg
tab-score song.tex --json            # 只看转换出来的 alphaTex，不渲染
```

输入按扩展名认：`.tex` / `.alphatex` 是 alphaTex，`.json` 是 JSON 谱面，
`.tab` / `.txt` / `.ascii` 是 ASCII 六线谱；认不对时用 `--input ascii|tex|json` 强制指定。

选项：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `-o, --out` | 与输入同名 | 输出文件 |
| `--input` | 按扩展名 | 强制输入格式：`ascii` / `tex` / `json` |
| `--format` | `png` | `png` 或 `svg` |
| `--theme` | `dark` | `dark` / `light` |
| `--width` | `720` | 版面宽度（逻辑像素），越宽一行塞的小节越多 |
| `--scale` | `1` | 版面缩放，1.15 左右接近 App 里的大小 |
| `--pixel-ratio` | `2` | 输出像素倍率，2 就是 2 倍图 |
| `--no-title` | 关 | 不画标题 |
| `--title-size` | `20` | 标题字号（alphaTab 默认 32，压在卡片上太抢） |
| `--beat-lines` | 关 | 每拍之间画一条细虚线，读谱时数拍子用 |
| `--beat-line-color` | `#6e7681` | 拍线的颜色 |
| `--clef-size` | `36` | TAB 谱号大小；缩到卡片里用 `26`–`32` |
| `--beam-thickness` | `4.5` | 符梁粗细；`2.6` 左右看起来不糊 |
| `--stem-thickness` | `1.08` | 符干粗细 |
| `--tab-font` | `14` | 品位数字号；和 `--tab-spacing` 一起调，比值约 0.85 像纸质六线谱 |
| `--tab-spacing` | `13` | 六条弦的间距；字号 15 时配 18 |
| `--min-width` | 关 | 内容太窄的谱补到这个宽度（逻辑像素），让一批图在页面里字号一致 |
| `--padding` | `6` | 四周留白（逻辑像素），底部是它的两倍；`0` 会让最下一行的品数贴边 |
| `--no-embed-font` | 关 | SVG 不内嵌字体：430KB → 30KB，但单独打开会缺音符符号 |

扫弦箭头（`{bd}` / `{bu}`）由本工具自己画在谱面下方，而不是让 alphaTab 画在六线谱内部——
alphaTab 的刷弦箭头会落在六线谱第一弦那一行，压住 1 弦的品位数字；本工具把 `brushType`
从模型里取出来（`prepareScore()` 返回 `Map<Beat, "down"|"up">`），清掉后按 `boundsLookup`
里每一拍的横坐标重新画在谱面下面，所以 `--tab-font` 放大后也不会和箭头打架。

## 输入格式

### alphaTex

直接写 [alphaTex](https://alphatab.net/docs/alphatex/introduction)，见 `samples/demo.tex`：

```text
\tempo 80
\ts (4 4)
(3.5 2.4 0.3 1.2 0.1).8 {bd} 2.4.8 {bu} ...
```

`{bd}` 下扫、`{bu}` 上扫、`x.5` 死音（切音）、`r.8` 休止、`{tu 3}` 三连音、`{d}` 附点。

### JSON

给程序生成的谱面用。位置和时值都以四分音符为 1，`at` 从小节头算起：

```json
{
  "title": "示例",
  "tempo": 80,
  "timeSignature": [4, 4],
  "mute": "dead",
  "bars": [
    {
      "hits": [
        { "at": 0, "dur": 1, "dir": "D", "notes": [{ "string": 6, "fret": 3 }] },
        { "at": 1, "dur": 0.5, "dir": "U", "notes": [{ "string": 2, "fret": 1 }] }
      ]
    }
  ]
}
```

- `bars` 里每一项是 `{ hits: [...] }`，也可以直接给数组
- `at` / `dur`：位置和时值，四分音符 = 1；`dur` 省略时算到下一个音
- `notes`：`[{ string, fret }]`，同一声部多个音就是和弦
- `dir`：`"D"` 下扫 / `"U"` 上扫（可省略）
- `mute: "dead"`：全局把音头画成死音（切音）

### ASCII 六线谱

最省事的一种输入：六行「弦名 + 弦线 + 数字」，见 `samples/demo.tab`。

```text
title: 示例 · 八分分解
tempo: 72
ts: 4/4

e|--------0-------|--------0-------|
B|----1-------1---|----1-------1---|
G|--0---0---0---0-|--0---0---0---0-|
D|----------------|----------------|
A|3-------3-------|3-------3-------|
E|----------------|----------------|
```

- 弦名可以写 `e/B/G/D/A/E`（小写 `e` 是 1 弦、大写 `E` 是 6 弦），也可以写 `1`–`6`；
  不写弦名就按「从上到下 = 1 弦到 6 弦」；
- `|` 分小节（`||` 也行，多出来的空小节会被丢掉）；
- 同一列上的数字算**和弦**，一起拨；
- `x` 是闷音（死音），`-` 是延音占位；`h` / `p` / `~` 这类技巧记号暂时忽略；
- 时值不看符号、看**列距**：按小节宽度均分，再吸附到最近的常用时值，
  所以「两列一个音」是八分、「四列一个音」是四分，三连音这种非整数列距会保留原值；
- 文件开头可以写 `title: / tempo: / ts:` 三行头信息（`bpm:` 也认）。

## 当库用

```js
import { renderPng, renderSvg, specToAlphaTex, asciiTabToAlphaTex } from "@danzw777/tab-score";

const { data, width, height, beats } = await renderPng(tex, { theme: "dark", width: 900 });
fs.writeFileSync("out.png", data);
// beats: [{ x, w }, …] 每一拍在图片里的横向区间（像素）。想做「播放时高亮当前拍」
// 这类界面时按它定位；按顺序就是第 1 拍、第 2 拍…，长谱折行后仍然连续。
console.log(beats.length, "拍");

const svg = await renderSvg(tex, { theme: "light" });

// 文本谱 → 谱面图，一步到位
const tex2 = asciiTabToAlphaTex(asciiText, specToAlphaTex);
await renderPng(tex2, { theme: "dark" });
```

## 许可

MIT（本工具自身的代码）。谱面由 alphaTab 生成，MPL-2.0 要求在渲染结果里保留「♪ alphaTab.net」署名：**一首曲子超过 10 小节（或超过 2 条轨）时**，alphaTab 会自动把它画在最后一条谱的上方，请不要裁掉、盖住或裁切到它。
