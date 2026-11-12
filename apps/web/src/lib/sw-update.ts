/**
 * 新版本提示的「什么时候该弹」。
 *
 * 为什么需要它：`public/sw.js` 的导航请求是网络优先，**发新版一般下次打开就是新的**。
 * 但页面一直开着（练琴时挂在后台标签页）时，旧的 JS 已经在内存里跑，用户看不到任何提示，
 * 关掉重开才会换。这里盯 `controllerchange`：新的 service worker 接管页面时触发，
 * 说明「磁盘上的版本和正在跑的不一样了」，弹一条「刷新一下」。
 *
 * 首次安装时 `controllerchange` 也会触发一次（这时并没有旧版本），所以订阅时先记住
 * 当时有没有 controller：没有就忽略第一次事件。
 */
export function watchForUpdates(onUpdate: () => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => {};

  const hadController = Boolean(navigator.serviceWorker.controller);
  let fired = false;

  const onChange = () => {
    if (!hadController && !fired) {
      // 第一次安装：不是「更新」，不打扰
      fired = true;
      return;
    }
    fired = true;
    onUpdate();
  };

  navigator.serviceWorker.addEventListener("controllerchange", onChange);

  if (import.meta.env.DEV) {
    // 开发环境没有 service worker，留一个手动触发的口子给浏览器检查用。
    // `import.meta.env.DEV` 在生产构建里是 false，这段不会进产物。
    (window as unknown as { __guitarNotifyUpdate?: () => void }).__guitarNotifyUpdate = onUpdate;
  }

  return () => navigator.serviceWorker.removeEventListener("controllerchange", onChange);
}

/**
 * 定期问一次「有没有新版本」。
 *
 * 只在页面可见时问（后台标签页不浪费请求），间隔 30 分钟；拿到的 registration 有 waiting
 * 或 installing 的 worker 时，浏览器会在它装好后自己触发 `controllerchange`，
 * 所以这里只负责 `update()`。
 */
export function pollForUpdates(intervalMs = 30 * 60 * 1000): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => {};

  let timer: number | undefined;
  let stopped = false;

  const check = () => {
    if (stopped || document.visibilityState !== "visible") return;
    void navigator.serviceWorker.getRegistration().then((registration) => registration?.update());
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") check();
  };

  check();
  timer = window.setInterval(check, intervalMs);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    stopped = true;
    if (timer !== undefined) window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
