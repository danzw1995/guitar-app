/**
 * 在 DSH 的 session 里搜内容（session 是「多帧 zstd」，普通文本工具搜不到）。
 *
 *   node scripts/session-grep.mjs guitar_            # 搜关键字
 *   node scripts/session-grep.mjs guitar_ --calls    # 只看工具调用事件
 *   node scripts/session-grep.mjs guitar_ --last 20  # 只看最近 20 条匹配
 *
 * 用途：确认插件的 Host 工具到底有没有被调用（`tool/call` 事件里的 name）。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";
import { zstdDecompressSync } from "node:zlib";

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** 一个 .zstd 文件里可能串了很多帧，按 magic 拆开逐帧解压。 */
function decodeSession(file) {
  const buf = readFileSync(file);
  const starts = [];
  let i = 0;
  while ((i = buf.indexOf(MAGIC, i)) !== -1) {
    starts.push(i);
    i += 4;
  }
  if (starts.length === 0) return "";
  let text = "";
  for (let n = 0; n < starts.length; n++) {
    const frame = buf.subarray(starts[n], n + 1 < starts.length ? starts[n + 1] : buf.length);
    try {
      text += zstdDecompressSync(frame).toString("utf8");
    } catch {
      // 坏帧跳过，不影响其它帧
    }
  }
  return text;
}

function findSessions(dir) {
  const out = [];
  (function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const p = join(current, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".zstd")) out.push({ path: p, mtime: statSync(p).mtimeMs });
    }
  })(dir);
  return out.sort((a, b) => b.mtime - a.mtime);
}

const argv = process.argv.slice(2);
const pattern = argv.find((a) => !a.startsWith("--"));
if (!pattern) {
  console.error("用法: node scripts/session-grep.mjs <关键字> [--calls] [--last N]");
  process.exit(1);
}
const onlyCalls = argv.includes("--calls");
const lastIdx = argv.indexOf("--last");
const last = lastIdx >= 0 ? Number(argv[lastIdx + 1] || 20) : 10;

const root = join(homedir(), ".dsh", "sessions");
const sessions = findSessions(root);
if (sessions.length === 0) {
  console.error(`没有找到 session：${root}`);
  process.exit(1);
}

let total = 0;
for (const session of sessions) {
  const text = decodeSession(session.path);
  if (!text.includes(pattern)) continue;

  const lines = text.split("\n").filter((line) => line && line.includes(pattern));
  const calls = [];
  for (const line of lines) {
    if (!line.includes('"tool/call"')) continue;
    const name = line.match(/"name"\s*:\s*"([^"\\]+)"/);
    if (name && name[1].toLowerCase().includes(pattern.toLowerCase())) calls.push(name[1]);
  }

  const label = basename(dirname(session.path));
  const tally = calls.reduce((map, name) => map.set(name, (map.get(name) ?? 0) + 1), new Map());
  const tallyText = [...tally].map(([name, n]) => `${name}×${n}`).join(", ");
  console.log(`\n== ${label}`);
  if (onlyCalls) {
    console.log(calls.length ? `   工具调用 ${calls.length} 次：${tallyText}` : `   没有名为「${pattern}」的工具调用`);
  } else {
    console.log(`   命中 ${lines.length} 行${calls.length ? `，其中工具调用 ${calls.length} 次：${tallyText}` : ""}`);
  }

  const show = onlyCalls ? lines.filter((l) => {
    if (!l.includes('"tool/call"')) return false;
    const name = l.match(/"name"\s*:\s*"([^"\\]+)"/);
    return name ? name[1].toLowerCase().includes(pattern.toLowerCase()) : false;
  }) : lines;
  for (const line of show.slice(-last)) {
    console.log("   · " + line.slice(0, 220).replace(/\s+/g, " "));
  }
  total += show.length;
}

console.log(`\n合计命中 ${total} 行`);
