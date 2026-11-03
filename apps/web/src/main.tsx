import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * 注册 service worker：只在生产构建里做，开发时避免缓存干扰热更新。
 * 用 `load` 之后注册，不抢首屏带宽。
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("[guitar-lab] service worker 注册失败", error);
    });
  });
}
