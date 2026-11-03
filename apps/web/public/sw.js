/*
 * Guitar Lab 的 service worker（v1）
 *
 * 策略刻意保守：
 * - 导航请求：**网络优先**，断网时回落到缓存的 index.html——这样发新版立刻生效，
 *   不会出现"用户卡在旧版本"这种最烦的 PWA 问题；
 * - 其它同源 GET：**缓存优先 + 后台更新**（stale-while-revalidate），
 *   Vite 的资源名带 hash，所以旧缓存不会顶替新文件。
 *
 * 升版本时只改 VERSION；activate 会把旧的 guitar-lab-* 缓存全删掉。
 */
const VERSION = "v1";
const CACHE = `guitar-lab-${VERSION}`;

/** 装完就能离线打开的最小集合。 */
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("guitar-lab-") && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：先要网络，失败才用缓存
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put("/index.html", fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE);
          const cached = (await cache.match("/index.html")) || (await cache.match("/"));
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // 静态资源：缓存优先，同时后台拉新
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);

      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);

      if (cached) {
        // 后台更新，不阻塞返回
        event.waitUntil(network);
        return cached;
      }

      const fresh = await network;
      return fresh || Response.error();
    })(),
  );
});
