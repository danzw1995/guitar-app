/**
 * `node --experimental-strip-types`（Node 26 默认开启）在本机会在**退出时**崩一次
 * （0xC0000005），但测试结果本身是完整的：打印了 `ℹ pass N / ℹ fail 0` 之后才崩。
 *
 * 直接 `node test/core.test.ts` 会把这种情况当成失败，所以套一层：
 * 只有"确实有测试没通过"才返回非零；"全过但退出时崩"按通过处理并提示一句。
 *
 * CI 跑在 Linux + Node 24 上，那边本来就正常，这一层只是让本地 `pnpm test` 别误报。
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const child = spawnSync(process.execPath, [join(root, "test/core.test.ts")], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});

process.stdout.write(child.stdout ?? "");
process.stderr.write(child.stderr ?? "");

const out = `${child.stdout ?? ""}${child.stderr ?? ""}`;
const failed = /ℹ fail (\d+)/.exec(out);
const passed = /ℹ pass (\d+)/.exec(out);

if (child.status === 0) process.exit(0);

if (failed && failed[1] === "0" && passed) {
  console.warn(
    "\n⚠ 测试全部通过，但 Node 在进程退出时崩了（本机 type-stripping 的老毛病）；已按通过处理。",
  );
  process.exit(0);
}

process.exit(child.status ?? 1);
