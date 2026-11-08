#!/usr/bin/env node
// 命令行：把一个 alphaTex 或 JSON 谱面渲染成 PNG。
//
//   tab-score examples/sweep.tex -o out.png
//   tab-score song.json --theme light --width 1000
//
// 说明：alphaTab 的 PDF 输出没有现成方案，要矢量请用 --format svg（或 PNG 加大 --scale）。
import fs from "node:fs";
import path from "node:path";
import { renderPng, renderSvg } from "../src/render.mjs";
import { specToAlphaTex } from "../src/spec.mjs";

const USAGE = `用法: tab-score <输入文件> [选项]

输入:
  .tex / .alphatex   alphaTex 文本
  .json              JSON 谱面（见 README 的格式说明）

选项:
  -o, --out <文件>       输出文件（默认与输入同名，扩展名换成 .png）
  --format <png|svg>    输出格式（默认 png）
  --theme <dark|light>  配色（默认 dark）
  --width <像素>        版面宽度，逻辑像素（默认 720）
  --scale <倍数>        版面缩放（默认 1）
  --pixel-ratio <倍数>  输出像素倍率（默认 2）
  --no-title            不画标题
  --title-size <像素>   标题字号（默认 20）
  --beat-lines          每拍之间画一条细虚线（读谱数拍子用）
  --beat-line-color <颜色>  拍线颜色（默认 #6e7681）
  --clef-size <数值>    TAB 谱号大小（默认 36；缩到卡片里时 28 更合适）
  --beam-thickness <数值>   符梁粗细（默认 4.5）
  --stem-thickness <数值>   符干粗细（默认 1.08）
  --padding <像素>      四周留白（默认 6；底部是它的两倍，免得最下一行的品数贴边）
  --no-embed-font       SVG 里不内嵌 Bravura 字体（文件从 430KB 降到 30KB，
                        单独打开会缺音符符号；页面里已经加载过字体时才用）
  --json                只打印转换后的 alphaTex，不渲染
  -h, --help            显示这段帮助`;

function parseArgs(argv) {
  const args = { files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "-o":
      case "--out":
        args.out = argv[++i];
        break;
      case "--format":
        args.format = argv[++i];
        break;
      case "--theme":
        args.theme = argv[++i];
        break;
      case "--width":
        args.width = Number(argv[++i]);
        break;
      case "--scale":
        args.scale = Number(argv[++i]);
        break;
      case "--pixel-ratio":
        args.pixelRatio = Number(argv[++i]);
        break;
      case "--no-title":
        args.title = false;
        break;
      case "--no-embed-font":
        args.embedFont = false;
        break;
      case "--title-size":
        args.titleSize = Number(argv[++i]);
        break;
      case "--beat-lines":
        args.beatLines = true;
        break;
      case "--beat-line-color":
        args.beatLineColor = argv[++i];
        break;
      case "--clef-size":
        args.clefSize = Number(argv[++i]);
        break;
      case "--beam-thickness":
        args.beamThickness = Number(argv[++i]);
        break;
      case "--stem-thickness":
        args.stemThickness = Number(argv[++i]);
        break;
      case "--padding":
        args.padding = Number(argv[++i]);
        break;
      case "--json":
        args.onlyTex = true;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`未知选项 ${arg}`);
        }
        args.files.push(arg);
    }
  }
  return args;
}

function readInput(file) {
  const text = fs.readFileSync(file, "utf8");
  if (path.extname(file).toLowerCase() === ".json") {
    return { tex: specToAlphaTex(JSON.parse(text)), source: "json" };
  }
  return { tex: text, source: "tex" };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  if (args.help || args.files.length === 0) {
    console.log(USAGE);
    return;
  }

  const input = args.files[0];
  const { tex } = readInput(input);

  if (args.onlyTex) {
    console.log(tex);
    return;
  }

  const format = args.format ?? "png";
  const out =
    args.out ??
    `${input.slice(0, input.length - path.extname(input).length)}.${format}`;

  const options = {
    width: Number.isFinite(args.width) ? args.width : 720,
    scale: Number.isFinite(args.scale) ? args.scale : 1,
    pixelRatio: Number.isFinite(args.pixelRatio) ? args.pixelRatio : 2,
    theme: args.theme ?? "dark",
    title: args.title !== false,
    titleSize: Number.isFinite(args.titleSize) ? args.titleSize : 20,
    embedFont: args.embedFont !== false,
    padding: Number.isFinite(args.padding) ? args.padding : 6,
    beatLines: args.beatLines === true,
    beatLineColor: args.beatLineColor ?? "#6e7681",
    engraving: {
      musicFontSize: Number.isFinite(args.clefSize) ? args.clefSize : undefined,
      beamThickness: Number.isFinite(args.beamThickness)
        ? args.beamThickness
        : undefined,
      stemThickness: Number.isFinite(args.stemThickness)
        ? args.stemThickness
        : undefined,
    },
  };

  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  if (format === "svg") {
    const svg = await renderSvg(tex, options);
    fs.writeFileSync(out, svg);
    console.log(`${out}（${Math.round(svg.length / 1024)} KB）`);
  } else {
    const result = await renderPng(tex, options);
    fs.writeFileSync(out, result.data);
    console.log(`${out}（${result.width}×${result.height}，${Math.round(result.data.length / 1024)} KB）`);
  }
}

main().catch((error) => {
  console.error(`渲染失败：${error.message}`);
  process.exitCode = 1;
});
