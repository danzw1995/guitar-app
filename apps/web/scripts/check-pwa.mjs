/**
 * PWA 静态校验：manifest 字段、图标真实尺寸、index.html 的引用、sw.js 语法。
 *
 *   node apps/web/scripts/check-pwa.mjs
 *
 * 只做静态断言，不证明"能装到桌面"——那需要在浏览器里点一次安装。
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(APP, "public");

let failed = 0;
const check = (label, fn) => {
  try {
    fn();
    console.log(`✔ ${label}`);
  } catch (error) {
    failed++;
    console.log(`✖ ${label}\n    ${error.message}`);
  }
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** 从 PNG 的 IHDR 读真实宽高（不信任 manifest 里写的 sizes）。 */
function pngSize(path) {
  const buf = readFileSync(path);
  const signature = buf.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error(`${path} 不是 PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const manifestPath = join(PUBLIC, "manifest.webmanifest");
let manifest = null;

check("manifest.webmanifest 存在且是合法 JSON", () => {
  if (!existsSync(manifestPath)) throw new Error("文件不存在");
  manifest = readJson(manifestPath);
});

check("manifest 必填字段齐全", () => {
  for (const key of ["name", "short_name", "start_url", "display", "icons"]) {
    if (!manifest?.[key]) throw new Error(`缺少 ${key}`);
  }
  if (manifest.display !== "standalone") throw new Error("display 应为 standalone");
  if (!manifest.theme_color) throw new Error("缺少 theme_color");
  if (!manifest.background_color) throw new Error("缺少 background_color");
});

check("manifest 里每个图标都真实存在，且尺寸与声明一致", () => {
  if (!manifest?.icons?.length) throw new Error("icons 为空");
  for (const icon of manifest.icons) {
    const file = join(PUBLIC, icon.src.replace(/^\//, ""));
    if (!existsSync(file)) throw new Error(`${icon.src} 不存在`);
    const [w, h] = icon.sizes.split("x").map(Number);
    const real = pngSize(file);
    if (real.width !== w || real.height !== h) {
      throw new Error(`${icon.src} 声明 ${icon.sizes}，实际 ${real.width}x${real.height}`);
    }
  }
});

check("有一个 512 的 maskable 图标（Android 启动器要）", () => {
  const maskable = manifest?.icons?.find((icon) => icon.purpose === "maskable");
  if (!maskable) throw new Error("没有 purpose=maskable 的图标");
  if (maskable.sizes !== "512x512") throw new Error("maskable 图标应为 512x512");
});

check("index.html 引用了 manifest 和 theme-color", () => {
  const html = readFileSync(join(APP, "index.html"), "utf8");
  if (!html.includes('rel="manifest"')) throw new Error("缺少 <link rel=\"manifest\">");
  if (!html.includes('href="/manifest.webmanifest"')) throw new Error("manifest 路径不对");
  if (!html.includes('name="theme-color"')) throw new Error("缺少 theme-color");
  if (!html.includes('rel="apple-touch-icon"')) throw new Error("缺少 apple-touch-icon");
});

check("index.html 里的图标路径都存在", () => {
  const html = readFileSync(join(APP, "index.html"), "utf8");
  for (const match of html.matchAll(/href="(\/icon-[^"]+)"/g)) {
    if (!existsSync(join(PUBLIC, match[1].replace(/^\//, "")))) {
      throw new Error(`${match[1]} 不存在`);
    }
  }
});

check("sw.js 语法可解析，且带了缓存版本号", () => {
  const source = readFileSync(join(PUBLIC, "sw.js"), "utf8");
  new Function(source); // 只解析不执行（里面用到 self / caches）
  if (!/const VERSION = "v\d+"/.test(source)) throw new Error('缺少 const VERSION = "vN"');
  if (!source.includes("skipWaiting")) throw new Error("缺少 skipWaiting，新 worker 不会接管");
  if (!source.includes("method !== \"GET\"")) throw new Error("没有过滤非 GET 请求");
});

check("main.tsx 只在生产构建注册 service worker", () => {
  const source = readFileSync(join(APP, "src", "main.tsx"), "utf8");
  if (!source.includes("import.meta.env.PROD")) throw new Error("缺少 PROD 判断");
  if (!source.includes('serviceWorker.register("/sw.js")')) throw new Error("没有注册 /sw.js");
});

if (failed > 0) {
  console.log(`\n${failed} 项未通过`);
  process.exit(1);
}
console.log("\nPWA 静态检查全部通过（能否安装仍需在浏览器里实测）");
