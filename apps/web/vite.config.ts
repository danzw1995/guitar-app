import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

export default defineConfig({
  plugins: [react()],
  // 版本号只写在这里，页脚不再硬编码，避免又一次漂移（v0.2.x 页脚曾停在 v0.2.0）。
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5173, host: "127.0.0.1" },
});
