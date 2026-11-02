/**
 * Host 半：把 Guitar Lab 的数据暴露成 agent 可调用的工具。
 *
 * 注意两点：
 * 1. `defineTool` 在动态插件里是沙箱全局 `harness.defineTool`，装成包时要从
 *    `@deepseek-ai/dsh-tools` 取——两条路都试，都失败就只跳过工具，不影响面板。
 * 2. 每个工具的注册都包在 try/catch 里：工具挂了不能让整个 bundle 变成 failed。
 */
import { chordLookup, dailyLookup, noteAt, scaleLookup } from "./lib/guitar.js";

export const inject = ["tools"];

const NS = "guitar-lab";

async function resolveDefineTool() {
  const sandbox = globalThis.harness;
  if (typeof sandbox?.defineTool === "function") return sandbox.defineTool;
  const mod = await import("@deepseek-ai/dsh-tools");
  if (typeof mod?.defineTool === "function") return mod.defineTool;
  throw new Error("找不到 defineTool（既没有 harness 全局，也 import 不到 @deepseek-ai/dsh-tools）");
}

const textBlocks = (_args, value) => [{ type: "text", text: String(value?.text ?? "") }];

export async function apply(ctx) {
  let defineTool;
  try {
    defineTool = await resolveDefineTool();
  } catch (error) {
    console.warn(`[${NS}] 跳过 Host 工具：${error?.message ?? error}`);
    return;
  }

  const tools = [
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

  for (const spec of tools) {
    try {
      const tool = defineTool({
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        output: { schema: { type: "json" }, render: textBlocks },
        execute: async (args) => spec.run(args ?? {}),
      });
      ctx.tools.register(tool);
      console.log(`[${NS}] 已注册工具 ${spec.name}`);
    } catch (error) {
      console.warn(`[${NS}] 工具 ${spec.name} 注册失败：${error?.message ?? error}`);
    }
  }
}
