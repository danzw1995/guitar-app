/**
 * Host 半：把 Guitar Lab 的数据暴露成 agent 可调用的工具。
 *
 * 为什么不用 `defineTool`：插件装在仓库目录下，`@deepseek-ai/dsh-tools` 在
 * app.asar 里，从插件目录 **解析不到**（ERR_MODULE_NOT_FOUND）；沙箱全局的
 * `harness.defineTool` 又只在动态插件里存在。好在 `ctx.tools.register()` 只校验
 * `name` 与 `output.render`，`parameters` 原样作为 JSON Schema 交给模型，
 * 所以这里直接构造定义对象，零依赖。
 *
 * 每个工具的注册单独 try/catch：工具挂了不能让整个 bundle 变成 failed。
 */
import { chordLookup, dailyLookup, noteAt, scaleLookup } from "./lib/guitar.js";

export const inject = ["tools"];

const NS = "guitar-lab";

const textBlocks = (_args, value) => [{ type: "text", text: String(value?.text ?? "") }];

/** 按 `ctx.tools.register` 的契约拼一个工具定义。 */
export function makeTool({ name, description, parameters, run }) {
  return {
    name,
    description,
    parameters: {
      type: "object",
      properties: parameters,
      required: Object.entries(parameters)
        .filter(([, spec]) => spec.required === true)
        .map(([key]) => key),
    },
    output: {
      schema: { type: "object", properties: { text: { type: "string" } } },
      render: textBlocks,
    },
    execute: async (args) => run(args ?? {}),
  };
}

export const TOOL_SPECS = [
  {
    name: "guitar_chord",
    description:
      "查一个吉他和弦的构成音与常用指法（标准调弦）。例如 C、Am、G7、F#m。返回性质、构成音（含级数）与指法串。",
    parameters: {
      name: { type: "string", description: "和弦名，如 C、Am、G7、F#m", required: true },
    },
    run: ({ name }) => chordLookup(name),
  },
  {
    name: "guitar_scale",
    description:
      "查一个调的音阶音（标准调弦）。返回音名、首调唱名与音高类。默认大调，可选自然小调、大调五声、小调五声。",
    parameters: {
      key: { type: "string", description: "调，如 C、G、Bb、Am", required: true },
      scale: {
        type: "string",
        description: "音阶 id：major / naturalMinor / majorPentatonic / minorPentatonic（默认 major）",
      },
    },
    run: ({ key, scale }) => scaleLookup(key, scale ?? "major"),
  },
  {
    name: "guitar_daily",
    description: "查某一天的每日一题参数：调、音阶、品域、总格数与要填格数。不传日期就是今天。",
    parameters: {
      date: { type: "string", description: "日期 YYYY-MM-DD；不传用今天" },
    },
    run: ({ date }) => dailyLookup(date),
  },
  {
    name: "guitar_note_at",
    description: "问某一格的音：给弦号（1–6，1 是最细的高音 E）和品号（0–24），返回音高类与固定唱名。",
    parameters: {
      string: { type: "integer", description: "弦号 1–6，1 是高音 E", required: true },
      fret: { type: "integer", description: "品号 0–24，0 是空弦", required: true },
    },
    run: ({ string, fret }) => noteAt(string, fret),
  },
];

export function apply(ctx) {
  for (const spec of TOOL_SPECS) {
    try {
      const tool = makeTool(spec);
      ctx.tools.register(tool);
      console.log(`[${NS}] 已注册工具 ${spec.name}`);
    } catch (error) {
      console.warn(`[${NS}] 工具 ${spec.name} 注册失败：${error?.message ?? error}`);
    }
  }
}
