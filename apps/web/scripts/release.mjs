/**
 * 一条命令收尾（v0.174.0）：把每次发版都要重复的机械动作做完。
 *
 *   node apps/web/scripts/release.mjs 0.174.0 "标题文字" \
 *     --note "第一条变更" --note "第二条变更" \
 *     [--doc "写进 docs/versioning.md 末尾的一段话"] [--core 0.64.0]
 *
 * 它做四件事：
 *   1. 根 package.json 与 apps/web/package.json 的版本号（--core 时连 core 一起）
 *   2. 在 CHANGELOG.md 顶上插一节（版本 + 日期 + Added 列表）
 *   3. 改 docs/versioning.md 的「当前：产品 `x.y.z`，core `x.y.z`」行，--doc 时追加一段
 *   4. 写好 apps/web/.tmp/commit-msg-<版本>.txt（中文提交信息不走 -m，免得 BOM）
 *
 * 它**不**做的事：docs/ux.md 那节人话、检查、commit / tag / push——最后会把命令打出来。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const version = argv[0] ?? "";
const title = argv[1] ?? "";
const notes = [];
let doc = "";
let coreVersion = "";

for (let index = 2; index < argv.length; index += 1) {
  const item = argv[index];
  if (item === "--note") notes.push(argv[index + 1] ?? "");
  else if (item === "--doc") doc = argv[index + 1] ?? "";
  else if (item === "--core") coreVersion = argv[index + 1] ?? "";
}

if (!/^\d+\.\d+\.\d+$/.test(version) || !title.trim()) {
  console.error('用法：node apps/web/scripts/release.mjs 0.174.0 "标题" [--note …] [--doc …] [--core 0.64.0]');
  process.exit(2);
}
if (coreVersion && !/^\d+\.\d+\.\d+$/.test(coreVersion)) {
  console.error(`--core 的版本号不对：${coreVersion}`);
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file) => fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
const write = (file, text) => fs.writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`, "utf8");

function bumpJson(file, next) {
  const data = JSON.parse(read(file));
  data.version = next;
  write(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`✔ ${path.relative(root, file)} → ${next}`);
}

bumpJson(path.join(root, "package.json"), version);
bumpJson(path.join(root, "apps/web/package.json"), version);
if (coreVersion) bumpJson(path.join(root, "packages/core/package.json"), coreVersion);

const today = (() => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
})();

const changelogPath = path.join(root, "CHANGELOG.md");
const changelog = read(changelogPath);
const firstSection = changelog.search(/^## \[/m);
if (firstSection < 0) {
  console.error("CHANGELOG.md 里找不到 `## [` 开头的节，格式变了？");
  process.exit(2);
}
const bullets = notes.length > 0 ? notes.map((item) => `- ${item}`) : ["- 待补：这一版做了什么"];
const section = `## [${version}] - ${today}\n\n### Added\n${bullets.join("\n")}\n\n`;
write(changelogPath, changelog.slice(0, firstSection) + section + changelog.slice(firstSection));
console.log(`✔ CHANGELOG.md 插了 [${version}]（${notes.length} 条 Added）`);

const versioningPath = path.join(root, "docs/versioning.md");
let versioning = read(versioningPath);
const currentLine = /当前：产品 `\d+\.\d+\.\d+`，core `(\d+\.\d+\.\d+)`/;
if (!currentLine.test(versioning)) {
  console.error("docs/versioning.md 里找不到「当前：产品 …，core …」那一行，格式变了？");
  process.exit(2);
}
const coreNow = versioning.match(currentLine)?.[1] ?? "?";
versioning = versioning.replace(currentLine, `当前：产品 \`${version}\`，core \`${coreVersion || coreNow}\``);
if (doc) {
  versioning = `${versioning.trimEnd()}\n\n${doc.trim()}\n`;
}
write(versioningPath, versioning);
console.log(
  `✔ docs/versioning.md 当前版本 → ${version} / core ${coreVersion || coreNow}${doc ? "（并追加了一段）" : ""}`,
);

const messageFile = path.join(root, "apps/web/.tmp", `commit-msg-${version}.txt`);
fs.mkdirSync(path.dirname(messageFile), { recursive: true });
const message = [
  // 标题自带 conventional 前缀时别再套一层（v0.174.0 / v0.176.0 出现过「feat: feat(songs): …」）
  /^[a-z]+(\([^)]+\))?: /.test(title.trim()) ? `${title.trim()} (v${version})` : `feat: ${title.trim()} (v${version})`,
  "",
  ...(notes.length > 0 ? notes.map((item) => `- ${item}`) : ["- （这一版做了什么，补一句）"]),
  "",
].join("\n");
write(messageFile, message);
console.log(`✔ 提交信息 → ${path.relative(root, messageFile)}`);

const minor = version.endsWith(".0");
console.log(`
还差这几步：
  1. docs/ux.md 加一节人话（这一版改了哪儿、为什么）${minor ? "" : "（patch 版一般不用）"}
  2. pnpm run check:all && node apps/web/scripts/check-ui.mjs "http://127.0.0.1:5186" && node apps/web/scripts/check-mobile.mjs
  3. git add -A && git commit -F "apps/web/.tmp/commit-msg-${version}.txt"
  4. ${
    minor
      ? `git tag -a v${version} -m "v${version}" && git push origin main && git push origin v${version}`
      : "git push origin main（patch 版只 bump + CHANGELOG，不打 tag）"
  }
`);
