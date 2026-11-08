# @danzw/tab-score

把吉他六线谱（alphaTex 文本或 JSON）渲染成图片：一个不依赖浏览器的命令行工具，也是一个可以直接 import 的库。

- 底座是 [alphaTab](https://alphatab.net)（MPL-2.0）+ 官方原生渲染后端 [alphaSkia](https://github.com/CoderLine/alphaSkia)（BSD-3）
- 不需要 Chrome、不需要 DOM、不需要 Web Worker
- 输出 PNG（默认 2 倍像素）或 SVG（字体内嵌，单文件可发给别人看）

## 安装

```bash
npm i -g @danzw/tab-score     # 全局安装
# 或者在自己的项目里
npm i @danzw/tab-score
```

`alphaSkia` 的原生二进制按平台装（`@coderline/alphaskia-windows|linux|macos`），它们是 `optionalDependencies`，会自动按当前系统挑一个。

## 用法

```bash
tab-score samples/demo.tex -o demo.png
tab-score samples/progression.json --theme light --width 1000
tab-score song.tex --format svg -o song.svg
tab-score song.tex --json            # 只看转换出来的 alphaTex，不渲染
```

选项：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `-o, --out` | 与输入同名 | 输出文件 |
| `--format` | `png` | `png` 或 `svg` |
| `--theme` | `dark` | `dark` / `light` |
| `--width` | `720` | 版面宽度（逻辑像素），越宽一行塞的小节越多 |
| `--scale` | `1` | 版面缩放，1.15 左右接近 App 里的大小 |
| `--pixel-ratio` | `2` | 输出像素倍率，2 就是 2 倍图 |
| `--no-title` | 关 | 不画标题 |
| `--title-size` | `20` | 标题字号（alphaTab 默认 32，压在卡片上太抢） |
| `--no-embed-font` | 关 | SVG 不内嵌字体：430KB → 30KB，但单独打开会缺音符符号 |

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

## 当库用

```js
import { renderPng, renderSvg, specToAlphaTex } from "@danzw/tab-score";

const { data, width, height } = await renderPng(tex, { theme: "dark", width: 900 });
fs.writeFileSync("out.png", data);

const svg = await renderSvg(tex, { theme: "light" });
```

## 许可

MIT（本工具自身的代码）。谱面由 alphaTab 生成，MPL-2.0 要求在渲染结果里保留「♪ alphaTab.net」署名：**一首曲子超过 10 小节（或超过 2 条轨）时**，alphaTab 会自动把它画在最后一条谱的上方，请不要裁掉、盖住或裁切到它。
